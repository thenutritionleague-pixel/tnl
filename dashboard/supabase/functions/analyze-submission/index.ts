import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  let submissionId: string | undefined
  try {
    const body = await req.json()
    // Supabase DB webhook shape: { record: { id, org_id, ... } }
    const record = body.record ?? body
    submissionId = record.id
    const orgId: string = record.org_id

    if (!submissionId || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing id or org_id' }), { status: 400 })
    }

    // Atomic claim: only proceed if we successfully flip ai_status from null → 'analyzing'.
    // Use .select('id') (not head:true) — head:true can return null count even on success.
    const { data: claimed } = await supabase
      .from('task_submissions')
      .update({ ai_status: 'analyzing' })
      .is('ai_status', null)
      .eq('id', submissionId)
      .select('id')

    if (!claimed || claimed.length === 0) {
      // Already claimed by another invocation or already analyzed
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    // Fetch submission + task (including tier data)
    const { data: sub } = await supabase
      .from('task_submissions')
      .select('user_id, task_id, challenge_id, proof_url, selected_tier_index, tasks(title, description, points, points_tiers), profiles:user_id(name)')
      .eq('id', submissionId)
      .single()

    if (!sub?.proof_url) {
      await supabase
        .from('task_submissions')
        .update({ ai_status: 'needs_review', ai_feedback: 'No proof image found.' })
        .eq('id', submissionId)
      return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
    }

    const sd = sub as any
    const taskTitle: string = sd.tasks?.title ?? 'wellness task'
    const taskDesc: string  = sd.tasks?.description ?? ''
    const taskPoints: number = sd.tasks?.points ?? 0
    const memberName: string = sd.profiles?.name ?? 'A member'
    const tiers: { label: string; description: string; points: number }[] | null = sd.tasks?.points_tiers ?? null
    const claimedTierIndex: number | null = sd.selected_tier_index ?? null
    const claimedTier = (tiers && claimedTierIndex != null) ? (tiers[claimedTierIndex] ?? null) : null

    // Signed URL for current proof
    const { data: signed } = await supabase.storage
      .from('task-proofs')
      .createSignedUrl(sub.proof_url, 120)

    if (!signed?.signedUrl) {
      await supabase
        .from('task_submissions')
        .update({ ai_status: 'needs_review', ai_feedback: 'Could not access proof image.' })
        .eq('id', submissionId)
      return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
    }

    const currentBase64 = await fetchImageAsBase64(signed.signedUrl)
    if (!currentBase64) {
      await supabase
        .from('task_submissions')
        .update({ ai_status: 'needs_review', ai_feedback: 'Could not download proof image.' })
        .eq('id', submissionId)
      return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
    }

    // Previous approved proofs for duplicate detection
    const { data: prevSubs } = await supabase
      .from('task_submissions')
      .select('proof_url')
      .eq('task_id', sub.task_id)
      .eq('user_id', sub.user_id)
      .eq('status', 'approved')
      .order('submitted_at', { ascending: false })
      .limit(3)

    type ImageBlock = { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' } }
    type TextBlock  = { type: 'text'; text: string }

    // Current proof at high detail so numbers/text on screens are readable
    const imageBlocks: ImageBlock[] = [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'high' } },
    ]

    // Previous proofs at low detail — only needed to detect duplicates
    let prevCount = 0
    for (const prev of prevSubs ?? []) {
      if (!prev.proof_url) continue
      const { data: ps } = await supabase.storage.from('task-proofs').createSignedUrl(prev.proof_url, 60)
      if (!ps?.signedUrl) continue
      const b64 = await fetchImageAsBase64(ps.signedUrl)
      if (!b64) continue
      imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } })
      prevCount++
    }

    const tierBlock = claimedTier
      ? `CLAIMED TIER: ${claimedTier.label} (${claimedTier.points} pts)\nTiers are MINIMUM thresholds. The member must prove they reached at least the "${claimedTier.label}" level. Achieving MORE than the minimum is perfectly valid — do NOT reject because a higher result could have earned a higher tier. Only reject if the proof clearly shows they fell BELOW this tier's minimum.`
      : `POINTS: ${taskPoints}`

    const hasPrev = prevCount > 0
    const prevNote = hasPrev
      ? `Images 2–${prevCount + 1} are this member's previous approved submissions for the SAME task (duplicate detection only).`
      : ''

    const prompt = `You are a strict but fair AI reviewer for a wellness challenge app. Your goal is to make a confident approve/reject decision on every submission to minimise human review.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

Image 1 is the current submission proof.${prevNote ? `\n${prevNote}` : ''}

APPROVE when ALL of the following are clearly true:
• The photo genuinely shows completion of this specific task.
• It is a real photograph (not AI-generated, stock image, internet download, or screenshot of someone else's photo).
${hasPrev ? '• It is meaningfully different from any previous submission images.\n' : ''}${claimedTier ? `• Visible evidence (readable numbers, labels, screens) confirms the member reached at least the "${claimedTier.label}" threshold. Exceeding it is fine.` : ''}

REJECT when ANY of the following are clearly true:
• The photo has no obvious connection to the task.
• It appears AI-generated, is a stock/internet image, or is clearly staged/fake.
${hasPrev ? '• It is the same or near-identical photo as a previous submission.\n' : ''}${claimedTier ? `• The proof clearly shows the member fell BELOW the "${claimedTier.label}" minimum (e.g. visible number is lower than required).` : ''}

LENIENCY RULES:
• Blurry, casual, or low-quality real photos → approve if task completion is still evident.
• Tasks hard to photograph (meditation, hydration, sleep) → approve any sincere real attempt.
• For fitness metrics (steps, distance, calories, time) numbers must be visible and match the claimed tier.
• Only set confidence ≥ 0.78 when clearly sure it should be approved.
• Only set confidence < 0.40 when clearly fake, duplicate, or wrong task.
• Use 0.40–0.77 sparingly for genuinely uncertain cases.

Respond in JSON only — no markdown:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short codes"],"feedback":"If not approved: 1–2 actionable sentences telling the member what was wrong and how to resubmit correctly."}`

    const contentBlocks: (TextBlock | ImageBlock)[] = [
      { type: 'text', text: prompt },
      ...imageBlocks,
    ]

    let aiResult: { approved: boolean; confidence: number; issues: string[]; feedback: string }
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: contentBlocks }],
        response_format: { type: 'json_object' },
        max_tokens: 400,
      })
      aiResult = JSON.parse(response.choices[0].message.content ?? '{}')
    } catch {
      await supabase
        .from('task_submissions')
        .update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' })
        .eq('id', submissionId)
      return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
    }

    const confidence = Math.min(1, Math.max(0, aiResult.confidence ?? 0))
    const feedback   = aiResult.feedback ?? ''

    let aiStatus: string
    if (aiResult.approved && confidence >= 0.78) {
      aiStatus = 'approved'
    } else if (!aiResult.approved || confidence < 0.40) {
      aiStatus = 'rejected'
    } else {
      aiStatus = 'needs_review'
    }

    await supabase
      .from('task_submissions')
      .update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence })
      .eq('id', submissionId)

    // Auto-approve — use claimed tier's points if tiered, else task base points
    if (aiStatus === 'approved') {
      const finalPoints = claimedTier?.points ?? taskPoints
      await supabase
        .from('task_submissions')
        .update({ status: 'approved', points_awarded: finalPoints, reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)

      await supabase.from('feed_items').insert({
        org_id: orgId,
        type: 'submission_approved',
        title: `${memberName} completed ${taskTitle}`,
        content: `+${finalPoints} 🥦 broccoli points earned`,
        is_auto_generated: true,
        author_id: sub.user_id,
        challenge_id: sub.challenge_id ?? null,
      })
    }

    // Auto-reject: update status + notify member via feed
    if (aiStatus === 'rejected') {
      await supabase
        .from('task_submissions')
        .update({
          status: 'rejected',
          rejection_reason: feedback || 'Rejected by AI review.',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      await supabase.from('feed_items').insert({
        org_id: orgId,
        type: 'submission_rejected',
        title: `Your ${taskTitle} submission was not approved`,
        content: feedback || 'Please resubmit with a clear proof photo.',
        is_auto_generated: true,
        author_id: sub.user_id,
        challenge_id: sub.challenge_id ?? null,
      })
    }

    return new Response(JSON.stringify({ aiStatus, feedback, confidence }), { status: 200 })

  } catch (err) {
    console.error('[analyze-submission]', err)
    // Best-effort: reset stuck 'analyzing' so pg_cron doesn't spin forever
    if (submissionId) {
      try {
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' })
          .eq('id', submissionId)
          .eq('ai_status', 'analyzing')
      } catch { /* ignore secondary failure */ }
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
  }
})
