import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

// Set this in Supabase: Settings → Edge Functions → Secrets → GEMINI_API_KEY.
// Empty/missing key → video submissions fall back to needs_review.
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL   = 'gemini-2.0-flash'
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com'

type Tier = { label: string; description: string; points: number }
type AIResult = { approved: boolean; confidence: number; issues: string[]; feedback: string }

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

function buildPrompt(opts: {
  medium: 'image' | 'video'
  taskTitle: string
  taskDesc: string
  claimedTier: Tier | null
  taskPoints: number
  prevCount: number
}): string {
  const { medium, taskTitle, taskDesc, claimedTier, taskPoints, prevCount } = opts
  const hasPrev = prevCount > 0

  const tierBlock = claimedTier
    ? `CLAIMED TIER: ${claimedTier.label} (${claimedTier.points} pts)\nTiers are MINIMUM thresholds. The member must prove they reached at least the "${claimedTier.label}" level. Achieving MORE than the minimum is perfectly valid — do NOT reject because a higher result could have earned a higher tier. Only reject if the proof clearly shows they fell BELOW this tier's minimum.`
    : `POINTS: ${taskPoints}`

  if (medium === 'video') {
    return `You are a strict but fair AI reviewer for a wellness challenge app. Your goal is to make a confident approve/reject decision on every video submission to minimise human review.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

This is a VIDEO submission. Evaluate it on motion, duration, form, and audio cues — not just one frame.

APPROVE when ALL of the following are clearly true:
• The video genuinely shows the activity described in the task.
• If the task is time-based (e.g. plank, wall-sit, run, hold), the visible duration meets or exceeds the claimed tier's minimum.
• The video is a single continuous take — no obvious cuts, splices, or replays that would fake duration.
• Form/execution is consistent with the activity (not faked, not just standing/sitting while pretending).
${claimedTier ? `• Visible evidence confirms the member reached at least the "${claimedTier.label}" threshold.` : ''}

REJECT when ANY of the following are clearly true:
• The video shows a different activity than the task describes.
• The activity is held or performed for noticeably less than the claimed tier's minimum.
• Hard cuts or edits suggest faked duration.
• The activity is obviously simulated (e.g. lying down but claiming to plank, walking but claiming to run).

LENIENCY RULES:
• Slightly low-quality, dim, or shaky video → approve if the activity is still clearly visible.
• Brief pauses to adjust the camera or wipe sweat are OK during long exercises.
• Audio (stopwatch beep, counting, breathing) is helpful context — but absence of audio is fine.
• If the camera misses part of the body but the activity is still clearly happening → approve.
• Only set confidence ≥ 0.85 when clearly sure it should be approved.
• Only set confidence < 0.35 when clearly fake, wrong activity, or duration grossly short.
• Use 0.35–0.84 for genuinely uncertain cases (will be sent to admin review).

Respond in JSON only — no markdown:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short codes"],"feedback":"If not approved: 1–2 actionable sentences telling the member what was wrong and how to resubmit correctly."}`
  }

  // medium === 'image'
  const prevNote = hasPrev
    ? `Images 2–${prevCount + 1} are this member's previous approved submissions for the SAME task (duplicate detection only).`
    : ''

  return `You are a strict but fair AI reviewer for a wellness challenge app. Your goal is to make a confident approve/reject decision on every submission to minimise human review.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

Image 1 is the current submission proof.${prevNote ? `\n${prevNote}` : ''}

APPROVE when ALL of the following are clearly true:
• The photo genuinely shows completion of this specific task.
• It is a real photograph (not AI-generated, stock image, internet download, or screenshot of someone else's photo).
${hasPrev ? '• The key DATA visible in the image (step count, distance, calories, date, time) is different from the previous submission — the app UI looking similar is NORMAL and expected.\n' : ''}${claimedTier ? `• Visible evidence (readable numbers, labels, screens) confirms the member reached at least the "${claimedTier.label}" threshold. Exceeding it is fine.` : ''}

REJECT when ANY of the following are clearly true:
• The photo has no obvious connection to the task.
• It appears AI-generated, is a stock/internet image, or is clearly staged/fake.
${hasPrev ? '• The exact same numbers/metrics AND the same date/time are visible in both the current and a previous submission (meaning it is literally the same screenshot reused).\n' : ''}${claimedTier ? `• The proof clearly shows the member fell BELOW the "${claimedTier.label}" minimum (e.g. visible number is lower than required).` : ''}

LENIENCY RULES:
• Blurry, casual, or low-quality real photos → approve if task completion is still evident.
• Tasks hard to photograph (meditation, hydration, sleep) → approve any sincere real attempt.
• For fitness metrics (steps, distance, calories, time) numbers must be visible and match the claimed tier.
• FITNESS TRACKER APPS (StepUp, Google Fit, Apple Health, Samsung Health, Garmin, etc.): many members use the same app. The UI will look visually identical across days — this is NORMAL. Only flag as duplicate if the EXACT same step count or metric value is visible in both images. Different numbers = different day = valid.
• Only set confidence ≥ 0.78 when clearly sure it should be approved.
• Only set confidence < 0.40 when clearly fake or literally the same screenshot reused.
• Use 0.40–0.77 sparingly for genuinely uncertain cases.

Respond in JSON only — no markdown:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short codes"],"feedback":"If not approved: 1–2 actionable sentences telling the member what was wrong and how to resubmit correctly."}`
}

