/**
 * Client-safe checks on a proof_url. Signing and API calls live in
 * video-host.ts (server-only).
 *
 *   gumlet://<asset_id>  — current video host (Nov 2026 onward)
 *   bunny://<guid>       — retired host; files can no longer be fetched
 *   anything else        — a file in Supabase Storage (photos, very old videos)
 */
export const isGumletProof = (p?: string | null): p is string => !!p && p.startsWith('gumlet://')
export const isLegacyBunnyProof = (p?: string | null): p is string => !!p && p.startsWith('bunny://')
/** Video on a hosted service (either one) rather than a file in Supabase Storage. */
export const isHostedVideoProof = (p?: string | null): p is string => isGumletProof(p) || isLegacyBunnyProof(p)
/** Any video proof, hosted or a raw video file in Storage. */
export const isVideoProof = (p?: string | null): p is string =>
  isHostedVideoProof(p) || (!!p && /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(p))
