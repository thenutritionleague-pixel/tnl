import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'
import { crypto as stdCrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL   = 'gemini-flash-latest'
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com'

const BUNNY_LIBRARY_ID    = Deno.env.get('BUNNY_LIBRARY_ID')    ?? ''
const BUNNY_API_KEY       = Deno.env.get('BUNNY_API_KEY')       ?? ''
const BUNNY_CDN_HOSTNAME  = Deno.env.get('BUNNY_CDN_HOSTNAME')  ?? ''
const BUNNY_TOKEN_AUTH    = Deno.env.get('BUNNY_TOKEN_AUTH_KEY') ?? ''

// pHash shadow mode: compute + store + log, but DO NOT reject on it yet.
const PHASH_ENFORCE = false
const PHASH_DUP_THRESHOLD = 6

// Video rep-count calibration. Gemini Flash samples frames and undercounts
// real effort by ~30%, so we only require this fraction of the target to
// approve. When we upgrade to Gemini Pro (accurate counting) raise toward 0.9.
const VIDEO_COUNT_TOLERANCE = 0.65

type Tier = { label: string; description: string; points: number }
type AIResult = {
  approved:   boolean
  confidence: number
  issues:     string[]
  feedback:   string
  read?: { value?: number | null; unit?: string | null } | null
}

type BunnyPollResult =
  | { kind: 'ready'; url: string }
  | { kind: 'pending' }
  | { kind: 'failed'; reason: string }

// Pull the required rep/second count out of a tier like "20 push-ups" or
// "30 secs duration" -> 20 / 30. Null if no number present.
function extractRequiredCount(tier: Tier): number | null {
  const m = `${tier.label} ${tier.description}`.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

async function bunnySignedUrl(guid: string, ttlSeconds = 900): Promise<string> {
  const path = `/${guid}/play_480p.mp4`
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
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Perceptual fingerprint (dHash, 64-bit). Resize to 9x8, compare each pixel's
// brightness to its right neighbour. Returns 16-hex, or null on decode error.
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
  } catch (e) {
    console.warn('[dhash] decode failed', e instanceof Error ? e.message : e)
    return null
  }
}

function hamming(aHex: string, bHex: string): number {
  let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex)
  let count = 0
  while (x > 0n) { count += Number(x & 1n); x >>= 1n }
  return count
}

async function bunnyCheckStatus(guid: string): Promise<BunnyPollResult> {
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY || !BUNNY_CDN_HOSTNAME) {
    return { kind: 'failed', reason: 'Bunny credentials missing on the server.' }
  }
  const statusUrl = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${guid}`
  const deadline = Date.now() + 40_000
  let lastKnownStatus = -1
  while (Date.now() < deadline) {
    try {
      const res = await fetch(statusUrl, {
        headers: { 'AccessKey': BUNNY_API_KEY, 'accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (res.status === 404) return { kind: 'failed', reason: 'Video was deleted from the video service before analysis. Please re-upload.' }
      if (!res.ok) { await new Promise(r => setTimeout(r, 2000)); continue }
      const data = await res.json() as { status?: number }
      lastKnownStatus = data.status ?? -1
      if (lastKnownStatus === 4) return { kind: 'ready', url: await bunnySignedUrl(guid) }
      if (lastKnownStatus === 5) return { kind: 'failed', reason: 'Video could not be processed — likely audio/video sync issue, unsupported codec, or corrupted file. Please re-record and try again.' }
      if (lastKnownStatus === 6) return { kind: 'failed', reason: 'Video upload was incomplete. Please try again on a stable network.' }
    } catch (e) {
      console.warn('[bunny] status check error', e instanceof Error ? e.message : e)
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  console.log('[bunny] poll timeout, last status =', lastKnownStatus)
  return { kind: 'pending' }
}

function buildPrompt(opts: {
  medium: 'image' | 'video'
  taskTitle: string
  taskDesc: string
  claimedTier: Tier | null
  taskPoints: number
}): string {
  const { medium, taskTitle, taskDesc, claimedTier, taskPoints } = opts

  if (medium === 'video') {
    const req = claimedTier ? extractRequiredCount(claimedTier) : null
    return `You are a fair AI reviewer for a wellness challenge app reviewing a VIDEO. You have TWO jobs.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${claimedTier ? `CLAIMED TIER: "${claimedTier.label}"${req != null ? ` (target: ${req})` : ''}` : `POINTS: ${taskPoints}`}

