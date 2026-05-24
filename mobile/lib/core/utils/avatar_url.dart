/// Returns an avatar URL suitable for display.
///
/// We previously rewrote URLs through Supabase's `/render/image/` endpoint to
/// resize avatars server-side. That endpoint counts every unique source image
/// against the Pro plan's "Storage Image Transformations" quota (100 originals
/// per month) — which is far too low for this app's scale.
///
/// Avatars are already capped client-side at upload (maxWidth/maxHeight: 512,
/// JPEG quality 80 → ~50 KB) so server-side resizing buys us nothing meaningful
/// on payload size, and on-device `ResizeImage(...)` still bounds memory
/// during scroll. This helper now just returns the URL unchanged.
///
/// Keep the helper around so we don't have to rip out every call site if we
/// ever switch to a different transformation service (Cloudflare Images,
/// imgix, etc.) — that swap would happen here.
String avatarThumbnailUrl(String? url, {int size = 96, int quality = 70}) {
  return url ?? '';
}
