import { getAdminProfile } from '@/lib/auth'
import { getOrgMembersForAdjust } from '@/lib/supabase/admin-queries'
import { AdjustClient } from './_components/adjust-client'
import { redirect } from 'next/navigation'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']

export default async function AdjustPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params

  const profile = await getAdminProfile()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) redirect('/organizations')

  // Org-scoped admins can only access their own org
  if (['org_admin', 'sub_admin'].includes(profile.role) && profile.org_id !== orgId) {
    redirect('/organizations')
  }

  const members = await getOrgMembersForAdjust(orgId)
  return <AdjustClient orgId={orgId} members={members} />
}
