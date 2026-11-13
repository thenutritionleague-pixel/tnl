'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile, readOnlyBlock } from '@/lib/auth'
import { isHostedVideoProof, hostedVideoUrl } from '@/lib/video-host'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const profile = await getAdminProfile()
  if (!profile) return null

  // Hosted videos — signed Gumlet URL; retired Bunny files resolve to null.
  if (isHostedVideoProof(path)) return await hostedVideoUrl(path)

  const client = await createAdminClient()
  // No transform — Supabase Pro's "Storage Image Transformations" quota is
  // only 100 unique source images per month, far too restrictive. Mobile
  // uploads already cap proofs at 1280×1280 / quality 82 (~150-300 KB) so
  // the egress hit of serving originals is negligible (<1% of 250 GB Pro
  // egress budget).
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

export async function approveMemberSubmission(
  submissionId: string,
  orgId: string,
  memberId: string,
  pointsOverride: number | null,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  let finalPoints = pointsOverride
  if (finalPoints === null) {
    // Must resolve the CLAIMED TIER, not the task's base value.
    //
    // This read only ever fetched tasks.points, which on a tiered task is the
    // floor and not what anyone earns: Broccoli Burpee Bash is 10 base with
    // 100/200 tiers, Plank Stand is 10 base with 50/100/150. So approving from
    // the member detail page paid 10 points for a submission worth 200 --
    // confirmed live on 24 Aug for Atin Goyal, whose snapshot held the "10
    // Burpees" tier at 200 the whole time.
    //
    // The Approvals page was fixed for exactly this on 23 Aug (7a5c78c); this
    // second approve path was missed. Same snapshot-first order as there:
    // task_snapshot.selected_tier is frozen at submission time and never
    // depends on a join resolving correctly later.
    const { data: sub } = await client
      .from('task_submissions')
      .select('selected_tier_index, task_snapshot, tasks(points, points_tiers)')
      .eq('id', submissionId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd = sub as any
    const tierPoints: number | null =
      sd?.task_snapshot?.selected_tier?.points ??
      (sd?.selected_tier_index != null
        ? (sd?.tasks?.points_tiers?.[sd.selected_tier_index]?.points ?? null)
        : null)
    finalPoints = tierPoints ?? sd?.tasks?.points ?? 0
  }

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
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function updateMemberAvatarColor(
  memberId: string,
  orgId: string,
  color: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Invalid color.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('profiles')
    .update({ avatar_color: color })
    .eq('id', memberId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  return { success: true }
}

export async function rejectMemberSubmission(
  submissionId: string,
  orgId: string,
  memberId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
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
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}
