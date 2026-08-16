import { getOrgChallenges, getOrgTeamList, getOrgTimezone } from '@/lib/supabase/queries'
import ChallengesClient from './_components/challenges-client'

// See teams/page.tsx — server-rendered to avoid the post-hydration
// server-action waterfall.
export default async function OrgChallengesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [challenges, teamList, timezone] = await Promise.all([
    getOrgChallenges(orgId), getOrgTeamList(orgId), getOrgTimezone(orgId),
  ])
  return (
    <ChallengesClient
      orgId={orgId}
      initialChallenges={challenges}
      initialTeamList={teamList}
      initialTimezone={timezone}
    />
  )
}
