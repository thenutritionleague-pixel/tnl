'use server'

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Re-analyze a submission by delegating to the Supabase edge function
 * `analyze-submission`. This is the ONE place AI logic lives:
 *   - Mobile submits → trigger → analyze-submission (same edge fn)
 *   - Admin clicks Re-analyze → this action → analyze-submission (same edge fn)
 *
 * Benefits over the previous 300-line duplicated implementation:
 *   • Every prompt/threshold change automatically applies to both flows
 *   • Env vars (OPENAI, GEMINI, BUNNY) only need to live in Supabase secrets —
 *     the dashboard host (Netlify) doesn't need any AI keys anymore
 *   • Bunny URL handling, tier logic, food leniency etc. are guaranteed
 *     identical between the two entry points
 */
export async function runAiAnalysis(
  submissionId: string,
  force: boolean = false,
): Promise<{ aiStatus: string; aiFeedback: string; aiConfidence: number } | null> {
  const client = await createAdminClient()

  const { data: sub } = await client
    .from('task_submissions')
    .select('org_id, status')
    .eq('id', submissionId)
    .single()

  if (!sub) return null

  // Idempotency: on non-forced trigger fires (unused here — trigger goes
  // directly to the edge fn), only proceed on pending. From the Re-analyze
  // button (force=true), always run.
  if (!force && sub.status !== 'pending') return null

  // Reset AI state so the edge fn's atomic claim (ai_status IS NULL) succeeds.
  await client
    .from('task_submissions')
    .update({ ai_status: null, ai_feedback: null, ai_confidence: null })
    .eq('id', submissionId)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    console.error('[runAiAnalysis] NEXT_PUBLIC_SUPABASE_URL missing')
    return { aiStatus: 'needs_review', aiFeedback: 'Server misconfigured — please try again.', aiConfidence: 0 }
  }

  // Fire the edge function synchronously (matches the previous UX — user waits
  // on the "Analyzing…" spinner until the AI is done).
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/analyze-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { id: submissionId, org_id: sub.org_id } }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[runAiAnalysis] edge fn returned', res.status, errText)
      await client
        .from('task_submissions')
        .update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' })
        .eq('id', submissionId)
        .eq('ai_status', 'analyzing')
    }
  } catch (e) {
    console.error('[runAiAnalysis] edge fn call threw', e instanceof Error ? e.message : e)
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' })
      .eq('id', submissionId)
      .eq('ai_status', 'analyzing')
  }

  // Re-fetch final state from DB — the edge fn wrote whatever it decided.
  const { data: updated } = await client
    .from('task_submissions')
    .select('ai_status, ai_feedback, ai_confidence')
    .eq('id', submissionId)
    .single()

  if (!updated) return null

  return {
    aiStatus:     updated.ai_status ?? 'needs_review',
    aiFeedback:   updated.ai_feedback ?? '',
    aiConfidence: (updated.ai_confidence as number | null) ?? 0,
  }
}