JOB 1 — GENUINE & RIGHT ACTIVITY?
Confirm the member is genuinely performing the RIGHT activity for this task (e.g. actual push-ups for a push-up task). Set approved=false ONLY if it is clearly cheating: a completely different activity, a screen recording / screenshot / random clip, or obviously faked/simulated motion. Otherwise approved=true.

JOB 2 — COUNT.
Count the repetitions (or, for a hold like plank, the seconds held) as carefully as you can. Watch the whole clip. Count GENEROUSLY — include every rep you see, even partial ones at the start/end. Put your best count in "read.value" and the unit in "read.unit" ("reps" or "seconds"). If you truly cannot tell, use null.

The server applies a generous tolerance to your count (it knows video counting undercounts), so just give your honest best count — do NOT try to reject on the count yourself. Your feedback field is only used if approved=false.

Respond JSON only:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short"],"feedback":"ONLY if approved=false: 1 sentence why (wrong activity / fake). Empty otherwise.","read":{"value":<your rep or second count, or null>,"unit":"reps|seconds|null"}}`
  }

  const tierBlock = claimedTier
    ? `CLAIMED TIER: "${claimedTier.label}" — minimum ${claimedTier.points}.

If this task involves a number (steps, calories, minutes, reps):
  1. Read the number in the image as carefully as you can.
  2. Compare to the minimum ${claimedTier.points}. GREATER THAN OR EQUAL → APPROVE.
     Examples: 7,544 vs 7,500 → APPROVE. 7,890 vs 6,000 → APPROVE. 6,000 vs 6,000 → APPROVE.
  3. If you CANNOT clearly read the number (blur, glare, cropped) → APPROVE anyway, confidence ~0.6. Do NOT reject for an unreadable number.
  4. Only set approved=false if the number is CLEARLY legible AND clearly below ${claimedTier.points}.
  Always put the number you read in the "read" field so the server can double-check.`
    : `POINTS: ${taskPoints}`

  return `You are a fair, LENIENT AI reviewer for a wellness challenge app. Your default is to APPROVE. Only reject when the image is clearly, obviously wrong. When unsure → APPROVE.

TASK: "${taskTitle}"${taskDesc ? `\nDESCRIPTION: ${taskDesc}` : ''}
${tierBlock}

WHAT THE IMAGE SHOULD ROUGHLY SHOW (derive from the task title/description):
  • Step/fitness task → a fitness tracker screenshot (ANY app) or activity photo.
  • Food/meal/protein/veggie task → a photo of food or drink.
  • Water/hydration task → water container or a hydration app.
  • Habit task → the relevant photo/screenshot.

APPROVE when the image is plausibly the right KIND of proof. Give the benefit of the doubt.

REJECT ONLY when the image is clearly unrelated (random selfie with no food for a food task, a landscape for a step task) OR clearly AI-generated / a stock image.

FOOD TASKS — BE VERY LENIENT (most wrong rejections happen here):
  • Example foods in the task (sattu, sprouts, chana, salad, cucumber, etc) are EXAMPLES, NOT a strict allowed-list.
  • If the image shows reasonable food in the SAME SPIRIT as the task, APPROVE. Do NOT reject because a salad also contains corn, or has sprouts, or is a soup/smoothie/chilla/curd instead of the exact example.
  • Poor lighting, odd angle, half-eaten, take-away box, restaurant plate, home-cooked, a drink/smoothie form → all APPROVE if food is visible.
  • A selfie that ALSO clearly shows the required food → APPROVE.

Do NOT judge whether the food is "healthy enough" or nitpick specific ingredients. Food + roughly matches theme → APPROVE.

CONFIDENCE: clearly right → 0.85–0.95. Plausible/unsure → 0.60 (approved=true). Clearly wrong → approved=false, 0.85+.

This app has NEVER had a problem with wrong approvals — only wrongly REJECTING honest members. Lean approve.

Respond JSON only:
{"approved":true|false,"confidence":0.0-1.0,"issues":["short"],"feedback":"ONLY if rejected: 1–2 sentences on what to submit instead. Empty if approved.","read":{"value":<number or null>,"unit":"steps|calories|reps|minutes|null"}}`
}

const INLINE_LIMIT = 15 * 1024 * 1024

