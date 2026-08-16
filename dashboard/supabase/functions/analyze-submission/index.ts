import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'
import { crypto as stdCrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

const GEMINI_API_KEY   = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_FLASH     = 'gemini-flash-latest'
const GEMINI_PRO       = 'gemini-pro-latest'
const GEMINI_BASE      = 'https://generativelanguage.googleapis.com'

const BUNNY_LIBRARY_ID    = Deno.env.get('BUNNY_LIBRARY_ID')    ?? ''
const BUNNY_API_KEY       = Deno.env.get('BUNNY_API_KEY')       ?? ''
const BUNNY_CDN_HOSTNAME  = Deno.env.get('BUNNY_CDN_HOSTNAME')  ?? ''
const BUNNY_TOKEN_AUTH    = Deno.env.get('BUNNY_TOKEN_AUTH_KEY') ?? ''

const PHASH_ENFORCE = true
const PHASH_DUP_THRESHOLD = 8
const NUMBER_REJECT_CONFIDENCE = 0.85

// Hybrid video: Flash counts first (cheap). If Flash would reject or the count
// is below FLASH tolerance, escalate to Pro (accurate) for a final verdict.
const HYBRID_VIDEO = true
const VIDEO_FLASH_TOLERANCE = 0.65 // Flash undercounts, so this is generous for the cheap approve path
const VIDEO_PRO_TOLERANCE   = 0.90 // Pro is accurate, so require most of the target

// Flash "Thinking Mode" for video: -1 = DYNAMIC (Flash spends reasoning tokens
// only on ambiguous videos, not obvious ones) -> better rep counts, lowest cost.
// Thinking tokens are billed as OUTPUT and drawn from maxOutputTokens, so the
// output cap MUST exceed the thinking spend or the JSON verdict comes back empty.
const FLASH_THINKING_BUDGET  = -1
const VIDEO_MAX_OUTPUT_TOKENS = 4096

// When an AI provider is momentarily THROTTLED/BUSY (429, 503, timeout, overloaded)
// we do NOT dump the submission on an admin. We null out ai_status so the
// retry-stuck-ai-submissions cron re-fires it a couple minutes later (rate
// windows reset every minute). Bounded by age so a permanently-failing row still
// reaches admin review as a last resort instead of looping forever.
const RETRY_MAX_AGE_MS = 20 * 60 * 1000
function isTransientError(msg: string): boolean {
  const m = (msg || '').toLowerCase()
  return m.includes('429') || m.includes('rate limit') || m.includes('rate_limit')
    || m.includes('resource_exhausted') || m.includes('quota')
    || m.includes('503') || m.includes('500') || m.includes('overloaded') || m.includes('unavailable')
    || m.includes('timeout') || m.includes('timed out') || m.includes('etimedout')
    || m.includes('econnreset') || m.includes('network') || m.includes('fetch failed')
}

const BUNNY_MP4_RESOLUTIONS = ['720p', '480p', '360p', '240p', '1080p']

// Largest original we will pull into edge-function memory when Bunny's
// transcode has stalled. Comfortably above a normal 1080p phone clip.
const FALLBACK_MAX_BYTES = 60 * 1024 * 1024

type Tier = { label: string; description: string; points: number }
type AIResult = {
  approved:   boolean
  confidence: number
  issues:     string[]
  feedback:   string
  read?: { value?: number | null; unit?: string | null } | null
  same_person?: 'same' | 'different' | 'unclear' | null
}
type Decision = { status: 'approved' | 'rejected' | 'needs_review'; feedback: string; confidence: number; model?: 'flash' | 'pro' | null }
type GenOpts = { thinkingBudget?: number; maxOutputTokens?: number }

type BunnyPollResult =
  | { kind: 'ready'; url: string }
  | { kind: 'pending' }
  | { kind: 'failed'; reason: string }

function clamp01(n: number): number { return Math.min(1, Math.max(0, n)) }
function extractRequiredCount(tier: Tier): number | null {
  const m = `${tier.label} ${tier.description}`.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

// Extract a numeric target (e.g. "7,500 steps") from a FLAT numeric task whose
// threshold lives only in the title/description, not a tier. Restores the number
// safety-net for step/calorie/minute/km tasks that have no points_tiers.
function extractNumericTarget(title: string, desc: string): { value: number; unit: string } | null {
  const m = `${title} ${desc}`.match(/(\d[\d,\.]*)\s*(steps?|calories?|kcal|cals?|minutes?|mins?|km|kilometers?)/i)
  if (!m) return null
  const value = parseInt(m[1].replace(/[,\.]/g, ''), 10)
  if (!Number.isFinite(value) || value <= 0) return null
  const u = m[2].toLowerCase()
  const unit = u.startsWith('step') ? 'steps'
    : (u.startsWith('cal') || u === 'kcal') ? 'calories'
    : u.startsWith('min') ? 'minutes'
    : 'km'
  return { value, unit }
}

async function bunnySignPath(path: string, ttlSeconds = 900): Promise<string> {
  const base = `https://${BUNNY_CDN_HOSTNAME}${path}`
  if (!BUNNY_TOKEN_AUTH) return base
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const raw = new TextEncoder().encode(BUNNY_TOKEN_AUTH + path + String(expires))
  const digest = new Uint8Array(await stdCrypto.subtle.digest('MD5', raw))
  let bin = ''
  for (const b of digest) bin += String.fromCharCode(b)
  const token = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base}?token=${token}&expires=${expires}`
}

async function bunnyResolvePlayableUrl(guid: string): Promise<string | null> {
  for (const r of BUNNY_MP4_RESOLUTIONS) {
    const url = await bunnySignPath(`/${guid}/play_${r}.mp4`)
    try {
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      if (head.ok) return url
    } catch { /* try next */ }
  }
  const orig = await bunnySignPath(`/${guid}/original`)
  try { const h = await fetch(orig, { method: 'HEAD', signal: AbortSignal.timeout(5000) }); if (h.ok) return orig } catch { /* none */ }
  return null
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch { return null }
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

async function computeDHash(bytes: Uint8Array): Promise<string | null> {
  try {
    const img = await Image.decode(bytes)
    const small = img.resize(9, 8)
    let hash = 0n
    let bit = 0n
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const l = small.getRGBAAt(x, y)
        const r = small.getRGBAAt(x + 1, y)
        const lb = 0.299 * l[0] + 0.587 * l[1] + 0.114 * l[2]
        const rb = 0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]
        if (lb > rb) hash |= (1n << bit)
        bit++
      }
    }
    return hash.toString(16).padStart(16, '0')
  } catch (e) { console.warn('[dhash] decode failed', e instanceof Error ? e.message : e); return null }
}

function hamming(aHex: string, bHex: string): number {
  let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex)
  let count = 0
  while (x > 0n) { count += Number(x & 1n); x >>= 1n }
  return count
}

async function bunnyCheckStatus(guid: string): Promise<BunnyPollResult> {
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY || !BUNNY_CDN_HOSTNAME) return { kind: 'failed', reason: 'Bunny credentials missing on the server.' }
  const statusUrl = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${guid}`
  const deadline = Date.now() + 40_000
  let lastKnownStatus = -1
  while (Date.now() < deadline) {
    try {
      const res = await fetch(statusUrl, { headers: { 'AccessKey': BUNNY_API_KEY, 'accept': 'application/json' }, signal: AbortSignal.timeout(5000) })
      if (res.status === 404) return { kind: 'failed', reason: 'Video was deleted from the video service before analysis. Please re-upload.' }
      if (!res.ok) { await new Promise(r => setTimeout(r, 2000)); continue }
      const data = await res.json() as { status?: number }
      lastKnownStatus = data.status ?? -1
      if (lastKnownStatus === 4) {
        const url = await bunnyResolvePlayableUrl(guid)
        if (url) return { kind: 'ready', url }
        return { kind: 'failed', reason: 'Video processed but no downloadable version is available. Please re-upload the video.' }
      }
      if (lastKnownStatus === 5) return { kind: 'failed', reason: 'Video could not be processed — likely audio/video sync issue, unsupported codec, or corrupted file. Please re-record and try again.' }
      if (lastKnownStatus === 6) return { kind: 'failed', reason: 'Video upload was incomplete. Please try again on a stable network.' }
    } catch (e) { console.warn('[bunny] status check error', e instanceof Error ? e.message : e) }
    await new Promise(r => setTimeout(r, 2500))
  }
  console.log('[bunny] poll timeout, last status =', lastKnownStatus)

  // PLAN B: Bunny can sit in 'processing' for hours (status 0-3) while the
  // uploaded ORIGINAL is perfectly downloadable the whole time — five members
  // were stranded for ~3h on launch night exactly this way. The reviewer
  // dashboard already falls back to /original; do the same here instead of
  // leaving a genuine submission unevaluated.
  //
  // Size-capped: fetchVideo() pulls the whole file into memory, so a huge
  // original (an 8K phone recording can be ~184 MB) would exhaust the edge
  // function. Those stay 'pending' for the rescue sweep to hand to an admin.
  const fallbackUrl = await bunnyResolvePlayableUrl(guid)
  if (fallbackUrl) {
    try {
      const head = await fetch(fallbackUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      const size = Number(head.headers.get('content-length') ?? '0')
      if (head.ok && size > 0 && size <= FALLBACK_MAX_BYTES) {
        console.log('[bunny] transcode stalled; analysing original', size, 'bytes')
        return { kind: 'ready', url: fallbackUrl }
      }
      console.log('[bunny] original too large for fallback:', size)
    } catch { /* fall through to pending */ }
  }
  return { kind: 'pending' }
}

function buildVideoPrompt(taskTitle: string, taskDesc: string, claimedTier: Tier | null, taskPoints: number, hasReference = false): string {
  const req = claimedTier ? extractRequiredCount(claimedTier) : null
  const identityJob = hasReference ? `

JOB 3 — IS THIS THE SAME PERSON?
The FIRST image is a still from this member's OWN earlier approved submission. The video is their new one.
Decide whether the person exercising in the video is the same individual as in that image.
BE CONSERVATIVE. Different clothing, hair, lighting, room, camera angle or distance are NORMAL and are NOT evidence of a different person.
Answer "different" ONLY when facial features or body type clearly show it is somebody else.
If the face is not clearly visible in either the image or the video, answer "unclear".
This never rejects anyone on its own — a human reviews every "different".` : ''
  return `You are a fair AI reviewer for a wellness challenge app reviewing a VIDEO. You have ${hasReference ? 'THREE' : 'TWO'} jobs.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${claimedTier ? `CLAIMED TIER: "${claimedTier.label}"${req != null ? ` (target: ${req})` : ''}` : `POINTS: ${taskPoints}`}

JOB 1 — GENUINE & RIGHT ACTIVITY?
Confirm the member is genuinely performing the RIGHT activity for this task. Set approved=false ONLY if clearly cheating: a completely different activity, a screen recording / screenshot / random clip, or obviously faked/simulated motion. Otherwise approved=true.

JOB 2 — COUNT CAREFULLY (this is where mistakes happen).
The video is sampled at a low frame rate, so fast reps can fall between frames. Count deliberately:
  • Watch the clip chronologically from start to finish.
  • Count each rep as one full cycle (start position → full range of motion → back to start). For a hold like plank, count the seconds held instead.
  • Reps can happen quickly — look for partial reps at the edges and do NOT skip any.
  • If you cannot clearly see a rep actually happen, do NOT invent it. Never guess a number up or down to match the target.
  • Put your best honest integer in "read.value" and the unit in "read.unit" ("reps" or "seconds"). Use null ONLY if it is genuinely uncountable.

${identityJob}

Respond JSON only:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short"],"feedback":"ONLY if approved=false: 1 sentence why (wrong activity / fake). Empty otherwise.","read":{"value":<rep or second count, or null>,"unit":"reps|seconds|null"}${hasReference ? ',"same_person":"same|different|unclear"' : ''}}`
}

function buildImagePrompt(taskTitle: string, taskDesc: string, numericTarget: { value: number; unit: string } | null, taskPoints: number): string {
  const unitWord = numericTarget?.unit ? ` ${numericTarget.unit}` : ''
  const tierBlock = numericTarget
    ? `NUMERIC TARGET: this task requires AT LEAST ${numericTarget.value}${unitWord}.

Read the number and enforce it:
  1. Read the MAIN number in the image (e.g. the large "steps today" figure). IGNORE every other number — leaderboard / other people's counts, distance (km), calories, time, battery %, dates.
  2. Compare ONLY that main number to ${numericTarget.value}. GREATER THAN OR EQUAL → APPROVE.
     Examples: 7,544 vs 7,500 → APPROVE. 7,693 vs 7,500 → APPROVE. 8,181 vs 7,500 → APPROVE.
  3. Only if the main number is CLEARLY legible and CLEARLY below ${numericTarget.value} (e.g. 6,666 vs 7,500) → approved=false, confidence 0.9+.
  4. If you CANNOT clearly read the main number (blur, glare, cropped) → APPROVE anyway with confidence ~0.6.
  Always put the exact main number you read in the "read.value" field.`
    : `POINTS: ${taskPoints}`

  return `You are a fair, LENIENT AI reviewer for a wellness challenge app. Default to APPROVE. Only reject when the image is clearly wrong, or a legible number is clearly below the tier. When unsure → APPROVE.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

WHAT THE IMAGE SHOULD ROUGHLY SHOW (derive from the task):
  • Step/fitness → a fitness tracker screenshot (ANY app) or activity photo.
  • Food/meal/protein/veggie → a photo of food or drink.
  • Water/hydration → water container or a hydration app.
  • Habit → the relevant photo/screenshot.

APPROVE when the image is plausibly the right KIND of proof (and, if numeric, meets the tier). Benefit of the doubt.
REJECT when clearly unrelated (random selfie for a food task, a landscape for a step task), clearly AI/stock, OR a clearly-legible number below the tier.

FOOD TASKS — BE VERY LENIENT: example foods are EXAMPLES not a whitelist; corn/sprouts/soup/smoothie/chilla/curd all fine; poor lighting/angle/half-eaten/takeaway/selfie-with-food → APPROVE. Do NOT nitpick ingredients or "healthy enough".

CONFIDENCE: clearly right → 0.85–0.95. Unsure → 0.60 (approved=true). Clearly wrong / below-number → approved=false, 0.9+.

Respond JSON only:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short"],"feedback":"ONLY if rejected: 1–2 sentences on what to submit. Empty if approved.","read":{"value":<number or null>,"unit":"steps|calories|reps|minutes|null"}}`
}

const INLINE_LIMIT = 15 * 1024 * 1024

async function geminiGenerate(parts: unknown[], prompt: string, model: string, opts?: GenOpts): Promise<AIResult> {
  const generationConfig: Record<string, unknown> = {
    response_mime_type: 'application/json',
    temperature: 0.1,
    maxOutputTokens: opts?.maxOutputTokens ?? 2048,
  }
  if (opts?.thinkingBudget !== undefined) {
    // gemini-2.5-series uses thinkingBudget (-1 dynamic, 0 off, N fixed).
    generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget }
  }
  const reqBody = JSON.stringify({
    contents: [{ role: 'user', parts: [...parts, { text: prompt }] }],
    generationConfig,
  })
  // Retry transient Gemini failures (429/500/503/overloaded/network) with
  // backoff so a brief Pro/Flash demand spike self-heals INSIDE the call rather
  // than surfacing to an admin. Non-transient errors (4xx, bad output) fail fast.
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 4000)) // 4s, then 8s
    let genRes: Response
    try {
      genRes = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
        body: reqBody,
      })
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e)); continue // network blip -> retry
    }
    if (!genRes.ok) {
      const errTxt = (await genRes.text()).slice(0, 200)
      const err = new Error(`Gemini ${model} failed (${genRes.status}): ${errTxt}`)
      if (genRes.status === 429 || genRes.status === 500 || genRes.status === 503) { lastErr = err; continue } // transient -> retry
      throw err // non-transient -> fail now
    }
    const genData = await genRes.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }
    const candidate = genData.candidates?.[0]
    if (!candidate?.content) throw new Error(`Gemini ${model} no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`)
    // Join all text parts (thoughts are not returned unless includeThoughts is set).
    const text = (candidate.content.parts ?? []).map(p => p.text ?? '').join('')
    if (!text.trim()) throw new Error(`Gemini ${model} empty output (finishReason: ${candidate.finishReason ?? 'unknown'} — likely maxOutputTokens exhausted by thinking)`)
    try { return JSON.parse(text) as AIResult } catch { throw new Error(`Gemini ${model} JSON parse failed: ${text.slice(0, 200)}`) }
  }
  throw lastErr ?? new Error(`Gemini ${model} failed after retries`)
}

