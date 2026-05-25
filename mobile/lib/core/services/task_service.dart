import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as p;
import 'package:video_compress/video_compress.dart';
import '../utils/org_date_utils.dart';

class AlreadySubmittedTodayException implements Exception {
  const AlreadySubmittedTodayException();
  @override
  String toString() => 'You have already submitted this task today.';
}

/// Thrown when the picked image is in a format the admin dashboard / AI cannot
/// render (e.g. HEIC). The UI should prompt the user to retake or pick a JPEG.
class UnsupportedImageFormatException implements Exception {
  final String format;
  const UnsupportedImageFormatException(this.format);
  @override
  String toString() =>
      'This photo is in $format format, which can\'t be reviewed. '
      'Please take a new photo with the camera or pick a JPG/PNG image.';
}

/// Thrown when a video exceeds the task's max duration.
class VideoTooLongException implements Exception {
  final int durationSeconds;
  final int maxSeconds;
  const VideoTooLongException(this.durationSeconds, this.maxSeconds);
  @override
  String toString() =>
      'Video is ${durationSeconds}s but max allowed is ${maxSeconds}s. '
      'Please trim or record a shorter video.';
}

/// Thrown when video compression fails.
class VideoCompressionFailedException implements Exception {
  const VideoCompressionFailedException();
  @override
  String toString() =>
      'Could not compress the video. Please try a different video or contact support.';
}

class TaskService {
  static final _client = Supabase.instance.client;

  /// Get all active tasks for a team's active challenge, respecting week progressive unlocking.
  static Future<List<Map<String, dynamic>>> getActiveTasks(String orgId, String? teamId) async {
    if (teamId == null) return []; // Must belong to a team to see and do tasks
    
    final tasks = await _client.rpc('get_mobile_tasks', params: {
      'p_team_id': teamId,
      'p_org_id': orgId,
    });
    
    return List<Map<String, dynamic>>.from(tasks);
  }

  /// Get all submissions for a user in active challenges.
  static Future<List<Map<String, dynamic>>> getUserSubmissions(
    String userId,
    String orgId,
  ) async {
    final data = await _client
        .from('task_submissions')
        .select('id, task_id, status, submitted_at, submitted_date, points_awarded, rejection_reason')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .order('submitted_at', ascending: false)
        .limit(200);

    return List<Map<String, dynamic>>.from(data);
  }