async function geminiGenerate(parts: unknown[], prompt: string): Promise<AIResult> {
  const genRes = await fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...parts, { text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
      }),
    },
  )
  if (!genRes.ok) throw new Error(`Gemini generate failed (${genRes.status}): ${await genRes.text()}`)
  const genData = await genRes.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }
  const candidate = genData.candidates?.[0]
  if (!candidate?.content) throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`)
  const text = candidate.content.parts?.[0]?.text ?? '{}'
  try { return JSON.parse(text) as AIResult }
  catch { throw new Error(`Gemini JSON parse failed. Raw text: ${text.slice(0, 300)}`) }
}

async function analyzeVideoWithGemini(signedUrl: string, prompt: string): Promise<AIResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')
  const videoRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })
  if (!videoRes.ok) throw new Error(`Could not fetch video (${videoRes.status})`)
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer())
  const mimeType = videoRes.headers.get('content-type') ?? 'video/mp4'
  if (videoBytes.byteLength <= INLINE_LIMIT) {
    const base64 = bytesToBase64(videoBytes)
    return geminiGenerate([{ inline_data: { mime_type: mimeType, data: base64 } }], prompt)
  }
  const initRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
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
  })
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
  const deleteFile = () => { fetch(`${GEMINI_BASE}/v1beta/${fileName}`, { method: 'DELETE', headers: { 'X-goog-api-key': GEMINI_API_KEY } }).catch(() => {}) }
  const start = Date.now()
  while (state === 'PROCESSING' && Date.now() - start < 20_000) {
    await new Promise(r => setTimeout(r, 2000))
    const stateRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, { headers: { 'X-goog-api-key': GEMINI_API_KEY } })
    if (!stateRes.ok) break
    state = ((await stateRes.json()) as { state: string }).state
  }
  if (state !== 'ACTIVE') { deleteFile(); throw new Error(`Video processing did not complete (final state: ${state})`) }
  try { return await geminiGenerate([{ file_data: { mime_type: mimeType, file_uri: fileUri } }], prompt) } finally { deleteFile() }
}

Deno.serve(async (req: Request) => {
  let submissionId: string | undefined
  try {
    const body = await req.json()
    const record = body.record ?? body
    submissionId = record.id
    const orgId: string = record.org_id
    if (!submissionId || !orgId) return new Response(JSON.stringify({ error: 'Missing id or org_id' }), { status: 400 })

    const { data: claimed } = await supabase
      .from('task_submissions')
      .update({ ai_status: 'analyzing' })
      .is('ai_status', null)
      .eq('id', submissionId)
      .select('id')
    if (!claimed || claimed.length === 0) return new Response(JSON.stringify({ skipped: true }), { status: 200 })

    const { data: sub } = await supabase
      .from('task_submissions')
      .select('user_id, task_id, challenge_id, proof_url, selected_tier_index, tasks(title, description, points, points_tiers), profiles:user_id(name)')
      .eq('id', submissionId)
      .single()

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

    const isBunny = sub.proof_url.startsWith('bunny://')
    const isVideo = isBunny || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(sub.proof_url)
    const medium: 'image' | 'video' = isVideo ? 'video' : 'image'

    let aiResult: AIResult

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
      const prompt = buildPrompt({ medium, taskTitle, taskDesc, claimedTier, taskPoints })
      try {
        aiResult = await analyzeVideoWithGemini(videoUrl!, prompt)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/video]', errMsg)
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: `Video analysis failed: ${errMsg}` }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', error: errMsg }), { status: 200 })
      }
    } else {
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

      // pHash SHADOW MODE: compute, compare, store, log (no rejection yet).
      const myHash = await computeDHash(bytes)
      if (myHash) {
        const { data: prevHashed } = await supabase
          .from('task_submissions')
          .select('id, proof_hash')
          .eq('user_id', sub.user_id)
          .eq('task_id', sub.task_id)
          .eq('status', 'approved')
          .not('proof_hash', 'is', null)
          .neq('id', submissionId)
          .order('submitted_at', { ascending: false })
          .limit(20)
        let minDist = 999
        for (const p of prevHashed ?? []) {
          if (!p.proof_hash) continue
          const d = hamming(myHash, p.proof_hash)
          if (d < minDist) minDist = d
        }
        console.log('[phash]', JSON.stringify({ submissionId, myHash, minDist, wouldFlag: minDist <= PHASH_DUP_THRESHOLD }))
        await supabase.from('task_submissions').update({ proof_hash: myHash }).eq('id', submissionId)
        void PHASH_ENFORCE
      }

      const prompt = buildPrompt({ medium, taskTitle, taskDesc, claimedTier, taskPoints })
      const contentBlocks = [
        { type: 'text' as const, text: prompt },
        { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${currentBase64}`, detail: 'high' as const } },
      ]
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: contentBlocks }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 400,
        })
        aiResult = JSON.parse(response.choices[0].message.content ?? '{}')
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error('[analyze-submission/openai-image]', errMsg)
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: `AI analysis failed: ${errMsg}` }).eq('id', submissionId)
        return new Response(JSON.stringify({ aiStatus: 'needs_review', error: errMsg }), { status: 200 })
      }
    }

    // ================= DECISION =================
    let aiStatus: string
    let feedback = aiResult.feedback ?? ''
    const confidence = Math.min(1, Math.max(0, aiResult.confidence ?? 0))

    if (medium === 'video') {
      // 1) Clear cheating / wrong activity -> reject.
      if (aiResult.approved === false && confidence >= 0.55) {
        aiStatus = 'rejected'
        feedback = feedback || 'The video does not clearly show the required activity. Please re-record performing the exercise.'
      } else {
        // 2) Genuine activity. Apply calibrated count check.
        const required = claimedTier ? extractRequiredCount(claimedTier) : null
        const counted  = aiResult.read && typeof aiResult.read.value === 'number' ? aiResult.read.value : null
        if (required != null && counted != null) {
          const need = Math.ceil(required * VIDEO_COUNT_TOLERANCE)
          console.log('[video-count]', JSON.stringify({ submissionId, required, counted, need, tolerance: VIDEO_COUNT_TOLERANCE }))
          if (counted >= need) {
            aiStatus = 'approved'
            feedback = ''
          } else {
            // Clearly low even after tolerance -> admin decides (never hard reject).
            aiStatus = 'needs_review'
            feedback = `Video looks genuine but the count read low (~${counted} vs target ${required}). Please verify.`
          }
        } else {
          // Couldn't count -> trust genuineness -> approve.
          aiStatus = 'approved'
          feedback = ''
        }
      }
    } else {
      // IMAGE numeric safety net
      let forceNeedsReview = false
      if (claimedTier && aiResult.approved === false) {
        const readVal = aiResult.read && typeof aiResult.read.value === 'number' ? aiResult.read.value : null
        if (readVal != null && readVal >= claimedTier.points) {
          aiResult.approved = true
          aiResult.confidence = Math.max(aiResult.confidence ?? 0, 0.8)
          feedback = `Approved by server — image shows ${readVal} which meets the ${claimedTier.points} minimum.`
        } else if (readVal != null && readVal < claimedTier.points) {
          forceNeedsReview = true
        }
      }
      const conf = Math.min(1, Math.max(0, aiResult.confidence ?? 0))
      if (forceNeedsReview) { aiStatus = 'needs_review'; feedback = 'Number below tier on an unclear read — please verify the value.' }
      else if (aiResult.approved && conf >= 0.60) aiStatus = 'approved'
      else if (!aiResult.approved && conf >= 0.55) aiStatus = 'rejected'
      else aiStatus = 'needs_review'
    }

    await supabase.from('task_submissions').update({ ai_status: aiStatus, ai_feedback: feedback || null, ai_confidence: confidence }).eq('id', submissionId)

    if (aiStatus === 'approved') {
      const finalPoints = claimedTier?.points ?? taskPoints
      await supabase.from('task_submissions').update({ status: 'approved', points_awarded: finalPoints, reviewed_at: new Date().toISOString() }).eq('id', submissionId)
      await supabase.from('feed_items').insert({
        org_id: orgId, type: 'submission_approved',
        title: `${memberName} completed ${taskTitle}`,
        content: `+${finalPoints} 🥦 broccoli points earned`,
        is_auto_generated: true, author_id: sub.user_id, challenge_id: sub.challenge_id ?? null,
      })
    }
    if (aiStatus === 'rejected') {
      await supabase.from('task_submissions').update({
        status: 'rejected', rejection_reason: feedback || 'Rejected by AI review.',
        reviewed_at: new Date().toISOString(),
      }).eq('id', submissionId)
      await supabase.from('feed_items').insert({
        org_id: orgId, type: 'submission_rejected',
        title: `Your ${taskTitle} submission was not approved`,
        content: feedback || 'Please resubmit with a clear proof.',
        is_auto_generated: true, author_id: sub.user_id, challenge_id: sub.challenge_id ?? null,
      })
    }

    return new Response(JSON.stringify({ aiStatus, feedback, confidence, medium }), { status: 200 })
  } catch (err) {
    console.error('[analyze-submission]', err)
    if (submissionId) {
      try {
        await supabase.from('task_submissions').update({ ai_status: 'needs_review', ai_feedback: 'AI analysis failed — please review manually.' }).eq('id', submissionId).eq('ai_status', 'analyzing')
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 200 })
  }
})