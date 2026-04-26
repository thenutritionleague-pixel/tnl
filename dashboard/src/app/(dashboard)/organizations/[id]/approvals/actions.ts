'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

export async function approveSubmission(
  submissionId: string,
  orgId: string,
  pointsOverride: number | null,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  // Fetch submission details for feed item
  const { data: subDetails } = await client
    .from('task_submissions')
    .select('user_id, challenge_id, tasks(title, points), profiles:user_id(name)')
    .eq('id', submissionId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = subDetails as any
  const finalPoints = pointsOverride ?? sd?.tasks?.points ?? 0
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
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const client = await createAdminClient()
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 300) // 5 min expiry
  return data?.signedUrl ?? null
}