// Fetch video once, return bytes + mime so Flash and Pro can reuse it.
async function fetchVideo(signedUrl: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Could not fetch video (${res.status})`)
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get('content-type') ?? 'video/mp4' }
}

async function runVideoModel(video: { bytes: Uint8Array; mime: string }, prompt: string, model: string, opts?: GenOpts, reference?: { bytes: Uint8Array; mime: string } | null): Promise<AIResult> {
  // Reference goes FIRST so "the FIRST image" in the prompt is unambiguous.
  const refPart = reference
    ? [{ inline_data: { mime_type: reference.mime, data: bytesToBase64(reference.bytes) } }]
    : []
  if (video.bytes.byteLength <= INLINE_LIMIT) {
    return geminiGenerate([...refPart, { inline_data: { mime_type: video.mime, data: bytesToBase64(video.bytes) } }], prompt, model, opts)
  }
  // Large videos: Gemini File API (upload once, poll, generate)
  const initRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'X-goog-api-key': GEMINI_API_KEY,
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': video.bytes.byteLength.toString(),
      'X-Goog-Upload-Header-Content-Type': video.mime, 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'proof_video' } }),
  })
  if (!initRes.ok) throw new Error(`Upload init failed (${initRes.status})`)
  const uploadUrl = initRes.headers.get('x-goog-upload-url') ?? initRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('No upload URL')
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': video.bytes.byteLength.toString(), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: video.bytes,
  })
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`)
  const uploadData = await uploadRes.json() as { file: { name: string; uri: string; state: string } }
  const fileName = uploadData.file.name, fileUri = uploadData.file.uri
  let state = uploadData.file.state
  const deleteFile = () => { fetch(`${GEMINI_BASE}/v1beta/${fileName}`, { method: 'DELETE', headers: { 'X-goog-api-key': GEMINI_API_KEY } }).catch(() => {}) }
  const start = Date.now()
  while (state === 'PROCESSING' && Date.now() - start < 20_000) {
    await new Promise(r => setTimeout(r, 2000))
    const sr = await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, { headers: { 'X-goog-api-key': GEMINI_API_KEY } })
    if (!sr.ok) break
    state = ((await sr.json()) as { state: string }).state
  }
  if (state !== 'ACTIVE') { deleteFile(); throw new Error(`Video processing did not complete (state: ${state})`) }
  try { return await geminiGenerate([...refPart, { file_data: { mime_type: video.mime, file_uri: fileUri } }], prompt, model, opts) } finally { deleteFile() }
}