/// Gemini 2.0 Flash analyzes the video via the File API (handles large files).
/// Flow: fetch bytes → resumable upload → poll until ACTIVE → generateContent → delete file.
async function analyzeVideoWithGemini(signedUrl: string, prompt: string): Promise<AIResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  // 1. Pull video bytes from Supabase Storage
  const videoRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })
  if (!videoRes.ok) throw new Error(`Could not fetch video (${videoRes.status})`)
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer())
  const mimeType = videoRes.headers.get('content-type') ?? 'video/mp4'

  // 2. Start a resumable upload
  const initRes = await fetch(
    `${GEMINI_BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': videoBytes.byteLength.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'proof_video' } }),
    },
  )
  if (!initRes.ok) throw new Error(`Upload init failed (${initRes.status}): ${await initRes.text()}`)
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('No upload URL returned by Gemini File API')

  // 3. Upload the bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': videoBytes.byteLength.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoBytes,
  })
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status}): ${await uploadRes.text()}`)
  const uploadData = await uploadRes.json() as { file: { name: string; uri: string; state: string } }
  const fileName = uploadData.file.name // "files/xxxx"
  const fileUri  = uploadData.file.uri
  let   state    = uploadData.file.state

  // Best-effort cleanup helper
  const deleteFile = () => {
    fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' })
      .catch(() => {})
  }

  // 4. Poll until processed (max ~60s)
  const start = Date.now()
  while (state === 'PROCESSING' && Date.now() - start < 60_000) {
    await new Promise(r => setTimeout(r, 2000))
    const stateRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`)
    if (!stateRes.ok) break
    const stateData = await stateRes.json() as { state: string }
    state = stateData.state
  }
  if (state !== 'ACTIVE') {
    deleteFile()
    throw new Error(`Video processing did not complete (final state: ${state})`)
  }

  // 5. Generate content — request JSON response
  const genRes = await fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { file_data: { mime_type: mimeType, file_uri: fileUri } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 400,
        },
      }),
    },
  )
  deleteFile() // fire-and-forget cleanup regardless of outcome

  if (!genRes.ok) throw new Error(`Gemini generate failed (${genRes.status}): ${await genRes.text()}`)
  const genData = await genRes.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = genData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  return JSON.parse(text) as AIResult
}

Deno.serve(async (req: Request) => {
  let submissionId: string | undefined
  try {
    const body = await req.json()
    const record = body.record ?? body
    submissionId = record.id
    const orgId: string = record.org_id

    if (!submissionId || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing id or org_id' }), { status: 400 })
    }

    // Atomic claim — only proceed if we flip ai_status from null → 'analyzing'
    const { data: claimed } = await supabase
      .from('task_submissions')
      .update({ ai_status: 'analyzing' })
      .is('ai_status', null)
      .eq('id', submissionId)
      .select('id')

    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    // Fetch submission + task (with tier data)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd = sub as any
    const taskTitle: string = sd.tasks?.title ?? 'wellness task'
    const taskDesc: string  = sd.tasks?.description ?? ''
    const taskPoints: number = sd.tasks?.points ?? 0
    const memberName: string = sd.profiles?.name ?? 'A member'
    const tiers: Tier[] | null = sd.tasks?.points_tiers ?? null
    const claimedTierIndex: number | null = sd.selected_tier_index ?? null
    const claimedTier: Tier | null = (tiers && claimedTierIndex != null) ? (tiers[claimedTierIndex] ?? null) : null

    const isVideo = /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(sub.proof_url)
    const medium: 'image' | 'video' = isVideo ? 'video' : 'image'

    // ── Branch on medium ────────────────────────────────────────────────────
    let aiResult: AIResult

    if (medium === 'video') {
      // Video path — Gemini 2.0 Flash via File API
      if (!GEMINI_API_KEY) {
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: 'Video proof — admin review required.' })
          .eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', reason: 'gemini_not_configured' }), { status: 200 })
      }

      const { data: signed } = await supabase.storage
        .from('task-proofs')
        .createSignedUrl(sub.proof_url, 300)
      if (!signed?.signedUrl) {
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: 'Could not access proof video.' })
          .eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
      }

      const prompt = buildPrompt({ medium, taskTitle, taskDesc, claimedTier, taskPoints, prevCount: 0 })

      try {
        aiResult = await analyzeVideoWithGemini(signed.signedUrl, prompt)
      } catch (e) {
        console.error('[analyze-submission/video]', e)
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: 'Video analysis failed — please review manually.' })
          .eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
      }
    } else {
      // Image path — OpenAI GPT-4o (existing flow, unchanged)
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

      const imageBlocks: ImageBlock[] = [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'high' } },
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

      const prompt = buildPrompt({ medium, taskTitle, taskDesc, claimedTier, taskPoints, prevCount })
      const contentBlocks: (TextBlock | ImageBlock)[] = [
        { type: 'text', text: prompt },
        ...imageBlocks,
      ]

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
    }

    // ── Shared scoring + DB writes ──────────────────────────────────────────
    const confidence = Math.min(1, Math.max(0, aiResult.confidence ?? 0))
    const feedback   = aiResult.feedback ?? ''

    // Stricter thresholds for video: faked videos erode trust more than faked photos.
    const approveAt = medium === 'video' ? 0.85 : 0.78
    const rejectAt  = medium === 'video' ? 0.35 : 0.40

    let aiStatus: string
    if (aiResult.approved && confidence >= approveAt) {
      aiStatus = 'approved'
    } else if (!aiResult.approved || confidence < rejectAt) {
      aiStatus = 'rejected'
    } else {
      aiStatus = 'needs_review'
    }

    await supabase
      .from('task_submissions')
      .update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence })
      .eq('id', submissionId)

    // Auto-approve: use claimed tier's points if tiered, else task base
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
        content: feedback || (medium === 'video'
          ? 'Please resubmit with a clear proof video.'
          : 'Please resubmit with a clear proof photo.'),
        is_auto_generated: true,
        author_id: sub.user_id,
        challenge_id: sub.challenge_id ?? null,
      })
    }

    return new Response(JSON.stringify({ aiStatus, feedback, confidence, medium }), { status: 200 })

  } catch (err) {
    console.error('[analyze-submission]', err)
    // Best-effort: reset stuck 'analyzing' so pg_cron retry doesn't spin forever
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
