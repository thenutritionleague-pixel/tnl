'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getAdminProfile, readOnlyBlock } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export type ProofEvidence = {
  url: string
  /** SHA-256 of the actual file. Two entries sharing this ARE the same image. */
  sha256: string | null
  bytes: number | null
}

/**
 * Signed URLs AND a real content hash for one group's proofs.
 *
 * The list groups by perceptual fingerprint, which answers "do these look
 * alike" -- NOT "are these the same file". The list also compared file SIZES,
 * which is a guess: two different photos can be the same size, and the same
 * photo re-encoded is not.
 *
 * That distinction does not matter for browsing and matters enormously when a
 * member is going to be fined or lose points over it. So the proof is computed
 * here, at the moment an admin opens the group: download each file, SHA-256 it,
 * and let the UI state plainly whether they are byte-for-byte the same image or
 * merely similar-looking. A SHA match cannot be a coincidence.
 */
export async function getGroupProofUrls(paths: string[]): Promise<Record<string, ProofEvidence>> {
  const profile = await getAdminProfile()
  if (!profile) return {}

  const client = await createAdminClient()
  const out: Record<string, ProofEvidence> = {}

  await Promise.all(paths.map(async path => {
    const { data } = await client.storage.from('task-proofs').createSignedUrl(path, 900)
    const url = data?.signedUrl
    if (!url) return
    let sha256: string | null = null
    let bytes: number | null = null
    try {
      const res = await fetch(url)
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer())
        sha256 = createHash('sha256').update(buf).digest('hex')
        bytes = buf.byteLength
      }
    } catch {
      // Leave the hash null -- the UI then says it could not verify, rather
      // than implying the files differ.
    }
    out[path] = { url, sha256, bytes }
  }))

  return out
}

/**
 * Record an admin's verdict on a duplicate group so it stops reappearing.
 *
 * Keyed by fingerprint + task, which is what identifies a group, so the verdict
 * survives a later submission joining the same group.
 */
export async function reviewDuplicateGroup(
  orgId: string,
  proofHash: string,
  taskTitle: string,
  verdict: 'safe' | 'confirmed',
  note?: string,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }

  const client = await createAdminClient()
  const { error } = await client.from('duplicate_group_reviews').upsert({
    org_id: orgId,
    proof_hash: proofHash,
    task_title: taskTitle,
    verdict,
    note: note?.trim() || null,
    reviewed_by: profile.id,
    reviewed_email: profile.email,
    reviewed_at: new Date().toISOString(),
  }, { onConflict: 'org_id,proof_hash,task_title' })

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/duplicates`)
  return { success: true }
}

/** Undo a verdict — puts the group back in the unreviewed list. */
export async function clearDuplicateReview(orgId: string, proofHash: string, taskTitle: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }

  const client = await createAdminClient()
  const { error } = await client.from('duplicate_group_reviews').delete()
    .eq('org_id', orgId).eq('proof_hash', proofHash).eq('task_title', taskTitle)
  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/duplicates`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Video duplicates
// ---------------------------------------------------------------------------

const fmtBytes = (n: number) => n.toLocaleString('en-IN')

/**
 * Reject one submission from a video duplicate group, with the evidence baked
 * into the reason the member will read.
 *
 * The evidence is assembled HERE, from the database, not passed in from the
 * browser. A member losing points is entitled to a reason that is checkable and
 * that nobody could have edited on the way through, and the admin should not
 * have to retype a SHA-256 by hand.
 *
 * The wording states what was found, not what the member intended. "This is the
 * same file as X" is defensible; "you cheated" is a conclusion an admin may
 * reach but the system should not assert on their behalf.
 */
