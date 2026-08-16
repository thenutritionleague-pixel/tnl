import { getOrgTeams, getAvailableMembers } from '@/lib/supabase/queries'
import TeamsClient from './_components/teams-client'

// Server-rendered so the data ships with the HTML. Fetching this from the
// client cost two sequential server-action POSTs after hydration (~2.6s) —
// Next.js serialises server actions, so the Promise.all there was not parallel.
export default async function OrgTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [teams, pool] = await Promise.all([getOrgTeams(orgId), getAvailableMembers(orgId)])
  return <TeamsClient orgId={orgId} initialTeams={teams} initialPool={pool} />
}
