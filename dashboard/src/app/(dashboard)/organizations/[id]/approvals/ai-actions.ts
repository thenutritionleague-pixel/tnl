'use server'

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'

type SubmissionWithTask = {
  user_id: string
  org_id: string
  task_id: string
  status: string
  proof_url: string | null
  challenge_id: string | null
  tasks: { title: string; description: string; points: number } | null
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface AiResult {
  approved: boolean
  confidence: number
  issues: string[]
  feedback: string
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch {
    return null
  }
}

// org_id is always fetched from DB — never trusted from the caller
export async function runAiAnalysis(
  submissionId: string,
): Promise<{ aiStatus: string; aiFeedback: string; aiConfidence: number } | null> {
  const client = await createAdminClient()

  // Fetch submission — extract org_id from DB, never from caller
  const { data: subRaw } = await client
    .from('task_submissions')
    .select('user_id, org_id, task_id, status, proof_url, challenge_id, tasks(title, description, points)')
    .eq('id', submissionId)
    .single()

  if (!subRaw) return null

  const sub = subRaw as unknown as SubmissionWithTask

  // Idempotency: skip if already processed
  if (sub.status !== 'pending') return null

  const orgId = sub.org_id

  // Atomic claim: only proceed if we can flip ai_status from null → 'analyzing'
  const { data: claimed } = await client
    .from('task_submissions')
    .update({ ai_status: 'analyzing' })
    .eq('id', submissionId)
    .is('ai_status', null)
    .select('id')

  if (!claimed || claimed.length === 0) {
    // Another worker already claimed this submission
    return null
  }

  if (!sub.proof_url) {
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'No proof image found.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'No proof image found.', aiConfidence: 0 }
  }

  const taskTitle: string = sub.tasks?.title ?? 'wellness task'
  const taskDesc: string = sub.tasks?.description ?? ''

  // Get signed URL for current image
  const { data: signed } = await client.storage
    .from('task-proofs')
    .createSignedUrl(sub.proof_url, 120)

  if (!signed?.signedUrl) {
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'Could not access proof image.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'Could not access proof image.', aiConfidence: 0 }
  }

  // Fetch up to 3 previous approved proofs for same task + user (duplicate check)
  const { data: prevSubs } = await client
    .from('task_submissions')
    .select('proof_url')
    .eq('task_id', sub.task_id)
    .eq('user_id', sub.user_id)
    .eq('status', 'approved')
    .order('submitted_at', { ascending: false })
    .limit(3)

  // Build image content blocks
  type ImageBlock = { type: 'image_url'; image_url: { url: string; detail: 'low' } }
  type TextBlock = { type: 'text'; text: string }

  const currentBase64 = await fetchImageAsBase64(signed.signedUrl)
  if (!currentBase64) {
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'Could not download proof image.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'Could not download proof image.', aiConfidence: 0 }
  }

  const imageBlocks: ImageBlock[] = [
    {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'low' },
    },
  ]

  // Attach previous approved images for duplicate detection
  let prevCount = 0
  for (const prev of prevSubs ?? []) {
    if (!prev.proof_url) continue
    const { data: prevSigned } = await client.storage
      .from('task-proofs')
      .createSignedUrl(prev.proof_url, 60)
    if (!prevSigned?.signedUrl) continue
    const prevBase64 = await fetchImageAsBase64(prevSigned.signedUrl)
    if (!prevBase64) continue
    imageBlocks.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${prevBase64}`, detail: 'low' },
    })
    prevCount++
  }

  const hasPrevious = prevCount > 0
  const prompt = `You are reviewing a wellness challenge task submission.

Task: "${taskTitle}"${taskDesc ? `\nDescription: ${taskDesc}` : ''}

Image 1 is the current submission.${hasPrevious ? `\nImages 2–${prevCount + 1} are this member's previous approved submissions for the same task (for duplicate detection).` : ''}

Evaluate on three criteria:
1. TASK MATCH — Does Image 1 clearly show completion of this specific task?
2. AUTHENTICITY — Does it look like a genuine real photo? (reject if AI-generated, stock photo, screenshot, or obviously fake)
3. UNIQUENESS — Is it meaningfully different from any previous images? (reject if the same or near-identical photo is reused)

Be lenient with real-looking photos that broadly match the task. Only reject clear violations.

Respond in JSON only — no markdown, no extra text:
{"approved":true|false,"confidence":0.0-1.0,"issues":[],"feedback":"Brief message shown to the member only if rejected"}`

  const contentBlocks: (TextBlock | ImageBlock)[] = [
    { type: 'text', text: prompt },
    ...imageBlocks,
  ]

  let result: AiResult
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: contentBlocks }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    })
    result = JSON.parse(response.choices[0].message.content ?? '{}') as AiResult
  } catch (e) {
    console.error('[runAiAnalysis] OpenAI/parse error:', e)
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'AI analysis failed — please review manually.', aiConfidence: 0 }
  }

  const confidence = Math.min(1, Math.max(0, result.confidence ?? 0))
  const feedback = result.feedback ?? ''

  let aiStatus: string
  if (result.approved && confidence >= 0.85) {
    aiStatus = 'approved'
  } else if (!result.approved || confidence < 0.5) {
    aiStatus = 'rejected'
  } else {
    aiStatus = 'needs_review'
  }

  // Persist AI result
  await client
    .from('task_submissions')
    .update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence })
    .eq('id', submissionId)

  // Auto-approve: inline using admin client (no user session in webhook context)
  if (aiStatus === 'approved') {
    const finalPoints = sub.tasks?.points ?? 0
    const memberName = await client
      .from('profiles')
      .select('name')
      .eq('id', sub.user_id)
      .single()
      .then(r => r.data?.name ?? 'A member')

    await client
      .from('task_submissions')
      .update({
        status: 'approved',
        points_awarded: finalPoints,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .eq('status', 'pending')

    await client.from('feed_items').insert({
      org_id: orgId,
      type: 'submission_approved',
      title: `${memberName} completed ${taskTitle}`,
      content: `+${finalPoints} 🥦 broccoli points earned`,
      is_auto_generated: true,
      author_id: sub.user_id,
      challenge_id: sub.challenge_id ?? null,
    })
  }

  // Auto-reject: inline using admin client + notify member via feed item
  if (aiStatus === 'rejected') {
    await client
      .from('task_submissions')
      .update({ status: 'rejected', rejection_reason: feedback || 'Rejected by AI review.' })
      .eq('id', submissionId)

    await client.from('feed_items').insert({
      org_id: orgId,
      type: 'submission_rejected',
      title: `Your ${taskTitle} submission was not approved`,
      content: feedback || 'Please resubmit with a clear proof photo.',
      is_auto_generated: true,
      author_id: sub.user_id,
      challenge_id: sub.challenge_id ?? null,
    })
  }

  return { aiStatus, aiFeedback: feedback, aiConfidence: confidence }
}
