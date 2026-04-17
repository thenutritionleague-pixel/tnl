import { getOrgPointsBreakdown, getOrgMembersForAdjust } from '@/lib/supabase/admin-queries'
import { PointsClient } from './_components/points-client'

export default async function OrgPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [{ members, teams, currentWeek }, adjustMembers] = await Promise.all([
    getOrgPointsBreakdown(orgId),
    getOrgMembersForAdjust(orgId),
  ])
  return <PointsClient orgId={orgId} members={members} teams={teams} adjustMembers={adjustMembers} currentWeek={currentWeek} />
}
