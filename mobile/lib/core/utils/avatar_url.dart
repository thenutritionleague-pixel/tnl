/// Convert a Supabase Storage public URL into a server-side-resized thumbnail.
/// Drops payload from MB to KB per avatar — biggest egress lever.
///
/// Non-Supabase URLs (Google profile photos, etc.) are returned unchanged.
/// Requires the Supabase Pro plan for `/render/image/` to be enabled.
String avatarThumbnailUrl(String? url, {int size = 96, int quality = 70}) {
  if (url == null || url.isEmpty) return url ?? '';
  if (!url.contains('/storage/v1/object/public/')) return url;
  final transformed = url.replaceFirst(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  final sep = transformed.contains('?') ? '&' : '?';
  return '$transformed${sep}width=$size&height=$size&quality=$quality&resize=cover';
}
