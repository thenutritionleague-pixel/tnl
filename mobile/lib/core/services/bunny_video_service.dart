import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

/// Result of initiating a Bunny upload — returned by the `bunny-upload-init`
/// Supabase edge function. Contains everything the client needs to upload
/// directly to Bunny Stream via signed TUS headers.
class BunnyUploadInit {
  final String videoGuid;
  final String libraryId;
  final String tusEndpoint;
  final int expirationTime;
  final String signature;
  final String proofUrl; // e.g. "bunny://<guid>"
  const BunnyUploadInit({
    required this.videoGuid,
    required this.libraryId,
    required this.tusEndpoint,
    required this.expirationTime,
    required this.signature,
    required this.proofUrl,
  });
}

class BunnyUploadFailedException implements Exception {
  final String message;
  const BunnyUploadFailedException(this.message);
  @override
  String toString() => 'Video upload failed: $message';
}

/// Bunny Stream direct upload via TUS protocol with signature auth.
/// Uploads chunked in 2 MB slices so:
///   • progress can be reported to the UI
///   • a network hiccup only re-sends one chunk, not the whole video
///   • Chrome's XHR memory pressure stays bounded
class BunnyVideoService {
  static final _client = Supabase.instance.client;

  /// Chunk size for TUS PATCH — bigger = fewer round trips but more memory +
  /// slower resume; smaller = more overhead but smoother progress + easier
  /// recovery. 2 MB is the sweet spot for typical mobile networks.
  static const _chunkSize = 2 * 1024 * 1024; // 2 MB

  /// Call the `bunny-upload-init` edge function to reserve a video slot
  /// on Bunny and get signed upload credentials.
  static Future<BunnyUploadInit> initUpload({String? title}) async {
    final res = await _client.functions.invoke(
      'bunny-upload-init',
      body: {'title': title ?? 'proof-video'},
    );
    if (res.status != 200 || res.data == null) {
      throw BunnyUploadFailedException('init failed (${res.status}): ${res.data}');
    }
    final data = res.data as Map<String, dynamic>;
    return BunnyUploadInit(
      videoGuid:      data['videoGuid']      as String,
      libraryId:      data['libraryId']      as String,
      tusEndpoint:    data['tusEndpoint']    as String,
      expirationTime: data['expirationTime'] as int,
      signature:      data['signature']      as String,
      proofUrl:       data['proofUrl']       as String,
    );
  }

  /// Fire-and-forget: ask the server to delete a reserved Bunny video.
  /// Used to clean up when an upload fails partway — otherwise Bunny keeps
  /// an empty "Uploading" placeholder around forever.
  static Future<void> deleteReservation(String videoGuid) async {
    try {
      await _client.functions.invoke(
        'bunny-video-delete',
        body: {'videoGuid': videoGuid},
      );
    } catch (_) {
      // Best-effort cleanup. If it fails, the daily server-side sweep will
      // catch the orphan later. Never surface this to the user.
    }
  }

  /// Upload video bytes to Bunny via TUS. Returns the proof_url
  /// (`bunny://<guid>`) to store on the task_submissions row.
  ///
  /// [onProgress] is called with 0.0–1.0 as chunks upload. Use it to drive
  /// a progress bar in the UI.
  ///
  /// On any failure after the video is reserved, the reservation is deleted
  /// so it doesn't clutter the Bunny library as an empty placeholder.
  static Future<String> uploadVideo({
    required Uint8List bytes,
    required String mimeType,
    String? title,
    void Function(double progress)? onProgress,
  }) async {
    final init = await initUpload(title: title);

    try {
      return await _doUpload(init: init, bytes: bytes, mimeType: mimeType, title: title, onProgress: onProgress);
    } catch (err) {
      // Clean up the reserved Bunny slot — fire-and-forget, don't await.
      unawaited(deleteReservation(init.videoGuid));
      rethrow;
    }
  }

  static Future<String> _doUpload({
    required BunnyUploadInit init,
    required Uint8List bytes,
    required String mimeType,
    String? title,
    void Function(double progress)? onProgress,
  }) async {
    final headers = _authHeaders(init);
    final metadata = _metadata(mimeType: mimeType, title: title ?? 'proof-video');

    // ── Step 1: POST /tusupload → get Location for chunked PATCH ──
    final createRes = await http.post(
      Uri.parse(init.tusEndpoint),
      headers: {
        ...headers,
        'Tus-Resumable':   '1.0.0',
        'Upload-Length':   bytes.lengthInBytes.toString(),
        'Upload-Metadata': metadata,
      },
    );
    if (createRes.statusCode != 201) {
      throw BunnyUploadFailedException(
        'tus create failed (${createRes.statusCode}): ${createRes.body}',
      );
    }
    final location = createRes.headers['location'] ?? createRes.headers['Location'];
    if (location == null || location.isEmpty) {
      throw const BunnyUploadFailedException('tus create returned no Location header');
    }

    // Location can be absolute (https://...) or relative — resolve against endpoint
    final patchUri = Uri.parse(location).isAbsolute
        ? Uri.parse(location)
        : Uri.parse(init.tusEndpoint).resolve(location);

    // ── Step 2: PATCH chunks in 2 MB slices, reporting progress ──
    onProgress?.call(0);
    int offset = 0;
    final total = bytes.lengthInBytes;

    while (offset < total) {
      final end = (offset + _chunkSize > total) ? total : offset + _chunkSize;
      final chunk = Uint8List.sublistView(bytes, offset, end);

      final patchReq = http.Request('PATCH', patchUri);
      patchReq.headers.addAll({
        ...headers,
        'Tus-Resumable':  '1.0.0',
        'Upload-Offset':  offset.toString(),
        'Content-Type':   'application/offset+octet-stream',
        'Content-Length': chunk.lengthInBytes.toString(),
      });
      patchReq.bodyBytes = chunk;

      final streamed = await patchReq.send();
      final patchRes = await http.Response.fromStream(streamed);

      if (patchRes.statusCode != 204) {
        throw BunnyUploadFailedException(
          'tus patch failed at offset $offset (${patchRes.statusCode}): ${patchRes.body}',
        );
      }

      // Advance offset from Upload-Offset response header (authoritative)
      final newOffsetHeader = patchRes.headers['upload-offset'] ?? patchRes.headers['Upload-Offset'];
      final newOffset = int.tryParse(newOffsetHeader ?? '') ?? end;
      offset = newOffset;

      onProgress?.call(offset / total);
    }

    onProgress?.call(1);
    return init.proofUrl;
  }

  /// Bunny requires these headers on every TUS request. Signature auth
  /// avoids exposing the library API key to the client.
  static Map<String, String> _authHeaders(BunnyUploadInit init) => {
    'AuthorizationSignature': init.signature,
    'AuthorizationExpire':    init.expirationTime.toString(),
    'VideoId':                init.videoGuid,
    'LibraryId':              init.libraryId,
  };

  /// TUS Upload-Metadata: comma-separated `key base64(value)` pairs.
  static String _metadata({required String mimeType, required String title}) {
    String enc(String v) => base64.encode(utf8.encode(v));
    return 'filetype ${enc(mimeType)},title ${enc(title)}';
  }
}
