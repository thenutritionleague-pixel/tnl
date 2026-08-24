import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Last technical lever for the 24 Aug Bunny backlog.
 *
 * 145 videos sat on "still processing" with no thumbnail and no size, meaning
 * Bunny had never started them. Two things we had never actually done:
 *
 *   1. Read Bunny's REAL status code for those videos. Everything up to now
 *      inferred it. If they are sitting in an error state rather than a queue,
 *      that changes the answer entirely.
 *   2. Ask Bunny to re-encode. A video wedged in its queue can often be pushed
 *      through with an explicit /reencode, which we had never called.
 *
 * Reports the status distribution so the situation is finally measured rather
 * than guessed, and nudges the ones worth nudging. Read-only against our own
 * DB -- it never approves, rejects, or scores anything.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const LIB = Deno.env.get('BUNNY_LIBRARY_ID') ?? ''
const KEY = Deno.env.get('BUNNY_API_KEY') ?? ''
const CDN = Deno.env.get('BUNNY_CDN_HOSTNAME') ?? ''
const TOK = Deno.env.get('BUNNY_TOKEN_AUTH_KEY') ?? ''

async function signPath(path: string, ttl = 900): Promise<string> {
  const base = `https://${CDN}${path}`
  if (!TOK) return base
  const expires = Math.floor(Date.now() / 1000) + ttl
  const raw = new TextEncoder().encode(TOK + path + String(expires))
  const digest = new Uint8Array(
    await crypto.subtle.digest('MD5' in crypto.subtle ? 'MD5' : 'MD5', raw).catch(() => new ArrayBuffer(0)),
  )
  let bin = ''
  for (const b of digest) bin += String.fromCharCode(b)
  const token = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base}?token=${token}&expires=${expires}`
}

Deno.serve(async (req) => {
  if (!LIB || !KEY) {
    return new Response(JSON.stringify({ error: 'bunny creds missing' }), { status: 200 })
  }

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Number(body.limit ?? 40), 100)
  const doReencode: boolean = body.reencode === true

  const { data: rows } = await supabase
    .from('task_submissions')
    .select('id, proof_url')
    .eq('status', 'pending')
    .is('ai_status', null)
    .like('proof_url', 'bunny://%')
    .is('video_fingerprint', null)
    .order('submitted_at', { ascending: true })
    .limit(limit)

  const statusCounts: Record<string, number> = {}
  const nudged: string[] = []
  const errors: string[] = []

  for (const r of rows ?? []) {
    const guid = r.proof_url.replace('bunny://', '')
    try {
      const res = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, {
        headers: { AccessKey: KEY, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        statusCounts[`http_${res.status}`] = (statusCounts[`http_${res.status}`] ?? 0) + 1
        continue
      }
      const v = await res.json() as { status?: number; length?: number; storageSize?: number }
      const key = `status_${v.status ?? 'null'}`
      statusCounts[key] = (statusCounts[key] ?? 0) + 1

      // Size distribution against the 200MB transfer ceiling, so we can tell
      // whether a chunked/resumable upload is actually worth building or
      // whether these clear on their own once Bunny finishes.
      const mb = Math.round((v.storageSize ?? 0) / 1048576)
      const bucket = mb === 0 ? 'size_unknown'
        : mb <= 80 ? 'size_0_80MB'
        : mb <= 200 ? 'size_80_200MB'
        : 'size_over_200MB'
      statusCounts[bucket] = (statusCounts[bucket] ?? 0) + 1

      // status: 0 queued, 1 processing, 2 encoding, 3 finished, 4 resolution
      // finished, 5 failed, 6 presigned-upload started, 7 transcoding error.
      // A video Bunny has genuinely wedged (0 with real bytes on disk, or an
      // error state) is the case /reencode exists for.
      const wedged = v.status === 0 || v.status === 5 || v.status === 7
      if (doReencode && wedged && (v.storageSize ?? 0) > 0) {
        const re = await fetch(
          `https://video.bunnycdn.com/library/${LIB}/videos/${guid}/reencode`,
          { method: 'POST', headers: { AccessKey: KEY }, signal: AbortSignal.timeout(8000) },
        )
        if (re.ok) nudged.push(guid)
        else errors.push(`reencode_${re.status}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message.slice(0, 60) : 'err')
    }
    await new Promise(r => setTimeout(r, 40))
  }

  // What does the CDN ACTUALLY return for these files? 403 means our signing
  // is wrong, 404 means the object is not published yet, 200/206 means it was
  // fetchable all along and the bug is ours. This is the measurement that
  // every previous theory was missing.
  const probe: Record<string, unknown> = { cdnConfigured: !!CDN, tokenConfigured: !!TOK }
  const first = (rows ?? [])[0]
  if (first) {
    const guid = first.proof_url.replace('bunny://', '')
    for (const [label, path] of [
      ['original', `/${guid}/original`],
      ['thumbnail', `/${guid}/thumbnail.jpg`],
      ['play_720p', `/${guid}/play_720p.mp4`],
    ] as const) {
      try {
        const u = await signPath(path)
        const r = await fetch(u, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(8000) })
        probe[label] = r.status
        if (label === 'original') {
          probe.contentRange = r.headers.get('content-range')
          probe.contentLength = r.headers.get('content-length')
          const cr = r.headers.get('content-range') ?? ''
          const total = Number(cr.split('/')[1] ?? '0')
          probe.totalBytes = total
          probe.totalMB = Math.round(total / 1048576)
        }
        r.body?.cancel()
      } catch (e) {
        probe[label] = e instanceof Error ? e.message.slice(0, 40) : 'err'
      }
    }
  }

  // Is Gemini rate-limiting us, or is the quota gone for the day? Those look
  // identical from inside the pipeline (both classified transient, both
  // producing "Reviewer busy") but the answers are opposite: one clears in
  // seconds, the other not until the quota window resets.
  const gem: Record<string, unknown> = {}
  try {
    const key = Deno.env.get('GEMINI_API_KEY') ?? ''
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
        signal: AbortSignal.timeout(15000),
      },
    )
    gem.status = r.status
    if (!r.ok) gem.body = (await r.text()).slice(0, 300)
    else gem.ok = true
  } catch (e) {
    gem.error = e instanceof Error ? e.message.slice(0, 120) : 'err'
  }

  // CAN A PARTIAL DOWNLOAD BE ANALYSED?
  //
  // We do not need all 138MB to confirm someone did burpees -- we need enough
  // frames. If the MP4 was written faststart (moov atom at the front, which is
  // what browser-based uploads typically produce) then a prefix is a valid,
  // decodable clip. If moov sits at the end, a prefix is undecodable and this
  // idea is dead. Only a real test settles it, so: pull a prefix, hand it to
  // Gemini, and see whether it can actually describe the video.
  const partial: Record<string, unknown> = {}
  if (body.testPartial === true && first) {
    const guid = first.proof_url.replace('bunny://', '')
    const MB = Number(body.partialMB ?? 40)
    try {
      const u = await signPath(`/${guid}/original`)
      const r = await fetch(u, {
        headers: { Range: `bytes=0-${MB * 1048576 - 1}` },
        signal: AbortSignal.timeout(60_000),
      })
      partial.fetchStatus = r.status
      const buf = new Uint8Array(await r.arrayBuffer())
      partial.gotMB = Math.round(buf.byteLength / 1048576)

      let bin = ''
      const CH = 8192
      for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH))
      const b64 = btoa(bin)

      const key = Deno.env.get('GEMINI_API_KEY') ?? ''
      const g = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: 'video/mp4', data: b64 } },
                { text: 'In one short sentence: what physical activity is this person doing? If the video is unreadable, reply exactly UNREADABLE.' },
              ],
            }],
            generationConfig: { maxOutputTokens: 60, temperature: 0 },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      )
      partial.geminiStatus = g.status
      const txt = await g.text()
      partial.geminiSays = txt.slice(0, 300)
    } catch (e) {
      partial.error = e instanceof Error ? e.message.slice(0, 150) : 'err'
    }
  }

  return new Response(JSON.stringify({
    inspected: (rows ?? []).length,
    statusCounts,
    nudgedCount: nudged.length,
    probe,
    gemini: gem,
    partial,
    errors: errors.slice(0, 5),
  }), { status: 200 })
})
