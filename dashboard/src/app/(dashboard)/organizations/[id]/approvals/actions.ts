'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']
const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']

export async function approveSubmission(
  submissionId: string,
  orgId: string,
  pointsOverride: number | null,
) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

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
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
      ai_status: null,
      ai_feedback: null,
      ai_confidence: null,
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function loadApprovalsPage(orgId: string, page: number, status?: 'pending' | 'approved' | 'rejected', date?: string, taskId?: string) {
  const profile = await getAdminProfile()
  if (!profile) return null
  const { getOrgApprovals } = await import('@/lib/supabase/admin-queries')
  return getOrgApprovals(orgId, page, status, date, taskId)
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
  // No transform — see getProofSignedUrl above for the rationale (transformation
  // quota is the bottleneck, not egress).
  const { data: signed } = await client.storage
    .from('task-proofs')
    .createSignedUrl(data.proof_url, 300)
  return signed?.signedUrl ?? null
}
