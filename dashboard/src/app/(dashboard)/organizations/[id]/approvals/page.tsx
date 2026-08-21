import { getOrgApprovals, getOrgTaskList, getOrgApprovalCounts, getOrgTaskBreakdown } from '@/lib/supabase/admin-queries'
import { ApprovalsClient } from './_components/approvals-client'
import { getAdminProfile, canWrite } from '@/lib/auth'

export const revalidate = 0

export default async function OrgApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [{ approvals, hasMore }, tasks, counts, taskBreakdown, profile] = await Promise.all([
    getOrgApprovals(orgId, 0),
    getOrgTaskList(orgId),
    getOrgApprovalCounts(orgId),
    getOrgTaskBreakdown(orgId),
    getAdminProfile(),
  ])

  return (
    <ApprovalsClient
      orgId={orgId}
      initialApprovals={approvals}
      initialHasMore={hasMore}
      initialTasks={tasks}
      initialCounts={counts}
      initialTaskBreakdown={taskBreakdown}
      readOnly={!canWrite(profile)}
    />
  )
}
