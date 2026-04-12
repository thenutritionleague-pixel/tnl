import { getOrgPointsBreakdown } from '@/lib/supabase/admin-queries'
import { PointsClient } from './_components/points-client'

export default async function OrgPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const { members, teams } = await getOrgPointsBreakdown(orgId)
  return <PointsClient members={members} teams={teams} />
}
