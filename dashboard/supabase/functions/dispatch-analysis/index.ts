import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Fan-out dispatcher for analyze-submission.
 *
 * WHY THIS EXISTS
 * ---------------
 * The retry cron used to call analyze-submission directly, once per pending
 * submission, through pg_net. On 24 Aug that path was failing 70-95% of the
 * time for hours: pg_net stalls on DNS resolution the moment several requests
 * are in flight at once. Measured over 90 minutes on live traffic:
 *
 *     13-25 pg_net requests/min  ->  53.6% delivered
 *     26+   pg_net requests/min  ->  28.2% delivered
 *     1     request  (manual)    ->  100% delivered, every time
 *
 * The failure scales with CONCURRENCY, not with volume of work. Slowing the
 * stagger (0.5s -> 1.5s -> 2.5s) helped but never fixed it, because the cron
 * still had to make one pg_net call per submission.
 *
 * So: the cron now makes exactly ONE pg_net call -- to this function -- and the
 * fan-out happens here instead, over Deno's network stack, which is healthy
 * (analyze-submission talks to Gemini, Bunny and OpenAI over it all day without
 * this failure mode). That is a 12-30x reduction in exposure to the broken path.
 *
 * SAFETY
 * ------
 * Dispatching the same submission twice is harmless: analyze-submission claims
 * rows atomically (`ai_status IS NULL` compare-and-swap) and a second arrival
 * exits immediately as `{skipped:true}`. So a retry that overlaps an in-flight
 * analysis cannot double-process or double-award points.
 *
 * This function only KICKS work off. It never writes a verdict, never touches
 * status or points, and deliberately holds no opinion about the submission --
 * every decision still belongs to analyze-submission exactly as before.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ANALYZE_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-submission`
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// How many to kick per run. The cron fires every minute, so this is the
// per-minute ceiling. Each kick becomes its own independent analyze-submission
// invocation with its own memory and time budget, so this is bounded by how
// much concurrent AI work is sensible, not by anything in this function.
// Raised from 25 on results night. Measured intake was ~8 videos/min against
// ~2.3 completions/min, so the queue grew by roughly 6/min no matter how
// healthy dispatch was. The ceiling was this batch size, not the AI: each kick
// is an independent invocation, and the ones that find Bunny still transcoding
// return in ~8s rather than occupying a slot for a full analysis.
// 60 was right when most kicks returned in ~8s having found nothing to do.
// Once streaming unblocked the large originals, every kick became a real
// 250-300MB transfer plus a full Gemini analysis, and 60 of those at once
// tripped Gemini's rate limits -- 137 rows came straight back as "Reviewer
// busy". Throughput collapsed from 59 completions per 5min to 2.
//
// 10 concurrent real analyses at roughly 60-90s each still clears ~7-10/min,
// which is far more than enough, and stays inside what Gemini will accept.
const BATCH = 10

// Spacing between kicks. Small, but non-zero: it keeps us from opening every
// socket in the same millisecond, which is the shape of load that was upsetting
// pg_net in the first place. 60ms * 60 = 3.6s total, well inside budget.
const KICK_SPACING_MS = 60

type Row = { id: string; org_id: string; forced: boolean }

async function kick(row: Row): Promise<boolean> {
  try {
    const res = await fetch(ANALYZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        ...(row.forced ? { force: true } : {}),
        record: { id: row.id, org_id: row.org_id },
      }),
      // Long enough for a full video analysis to finish and reply. We do not
      // need the verdict here -- analyze-submission writes it to the row itself
      // -- but holding the connection means the invocation is not cut short.
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      console.warn('[dispatch] non-ok', row.id, res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[dispatch] kick failed', row.id, e instanceof Error ? e.message : e)
    return false
  }
}

Deno.serve(async () => {
  try {
    // First-time analysis: never claimed, submitted long enough ago that the
    // original insert-trigger has had its chance, and recent enough to still
    // matter. Mirrors the window the cron used to query directly.
    // OLDEST MEMBER SUBMISSIONS FIRST -- whoever has been waiting longest gets
    // served first, which is the fair order once intake has closed.
    //
    // The COOLDOWN is what makes that safe. Ordering by submitted_at alone was
    // a head-of-line blocking bug earlier tonight: a video still transcoding
    // gets kicked, immediately returns to ai_status=null ("still processing"),
    // and is therefore STILL the oldest next cycle. Twenty-five stuck rows won
    // every dispatch and the ~80 behind them were never reached at all -- the
    // queue sat flat at ~105 while the same 25 were retried over and over.
    //
    // Excluding anything attempted in the last COOLDOWN_MS keeps the ordering
    // honest: a row is tried, sits out one short rotation while others get
    // their turn, then comes back around. Oldest-first, but nothing can
    // monopolise the batch.
    const COOLDOWN_MS = 3 * 60_000
    const { data: fresh } = await supabase
      .from('task_submissions')
      .select('id, org_id')
      .is('ai_status', null)
      .eq('status', 'pending')
      .lt('submitted_at', new Date(Date.now() - 2 * 60_000).toISOString())
      .gt('submitted_at', new Date(Date.now() - 6 * 60 * 60_000).toISOString())
      .or(`ai_started_at.is.null,ai_started_at.lt.${new Date(Date.now() - COOLDOWN_MS).toISOString()}`)
      .order('submitted_at', { ascending: true })
      .limit(BATCH)

    const rows: Row[] = (fresh ?? []).map(r => ({ id: r.id, org_id: r.org_id, forced: false }))

    // Admin-forced re-checks of already-decided rows, if there is room left.
    if (rows.length < BATCH) {
      const { data: forced } = await supabase
        .from('task_submissions')
        .select('id, org_id')
        .is('ai_status', null)
        .neq('status', 'pending')
        .not('ai_started_at', 'is', null)
        .lt('ai_started_at', new Date(Date.now() - 2 * 60_000).toISOString())
        .gt('ai_started_at', new Date(Date.now() - 6 * 60 * 60_000).toISOString())
        .order('ai_started_at', { ascending: true })
        .limit(BATCH - rows.length)
      for (const r of forced ?? []) rows.push({ id: r.id, org_id: r.org_id, forced: true })
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), { status: 200 })
    }

    // Fire them off, spaced out, WITHOUT waiting for the analyses to finish --
    // a video takes 30-60s and there is no reason to hold this function open
    // for the whole batch. waitUntil keeps the runtime alive long enough for
    // the requests to land and complete in the background.
    const kicks: Promise<boolean>[] = []
    for (const row of rows) {
      kicks.push(kick(row))
      if (KICK_SPACING_MS > 0) await new Promise(r => setTimeout(r, KICK_SPACING_MS))
    }

    // @ts-ignore -- EdgeRuntime is provided by the Supabase edge runtime.
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(Promise.allSettled(kicks))
    }

    console.log('[dispatch] kicked', rows.length)
    return new Response(JSON.stringify({ dispatched: rows.length }), { status: 200 })
  } catch (err) {
    console.error('[dispatch]', err)
    // Return 200 so pg_net records a delivered response rather than a timeout;
    // the cron simply tries again next minute.
    return new Response(JSON.stringify({ error: 'dispatch failed' }), { status: 200 })
  }
})