export async function rejectVideoDuplicate(
  orgId: string,
  submissionId: string,
  adminNote?: string,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }

  const client = await createAdminClient()

  const { data: me, error: meErr } = await client
    .from('task_submissions')
    .select('id, org_id, status, video_fingerprint, video_file_sha, video_bytes, video_seconds, submitted_date')
    .eq('id', submissionId).eq('org_id', orgId).maybeSingle()
  if (meErr) return { error: meErr.message }
  if (!me) return { error: 'Submission not found.' }
  if (me.status === 'rejected') return { error: 'Already rejected.' }
  if (!me.video_fingerprint) return { error: 'This submission has no video fingerprint.' }

  // The other submissions sharing this exact video, for the reason text.
  const { data: siblings } = await client
    .from('task_submissions')
    .select('id, submitted_date, video_file_sha, tasks(title)')
    .eq('org_id', orgId)
    .eq('video_fingerprint', me.video_fingerprint)
    .neq('id', submissionId)

  const others = (siblings ?? []) as unknown as
    { id: string; submitted_date: string; video_file_sha: string | null; tasks: { title: string } | null }[]

  // Only claim "identical file" when the full-file hashes actually agree. A
  // shared thumbnail alone means "looks like" -- saying more than the evidence
  // supports is how a correct decision becomes an indefensible one.
  const proven = !!me.video_file_sha && others.some(o => o.video_file_sha === me.video_file_sha)
  const earlier = others
    .filter(o => o.submitted_date <= me.submitted_date)
    .sort((a, b) => a.submitted_date.localeCompare(b.submitted_date))[0] ?? others[0]

  const where = earlier
    ? `already submitted on ${earlier.submitted_date}${earlier.tasks?.title ? ` for "${earlier.tasks.title}"` : ''}`
    : 'already submitted for another entry'

  const facts = [
    me.video_seconds != null ? `${me.video_seconds}s` : null,
    me.video_bytes != null ? `${fmtBytes(me.video_bytes)} bytes` : null,
    me.video_file_sha ? `SHA-256 ${me.video_file_sha.slice(0, 16)}…` : null,
  ].filter(Boolean).join(', ')

  const reason = [
    proven
      ? `Duplicate video: this is the same video file you ${where}.`
      : `Duplicate video: this appears to be the same video you ${where}.`,
    facts ? `(${facts})` : null,
    'Each entry needs its own new recording.',
    adminNote?.trim() || null,
  ].filter(Boolean).join(' ')

  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      // Must mirror the approvals path: retry_pending_bunny_submissions selects
      // on a null ai_status, so nulling it makes the cron re-fire the AI and
      // silently re-approve what an admin just rejected.
      ai_status: 'rejected',
      ai_feedback: null,
      ai_confidence: null,
    })
    .eq('id', submissionId).eq('org_id', orgId)

  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/duplicates`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true, reason }
}

/**
 * Signed playback URLs for a video group, fetched when the admin opens it.
 *
 * Token Authentication is on for the Bunny library, so an unsigned URL will not
 * play. Mirrors the signing in the approvals actions rather than importing it,
 * because that module pulls in the whole approvals surface for one helper.
 */
export async function getVideoPlaybackUrls(guids: string[]): Promise<Record<string, string>> {
  const profile = await getAdminProfile()
  if (!profile) return {}

  const host = process.env.BUNNY_CDN_HOSTNAME || 'vz-c97d7e4d-363.b-cdn.net'
  const key  = process.env.BUNNY_TOKEN_AUTH_KEY || ''

  const sign = (path: string, ttl = 1800) => {
    const url = `https://${host}${path}`
    if (!key) return url
    const expires = Math.floor(Date.now() / 1000) + ttl
    const token = createHash('md5').update(key + path + String(expires)).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${url}?token=${token}&expires=${expires}`
  }

  const out: Record<string, string> = {}
  await Promise.all([...new Set(guids)].map(async guid => {
    // Bunny only generates renditions that fit the source, so try smallest-up
    // rather than assuming one exists.
    //
    // Probed with a one-byte ranged GET and a timeout, not HEAD: Bunny's CDN
    // does not answer HEAD on these paths (a ranged GET returns 206 where HEAD
    // gives nothing), and an untimed fetch that never answers hangs the whole
    // page. Same fix as the approvals and member views.
    const probe = async (url: string) => {
      try {
        const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(6000) })
        r.body?.cancel().catch(() => {})
        return r.ok || r.status === 206
      } catch { return false }
    }
    for (const r of ['480p', '360p', '240p', '720p']) {
      const url = sign(`/${guid}/play_${r}.mp4`)
      if (await probe(url)) { out[guid] = url; return }
    }
    // Transcode may never have run -- the original is intact throughout.
    const original = sign(`/${guid}/original`)
    if (await probe(original)) { out[guid] = original; return }
  }))
  return out
}

// ---------------------------------------------------------------------------
// Exact image reuse
// ---------------------------------------------------------------------------

/**
 * Reject one submission from an exact-image-reuse group.
 *
 * Same principle as the video version: the evidence is assembled here from the
 * database and storage metadata, not supplied by the browser, so the reason a
 * member reads is checkable and could not have been edited in transit.
 *
 * eTag is the file's MD5, so a match is identity, not resemblance -- which is
 * why this can state "the same image file" rather than "a similar image".
 */
export async function rejectExactImageDuplicate(
  orgId: string,
  submissionId: string,
  adminNote?: string,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }

  const client = await createAdminClient()

  const { data: me } = await client
    .from('task_submissions')
    .select('id, status, proof_url, submitted_date')
    .eq('id', submissionId).eq('org_id', orgId).maybeSingle()
  if (!me) return { error: 'Submission not found.' }
  if (me.status === 'rejected') return { error: 'Already rejected.' }
  if (!me.proof_url) return { error: 'This submission has no proof file.' }

  // Re-read the group from the RPC so the reason quotes verified facts rather
  // than anything the client sent.
  const { data: groupRows } = await client.rpc('get_reused_image_groups', { p_org_id: orgId })
  type GRow = {
    submission_id: string; fingerprint: string; submitted_date: string
    task_title: string; file_bytes: number | null
  }
  const rows = (groupRows ?? []) as GRow[]
  const mine = rows.find(r => r.submission_id === submissionId)
  if (!mine) return { error: 'This submission is no longer in a duplicate group.' }

  const siblings = rows.filter(r => r.fingerprint === mine.fingerprint && r.submission_id !== submissionId)
  const earlier = siblings
    .filter(s => s.submitted_date <= mine.submitted_date)
    .sort((a, b) => a.submitted_date.localeCompare(b.submitted_date))[0] ?? siblings[0]

  const where = earlier
    ? `already submitted on ${earlier.submitted_date}${earlier.task_title ? ` for "${earlier.task_title}"` : ''}`
    : 'already submitted for another entry'

  const facts = [
    mine.file_bytes != null ? `${mine.file_bytes.toLocaleString('en-IN')} bytes` : null,
    `MD5 ${mine.fingerprint.slice(0, 16)}…`,
  ].filter(Boolean).join(', ')

  const reason = [
    `Duplicate photo: this is the same image file you ${where}.`,
    `(${facts})`,
    'Each entry needs its own new photo.',
    adminNote?.trim() || null,
  ].filter(Boolean).join(' ')

  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      ai_status: 'rejected',
      ai_feedback: null,
      ai_confidence: null,
    })
    .eq('id', submissionId).eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/duplicates`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true, reason }
}
