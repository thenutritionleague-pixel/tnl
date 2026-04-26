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
  try {
    const body = await req.json()
    // Supabase DB webhook shape: { record: { id, org_id, ... } }
    const record = body.record ?? body
    const submissionId: string = record.id
    const orgId: string = record.org_id

    if (!submissionId || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing id or org_id' }), { status: 400 })
    }

    // Atomic claim: only proceed if we successfully flip ai_status from null → 'analyzing'.
    // This prevents double-processing when the webhook fires twice (retry scenario).
    const { count } = await supabase
      .from('task_submissions')
      .update({ ai_status: 'analyzing' })
      .is('ai_status', null)
      .eq('id', submissionId)
      .select('id', { count: 'exact', head: true })

    if (!count || count === 0) {
      // Already claimed by another invocation or already analyzed
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    // Fetch submission + task
    const { data: sub } = await supabase
      .from('task_submissions')
      .select('user_id, task_id, challenge_id, proof_url, tasks(title, description, points), profiles:user_id(name)')
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

    type ImageBlock = { type: 'image_url'; image_url: { url: string; detail: 'low' } }
    type TextBlock  = { type: 'text'; text: string }

    const imageBlocks: ImageBlock[] = [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'low' } },
    ]

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

    const prompt = `You are reviewing a wellness challenge task submission.\n\nTask: "${taskTitle}"${taskDesc ? `\nDescription: ${taskDesc}` : ''}\n\nImage 1 is the current submission.${prevCount > 0 ? `\nImages 2–${prevCount + 1} are this member's previous approved submissions for the same task (for duplicate detection).` : ''}\n\nEvaluate on three criteria:\n1. TASK MATCH — Does Image 1 clearly show completion of this specific task?\n2. AUTHENTICITY — Does it look like a genuine real photo? (reject if AI-generated, stock photo, screenshot, or obviously fake)\n3. UNIQUENESS — Is it meaningfully different from any previous images? (reject if the same or near-identical photo is reused)\n\nBe lenient with real-looking photos that broadly match the task. Only reject clear violations.\n\nRespond in JSON only — no markdown, no extra text:\n{"approved":true|false,"confidence":0.0-1.0,"issues":[],"feedback":"Brief message shown to the member only if rejected"}`

    const contentBlocks: (TextBlock | ImageBlock)[] = [
      { type: 'text', text: prompt },
      ...imageBlocks,
    ]

    let aiResult: { approved: boolean; confidence: number; issues: string[]; feedback: string }
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: contentBlocks }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
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
    if (aiResult.approved && confidence >= 0.85) {
      aiStatus = 'approved'
    } else if (!aiResult.approved || confidence < 0.5) {
      aiStatus = 'rejected'
    } else {
      aiStatus = 'needs_review'
    }

    await supabase
      .from('task_submissions')
      .update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence })
      .eq('id', submissionId)

    // Auto-approve
    if (aiStatus === 'approved') {
      await supabase
        .from('task_submissions')
        .update({ status: 'approved', points_awarded: taskPoints, reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)

      await supabase.from('feed_items').insert({
        org_id: orgId,
        type: 'submission_approved',
        title: `${memberName} completed ${taskTitle}`,
        content: `+${taskPoints} 🥦 broccoli points earned`,
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
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
  }
})
