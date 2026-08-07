'use server'

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Trigger AI analysis for a submission. This is the ONE place AI is kicked off
 * from the dashboard:
 *   - Mobile submits → trigger → analyze-submission (edge fn)
 *   - Admin clicks Re-analyze / Run AI Checks → this action → analyze-submission
 *
 * IMPORTANT — why this is fire-and-forget:
 * Video analysis now takes 30s–6min (Bunny processing + Flash-with-thinking +
 * Pro escalation). A Netlify server action is killed at ~26s, so we must NOT
 * hold the request open waiting for the edge fn — the browser would never get a
 * result and the UI would spin on "AI Analyzing…" forever.
 *
 * Instead we call the `reanalyze_submission` RPC, which resets the AI state and
 * kicks the edge function in the background via pg_net (the same mechanism the
 * retry cron uses), then returns immediately. The client then polls
 * `getSubmissionAiStatus` until the verdict lands.
 */
export async function runAiAnalysis(
  submissionId: string,
  force: boolean = false,
): Promise<{ aiStatus: string } | null> {
  const client = await createAdminClient()

  const { data: sub } = await client
    .from('task_submissions')
    .select('status')
    .eq('id', submissionId)
    .single()

  if (!sub) return null
  // From Run AI Checks (force=false) only touch pending rows. From the
  // Re-analyze button (force=true), always run.
  if (!force && sub.status !== 'pending') return null

  // Reset AI state + fire the edge function in the background (returns instantly).
  const { error } = await client.rpc('reanalyze_submission', { p_id: submissionId })
  if (error) {
    console.error('[runAiAnalysis] reanalyze_submission RPC failed:', error.message)
    return null
  }

  return { aiStatus: 'analyzing' }
}

/**
 * Read the current AI state of a submission. Used by the client to poll after
 * triggering analysis. Returns aiStatus === 'analyzing' (or null, transiently
 * right after the reset) while the edge function is still working.
 */
export async function getSubmissionAiStatus(
  submissionId: string,
): Promise<{ aiStatus: string | null; aiFeedback: string; aiConfidence: number; status: string } | null> {
  const client = await createAdminClient()
  const { data } = await client
    .from('task_submissions')
    .select('ai_status, ai_feedback, ai_confidence, status')
    .eq('id', submissionId)
    .single()

  if (!data) return null
  return {
    aiStatus:     data.ai_status ?? null,
    aiFeedback:   data.ai_feedback ?? '',
    aiConfidence: (data.ai_confidence as number | null) ?? 0,
    status:       data.status,
  }
}