/**
 * A still from the member's FIRST approved video in this org, used to check the
 * same person keeps showing up.
 *
 * Anchored on the FIRST approved submission, not the most recent: if a fake ever
 * slips through, anchoring on "most recent" would make that fake the new
 * baseline and every later fake would match it.
 *
 * Returns null whenever anything is missing or slow — the identity check is an
 * enhancement, and must never block or fail a submission.
 */
async function fetchIdentityAnchor(
  userId: string,
  orgId: string,
  excludeSubmissionId: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const { data } = await supabase
      .from('task_submissions')
      .select('id, proof_url')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .eq('status', 'approved')
      .like('proof_url', 'bunny://%')
      .neq('id', excludeSubmissionId)
      .order('submitted_at', { ascending: true })
      .limit(1)
    const row = (data ?? [])[0] as { proof_url: string } | undefined
    if (!row) return null // first submission — this one becomes the baseline
    const guid = row.proof_url.replace('bunny://', '')
    const url = await bunnySignPath(`/${guid}/thumbnail.jpg`)
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: 'image/jpeg' }
  } catch (e) {
    console.warn('[identity] anchor unavailable', e instanceof Error ? e.message : e)
    return null
  }
}

// HYBRID: Flash first (with dynamic thinking); escalate to Pro only when Flash
// would reject or count low.
async function decideVideo(signedUrl: string, taskTitle: string, taskDesc: string, claimedTier: Tier | null, taskPoints: number, reference?: { bytes: Uint8Array; mime: string } | null): Promise<Decision> {
  const prompt = buildVideoPrompt(taskTitle, taskDesc, claimedTier, taskPoints, !!reference)
  const video = await fetchVideo(signedUrl)

  // AI CANNOT reliably count reps from video (front/depth angles, knees-down,
  // portrait framing, ~1fps sampling all defeat counting). So the rep count is
  // ADVISORY ONLY and never rejects a genuine member. The AI's job for video is
  // anti-cheat: is this a genuine attempt at the RIGHT exercise?
  //   genuine -> approve   |   fake / wrong activity -> reject (confirmed by Pro)
  const flash = await runVideoModel(video, prompt, GEMINI_FLASH, { thinkingBudget: FLASH_THINKING_BUDGET, maxOutputTokens: VIDEO_MAX_OUTPUT_TOKENS }, reference)
  const fConf = clamp01(flash.confidence ?? 0)
  const flashFlagsFake = flash.approved === false && fConf >= 0.55

  // Identity mismatch NEVER rejects — full-body framing makes faces small and
  // a wrongly-accused member is far worse than a missed cheat. It routes to a
  // human instead, whatever the activity verdict was.
  if (reference && flash.same_person === 'different') {
    return {
      status: 'needs_review',
      feedback: 'The person in this video looks different from this member\'s earlier submissions — please confirm.',
      confidence: fConf,
      model: 'flash',
    }
  }

  // Genuine (or unsure) -> approve on the cheap Flash path. No count gate.
  if (!flashFlagsFake) {
    return { status: 'approved', feedback: '', confidence: fConf, model: 'flash' }
  }

  // Flash suspects fake / wrong activity -> confirm with Pro before rejecting so
  // we NEVER reject a genuine video on Flash's word alone.
  let pro: AIResult
  try {
    pro = await runVideoModel(video, prompt, GEMINI_PRO, { maxOutputTokens: VIDEO_MAX_OUTPUT_TOKENS }, reference)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[video/pro escalation failed]', msg)
    // Throttled Pro -> let the handler auto-retry (throw) instead of dumping to admin.
    if (isTransientError(msg)) throw e
    // Pro unavailable -> don't hard-reject on Flash alone; a human confirms.
    return { status: 'needs_review', feedback: 'Could not fully verify this video — please confirm the exercise.', confidence: fConf, model: 'flash' }
  }
  const pConf = clamp01(pro.confidence ?? 0)
  if (pro.approved === false && pConf >= 0.55) {
    return { status: 'rejected', feedback: pro.feedback || 'This video does not clearly show you performing the required exercise. Please re-record showing the full exercise.', confidence: pConf, model: 'pro' }
  }
  // Pro agrees it's genuine -> approve.
  return { status: 'approved', feedback: '', confidence: pConf, model: 'pro' }
}

