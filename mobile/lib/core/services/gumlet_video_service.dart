import 'dart:async';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

class GumletUploadFailedException implements Exception {
  final String message;
  const GumletUploadFailedException(this.message);
  @override
  String toString() => 'Video upload failed: $message';
}

/// Byte range of one multipart part. Pure so it can be unit tested.
class PartRange {
  final int number; // 1-based, as S3 / Gumlet number parts
  final int start;
  final int end; // exclusive
  const PartRange(this.number, this.start, this.end);
  int get length => end - start;
}

/// Split [total] bytes into parts of [partSize]; the last part takes the rest.
/// Must produce exactly the part count the server signed URLs for
/// (ceil(total / partSize), minimum 1).
List<PartRange> planParts(int total, int partSize) {
  if (total <= 0 || partSize <= 0) return const [];
  final parts = <PartRange>[];
  for (int start = 0, n = 1; start < total; start += partSize, n++) {
    final end = start + partSize > total ? total : start + partSize;
    parts.add(PartRange(n, start, end));
  }
  return parts;
}

/// Gumlet direct upload, in parts, straight from the browser to Gumlet's S3.
///
/// The `gumlet-upload` edge function holds the API key and hands back
/// presigned part URLs; the file itself never touches our servers. Each part is
/// retried on its own, so a dropped connection costs one part, not the whole
/// video -- the same protection the old Bunny TUS uploader gave. Web uploads
/// are uncompressed (video_compress has no web implementation), so clips are
/// routinely 90-250 MB and that matters.
class GumletVideoService {
  static final _client = Supabase.instance.client;

  static const _partRetries = 3; // per-part attempts before giving up
  static const _callRetries = 3; // edge-function calls (init / complete)

  /// Call the gumlet-upload edge function, retrying network blips.
  /// One hiccup on a mobile link must not kill an upload before it starts.
  static Future<Map<String, dynamic>> _call(Map<String, dynamic> body) async {
    Object? lastErr;
    for (int attempt = 0; attempt < _callRetries; attempt++) {
      if (attempt > 0) await Future.delayed(Duration(seconds: attempt * 2));
      try {
        final res = await _client.functions
            .invoke('gumlet-upload', body: body)
            .timeout(const Duration(seconds: 45));
        if (res.status == 200 && res.data is Map) {
          return Map<String, dynamic>.from(res.data as Map);
        }
        lastErr = GumletUploadFailedException(
            '${body['action']} failed (${res.status}): ${res.data}');
        // 4xx is the server refusing the request itself; retrying cannot help.
        if (res.status >= 400 && res.status < 500) break;
      } on FunctionException catch (e) {
        lastErr = GumletUploadFailedException(
            '${body['action']} failed (${e.status}): ${e.details}');
        if (e.status >= 400 && e.status < 500) break;
      } catch (e) {
        lastErr = e; // network drop / timeout -> retry
      }
    }
    throw lastErr is GumletUploadFailedException
        ? lastErr
        : GumletUploadFailedException('${body['action']} failed: $lastErr');
  }

  /// Fire-and-forget cleanup of a reserved asset after a failed upload, so
  /// Gumlet doesn't keep an empty placeholder eating storage minutes.
  static Future<void> _abort(String assetId) async {
    try {
      await _client.functions
          .invoke('gumlet-upload', body: {'action': 'abort', 'assetId': assetId});
    } catch (_) {
      // Best-effort. Never surface cleanup problems to the member.
    }
  }

  /// Upload [bytes] and return the proof_url (`gumlet://<asset_id>`) to store
  /// on the task_submissions row. [onProgress] gets 0.0-1.0 as parts land.
  static Future<String> uploadVideo({
    required Uint8List bytes,
    required String mimeType,
    String? title,
    void Function(double progress)? onProgress,
  }) async {
    final total = bytes.lengthInBytes;
    final init = await _call({
      'action': 'init',
      'title': title ?? 'proof-video',
      'size': total,
    });
    final assetId = init['assetId'] as String;
    final proofUrl = init['proofUrl'] as String;
    final partSize = (init['partSize'] as num).toInt();
    final urls = List<String>.from(init['partUrls'] as List);

    try {
      final plan = planParts(total, partSize);
      if (plan.length != urls.length) {
        throw GumletUploadFailedException(
            'part count mismatch (${plan.length} vs ${urls.length})');
      }

      onProgress?.call(0);
      final done = <Map<String, dynamic>>[];
      for (final part in plan) {
        final etag = await _putPart(
          assetId: assetId,
          part: part,
          urls: urls,
          chunk: Uint8List.sublistView(bytes, part.start, part.end),
        );
        done.add({'PartNumber': part.number, 'ETag': etag});
        onProgress?.call(part.end / total);
      }

      await _call({'action': 'complete', 'assetId': assetId, 'parts': done});
      onProgress?.call(1);
      return proofUrl;
    } catch (_) {
      unawaited(_abort(assetId));
      rethrow;
    }
  }

  static Future<String> _putPart({
    required String assetId,
    required PartRange part,
    required List<String> urls,
    required Uint8List chunk,
  }) async {
    Object? lastErr;
    for (int attempt = 0; attempt < _partRetries; attempt++) {
      if (attempt > 0) await Future.delayed(Duration(seconds: attempt * 2)); // 2s, 4s
      try {
        // A stalled mobile connection (4G handoff, lift, dead spot) would hang
        // forever with no timeout and freeze the progress bar. 8 MB needs a
        // generous budget on a slow link.
        final res = await http
            .put(Uri.parse(urls[part.number - 1]), body: chunk)
            .timeout(const Duration(seconds: 120));
        if (res.statusCode == 200) {
          final etag = res.headers['etag'] ?? res.headers['ETag'];
          if (etag != null && etag.isNotEmpty) return etag;
          lastErr = GumletUploadFailedException('part ${part.number}: no ETag');
          continue;
        }
        if (res.statusCode == 403) {
          // Presigned URLs expire after an hour; a slow member can outlast one.
          final r = await _call({
            'action': 'resign',
            'assetId': assetId,
            'parts': [part.number],
          });
          final fresh = (r['partUrls'] as Map)['${part.number}'] as String?;
          if (fresh != null) urls[part.number - 1] = fresh;
        }
        lastErr = GumletUploadFailedException(
            'part ${part.number} failed (${res.statusCode})');
      } catch (e) {
        lastErr = e; // network drop / timeout -> retry this part
      }
    }
    throw lastErr is GumletUploadFailedException
        ? lastErr
        : GumletUploadFailedException('part ${part.number} failed: $lastErr');
  }
}
