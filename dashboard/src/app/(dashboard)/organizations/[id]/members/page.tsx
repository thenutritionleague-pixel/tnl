import { getOrgMembers, getOrgTeams } from '@/lib/supabase/queries'
import MembersClient from './_components/members-client'

// See teams/page.tsx — server-rendered to avoid the post-hydration
// server-action waterfall.
export default async function OrgMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [members, teams] = await Promise.all([getOrgMembers(orgId), getOrgTeams(orgId)])
  return <MembersClient orgId={orgId} initialMembers={members} initialTeams={teams} />
}
