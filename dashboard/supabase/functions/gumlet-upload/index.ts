import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Member-side video upload to Gumlet. Replaces bunny-upload-init and
 * bunny-video-delete (Bunny account deactivated Nov 2026).
 *
 * The API key never leaves the server. The browser only ever sees presigned S3
 * part URLs, uploads the file in parts straight to Gumlet, and hands the part
 * ETags back here to finish the upload.
 *
 * Why multipart and not Gumlet's single presigned PUT: members upload from the
 * web app, which cannot compress (video_compress has no web implementation), so
 * clips are routinely 90-250 MB. A single PUT that drops at 90% restarts from
 * zero. Parts are retried one at a time, which is the same protection the Bunny
 * TUS uploader gave us.
 *
 * Actions (POST body `action`):
 *   init     { title, size }          -> { assetId, partSize, partUrls[], proofUrl }
 *   resign   { assetId, parts:[n] }   -> { partUrls: { [n]: url } }   (S3 URLs expire after 1h)
 *   complete { assetId, parts:[{PartNumber,ETag}] } -> { ok: true }
 *   abort    { assetId }              -> { ok: true }   (failed upload cleanup)
 *
 * Verified against the live API on 13 Nov 2026: browser CORS allows PUT and
 * exposes ETag on part URLs; a 90 MB / 60 s clip in 9 parts was ready ~55 s
 * after complete, and download.mp4 (signed) served the transcode.
 */

const GUMLET_API_KEY      = Deno.env.get('GUMLET_API_KEY') ?? ''
const GUMLET_WORKSPACE_ID = Deno.env.get('GUMLET_WORKSPACE_ID') ?? ''
const API = 'https://api.gumlet.com/v1'