  /// Upload an image proof and submit the task.
  /// [submittedDate] overrides the submission date (YYYY-MM-DD).
  /// Pass the original date when resubmitting a history item so the
  /// admin breakdown stays accurate.
  /// [task] is the full task row (id, title, description, points, points_tiers, …)
  /// used to build a task_snapshot frozen onto the submission so future task
  /// edits don't rewrite historical display.
  static Future<void> submitTaskImage({
    required String taskId,
    required Map<String, dynamic> task,
    String? challengeId,
    required String userId,
    required String orgId,
    required XFile imageFile,
    String? submittedDate,
    String? orgTimezone,
    String? note,
    int? selectedTierIndex,
  }) async {
    // Ensure the session is alive before touching storage.
    // supabase_flutter auto-refreshes, but if the refresh token is expired
    // (e.g. app unused for days) the upload gets a 403 RLS error.
    final session = _client.auth.currentSession;
    if (session == null) {
      throw AuthException('Session expired — please log in again.');
    }

    final bytes = await imageFile.readAsBytes();
    final rawExt = p.extension(imageFile.name).toLowerCase();

    // Block HEIC/HEIF — admin browsers can't render them, AI can't analyze them.
    // Detect by both filename and magic bytes (some pickers strip the extension).
    if (_isHeic(rawExt, bytes)) {
      throw const UnsupportedImageFormatException('HEIC');
    }

    // Normalize to a safe extension + content-type. image_picker with imageQuality
    // already re-encodes most iOS gallery picks as JPEG; we just ensure the
    // filename and content-type match what the browser will get.
    final safeExt = _safeExtensionFromBytes(bytes, rawExt);
    final fileName = 'proofs/$userId/${taskId}_${DateTime.now().millisecondsSinceEpoch}$safeExt';

    await _client.storage.from('task-proofs').uploadBinary(
      fileName,
      bytes,
      // cacheControl: 1 year — proofs never change at the same URL (filename
      // includes taskId + timestamp). Allows aggressive browser + CDN caching.
      fileOptions: FileOptions(
        upsert: false,
        contentType: _mimeType(safeExt),
        cacheControl: '31536000',
      ),
    );

    // Use the provided date (history resubmit) or fall back to the grace-aware
    // effective date in the org timezone. During 00:00–00:14 this returns
    // yesterday, matching what the DB trigger set_submitted_date_local() stores,
    // so the existing-rejected-row lookup finds the right row.
    final dateStr = submittedDate ?? orgEffectiveTodayStr(orgTimezone);

    // Build the task snapshot — freezes title/description/tiers/etc onto this
    // submission so future task edits don't rewrite history.
    final taskSnapshot = _buildTaskSnapshot(task, selectedTierIndex);

    // If there's a rejected submission for the same task/date, UPDATE it in-place
    // instead of inserting a new row. This keeps one row per (user, task, date).
    // Defensive .order().limit(1): the unique partial index allows multiple
    // rejected rows in theory, so always pick the most recent one.
    final rejectedQuery = _client
        .from('task_submissions')
        .select('id')
        .eq('task_id', taskId)
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('submitted_date', dateStr)
        .eq('status', 'rejected');
    final existing = challengeId != null
        ? await rejectedQuery.eq('challenge_id', challengeId)
            .order('submitted_at', ascending: false).limit(1).maybeSingle()
        : await rejectedQuery
            .order('submitted_at', ascending: false).limit(1).maybeSingle();

    if (existing != null) {
      await _client.from('task_submissions').update({
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'status': 'pending',
        'proof_url': fileName,
        'rejection_reason': null,
        'ai_status': null,
        'ai_feedback': null,
        'ai_confidence': null,
        'task_snapshot': taskSnapshot,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      }).eq('id', existing['id']);
      return;
    }

    try {
      await _client.from('task_submissions').insert({
        'task_id': taskId,
        if (challengeId != null) 'challenge_id': challengeId,
        'user_id': userId,
        'org_id': orgId,
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'submitted_date': dateStr,
        'status': 'pending',
        'proof_url': fileName,
        'task_snapshot': taskSnapshot,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      });
    } on PostgrestException catch (e) {
      if (e.code == '23505') {
        throw AlreadySubmittedTodayException();
      }
      rethrow;
    }
  }

