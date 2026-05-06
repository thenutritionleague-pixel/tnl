import { getOrgApprovals } from '@/lib/supabase/admin-queries'
import { ApprovalsClient } from './_components/approvals-client'

export const revalidate = 0

export default async function OrgApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const { approvals, hasMore } = await getOrgApprovals(orgId, 0)

  return <ApprovalsClient orgId={orgId} initialApprovals={approvals} initialHasMore={hasMore} />
}