Deno.serve(async (req: Request) => {
  let submissionId: string | undefined
  try {
    const body = await req.json()
    const record = body.record ?? body
    submissionId = record.id
    const orgId: string = record.org_id
    if (!submissionId || !orgId) return new Response(JSON.stringify({ error: 'Missing id or org_id' }), { status: 400 })

    const { data: claimed } = await supabase.from('task_submissions').update({ ai_status: 'analyzing' }).is('ai_status', null).eq('id', submissionId).select('id')
    if (!claimed || claimed.length === 0) return new Response(JSON.stringify({ skipped: true }), { status: 200 })

    const { data: sub } = await supabase
      .from('task_submissions')
      .select('user_id, task_id, challenge_id, proof_url, selected_tier_index, submitted_at, tasks(title, description, points, points_tiers), profiles:user_id(name)')
      .eq('id', submissionId).single()

    if (!sub?.proof_url) {
      await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'No proof image found.' }).eq('id', submissionId)
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
    const submittedAt: string = sd.submitted_at ?? new Date().toISOString()

    // Throttled/busy -> requeue for the retry cron (no admin work); bounded by age.
    const requeueOrReview = async (errMsg: string, reviewFeedback: string) => {
      const canRetry = isTransientError(errMsg) && (Date.now() - new Date(submittedAt).getTime()) < RETRY_MAX_AGE_MS
      if (canRetry) {
        await supabase.from('task_submissions').update({ ai_status: null, ai_feedback: 'Reviewer busy — retrying automatically.' }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'retry', error: errMsg }), { status: 200 })
      }
      await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: reviewFeedback }).eq('id', submissionId)
      return new Response(JSON.stringify({ aiStatus: 'needs_review', error: errMsg }), { status: 200 })
    }

    const isBunny = sub.proof_url.startsWith('bunny://')
    const isVideo = isBunny || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(sub.proof_url)
    const medium: 'image' | 'video' = isVideo ? 'video' : 'image'

    let decision: Decision

    if (medium === 'video') {
      if (!GEMINI_API_KEY) {
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'Video proof — admin review required.' }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', reason: 'gemini_not_configured' }), { status: 200 })
      }
      let videoUrl: string | null = null
      if (isBunny) {
        const guid = sub.proof_url.replace('bunny://', '')
        const poll = await bunnyCheckStatus(guid)
        if (poll.kind === 'ready') videoUrl = poll.url
        else if (poll.kind === 'pending') {
          await supabase.from('task_submissions').update({ ai_status: null, ai_feedback: 'Video still processing — will retry.' }).eq('id', submissionId)
          return new Response(JSON.stringify({ aiStatus: 'retry' }), { status: 200 })
        } else {
          await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: poll.reason }).eq('id', submissionId)
          return new Response(JSON.stringify({ aiStatus: 'needs_review', reason: 'bunny_failed' }), { status: 200 })
        }
      } else {
        const { data: signed } = await supabase.storage.from('task-proofs').createSignedUrl(sub.proof_url, 300)
        videoUrl = signed?.signedUrl ?? null
        if (!videoUrl) {
          await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'Could not access proof video.' }).eq('id', submissionId)
          return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
        }
      }
      // Identity anchor is best-effort: null on first submission, or on any
      // lookup/fetch problem. Analysis proceeds exactly as before when absent.
      const identityRef = await fetchIdentityAnchor(sub.user_id, orgId, submissionId)
      try {
        decision = await decideVideo(videoUrl!, taskTitle, taskDesc, claimedTier, taskPoints, identityRef)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/video]', errMsg)
        return await requeueOrReview(errMsg, `Video analysis failed: ${errMsg}`)
      }
    } else {
      // ---- IMAGE (GPT-4o + pHash) ----
      const { data: signed } = await supabase.storage.from('task-proofs').createSignedUrl(sub.proof_url, 120)
      if (!signed?.signedUrl) {
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'Could not access proof image.' }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
      }
      const bytes = await fetchBytes(signed.signedUrl)
      if (!bytes) {
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'Could not download proof image.' }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review' }), { status: 200 })
      }
      const currentBase64 = bytesToBase64(bytes)

      // Track the closest duplicate separately for THIS task vs a DIFFERENT task.
      let sameTaskMinDist = 999
      let crossTaskMinDist = 999
      let crossTaskTitle: string | null = null
      const myHash = await computeDHash(bytes)
      if (myHash) {
        // Compare against the member's recent approved proofs in THIS org (not
        // just this task) so the same photo reused for a DIFFERENT task is
        // caught too.
        //
        // The org filter is essential: a member can play more than one event,
        // and without it we compare against proofs from a finished event. That
        // rejects a genuine new submission with "you already submitted this
        // photo for <task>" naming a task they did months ago in another org.
        const { data: prevHashed } = await supabase.from('task_submissions')
          .select('id, task_id, proof_hash, tasks(title)').eq('user_id', sub.user_id)
          .eq('org_id', orgId)
          .eq('status', 'approved').not('proof_hash', 'is', null).neq('id', submissionId)
          .order('submitted_at', { ascending: false }).limit(50)
        for (const p of prevHashed ?? []) {
          if (!p.proof_hash) continue
          const d = hamming(myHash, p.proof_hash)
          if (p.task_id === sub.task_id) {
            if (d < sameTaskMinDist) sameTaskMinDist = d
          } else if (d < crossTaskMinDist) {
            crossTaskMinDist = d
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            crossTaskTitle = (p as any).tasks?.title ?? null
          }
        }
        console.log('[phash]', JSON.stringify({ submissionId, sameTaskMinDist, crossTaskMinDist }))
        await supabase.from('task_submissions').update({ proof_hash: myHash }).eq('id', submissionId)
      }

      // Numeric target: from a formal tier, or extracted from the task text for
      // flat numeric tasks (STEP "7,500 steps" lives only in the description).
      const numericTarget: { value: number; unit: string } | null = claimedTier
        ? { value: claimedTier.points, unit: '' }
        : extractNumericTarget(taskTitle, taskDesc)
      const prompt = buildImagePrompt(taskTitle, taskDesc, numericTarget, taskPoints)
      let ai: AIResult
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'high' } } ] }],
          response_format: { type: 'json_object' }, temperature: 0.1, max_tokens: 400,
        })
        ai = JSON.parse(response.choices[0].message.content ?? '{}')
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/openai-image]', errMsg)
        return await requeueOrReview(errMsg, `AI analysis failed: ${errMsg}`)
      }

      // Image decision — number-authoritative for numeric tasks, lenient otherwise.
      let status: 'approved' | 'rejected' | 'needs_review'
      let feedback = ai.feedback ?? ''
      const conf = clamp01(ai.confidence ?? 0)
      const readVal = ai.read && typeof ai.read.value === 'number' ? ai.read.value : null

      if (numericTarget) {
        // Trust the READ NUMBER, not GPT-4o's verdict: approve >= target, reject
        // only when confidently below, review when unclear. A genuine achiever is
        // never false-rejected on a misjudgment (e.g. 7,693 read as "below 7,500").
        const unitWord = numericTarget.unit ? ` ${numericTarget.unit}` : ''
        if (readVal != null && readVal >= numericTarget.value) {
          status = 'approved'; feedback = ''
        } else if (readVal != null && readVal < numericTarget.value) {
          if (conf >= NUMBER_REJECT_CONFIDENCE) {
            status = 'rejected'
            feedback = `Your screenshot shows ${readVal}${unitWord}, which is below the ${numericTarget.value}${unitWord} required. Please submit a screenshot showing at least ${numericTarget.value}${unitWord}.`
          } else {
            status = 'needs_review'
            feedback = 'The number looks below target but the read is unclear — please verify.'
          }
        } else {
          // No number read — be lenient: a valid-looking screenshot is approved;
          // anything else goes to review (never auto-rejected on a misread).
          if (ai.approved && conf >= 0.55) { status = 'approved'; feedback = '' }
          else { status = 'needs_review'; feedback = ai.feedback || 'Could not read the number clearly — please verify the screenshot.' }
        }
      } else {
        // Non-numeric tasks (food, water, habit) — trust the lenient AI verdict.
        if (ai.approved && conf >= 0.60) status = 'approved'
        else if (!ai.approved && conf >= 0.55) status = 'rejected'
        else status = 'needs_review'
      }

      if (PHASH_ENFORCE && status === 'approved') {
        const unit = ai.read?.unit ?? null
        // Skip number/screenshot proofs (step/calorie/minute app screens
        // legitimately look near-identical day to day).
        const isScreenshot = unit === 'steps' || unit === 'calories' || unit === 'minutes'
        if (!isScreenshot) {
          if (crossTaskMinDist <= PHASH_DUP_THRESHOLD) {
            // Same photo already used for a DIFFERENT task -> wrong image, reject.
            status = 'rejected'
            feedback = crossTaskTitle
              ? `This is the wrong image for this task — you already submitted this photo for "${crossTaskTitle}". Each task needs its own photo. Please upload a new photo for "${taskTitle}".`
              : `This is the wrong image for this task — this photo was already submitted for another task. Each task needs its own photo. Please upload a new photo for "${taskTitle}".`
          } else if (sameTaskMinDist <= PHASH_DUP_THRESHOLD) {
            // Same photo re-used for the SAME task -> let an admin verify.
            status = 'needs_review'
            feedback = 'This photo looks very similar to a previous submission for this task. Please verify it is a new photo.'
          }
        }
      }
      decision = { status, feedback, confidence: conf }
    }

    // ---- Shared write ----
    const aiStatus = decision.status
    const feedback = decision.feedback
    await supabase.from('task_submissions').update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: decision.confidence, ai_video_model: decision.model ?? null }).eq('id', submissionId)

    if (aiStatus === 'approved') {
      const finalPoints = claimedTier?.points ?? taskPoints
      await supabase.from('task_submissions').update({ status: 'approved', points_awarded: finalPoints, reviewed_at: new Date().toISOString() }).eq('id', submissionId)
      await supabase.from('feed_items').insert({ org_id: orgId, type: 'submission_approved', title: `${memberName} completed ${taskTitle}`, content: `+${finalPoints} 🥦 broccoli points earned`, is_auto_generated: true, author_id: sub.user_id, challenge_id: sub.challenge_id ?? null })
    }
    if (aiStatus === 'rejected') {
      await supabase.from('task_submissions').update({ status: 'rejected', rejection_reason: feedback || 'Rejected by AI review.', reviewed_at: new Date().toISOString() }).eq('id', submissionId)
      await supabase.from('feed_items').insert({ org_id: orgId, type: 'submission_rejected', title: `Your ${taskTitle} submission was not approved`, content: feedback || 'Please resubmit with a clear proof.', is_auto_generated: true, author_id: sub.user_id, challenge_id: sub.challenge_id ?? null })
    }

    return new Response(JSON.stringify({ aiStatus, feedback, confidence: decision.confidence, medium }), { status: 200 })
  } catch (err) {
    console.error('[analyze-submission]', err)
    if (submissionId) {
      // Unexpected (non-API) failure: send to admin review as a bounded last
      // resort. Throttle/rate-limit self-heal is handled by requeueOrReview above.
      try { await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' }).eq('id', submissionId).eq('ai_status', 'analyzing') } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 200 })
  }
})