  /// Submit a video proof. Picks any input format (mp4/mov/webm/mkv/3gp),
  /// validates duration against the task's max, compresses to 480p H.264 .mp4,
  /// uploads, and writes/updates the submission row.
  ///
  /// AI analysis is NOT triggered for video submissions yet — they go straight
  /// to manual review (ai_status stays null).
  static Future<void> submitTaskVideo({
    required String taskId,
    required Map<String, dynamic> task,
    String? challengeId,
    required String userId,
    required String orgId,
    required XFile videoFile,
    required int maxDurationSeconds,
    String? submittedDate,
    String? orgTimezone,
    String? note,
    int? selectedTierIndex,
    void Function(double progress)? onCompressProgress,
  }) async {
    final session = _client.auth.currentSession;
    if (session == null) {
      throw AuthException('Session expired — please log in again.');
    }

    // Validate extension before doing any work
    final rawExt = p.extension(videoFile.name).toLowerCase();
    const allowedVideoExts = {'.mp4', '.mov', '.m4v', '.webm', '.mkv', '.3gp'};
    if (!allowedVideoExts.contains(rawExt)) {
      throw UnsupportedImageFormatException(
        rawExt.isEmpty ? 'unknown' : rawExt.replaceFirst('.', '').toUpperCase(),
      );
    }

    Uint8List bytes;
    String uploadExt;
    String uploadMime;

    if (kIsWeb) {
      // Flutter web: video_compress has no web implementation. Skip compression
      // — upload the picked file as-is. Temporary cap at 200 MB.
      //
      // Duration check is also skipped on web. The picker enforces maxDuration
      // for camera capture; gallery picks fall through to admin review.
      final raw = await videoFile.readAsBytes();
      if (raw.lengthInBytes > 200 * 1024 * 1024) {
        final mb = (raw.lengthInBytes / (1024 * 1024)).toStringAsFixed(1);
        throw Exception(
          'Video is $mb MB — too large to upload (max 200 MB). Please trim the video or record a shorter clip.',
        );
      }
      bytes = raw;
      uploadExt = rawExt;
      uploadMime = switch (rawExt) {
        '.mov' || '.m4v' => 'video/quicktime',
        '.webm' => 'video/webm',
        '.mkv' => 'video/x-matroska',
        '.3gp' => 'video/3gpp',
        _ => 'video/mp4',
      };
    } else {
      // Native (iOS / Android): probe duration then compress to 480p .mp4.
      final info = await VideoCompress.getMediaInfo(videoFile.path);
      final srcDurationSec = ((info.duration ?? 0) / 1000).round();
      if (srcDurationSec > maxDurationSeconds + 1) {
        throw VideoTooLongException(srcDurationSec, maxDurationSeconds);
      }

      final progressSub = onCompressProgress == null
          ? null
          : VideoCompress.compressProgress$.subscribe((p) => onCompressProgress(p));
      MediaInfo? compressed;
      try {
        compressed = await VideoCompress.compressVideo(
          videoFile.path,
          quality: VideoQuality.MediumQuality, // ~480p, good admin-review quality
          includeAudio: true,
          deleteOrigin: false,
        );
      } finally {
        progressSub?.unsubscribe();
      }

      final outPath = compressed?.path;
      if (outPath == null) {
        throw const VideoCompressionFailedException();
      }

      final compressedFile = File(outPath);
      bytes = await compressedFile.readAsBytes();

      // Final safety net — compressed 90s video should be well under 30MB.
      if (bytes.lengthInBytes > 30 * 1024 * 1024) {
        throw Exception(
          'Compressed video is still too large (>30 MB). Please record a shorter or simpler video.',
        );
      }

      // Best-effort cleanup of the compressed temp file
      try { await compressedFile.delete(); } catch (_) {}

      uploadExt = '.mp4';
      uploadMime = 'video/mp4';
    }

    final fileName = 'proofs/$userId/${taskId}_${DateTime.now().millisecondsSinceEpoch}$uploadExt';

    await _client.storage.from('task-proofs').uploadBinary(
      fileName,
      bytes,
      // 1 year — proof URLs include timestamp so they're immutable.
      fileOptions: FileOptions(
        upsert: false,
        contentType: uploadMime,
        cacheControl: '31536000',
      ),
    );

    final dateStr = submittedDate ?? orgEffectiveTodayStr(orgTimezone);
    final taskSnapshot = _buildTaskSnapshot(task, selectedTierIndex);

    // Find existing rejected row for same task/date → update it in-place.
    final rejectedQuery = _client
        .from('task_submissions')
        .select('id')
        .eq('task_id', taskId)
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('submitted_date', dateStr)
        .eq('status', 'rejected');
    final existing = challengeId != null
        ? await rejectedQuery.eq('challenge_id', challengeId)
            .order('submitted_at', ascending: false).limit(1).maybeSingle()
        : await rejectedQuery
            .order('submitted_at', ascending: false).limit(1).maybeSingle();

    if (existing != null) {
      await _client.from('task_submissions').update({
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'status': 'pending',
        'proof_url': fileName,
        'rejection_reason': null,
        'ai_status': null,
        'ai_feedback': null,
        'ai_confidence': null,
        'task_snapshot': taskSnapshot,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      }).eq('id', existing['id']);
      return;
    }

    try {
      await _client.from('task_submissions').insert({
        'task_id': taskId,
        if (challengeId != null) 'challenge_id': challengeId,
        'user_id': userId,
        'org_id': orgId,
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'submitted_date': dateStr,
        'status': 'pending',
        'proof_url': fileName,
        'task_snapshot': taskSnapshot,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      });
    } on PostgrestException catch (e) {
      if (e.code == '23505') {
        throw AlreadySubmittedTodayException();
      }
      rethrow;
    }
  }

