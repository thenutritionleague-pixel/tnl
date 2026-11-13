import { createHmac } from 'crypto'
import { isGumletProof } from './video-proof'

/**
 * Proof videos live on Gumlet as `gumlet://<asset_id>` (Nov 2026 onward).
 *
 * `bunny://<guid>` rows are from the retired Bunny account. Its files cannot be
 * fetched any more, so they resolve to null and the UI shows "no longer
 * available" instead of a broken player. Their points and history are untouched.
 *
 * Server-only: uses the Gumlet sign secret and API key.
 */

const GUMLET_WORKSPACE_ID = process.env.GUMLET_WORKSPACE_ID || ''
const GUMLET_SIGN_SECRET  = process.env.GUMLET_SIGN_SECRET  || ''
const GUMLET_API_KEY      = process.env.GUMLET_API_KEY      || ''
const GUMLET_CDN          = 'https://video.gumlet.io'

export { isGumletProof, isLegacyBunnyProof, isHostedVideoProof, isVideoProof } from './video-proof'

export const gumletAssetId = (p: string) => p.replace('gumlet://', '')

/**
 * Gumlet signed URL: HMAC-SHA1 (hex) over path + expiry, keyed with the
 * BASE64-DECODED sign secret. Verified against a real asset 13 Nov 2026.
 */
export function gumletSignUrl(url: string, ttlSeconds = 1800): string {
  if (!GUMLET_SIGN_SECRET) return url
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const path = url.slice(GUMLET_CDN.length)
  const token = createHmac('sha1', Buffer.from(GUMLET_SIGN_SECRET, 'base64'))
    .update(path + String(expires))
    .digest('hex')
  return `${url}?token=${token}&expires=${expires}`
}

/** Thumbnails are served without a token even with signed URLs on. */
export function gumletThumbUrl(assetId: string): string {
  return `${GUMLET_CDN}/${GUMLET_WORKSPACE_ID}/${assetId}/thumbnail-1-0.png`
}

/**
 * A URL an admin's <video> tag can play.
 *
 * download.mp4 exists once Gumlet finishes the transcode (~1 min for a 60 s
 * clip). Until then, fall back to the uploaded original, which Gumlet serves
 * from the moment the upload completes -- so a reviewer is never stuck on
 * "processing" for a video that is sitting right there. That was the lesson of
 * the 24 Aug Bunny backlog.
 */
export async function gumletPlayableUrl(assetId: string, ttlSeconds = 1800): Promise<string> {
  const mp4 = gumletSignUrl(`${GUMLET_CDN}/${GUMLET_WORKSPACE_ID}/${assetId}/download.mp4`, ttlSeconds)
  // Probe with a one-byte ranged GET and a timeout: a probe that never answers
  // must not hang the review panel (24 Aug Compare-panel spinner).
  try {
    const r = await fetch(mp4, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(6000) })
    r.body?.cancel().catch(() => {})
    if (r.ok || r.status === 206) return mp4
  } catch { /* fall through to the original */ }

  if (GUMLET_API_KEY) {
    try {
      const res = await fetch(`https://api.gumlet.com/v1/video/assets/${assetId}`, {
        headers: { Authorization: `Bearer ${GUMLET_API_KEY}`, accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const asset = await res.json() as { original_download_url?: string }
        if (asset.original_download_url) return asset.original_download_url
      }
    } catch { /* return the MP4 URL; the player shows its own error */ }
  }
  return mp4
}

/** Playable URL for any hosted video proof; null for retired Bunny files. */
export async function hostedVideoUrl(proofUrl: string, ttlSeconds = 1800): Promise<string | null> {
  if (isGumletProof(proofUrl)) return gumletPlayableUrl(gumletAssetId(proofUrl), ttlSeconds)
  return null
}

/** Delete a Gumlet asset. Used when an admin clears a submission for resubmit. */
export async function deleteGumletAsset(assetId: string): Promise<void> {
  if (!GUMLET_API_KEY) return
  const res = await fetch(`https://api.gumlet.com/v1/video/assets/${assetId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${GUMLET_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok && res.status !== 404) throw new Error(`Gumlet delete failed (${res.status})`)
}
