'use server'

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { approveSubmission } from './actions'

type SubmissionWithTask = {
  user_id: string
  task_id: string
  proof_url: string | null
  tasks: { title: string; description: string } | null
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
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch {
    return null
  }
}

export async function runAiAnalysis(
  submissionId: string,
  orgId: string,
): Promise<{ aiStatus: string; aiFeedback: string; aiConfidence: number } | null> {
  const client = await createAdminClient()

  // Mark as analyzing
  await client
    .from('task_submissions')
    .update({ ai_status: 'analyzing' })
    .eq('id', submissionId)

  // Fetch submission + task details
  const { data: sub } = await client
    .from('task_submissions')
    .select('user_id, task_id, proof_url, tasks(title, description)')
    .eq('id', submissionId)
    .single()

  if (!sub?.proof_url) {
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'No proof image found.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'No proof image found.', aiConfidence: 0 }
  }

  const sd = sub as unknown as SubmissionWithTask
  const taskTitle: string = sd.tasks?.title ?? 'wellness task'
  const taskDesc: string = sd.tasks?.description ?? ''

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
  } catch {
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

  // Auto-approve
  if (aiStatus === 'approved') {
    await approveSubmission(submissionId, orgId, null)
  }

  // Auto-reject
  if (aiStatus === 'rejected') {
    await client
      .from('task_submissions')
      .update({ status: 'rejected', rejection_reason: feedback || 'Rejected by AI review.' })
      .eq('id', submissionId)
  }

  return { aiStatus, aiFeedback: feedback, aiConfidence: confidence }
}
