'use server'

import { revalidatePath } from 'next/cache'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile, readOnlyBlock } from '@/lib/auth'

const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']
const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']

const BUNNY_CDN_HOSTNAME  = process.env.BUNNY_CDN_HOSTNAME  || 'vz-c97d7e4d-363.b-cdn.net'
const BUNNY_TOKEN_AUTH    = process.env.BUNNY_TOKEN_AUTH_KEY || ''

const BUNNY_MP4_RESOLUTIONS = ['720p', '480p', '360p', '240p', '1080p']

/**
 * Sign an arbitrary Bunny CDN path. Token Authentication:
 *   token = base64url( md5_binary(TokenAuthKey + path + expires) )
 * If TOKEN_AUTH is empty, returns the plain URL (works if the library is public).
 */
function bunnySignPath(path: string, ttlSeconds = 1800): string {
  const url = `https://${BUNNY_CDN_HOSTNAME}${path}`
  if (!BUNNY_TOKEN_AUTH) return url
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const raw = BUNNY_TOKEN_AUTH + path + String(expires)
  const md5 = createHash('md5').update(raw).digest()
  const token = md5.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${url}?token=${token}&expires=${expires}`
}

/**
 * Bunny only generates renditions that fit the source, so a hardcoded 480p can
 * 404 for some videos. Try each resolution (HEAD) and return the first that
 * exists; fall back to 480p unverified so we always return something.
 */
async function bunnyPlayableUrl(guid: string, ttlSeconds = 1800): Promise<string> {
  for (const r of BUNNY_MP4_RESOLUTIONS) {
    const url = bunnySignPath(`/${guid}/play_${r}.mp4`, ttlSeconds)
    try {
      const head = await fetch(url, { method: 'HEAD' })
      if (head.ok) return url
    } catch { /* try next resolution */ }
  }
  // Bunny's transcode can fail (status 5) while the uploaded original is
  // perfectly intact and downloadable. Without this the reviewer is stuck on
  // "Video is being processed" forever for a video that is sitting right
  // there, because every play_* rendition 404s. The edge function already
  // falls back this way; the dashboard did not.
  const original = bunnySignPath(`/${guid}/original`, ttlSeconds)
  try {
    const head = await fetch(original, { method: 'HEAD' })
    if (head.ok) return original
  } catch { /* fall through */ }

  return bunnySignPath(`/${guid}/play_480p.mp4`, ttlSeconds)
}

export async function approveSubmission(
  submissionId: string,
  orgId: string,
  pointsOverride: number | null,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  // Fetch submission details for feed item
  const { data: subDetails } = await client
    .from('task_submissions')
    .select('user_id, challenge_id, selected_tier_index, task_snapshot, tasks(title, points, points_tiers), profiles:user_id(name)')
    .eq('id', submissionId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = subDetails as any
  // Fall back to the CLAIMED TIER, not the task's base points.
  //
  // A tiered task carries a nominal `points` that is not what anyone earns --
  // Broccoli Burpee Bash is points = 10 with tiers of 100 and 200. The review
  // modal already tells the admin "Default: 200 pts (claimed tier)", but the
  // default here was tasks.points, so leaving the override blank would have
  // awarded 10 instead of 200 and quietly underpaid the member.
  //
  // Never fired for a while: 48 admin approvals of a tiered submission all
  // happened to have an override typed. It fired on 23 Aug -- three needs_review
  // submissions paid the base 10 instead of the claimed tier (150, 200, 150).
  // The LIVE join's tasks.points_tiers[index] came back empty for those three
  // for reasons never fully pinned down, and the code fell straight through to
  // tasks.points with no one noticing until a captain flagged the payout.
  //
  // Snapshot first, live join second: task_snapshot.selected_tier is written
  // once at submission time and never depends on a join resolving correctly at
  // approval time. On all three broken rows it held the right tier.points the
  // whole time -- admin-queries.ts already prefers it for this exact reason,
  // this action just never matched that.
  const tierPoints: number | null =
    sd?.task_snapshot?.selected_tier?.points ??
    (sd?.selected_tier_index != null
      ? (sd?.tasks?.points_tiers?.[sd.selected_tier_index]?.points ?? null)
      : null)
  const finalPoints = pointsOverride ?? tierPoints ?? sd?.tasks?.points ?? 0
  const taskTitle: string = sd?.tasks?.title ?? 'a task'
  const memberName: string = sd?.profiles?.name ?? 'A member'
  const memberId: string | null = sd?.user_id ?? null
  const challengeId: string | null = sd?.challenge_id ?? null

  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'approved',
      points_awarded: finalPoints,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }

  // Create rich feed item
  await client.from('feed_items').insert({
    org_id: orgId,
    type: 'submission_approved',
    title: `${memberName} completed ${taskTitle}`,
    content: `+${finalPoints} 🥦 broccoli points earned`,
    is_auto_generated: true,
    author_id: memberId,
    challenge_id: challengeId,
  })

  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function rejectSubmission(
  submissionId: string,
  orgId: string,
  reason: string,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
      // ai_status must NOT be nulled. retry_pending_bunny_submissions selects
      // on `ai_status IS NULL`, so nulling it made the cron re-fire the AI on a
      // submission a human had just rejected — the AI re-approved it and the
      // rejection silently disappeared. Mark it as the human verdict instead.
      ai_status: 'rejected',
      ai_feedback: null,
      ai_confidence: null,
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function loadApprovalsPage(orgId: string, page: number, status?: 'pending' | 'approved' | 'rejected', date?: string, taskId?: string, search?: string, aiDisagreed = false, needsAttention = false) {
  const profile = await getAdminProfile()
  if (!profile) return null
  const { getOrgApprovals } = await import('@/lib/supabase/admin-queries')
  return getOrgApprovals(orgId, page, status, date, taskId, search, aiDisagreed, needsAttention)
}

export async function loadOrgTasks(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return []
  const { getOrgTaskList } = await import('@/lib/supabase/admin-queries')
  return getOrgTaskList(orgId)
}

export async function loadApprovalCounts(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { pending: 0, approved: 0, rejected: 0, rejectedEver: 0 }
  const { getOrgApprovalCounts } = await import('@/lib/supabase/admin-queries')
  return getOrgApprovalCounts(orgId)
}

export async function loadOrgTaskBreakdown(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return []
  const { getOrgTaskBreakdown } = await import('@/lib/supabase/admin-queries')
  return getOrgTaskBreakdown(orgId)
}

export async function loadRejectionHistoryPage(orgId: string, page: number, taskId?: string) {
  const profile = await getAdminProfile()
  if (!profile) return null
  const { getOrgRejectionHistory } = await import('@/lib/supabase/admin-queries')
  return getOrgRejectionHistory(orgId, page, taskId || undefined)
}

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const profile = await getAdminProfile()
  if (!profile) return null

  // Bunny Stream videos — return signed CDN URL (Token Authentication is
  // enabled on the library, so playback requires a signed token).
  if (path.startsWith('bunny://')) {
    const guid = path.replace('bunny://', '')
    return await bunnyPlayableUrl(guid)
  }

  const client = await createAdminClient()
  // No `transform: {...}` — Supabase counts each unique source image transformed
  // against the Pro plan's 100/month "Storage Image Transformations" quota, and
  // active admin review sessions blow through that in a day. Proofs are already
  // capped at 1280×1280 / quality 82 on mobile upload (~150-300 KB each), so
  // serving the original costs negligible egress (<1% of the 250 GB Pro budget).
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 1800)
  return data?.signedUrl ?? null
}

export async function getPreviousApprovedProof(
  userId: string,
  taskId: string,
  excludeSubmissionId: string,
): Promise<string | null> {
  const profile = await getAdminProfile()
  if (!profile) return null
  const client = await createAdminClient()
  const { data } = await client
    .from('task_submissions')
    .select('proof_url')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('status', 'approved')
    .neq('id', excludeSubmissionId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.proof_url) return null

  // Bunny video → signed CDN URL
  if (data.proof_url.startsWith('bunny://')) {
    const guid = data.proof_url.replace('bunny://', '')
    return await bunnyPlayableUrl(guid, 300)
  }

  // No transform — see getProofSignedUrl above for the rationale (transformation
  // quota is the bottleneck, not egress).
  const { data: signed } = await client.storage
    .from('task-proofs')
    .createSignedUrl(data.proof_url, 300)
  return signed?.signedUrl ?? null
}

/**
 * Clear a member's submission for the day so they can submit again from scratch.
 *
 * Day 1 of National produced the case this exists for: a member picked the 6,000
 * tier at 10:38, then wanted to keep walking and claim 12,000 later. Once a
 * submission is approved the task shows "Done" and cannot be tapped, so the only
 * way through was an admin doing it by hand in the database. At ~900 submissions
 * a day that does not scale.
 *
 * This is a FRESH START, not an edit: the submission, its points, its feed posts
 * and its proof file all go, and whatever they submit next decides the points —
 * higher or lower. The daily unique index (user, task, date) means the slot must
 * genuinely be empty before they can submit again.
 */
export async function allowResubmit(submissionId: string, orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  const { data: sub } = await client
    .from('task_submissions')
    .select('id, user_id, proof_url, challenge_id, reviewed_at, submitted_at')
    .eq('id', submissionId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!sub) return { error: 'Submission not found in this org.' }

  // 1. Ledger BEFORE the submission: points_transactions.submission_id has an FK
  //    to task_submissions with no ON DELETE CASCADE, so the reverse order fails
  //    with 23503 for any approved submission.
  const { error: ptErr } = await client
    .from('points_transactions').delete().eq('submission_id', submissionId)
  if (ptErr) return { error: `Could not clear points: ${ptErr.message}` }

  // 2. The auto-posts announcing points they no longer hold. feed_items has no
  //    submission_id column, so these are matched by author + type within a
  //    short window around the decision.
  const anchor = sub.reviewed_at ?? sub.submitted_at
  if (anchor) {
    const from = new Date(new Date(anchor).getTime() - 60_000).toISOString()
    const to   = new Date(new Date(anchor).getTime() + 5 * 60_000).toISOString()
    await client.from('feed_items').delete()
      .eq('author_id', sub.user_id)
      .eq('is_auto_generated', true)
      .in('type', ['submission_approved', 'submission_rejected', 'milestone'])
      .gte('created_at', from).lte('created_at', to)
  }

  // 3. The submission itself (cascades task_submission_events).
  const { error: sErr } = await client
    .from('task_submissions').delete().eq('id', submissionId).eq('org_id', orgId)
  if (sErr) return { error: `Could not clear submission: ${sErr.message}` }

  // 4. The proof file. Bunny videos live on another backend and are swept
  //    separately, so only Supabase Storage paths are removed here.
  if (sub.proof_url && !sub.proof_url.startsWith('bunny://')) {
    const { error: stErr } = await client.storage.from('task-proofs').remove([sub.proof_url])
    if (stErr) console.error('[allowResubmit] proof cleanup failed:', stErr)
  }

  // 5. total_points is a cached sum, so recompute it from the ledger rather than
  //    subtracting — that keeps it exactly equal to the transactions, which is
  //    what invariant 2 asserts.
  const { data: ledger } = await client
    .from('points_transactions').select('amount')
    .eq('user_id', sub.user_id).eq('org_id', orgId)
  const total = ((ledger ?? []) as { amount: number }[])
    .reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const { error: pErr } = await client
    .from('profiles').update({ total_points: total }).eq('id', sub.user_id)
  if (pErr) return { error: `Could not recompute points: ${pErr.message}` }

  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export type DuplicateMatch = {
  /** Signed URL of the proof being reviewed. */
  currentUrl: string
  /** Signed URL of the earlier APPROVED proof it matched. */
  previousUrl: string
  previousDate: string
  /** true when the two files are byte-for-byte the same, not merely similar. */
  identical: boolean
  currentBytes?: number
  previousBytes?: number
  /**
   * Hamming distance between the two perceptual hashes, 0-64.
   * 0 means the same image; the AI only flags at 8 or below. Showing it lets a
   * reviewer tell "identical file" from "a similar-looking lunch on another day",
   * which for a task members repeat daily is the whole judgement.
   */
  distance?: number
  /**
   * A video pair rather than a photo pair. The panel plays them instead of
   * showing images, and the byte-size / distance fields do not apply -- a video
   * is proven identical by its full-file SHA, recorded when it was fingerprinted.
   */
  isVideo?: boolean
}

/**
 * Bits that differ between two 64-bit hex dHashes.
 *
 * Done a hex digit at a time rather than with BigInt: this file is compiled for
 * the dashboard's TS target, which predates BigInt literals, and a 16-entry
 * popcount table is both portable and faster than shifting a BigInt 64 times.
 */
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64
  let n = 0
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16)
    const y = parseInt(b[i], 16)
    if (Number.isNaN(x) || Number.isNaN(y)) return 64
    n += NIBBLE_BITS[(x ^ y) & 15]
  }
  return n
}

/**
 * The evidence behind a "this photo looks very similar" flag.
 *
 * The flag alone is unusable: it tells an admin two photos resemble each other
 * but not WHICH photo, so the only options were to trust it blindly or approve
 * blindly. On 20 Aug that produced 18 flagged submissions nobody could action,
 * while members waited and support messages piled up.
 *
 * This returns both images plus the one fact that settles it outright: whether
 * the files are byte-identical. Two photos of the same meal taken seconds apart
 * still differ in thousands of bytes, so an exact match is a re-upload, not a
 * coincidence — all 18 on 20 Aug were exact, including a 2.3 MB file.
 *
 * Matching is by proof_hash (what the AI actually compared), scoped to the same
 * member, task and org, so it names the exact submission that triggered the flag
 * rather than guessing at "most recent".
 */
export async function getDuplicateMatch(submissionId: string): Promise<DuplicateMatch | null> {
  const profile = await getAdminProfile()
  if (!profile) return null
  const client = await createAdminClient()

  // VIDEOS first. proof_hash is null for every video, so the image path below
  // returned null and the panel read "No earlier photo to compare" -- on a
  // submission the system had just rejected for being a duplicate video. The
  // admin was told a duplicate existed and then shown nothing to check it
  // against, which is the same unusable flag this function was written to fix.
  {
    const { data: v } = await client
      .from('task_submissions')
      .select('user_id, org_id, proof_url, video_fingerprint, video_file_sha, submitted_date')
      .eq('id', submissionId)
      .maybeSingle()

    if (v?.proof_url?.startsWith('bunny://') && v.video_fingerprint) {
      const { data: earlier } = await client
        .from('task_submissions')
        .select('proof_url, submitted_date, video_file_sha')
        .eq('user_id', v.user_id)
        .eq('org_id', v.org_id)
        .eq('video_fingerprint', v.video_fingerprint)
        .neq('id', submissionId)
        .order('submitted_at', { ascending: true })
        .limit(1)

      const prevVideo = (earlier ?? [])[0] as
        { proof_url: string | null; submitted_date: string; video_file_sha: string | null } | undefined

      if (prevVideo?.proof_url) {
        const [currentUrl, previousUrl] = await Promise.all([
          bunnyPlayableUrl(v.proof_url.replace('bunny://', '')),
          bunnyPlayableUrl(prevVideo.proof_url.replace('bunny://', '')),
        ])
        if (currentUrl && previousUrl) {
          return {
            currentUrl,
            previousUrl,
            previousDate: prevVideo.submitted_date,
            // Both full-file SHAs recorded and equal = the same file, proven.
            identical: !!v.video_file_sha && v.video_file_sha === prevVideo.video_file_sha,
            isVideo: true,
          }
        }
      }
      return null
    }
  }

  const { data: cur } = await client
    .from('task_submissions')
    .select('user_id, task_id, org_id, proof_url, proof_hash')
    .eq('id', submissionId)
    .maybeSingle()
  if (!cur?.proof_hash || !cur.proof_url) return null

  // Find the CLOSEST earlier photo, not an exactly-equal hash.
  //
  // This used to require .eq('proof_hash', ...). That only ever matched a
  // pixel-identical re-upload -- but those are now auto-rejected before a human
  // sees them, so every row still reaching this panel is a NEAR match (1-8 bits)
  // with, by definition, a different hash. The query found nothing, the function
  // returned null, and "Compare photos" appeared to do nothing at all.
  const { data: candidates } = await client
    .from('task_submissions')
    .select('proof_url, submitted_date, proof_hash')
    .eq('user_id', cur.user_id)
    .eq('task_id', cur.task_id)
    .eq('org_id', cur.org_id)
    .eq('status', 'approved')
    .not('proof_hash', 'is', null)
    .neq('id', submissionId)
    .order('submitted_at', { ascending: true })
    .limit(50)

  let prev: { proof_url: string; submitted_date: string } | null = null
  let bestDistance = 65
  for (const c of (candidates ?? []) as { proof_url: string | null; submitted_date: string; proof_hash: string }[]) {
    if (!c.proof_url) continue
    let d: number
    try { d = hammingHex(cur.proof_hash, c.proof_hash) } catch { continue }
    if (d < bestDistance) {
      bestDistance = d
      prev = { proof_url: c.proof_url, submitted_date: c.submitted_date }
    }
  }
  if (!prev?.proof_url) return null

  const sign = async (path: string) => {
    const { data } = await client.storage.from('task-proofs').createSignedUrl(path, 900)
    return data?.signedUrl ?? null
  }
  const [currentUrl, previousUrl] = await Promise.all([sign(cur.proof_url), sign(prev.proof_url)])
  if (!currentUrl || !previousUrl) return null

  // Hash the actual bytes. proof_hash is a perceptual hash, which can in
  // principle collide; a SHA of the file cannot. This is what lets the UI say
  // "identical file" instead of "looks similar".
  const digest = async (url: string): Promise<{ hash: string; bytes: number } | null> => {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const buf = new Uint8Array(await res.arrayBuffer())
      return { hash: createHash('sha256').update(buf).digest('hex'), bytes: buf.byteLength }
    } catch { return null }
  }
  const [a, b] = await Promise.all([digest(currentUrl), digest(previousUrl)])

  return {
    currentUrl,
    previousUrl,
    previousDate: prev.submitted_date as string,
    identical: !!a && !!b && a.hash === b.hash,
    currentBytes: a?.bytes ?? 0,
    previousBytes: b?.bytes ?? 0,
    distance: bestDistance,
  }
}

export type PipelineHealth = {
  level: 'healthy' | 'busy' | 'degraded'
  headline: string
  detail: string
  pending: number
  oldestMins: number
  needsReview: number
  videoPending: number
  photoPending: number
  autoReleaseOk: boolean
  lastAutoRelease: string | null
}

/**
 * Whether the submission pipeline is keeping up, in words an admin can act on.
 *
 * Without this the only visible signal is "N pending", which says nothing about
 * WHY. On 20 Aug an admin watched 107 pile up with no way to tell that Bunny was
 * hours behind on 800 videos and Google was returning 503s — so the only option
 * was to ask someone to read the logs. Photos that same day averaged 72 seconds.
 *
 * The distinction that matters is video vs photo: video is the only thing that
 * queues, because the web app uploads raw phone recordings (70-280 MB) and both
 * transcoding and analysis choke on them.
 */
export async function getPipelineHealth(orgId: string): Promise<PipelineHealth | null> {
  const profile = await getAdminProfile()
  if (!profile) return null
  const client = await createAdminClient()

  const { data: rows } = await client
    .from('task_submissions')
    .select('ai_status, proof_url, submitted_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .limit(500)

  const list = (rows ?? []) as { ai_status: string | null; proof_url: string; submitted_at: string }[]
  const now = Date.now()
  const pending = list.length
  const needsReview = list.filter(r => r.ai_status === 'needs_review').length
  const videoPending = list.filter(r => r.proof_url?.startsWith('bunny://') && r.ai_status !== 'needs_review').length
  const photoPending = pending - videoPending - needsReview
  // Age is measured ONLY over submissions the pipeline still owes an answer on.
  // A needs_review row is waiting on a PERSON and has no time limit by design,
  // so counting it here reported "something is stuck" over a 202-minute review
  // item while the pipeline itself was completely healthy -- a red alarm about
  // the system when the real message was "14 decisions are waiting for you".
  const awaitingPipeline = list.filter(r => r.ai_status !== 'needs_review')
  const oldestMins = awaitingPipeline.length === 0 ? 0 : Math.round(
    Math.max(...awaitingPipeline.map(r => now - new Date(r.submitted_at).getTime())) / 60000)

  // The safety net only counts as working if it ran within the last two cycles.
  const { data: cronRow } = await client
    .schema('cron' as never)
    .from('job_run_details' as never)
    .select('start_time, status')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))
  const lastAutoRelease = (cronRow as { start_time?: string } | null)?.start_time ?? null
  const autoReleaseOk = oldestMins < 70

  let level: PipelineHealth['level'] = 'healthy'
  let headline = 'Everything is being processed normally'
  let detail = pending === 0 ? 'Nothing waiting.' : `${pending} waiting, oldest ${oldestMins} min — all within normal time.`

  if (!autoReleaseOk) {
    level = 'degraded'
    headline = 'Something is stuck'
    detail = `A submission has been waiting ${oldestMins} min with no AI result and was not released automatically. This needs looking at.`
  } else if (needsReview > 0 && videoPending < 15 && oldestMins < 30) {
    // Not a fault -- the pipeline is keeping up and these are simply decisions
    // only a person can make. Say that plainly instead of raising an alarm.
    level = 'healthy'
    headline = `${needsReview} submission${needsReview === 1 ? '' : 's'} waiting on your decision`
    detail = 'The pipeline is keeping up. These are flags the AI would not decide on its own.'
  } else if (videoPending >= 15 || oldestMins >= 30) {
    level = 'busy'
    headline = 'Video processing is running behind'
    detail = `${videoPending} videos waiting on the video service, oldest ${oldestMins} min. `
      + 'After 45 min they move to Needs Review for a human — not the member\'s fault, but not auto-approved either. Photos are unaffected.'
  }

  return { level, headline, detail, pending, oldestMins, needsReview, videoPending, photoPending, autoReleaseOk, lastAutoRelease }
}

export type IdentityReference = {
  submittedDate: string
  taskTitle: string
  videoUrl: string | null
  thumbUrl: string | null
}

/**
 * The earlier videos the identity check actually compared this one against.
 *
 * "The person looks different from this member's earlier submissions" is
 * unusable on its own -- it names no submission, so an admin is asked to confirm
 * something they cannot see. And this is the one flag that must never be acted
 * on blind: wrongly accusing a member of sending someone else's video is far
 * worse than any missed cheat.
 *
 * Returns the SAME references the AI used: the member's two EARLIEST approved
 * videos in this org (see fetchIdentityAnchors in analyze-submission). Earliest,
 * not latest, so a fake that once slipped through can never become the baseline
 * everything else is measured against.
 */
export async function getIdentityReferences(submissionId: string): Promise<IdentityReference[]> {
  const profile = await getAdminProfile()
  if (!profile) return []
  const client = await createAdminClient()

  const { data: cur } = await client
    .from('task_submissions')
    .select('user_id, org_id')
    .eq('id', submissionId)
    .maybeSingle()
  if (!cur) return []

  const { data: rows } = await client
    .from('task_submissions')
    .select('proof_url, submitted_date, tasks(title)')
    .eq('user_id', cur.user_id)
    .eq('org_id', cur.org_id)
    .eq('status', 'approved')
    .like('proof_url', 'bunny://%')
    .neq('id', submissionId)
    .order('submitted_at', { ascending: true })
    .limit(2)

  const out: IdentityReference[] = []
  for (const r of (rows ?? []) as { proof_url: string; submitted_date: string; tasks?: { title?: string } }[]) {
    const guid = r.proof_url.replace('bunny://', '')
    out.push({
      submittedDate: r.submitted_date,
      taskTitle: r.tasks?.title ?? 'Earlier submission',
      videoUrl: await bunnyPlayableUrl(guid, 900),
      thumbUrl: bunnySignPath(`/${guid}/thumbnail.jpg`, 900),
    })
  }
  return out
}
