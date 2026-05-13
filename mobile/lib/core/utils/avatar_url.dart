/// Returns an avatar URL suitable for display.
///
/// NOTE: Supabase Storage image transforms (`/render/image/...?width=...`)
/// require the Pro plan. Until that's enabled, this is a no-op. Memory is
/// still bounded client-side via `ResizeImage` at the call sites.
///
/// When ready to enable transforms, switch this to:
///   url.replaceFirst('/object/public/', '/render/image/public/')
///   + '?width=$size&height=$size&quality=$quality&resize=cover'
String avatarThumbnailUrl(String? url, {int size = 96, int quality = 70}) {
  return url ?? '';
}
