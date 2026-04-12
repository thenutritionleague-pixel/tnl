import { getInviteWhitelist } from '@/lib/supabase/admin-queries'
import { InviteClient } from './_components/invite-client'

export default async function OrgInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const { invites, teams } = await getInviteWhitelist(orgId)
  return <InviteClient orgId={orgId} initialInvites={invites} teams={teams} />
}
