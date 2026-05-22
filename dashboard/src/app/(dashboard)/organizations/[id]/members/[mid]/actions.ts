'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const profile = await getAdminProfile()
  if (!profile) return null
  const client = await createAdminClient()
  // Server-side resize — proof viewer is at most ~600px wide on retina;
  // 1024px source is plenty for review. Cuts egress 5-10× per proof view.
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 300, {
      transform: { width: 1024, quality: 80, resize: 'contain' },
    })
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
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  let finalPoints = pointsOverride
  if (finalPoints === null) {
    const { data: sub } = await client
      .from('task_submissions')
      .select('tasks(points)')
      .eq('id', submissionId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalPoints = (sub as any)?.tasks?.points ?? 0
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