  /// Build the task_snapshot JSONB blob frozen onto each submission row.
  /// Captures everything the dashboard / AI / mobile history screen needs
  /// to render the submission correctly even if the task is edited later.
  static Map<String, dynamic> _buildTaskSnapshot(
    Map<String, dynamic> task,
    int? selectedTierIndex,
  ) {
    final tiersRaw = task['points_tiers'];
    final tiers = (tiersRaw is List)
        ? List<Map<String, dynamic>>.from(
            tiersRaw.whereType<Map>().map((m) => Map<String, dynamic>.from(m)),
          )
        : <Map<String, dynamic>>[];
    final selectedTier = (selectedTierIndex != null &&
            selectedTierIndex >= 0 &&
            selectedTierIndex < tiers.length)
        ? tiers[selectedTierIndex]
        : null;
    return {
      'title':        task['title'],
      'description':  task['description'],
      'points':       task['points'],
      'icon':         task['icon'],
      'category':     task['category'],
      'week_number':  task['week_number'],
      'points_tiers': tiers,
      'selected_tier': selectedTier,
    };
  }

  static String _mimeType(String ext) => switch (ext) {
    '.png'  => 'image/png',
    '.gif'  => 'image/gif',
    '.webp' => 'image/webp',
    _       => 'image/jpeg',
  };

  /// HEIC/HEIF detection by extension OR by 'ftyp...heic/heif/mif1/heix/hevc' magic.
  /// HEIC files have an ISO BMFF box structure: bytes 4–7 are 'ftyp', then a brand.
  static bool _isHeic(String ext, List<int> bytes) {
    if (ext == '.heic' || ext == '.heif') return true;
    if (bytes.length < 12) return false;
    // 'ftyp' starts at offset 4
    final isFtyp = bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70;
    if (!isFtyp) return false;
    // Brand at offset 8: 'heic' | 'heix' | 'heif' | 'mif1' | 'msf1' | 'hevc' | 'hevx'
    final brand = String.fromCharCodes(bytes.sublist(8, 12)).toLowerCase();
    return brand == 'heic' || brand == 'heix' || brand == 'heif'
        || brand == 'mif1' || brand == 'msf1'
        || brand == 'hevc' || brand == 'hevx';
  }

  /// Pick a safe extension based on the image's actual magic bytes, falling back
  /// to the source extension if the bytes don't match a known format.
  /// Ensures the storage URL extension matches the actual content.
  static String _safeExtensionFromBytes(List<int> bytes, String fallbackExt) {
    if (bytes.length >= 4) {
      // PNG: 89 50 4E 47
      if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
        return '.png';
      }
      // JPEG: FF D8 FF
      if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) {
        return '.jpg';
      }
      // GIF: 47 49 46 38
      if (bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38) {
        return '.gif';
      }
      // WEBP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
      if (bytes.length >= 12 &&
          bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
          bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) {
        return '.webp';
      }
    }
    // Unknown content — keep the source extension but default to .jpg if missing
    final allowed = {'.jpg', '.jpeg', '.png', '.gif', '.webp'};
    return allowed.contains(fallbackExt) ? fallbackExt : '.jpg';
  }

  /// Get submissions from previous days (for Task History).
  /// Returns pending (awaiting review) and rejected submissions from before today.
  /// - pending: member already submitted, waiting for admin review (read-only card)
  /// - rejected: member can resubmit (shows Resubmit button)
  static Future<List<Map<String, dynamic>>> getPastSubmissions(
    String userId,
    String orgId, {
    String orgTimezone = 'UTC',
  }) async {
    final todayStr = orgEffectiveTodayStr(orgTimezone);

    final data = await _client
        .from('task_submissions')
        .select(
          'id, task_id, challenge_id, status, submitted_date, submitted_at, rejection_reason, '
          'task_snapshot, '
          'tasks!task_id(id, title, description, icon, points, points_tiers)',
        )
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .inFilter('status', ['pending', 'rejected'])
        .neq('submitted_date', todayStr) // exclude today — handled by Tasks screen
        .order('submitted_date', ascending: false)
        .limit(60);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Get a signed URL for a private task proof image.
  static Future<String> getProofSignedUrl(String path) async {
    return await _client.storage
        .from('task-proofs')
        .createSignedUrl(path, 3600);
  }
}
