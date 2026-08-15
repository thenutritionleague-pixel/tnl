import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as p;
import 'package:video_compress/video_compress.dart';
import 'package:video_player/video_player.dart';
import 'bunny_video_service.dart';
import 'submission_outbox.dart';
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

/// Thrown when the proof uploaded successfully but the submission row couldn't
/// be saved after retries. The submission is SAFELY queued on the device and
/// will auto-complete on the next app launch — nothing is lost. The UI should
/// show a reassuring (not error) message.
class SubmissionQueuedException implements Exception {
  final Object? cause;
  const SubmissionQueuedException(this.cause);
  @override
  String toString() =>
      'Your proof was uploaded and saved. It will finish submitting '
      'automatically the next time you open the app.';
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

  /// Ensure the auth access token is fresh before a write. supabase_flutter
  /// auto-refreshes, but a long upload (60–90s video) can outlive the ~1h access
  /// token, causing the follow-up insert to fail with a 403. Proactively refresh
  /// when it is close to expiry. This is SILENT (uses the stored refresh token)
  /// — the member is NOT asked to log in again.
  static Future<void> _ensureFreshSession() async {
    final session = _client.auth.currentSession;
    if (session == null) {
      throw AuthException('Session expired — please log in again.');
    }
    final expiresAt = session.expiresAt; // epoch seconds
    if (expiresAt != null) {
      final secondsLeft =
          expiresAt - (DateTime.now().millisecondsSinceEpoch ~/ 1000);
      if (secondsLeft < 120) {
        try {
          await _client.auth.refreshSession();
        } catch (_) {
          // If refresh fails, the write below surfaces the real error.
        }
      }
    }
  }

