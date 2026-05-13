/// Convert a Supabase Storage public URL into a server-side-resized
/// thumbnail. Drops payload size from MB to KB and keeps client memory low.
///
/// Non-Supabase URLs (Google profile photos, etc.) are returned unchanged.
String avatarThumbnailUrl(String? url, {int size = 96, int quality = 70}) {
  if (url == null || url.isEmpty) return url ?? '';
  // Only Supabase Storage public URLs can be transformed via /render/image/
  if (!url.contains('/storage/v1/object/public/')) return url;
  final transformed = url.replaceFirst(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  final sep = transformed.contains('?') ? '&' : '?';
  return '$transformed${sep}width=$size&height=$size&quality=$quality&resize=cover';
}
