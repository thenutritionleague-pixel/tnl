import { getMemberDetail } from '@/lib/supabase/admin-queries'
import { MemberDetailClient } from './_components/member-detail-client'
import type { OrgMemberForAdjust } from '@/lib/supabase/admin-queries'

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id: orgId, mid } = await params
  const member = await getMemberDetail(orgId, mid)

  if (!member) {
    return <p className="text-sm text-muted-foreground">Member not found in this organization.</p>
  }

  const adjustMember: OrgMemberForAdjust = {
    id: member.id,
    name: member.name,
    teamName: member.team,
  }

  return <MemberDetailClient member={member} orgId={orgId} adjustMember={adjustMember} />
}
