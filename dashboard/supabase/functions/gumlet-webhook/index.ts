import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Gumlet calls this when a video finishes (or fails) processing.
 *
 * This is the FAST path. On insert, analyze-submission usually finds the
 * transcode still running and parks the row as "Video still processing — will
 * retry." Without this hook the next attempt waits for dispatch-analysis's
 * 3-minute cooldown; with it the AI starts the moment the MP4 exists (~1 min
 * after upload for a 60 s clip, measured 13 Nov 2026).
 *
 * The cron path stays as the safety net: Gumlet retries a failed delivery only
 * every ~30 minutes, so nothing may DEPEND on this firing.
 *
 * Auth: Gumlet sends the token configured on the webhook in `x-gumlet-token`
 * (no HMAC). Deployed with verify_jwt = false; the token is the gate.
 */

const TOKEN = Deno.env.get('GUMLET_WEBHOOK_TOKEN') ?? ''
const ANALYZE_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-submission`
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY)

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const ok = (body: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!TOKEN || !safeEqual(req.headers.get('x-gumlet-token') ?? '', TOKEN)) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const evt = await req.json() as {
      type?: string; status?: string; asset_id?: string
      error?: { code?: string; message?: string }
    }
    const assetId = evt.asset_id ?? ''
    if (!/^[0-9a-f]{24}$/.test(assetId)) return ok({ ignored: 'no asset' })

    const type = evt.type ?? ''
    const status = evt.status ?? ''
    const ready = status === 'ready' || type === 'video.status.ready'
    const errored = status === 'errored' || type === 'video.status.errored'
    // stream_ready fires before the MP4 exists; analyze-submission checks the
    // asset itself, so kicking on it is harmless and occasionally earlier.
    const streamReady = type === 'video.status.stream_ready'
    if (!ready && !errored && !streamReady) return ok({ ignored: type || status })

    // The submission row may not exist yet: the app inserts it right after the
    // upload completes, and a short clip can finish processing first. That is
    // fine -- the insert itself triggers analysis, which will find it ready.
    const { data: rows } = await supabase
      .from('task_submissions')
      .select('id, org_id, ai_status, status')
      .eq('proof_url', `gumlet://${assetId}`)
      .eq('status', 'pending')
    const pending = (rows ?? []) as { id: string; org_id: string; ai_status: string | null }[]
    if (pending.length === 0) return ok({ rows: 0 })

    if (errored) {
      const msg = 'We could not process this video. Please record it again and re-upload — an MP4 from your phone camera works best.'
      console.warn('[gumlet-webhook] errored', assetId, evt.error?.code, evt.error?.message)
      for (const r of pending) {
        // Only rows still waiting on the video. An admin decision or an AI run
        // in flight must not be overwritten by a late webhook.
        await supabase.from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: msg })
          .eq('id', r.id).is('ai_status', null)
      }
      return ok({ errored: pending.length })
    }

    // Kick analysis for rows parked on the video. analyze-submission claims
    // with `ai_status is null`, so a duplicate kick is a no-op.
    // Gumlet waits only 25 s for our reply and an analysis can take longer, so
    // reply now and let the kicks finish in the background (same pattern as
    // dispatch-analysis).
    const kicks = pending
      .filter(r => r.ai_status === null)
      .map(r => fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ record: { id: r.id, org_id: r.org_id } }),
      }).then(res => res.body?.cancel()).catch(e => console.warn('[gumlet-webhook] kick failed', r.id, e instanceof Error ? e.message : e)))
    // @ts-ignore -- EdgeRuntime is provided by the Supabase edge runtime.
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore -- see above
      EdgeRuntime.waitUntil(Promise.allSettled(kicks))
    }
    return ok({ kicked: kicks.length })
  } catch (err) {
    console.error('[gumlet-webhook]', err instanceof Error ? err.message : err)
    // 200 anyway: a parse problem will not fix itself on Gumlet's retry, and the
    // cron safety net still covers the row.
    return ok({ error: true })
  }
})
