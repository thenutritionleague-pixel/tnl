'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const client = await createAdminClient()
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 300) // 5-min expiry
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

export async function rejectMemberSubmission(
  submissionId: string,
  orgId: string,
  memberId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }

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