  /// Insert a NEW submission durably: queue it locally first (so a failure or an
  /// app-close never loses it), then insert with a fresh session + retries. On
  /// permanent failure it stays queued and auto-completes on next app launch.
  /// Throws [AlreadySubmittedTodayException] on a same-day duplicate.
  static Future<void> _insertSubmissionDurable(Map<String, dynamic> record) async {
    final proofUrl = record['proof_url'] as String;
    await SubmissionOutbox.enqueue(record);

    Object? lastErr;
    for (int attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await Future.delayed(Duration(seconds: attempt * 2)); // 2s, 4s
      }
      try {
        await _ensureFreshSession();
        await _client
            .from('task_submissions')
            .insert(SubmissionOutbox.buildInsertPayload(record));
        await SubmissionOutbox.remove(proofUrl);
        return; // success
      } on PostgrestException catch (e) {
        if (e.code == '23505') {
          await SubmissionOutbox.remove(proofUrl); // already submitted today
          throw AlreadySubmittedTodayException();
        }
        lastErr = e; // transient DB error → retry
      } on AuthException {
        // Session truly dead → surface to UI (login). Outbox keeps the record
        // and completes it on next launch after re-auth.
        rethrow;
      } catch (e) {
        lastErr = e; // network / other → retry
      }
    }
    // Retries exhausted, but the submission is safely queued and will finish on
    // the next launch. Surface a reassuring (non-fatal) signal to the UI.
    throw SubmissionQueuedException(lastErr);
  }

  /// Update an existing (rejected) submission row in place, with a fresh session
  /// + retries. The row already exists so this is not queued in the outbox.
  static Future<void> _updateWithRetry(
      String id, Map<String, dynamic> patch) async {
    Object? lastErr;
    for (int attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await Future.delayed(Duration(seconds: attempt * 2));
      try {
        await _ensureFreshSession();
        await _client.from('task_submissions').update(patch).eq('id', id);
        return;
      } on AuthException {
        rethrow;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? Exception('Could not update the submission.');
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

    final trimmedNote = (note != null && note.trim().isNotEmpty) ? note.trim() : null;

    if (existing != null) {
      await _updateWithRetry(existing['id'] as String, {
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'status': 'pending',
        'proof_url': fileName,
        'rejection_reason': null,
        'ai_status': null,
        'ai_feedback': null,
        'ai_confidence': null,
        'task_snapshot': taskSnapshot,
        if (trimmedNote != null) 'note': trimmedNote,
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      });
      return;
    }

    await _insertSubmissionDurable({
      'task_id': taskId,
      'challenge_id': challengeId,
      'user_id': userId,
      'org_id': orgId,
      'submitted_at': DateTime.now().toUtc().toIso8601String(),
      'submitted_date': dateStr,
      'proof_url': fileName,
      'task_snapshot': taskSnapshot,
      'note': trimmedNote,
      'selected_tier_index': selectedTierIndex,
    });
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
    void Function(double progress)? onUploadProgress,
    Uint8List? preloadedBytes,
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
      // Flutter web: video_compress has no web implementation. Upload raw
      // — Bunny Stream transcodes any input to browser-safe MP4 server-side.
      // Bunny bucket accepts up to 500 MB. iPhone 90s .mov typically 60-150 MB.

      // Enforce the task's own length limit on web too. video_compress can't
      // probe here, so read the duration through video_player, which supports
      // the blob URL the picker hands us. Without this the per-task
      // max_video_seconds (60 / 90 / 120 …) was silently ignored on web, which
      // is the only platform members actually use.
      //
      // Fail OPEN: if the duration can't be determined we let the submission
      // through. Blocking a genuine member because their browser wouldn't
      // report metadata is worse than accepting an over-length clip.
      final probedSeconds = await _probeVideoDurationSeconds(videoFile);
      if (probedSeconds != null && probedSeconds > maxDurationSeconds + 1) {
        throw VideoTooLongException(probedSeconds, maxDurationSeconds);
      }

      // Prefer bytes read at PICK time — on web the blob backing videoFile may
      // have been evicted by now ("Could not load Blob"). Fall back to a fresh
      // read only if no preloaded bytes were passed.
      final raw = preloadedBytes ?? await videoFile.readAsBytes();
      if (raw.lengthInBytes > 500 * 1024 * 1024) {
        final mb = (raw.lengthInBytes / (1024 * 1024)).toStringAsFixed(1);
        throw Exception(
          'Video is $mb MB — too large to upload (max 500 MB). Please trim the video or record a shorter clip.',
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
      // Compression here still helps upload speed on 4G — Bunny would transcode
      // anyway, but a 20 MB upload is much faster than a 100 MB one.
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

      // Final safety net — compressed 90s video should be well under 50MB.
      if (bytes.lengthInBytes > 50 * 1024 * 1024) {
        throw Exception(
          'Compressed video is still too large (>50 MB). Please record a shorter or simpler video.',
        );
      }

      // Best-effort cleanup of the compressed temp file
      try { await compressedFile.delete(); } catch (_) {}

      uploadExt = '.mp4';
      uploadMime = 'video/mp4';
    }

    // Upload directly to Bunny Stream — server-side transcodes to browser-safe
    // MP4 + adaptive HLS. proof_url becomes "bunny://<guid>" so downstream
    // (analyze-submission, admin dashboard) can route to the CDN.
    // ignore: unused_local_variable
    final _extForLegacy = uploadExt;
    final fileName = await BunnyVideoService.uploadVideo(
      bytes: bytes,
      mimeType: uploadMime,
      title: 'proof-$taskId-${DateTime.now().millisecondsSinceEpoch}',
      onProgress: onUploadProgress,
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

    final trimmedNote = (note != null && note.trim().isNotEmpty) ? note.trim() : null;

    if (existing != null) {
      await _updateWithRetry(existing['id'] as String, {
        'submitted_at': DateTime.now().toUtc().toIso8601String(),
        'status': 'pending',
        'proof_url': fileName,
        'rejection_reason': null,
        'ai_status': null,
        'ai_feedback': null,
        'ai_confidence': null,
        'task_snapshot': taskSnapshot,
        if (trimmedNote != null) 'note': trimmedNote,
        if (selectedTierIndex != null) 'selected_tier_index': selectedTierIndex,
      });
      return;
    }

    await _insertSubmissionDurable({
      'task_id': taskId,
      'challenge_id': challengeId,
      'user_id': userId,
      'org_id': orgId,
      'submitted_at': DateTime.now().toUtc().toIso8601String(),
      'submitted_date': dateStr,
      'proof_url': fileName,
      'task_snapshot': taskSnapshot,
      'note': trimmedNote,
      'selected_tier_index': selectedTierIndex,
    });
  }

  /// Read a picked video's duration in whole seconds.
  ///
  /// Used on web, where video_compress has no implementation. video_player
  /// accepts the blob URL that image_picker_for_web puts in [XFile.path].
  ///
  /// Returns null when the duration cannot be determined (unsupported codec,
  /// metadata still loading, blob already revoked). Callers MUST treat null as
  /// "unknown" and allow the submission — never block a member on a probe that
  /// simply failed. Bounded by a timeout so a stuck load can't hang submit.
  static Future<int?> _probeVideoDurationSeconds(XFile file) async {
    VideoPlayerController? controller;
    try {
      controller = VideoPlayerController.networkUrl(Uri.parse(file.path));
      await controller.initialize().timeout(const Duration(seconds: 12));
      final d = controller.value.duration;
      if (d <= Duration.zero) return null;
      return (d.inMilliseconds / 1000).round();
    } catch (_) {
      return null; // fail open
    } finally {
      try {
        await controller?.dispose();
      } catch (_) {/* ignore */}
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
  /// Returns approved, pending, and rejected submissions from before today.
  /// - approved: read-only "✓ Approved" card — so members can always see their
  ///   completed work (an approved task otherwise disappears from every list,
  ///   which members mistake for a "missing" submission).
  /// - pending: member already submitted, waiting for admin review (read-only)
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
          'points_awarded, task_snapshot, '
          'tasks!task_id(id, title, description, icon, points, points_tiers)',
        )
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .inFilter('status', ['pending', 'rejected', 'approved'])
        .neq('submitted_date', todayStr) // exclude today — handled by Tasks screen
        .order('submitted_date', ascending: false)
        .limit(120);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Get a signed URL for a private task proof image.
  static Future<String> getProofSignedUrl(String path) async {
    return await _client.storage
        .from('task-proofs')
        .createSignedUrl(path, 3600);
  }
}
