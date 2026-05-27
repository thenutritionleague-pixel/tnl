import { getOrgApprovals, getOrgTaskList, getOrgApprovalCounts } from '@/lib/supabase/admin-queries'
import { ApprovalsClient } from './_components/approvals-client'

export const revalidate = 0

export default async function OrgApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [{ approvals, hasMore }, tasks, counts] = await Promise.all([
    getOrgApprovals(orgId, 0),
    getOrgTaskList(orgId),
    getOrgApprovalCounts(orgId),
  ])

  return (
    <ApprovalsClient
      orgId={orgId}
      initialApprovals={approvals}
      initialHasMore={hasMore}
      initialTasks={tasks}
      initialCounts={counts}
    />
  )
}
