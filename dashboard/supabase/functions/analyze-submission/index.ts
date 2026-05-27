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
// 'flash-latest' auto-upgrades when Google releases newer Flash versions.
const GEMINI_MODEL   = 'gemini-flash-latest'
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com'

type Tier = { label: string; description: string; points: number }
type AIResult = { approved: boolean; confidence: number; issues: string[]; feedback: string }

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const CHUNK = 8192
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
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

═══════════════════════════════════════════════════════════════
EVALUATION PROCEDURE — follow these steps in order, in your head.
═══════════════════════════════════════════════════════════════

STEP 1 — DERIVE EXPECTED PROOF (from the task title + description above):
What kind of video would actually prove the member did this task? Most wellness videos fall into one of:
  • A person performing the named exercise (plank, squat, push-up, jumping jacks, run, dance, yoga pose, etc.) with visible form and duration
  • A timer or fitness-app screen recording showing the activity being tracked
  • A short demonstration of a habit (drinking water, preparing a meal, journalling)

STEP 2 — DESCRIBE THE VIDEO (silently, in your own reasoning):
What activity is actually being performed in the video? For how long? Is it the right activity for the task?

STEP 3 — APPLY THE HARD GATE:
Does the video from STEP 2 match the expected activity from STEP 1?
  • YES → continue to the rules below.
  • NO  → REJECT immediately with approved=false and confidence ≤ 0.20. Set feedback to explain what the task needs.
  • UNSURE → continue but cap confidence at 0.60 so an admin reviews it.

═══════════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════════
EVALUATION PROCEDURE — follow these steps in order, in your head.
═══════════════════════════════════════════════════════════════

STEP 1 — DERIVE EXPECTED PROOF (from the task title + description above):
Based on what the task asks the member to do, what kind of image would actually prove they did it? Possible categories:
  • A fitness-tracker screenshot showing a number (steps, distance, calories, heart rate, active minutes)
  • A photograph of food/meal/drink (plate, bowl, glass, bottle)
  • A photograph or video frame of physical activity (person exercising, pose, gym, outdoors)
  • A screenshot of an app screen (meditation timer, sleep tracker, journaling, etc.)
  • A selfie demonstrating something specific to the task (e.g. holding an object, in a setting)
  • A document/written entry (handwritten journal, list)

Decide silently which one (or two) of these the task requires. If the task description is specific, follow it.

STEP 2 — DESCRIBE THE IMAGE (silently, in your own reasoning):
What does Image 1 actually show? A meal? An app screenshot with numbers? A person mid-exercise? A selfie holding a glass? A selfie with no obvious context? Scenery?

STEP 3 — APPLY THE HARD GATE:
Does the image from STEP 2 match the expected proof from STEP 1?
  • YES → continue to the rules below.
  • NO  → REJECT immediately with approved=false and confidence ≤ 0.20. Set feedback to explain what the task needs (e.g. "This task requires a step-counter screenshot, but you submitted a photo of a drink. Please open your fitness app and submit a screenshot of today's step count.").
  • UNSURE (proof is ambiguous, could match) → continue to the rules below but cap confidence at 0.60 so an admin reviews it.

A REAL, well-composed photo of the WRONG subject is still WRONG. Sincerity does not override mismatch.

═══════════════════════════════════════════════════════════════

APPROVE when ALL of the following are clearly true:
• The photo passes the STEP 3 gate (subject matter matches what the task asks for).
• It is a real photograph (not AI-generated, stock image, internet download, or screenshot of someone else's photo).
${hasPrev ? '• The key DATA visible in the image (step count, distance, calories, date, time) is different from the previous submission — the app UI looking similar is NORMAL and expected.\n' : ''}${claimedTier ? `• Visible evidence (readable numbers, labels, screens) confirms the member reached at least the "${claimedTier.label}" threshold. Exceeding it is fine.` : ''}

REJECT when ANY of the following are clearly true:
• The photo fails the STEP 3 gate (subject unrelated to the task — e.g. a drink photo for a step-count task, a selfie for a hydration task, food for an exercise task).
• It appears AI-generated, is a stock/internet image, or is clearly staged/fake.
${hasPrev ? '• The exact same numbers/metrics AND the same date/time are visible in both the current and a previous submission (meaning it is literally the same screenshot reused).\n' : ''}${claimedTier ? `• The proof clearly shows the member fell BELOW the "${claimedTier.label}" minimum (e.g. visible number is lower than required).` : ''}

LENIENCY RULES (apply ONLY after the STEP 3 gate has passed):
• Blurry, casual, or low-quality real photos → approve if task completion is still evident.
• For fitness metrics (steps, distance, calories, time) numbers must be visible and match the claimed tier.
• FITNESS TRACKER APPS (StepUp, Google Fit, Apple Health, Samsung Health, Garmin, etc.): many members use the same app. The UI will look visually identical across days — this is NORMAL. Only flag as duplicate if the EXACT same step count or metric value is visible in both images. Different numbers = different day = valid.
• Only set confidence ≥ 0.78 when clearly sure it should be approved.
• Only set confidence < 0.40 when clearly fake, literally the same screenshot reused, OR the proof type is wrong for this task.
• Use 0.40–0.77 sparingly for genuinely uncertain cases.

Respond in JSON only — no markdown:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short codes"],"feedback":"If not approved: 1–2 actionable sentences telling the member what was wrong and how to resubmit correctly."}`
}