// S3 multipart floor is 5 MB for every part but the last. 8 MB keeps a
// 250 MB clip at 32 parts while a dropped part costs at most 8 MB to resend,
// and the member's progress bar moves at least every 8 MB.
const PART_SIZE = 8 * 1024 * 1024
// Matches the app's own ceiling with headroom; anything larger is refused
// before an asset is created so it never costs storage.
const MAX_BYTES = 600 * 1024 * 1024
const MAX_PARTS = Math.ceil(MAX_BYTES / PART_SIZE)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function gumlet(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GUMLET_API_KEY}`,
      'accept':        'application/json',
      // Only with a body: Gumlet answers a body-less request that claims JSON
      // (e.g. DELETE) with 400 "Unexpected end of JSON input".
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> | null }
}

async function signParts(assetId: string, partNumbers: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {}
  // Bounded concurrency: a 250 MB clip is 25 signing calls, and Gumlet does not
  // publish a rate limit, so don't fire them all at once.
  for (let i = 0; i < partNumbers.length; i += 8) {
    const batch = partNumbers.slice(i, i + 8)
    const results = await Promise.all(batch.map(n => gumlet('GET', `/video/assets/${assetId}/multipartupload/${n}/sign`)))
    results.forEach((r, j) => {
      const url = (r.data as { part_upload_url?: string } | null)?.part_upload_url
      if (!r.ok || !url) throw new Error(`sign part ${batch[j]} failed (${r.status})`)
      out[batch[j]] = url
    })
  }
  return out
}

// The asset must have been created for THIS member. Ownership is stamped into
// the asset's metadata at init, so a member cannot complete or delete someone
// else's upload by guessing an asset id.
async function ownsAsset(assetId: string, userId: string): Promise<boolean> {
  const r = await gumlet('GET', `/video/assets/${assetId}`)
  if (!r.ok) return false
  const meta = ((r.data?.input as Record<string, unknown> | undefined)?.metadata ?? {}) as Record<string, unknown>
  return meta.user_id === userId
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    if (!GUMLET_API_KEY || !GUMLET_WORKSPACE_ID) {
      console.error('[gumlet-upload] Gumlet credentials missing')
      return json({ error: 'Video service not configured' }, 500)
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'Missing auth' }, 401)
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) return json({ error: 'Invalid auth' }, 401)

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = body.action ?? 'init'

    if (action === 'init') {
      const size = Number(body.size)
      if (!Number.isFinite(size) || size <= 0) return json({ error: 'Missing or invalid size' }, 400)
      if (size > MAX_BYTES) return json({ error: 'Video too large' }, 413)
      const title = typeof body.title === 'string' && body.title.length < 200 ? body.title : 'proof-video'

      const created = await gumlet('POST', '/video/assets/upload', {
        workspace_id: GUMLET_WORKSPACE_ID,
        // ABR for admin playback, plus an MP4 (download.mp4) for the AI.
        // Without mp4_access the MP4 URLs return 403 -- the dashboard default
        // has it off, so it must be requested here on every upload.
        format: 'ABR',
        mp4_access: true,
        // Only what review needs. Gumlet's default renders up to 2160p, which
        // only adds processing time at peak.
        resolution: ['360p', '720p'],
        // The original is the AI's fallback while a transcode is queued. The
        // API defaults this to false, unlike the dashboard.
        keep_original: true,
        title,
        metadata: { user_id: user.id },
      })
      const assetId = (created.data as { asset_id?: string } | null)?.asset_id
      if (!created.ok || !assetId) {
        console.error('[gumlet-upload] create failed', created.status, JSON.stringify(created.data))
        return json({ error: 'Video service create failed', status: created.status }, 502)
      }

      const partCount = Math.max(1, Math.ceil(size / PART_SIZE))
      try {
        const signed = await signParts(assetId, Array.from({ length: partCount }, (_, i) => i + 1))
        return json({
          assetId,
          partSize: PART_SIZE,
          partUrls: Array.from({ length: partCount }, (_, i) => signed[i + 1]),
          proofUrl: `gumlet://${assetId}`,
        })
      } catch (e) {
        // Don't leave an empty placeholder eating storage.
        await gumlet('DELETE', `/video/assets/${assetId}`).catch(() => {})
        throw e
      }
    }

    const assetId = typeof body.assetId === 'string' ? body.assetId : ''
    if (!/^[0-9a-f]{24}$/.test(assetId)) return json({ error: 'Missing or invalid assetId' }, 400)
    if (!(await ownsAsset(assetId, user.id))) return json({ error: 'Not your upload' }, 403)

    if (action === 'resign') {
      const parts = (Array.isArray(body.parts) ? body.parts : [])
        .map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= MAX_PARTS)
      if (parts.length === 0) return json({ error: 'No parts' }, 400)
      return json({ partUrls: await signParts(assetId, parts) })
    }

    if (action === 'complete') {
      const parts = (Array.isArray(body.parts) ? body.parts : []) as { PartNumber?: unknown; ETag?: unknown }[]
      const clean = parts
        .map(p => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag ?? '') }))
        .filter(p => Number.isInteger(p.PartNumber) && p.PartNumber >= 1 && p.ETag)
        .sort((a, b) => a.PartNumber - b.PartNumber)
      if (clean.length === 0 || clean.length !== parts.length) return json({ error: 'Invalid parts' }, 400)
      const done = await gumlet('POST', `/video/assets/${assetId}/multipartupload/complete`, { parts: clean })
      if (!done.ok) {
        console.error('[gumlet-upload] complete failed', done.status, JSON.stringify(done.data))
        return json({ error: 'Video service complete failed', status: done.status }, 502)
      }
      return json({ ok: true })
    }

    if (action === 'abort') {
      // Never delete a video a submission already points at.
      const { count } = await supabase
        .from('task_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('proof_url', `gumlet://${assetId}`)
      if ((count ?? 0) > 0) return json({ ok: true, kept: true })
      const del = await gumlet('DELETE', `/video/assets/${assetId}`)
      if (del.ok || del.status === 404) return json({ ok: true })
      console.error('[gumlet-upload] delete failed', del.status, JSON.stringify(del.data))
      return json({ error: 'Video service delete failed' }, 502)
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gumlet-upload]', msg)
    return json({ error: 'Internal error' }, 500)
  }
})
