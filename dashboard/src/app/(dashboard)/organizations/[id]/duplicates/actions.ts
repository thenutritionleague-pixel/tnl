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