// Videos ≤ 15 MB go via inline base64 — one round-trip, no upload/poll overhead,
// fits well inside the 26 s edge-function wall-clock limit.
// Videos > 15 MB fall back to the File API (resumable upload + poll).
const INLINE_LIMIT = 15 * 1024 * 1024

function bytesToBase64(bytes: Uint8Array): string {
  // Process in 8 KB chunks — spread operator is fast; char-by-char concat is O(n²)
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function geminiGenerate(
  parts: unknown[],
  prompt: string,
): Promise<AIResult> {
  const genRes = await fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...parts, { text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0.2, maxOutputTokens: 2048 },
      }),
    },
  )
  if (!genRes.ok) throw new Error(`Gemini generate failed (${genRes.status}): ${await genRes.text()}`)
  const genData = await genRes.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }
  const candidate = genData.candidates?.[0]
  if (!candidate?.content) {
    throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`)
  }
  const text = candidate.content.parts?.[0]?.text ?? '{}'
  try {
    return JSON.parse(text) as AIResult
  } catch {
    throw new Error(`Gemini JSON parse failed. Raw text: ${text.slice(0, 300)}`)
  }
}

async function analyzeVideoWithGemini(signedUrl: string, prompt: string): Promise<AIResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const videoRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })
  if (!videoRes.ok) throw new Error(`Could not fetch video (${videoRes.status})`)
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer())
  const mimeType = videoRes.headers.get('content-type') ?? 'video/mp4'

  // Fast path: inline base64 — no File API, no polling, ~3-8 s total
  if (videoBytes.byteLength <= INLINE_LIMIT) {
    const base64 = bytesToBase64(videoBytes)
    return geminiGenerate(
      [{ inline_data: { mime_type: mimeType, data: base64 } }],
      prompt,
    )
  }

  // Slow path: File API for large videos (resumable upload → poll → generate)
  const initRes = await fetch(
    `${GEMINI_BASE}/upload/v1beta/files`,
    {
      method: 'POST',
      headers: {
        'X-goog-api-key': GEMINI_API_KEY,
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
  const uploadUrl = initRes.headers.get('x-goog-upload-url') ?? initRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('No upload URL returned by Gemini File API')

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
  const fileName = uploadData.file.name
  const fileUri  = uploadData.file.uri
  let   state    = uploadData.file.state

  const deleteFile = () => {
    fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
      method: 'DELETE',
      headers: { 'X-goog-api-key': GEMINI_API_KEY },
    }).catch(() => {})
  }

  // Poll until ACTIVE (max 20 s — leave headroom for the generate call)
  const start = Date.now()
  while (state === 'PROCESSING' && Date.now() - start < 20_000) {
    await new Promise(r => setTimeout(r, 2000))
    const stateRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
      headers: { 'X-goog-api-key': GEMINI_API_KEY },
    })
    if (!stateRes.ok) break
    state = ((await stateRes.json()) as { state: string }).state
  }
  if (state !== 'ACTIVE') {
    deleteFile()
    throw new Error(`Video processing did not complete (final state: ${state})`)
  }

  try {
    return await geminiGenerate(
      [{ file_data: { mime_type: mimeType, file_uri: fileUri } }],
      prompt,
    )
  } finally {
    deleteFile()
  }
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
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/video]', errMsg)
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: `Video analysis failed: ${errMsg}` })
          .eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', error: errMsg }), { status: 200 })
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
      } catch (e) {
        // Log the actual OpenAI error so it shows in Supabase function logs.
        // Common causes: OPENAI_API_KEY invalid/expired, billing/quota exhausted,
        // rate limit, OpenAI partial outage, or model deprecation.
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/openai-image]', errMsg)
        await supabase
          .from('task_submissions')
          .update({ ai_status: 'needs_review', ai_feedback: `AI analysis failed: ${errMsg}` })
          .eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', error: errMsg }), { status: 200 })
      }
    }

    // ── Shared scoring + DB writes ──────────────────────────────────────────
    const confidence = Math.min(1, Math.max(0, aiResult.confidence ?? 0))
    const feedback   = aiResult.feedback ?? ''

    const approveAt = 0.70
    const rejectAt  = 0.50

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
