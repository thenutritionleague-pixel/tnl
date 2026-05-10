'use server'

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'

type TaskTier = { label: string; description: string; points: number }

type SubmissionWithTask = {
  user_id: string
  org_id: string
  task_id: string
  status: string
  proof_url: string | null
  challenge_id: string | null
  selected_tier_index: number | null
  tasks: { title: string; description: string; points: number; points_tiers: TaskTier[] | null } | null
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface AiResult {
  approved: boolean
  confidence: number
  issues: string[]
  feedback: string
}

function buildReviewPrompt({
  taskTitle, taskDesc, claimedTier, taskPoints, prevCount,
}: {
  taskTitle: string
  taskDesc: string
  claimedTier: TaskTier | null
  taskPoints: number
  prevCount: number
}): string {
  const tierBlock = claimedTier
    ? `CLAIMED TIER: ${claimedTier.label} — ${claimedTier.description} (${claimedTier.points} pts)
You MUST verify the photo provides visible evidence matching this threshold (e.g. a fitness tracker showing the step/distance count, a food label, a completed workout screen). If the evidence does not clearly support the claimed tier, reject and explain what is missing.`
    : `POINTS: ${taskPoints}`

  const prevNote = prevCount > 0
    ? `Images 2–${prevCount + 1} are this member's previous approved submissions for the SAME task (duplicate detection only — do not use them to judge task quality).`
    : 'No previous submissions to compare.'

  return `You are a strict but fair AI reviewer for a wellness challenge app. Your goal is to make a confident approve/reject decision on every submission to minimise human review.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

Image 1 is the current submission proof.
${prevNote}

APPROVE when ALL of the following are clearly true:
• The photo genuinely shows completion of this specific task.
• It is a real photograph (not AI-generated, stock image, internet download, or screenshot of someone else's photo).
• It is meaningfully different from any previous submission images (not a reused or near-identical photo).
${claimedTier ? `• Visible evidence (readable numbers, labels, screens) supports the claimed tier "${claimedTier.label} — ${claimedTier.description}".` : ''}

REJECT when ANY of the following are clearly true:
• The photo has no obvious connection to the task.
• It appears AI-generated, is a stock/internet image, or is clearly staged/fake.
• It is the same or near-identical photo as a previous submission.
${claimedTier ? `• The proof does not show evidence meeting the claimed tier threshold.` : ''}

LENIENCY RULES:
• Blurry, casual, or low-quality real photos → approve if the task completion is still evident.
• Tasks that are hard to photograph (meditation, hydration, sleep) → approve any sincere real attempt.
• For fitness metrics (steps, distance, calories, time) the numbers must be visible and match the claimed tier.
• IMPORTANT — fitness tracker / step counter screenshots: daily submissions that show the SAME APP with a different day's progress are NOT duplicates. The app UI looking similar across days is completely normal and expected. Only flag as duplicate if it is literally the exact same screenshot reused (identical step count AND identical timestamp AND identical date shown on screen). Similar step counts (e.g. ~10,000 steps on different days) are NOT evidence of duplication.
• When genuinely uncertain — especially about duplicates for fitness apps — set confidence 0.40–0.77 to route to human review. Do not auto-reject when uncertain.
• Only set confidence ≥ 0.78 when you are clearly sure it should be approved.
• Only set confidence < 0.30 when it is clearly fake, an obvious duplicate (identical photo), or completely wrong task.

Respond in JSON only — no markdown, no extra text:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short issue codes if any"],"feedback":"If not approved: 1–2 actionable sentences telling the member exactly what was wrong and how to resubmit correctly."}`
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
    .select('user_id, org_id, task_id, status, proof_url, challenge_id, selected_tier_index, tasks(title, description, points, points_tiers)')
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
  const tiers = sub.tasks?.points_tiers ?? null
  const claimedTierIndex = sub.selected_tier_index ?? null
  const claimedTier: TaskTier | null =
    tiers && claimedTierIndex != null ? (tiers[claimedTierIndex] ?? null) : null

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
  type ImageBlock = { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' } }
  type TextBlock = { type: 'text'; text: string }

  const currentBase64 = await fetchImageAsBase64(signed.signedUrl)
  if (!currentBase64) {
    await client
      .from('task_submissions')
      .update({ ai_status: 'needs_review', ai_feedback: 'Could not download proof image.' })
      .eq('id', submissionId)
    return { aiStatus: 'needs_review', aiFeedback: 'Could not download proof image.', aiConfidence: 0 }
  }

  // Current proof at high detail so numbers/text on screens are readable
  const imageBlocks: ImageBlock[] = [
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'high' } },
  ]

  // Previous proofs at low detail — only needed to detect duplicates
  let prevCount = 0
  for (const prev of prevSubs ?? []) {
    if (!prev.proof_url) continue
    const { data: prevSigned } = await client.storage
      .from('task-proofs')
      .createSignedUrl(prev.proof_url, 60)
    if (!prevSigned?.signedUrl) continue
    const prevBase64 = await fetchImageAsBase64(prevSigned.signedUrl)
    if (!prevBase64) continue
    imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prevBase64}`, detail: 'low' } })
    prevCount++
  }

  const prompt = buildReviewPrompt({ taskTitle, taskDesc, claimedTier, taskPoints: sub.tasks?.points ?? 0, prevCount })

  const contentBlocks: (TextBlock | ImageBlock)[] = [
    { type: 'text', text: prompt },
    ...imageBlocks,
  ]

  let result: AiResult
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: contentBlocks }],
      response_format: { type: 'json_object' },
      max_tokens: 400,
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
  if (result.approved && confidence >= 0.78) {
    aiStatus = 'approved'
  } else if (!result.approved || confidence < 0.30) {
    aiStatus = 'rejected'
  } else {
    aiStatus = 'needs_review'
  }

  // Persist AI result
  await client
    .from('task_submissions')
    .update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence })
    .eq('id', submissionId)

  // Auto-approve: inline using admin client (no user session in webhook context).
  // ONLY if the row is still 'pending' — admin's manual decision wins concurrent races.
  if (aiStatus === 'approved') {
    const finalPoints = claimedTier?.points ?? sub.tasks?.points ?? 0
    const memberName = await client
      .from('profiles')
      .select('name')
      .eq('id', sub.user_id)
      .single()
      .then(r => r.data?.name ?? 'A member')

    const { data: updated } = await client
      .from('task_submissions')
      .update({
        status: 'approved',
        points_awarded: finalPoints,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .eq('status', 'pending')
      .select('id')

    if (updated && updated.length > 0) {
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
  }

  // Auto-reject: inline using admin client + notify member via feed item.
  // ONLY if the row is still 'pending' — admin's manual decision wins races.
  if (aiStatus === 'rejected') {
    const { data: updated } = await client
      .from('task_submissions')
      .update({ status: 'rejected', rejection_reason: feedback || 'Rejected by AI review.' })
      .eq('id', submissionId)
      .eq('status', 'pending')
      .select('id')

    if (updated && updated.length > 0) {
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
  }

  return { aiStatus, aiFeedback: feedback, aiConfidence: confidence }
}
