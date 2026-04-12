import { getOrgAdmins } from '@/lib/supabase/admin-queries'
import { getAdminProfile } from '@/lib/auth'
import { OrgAdminsClient } from './_components/org-admins-client'

export default async function OrgAdminsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [admins, viewer] = await Promise.all([getOrgAdmins(orgId), getAdminProfile()])

  const orgAdmin   = admins.find(a => a.role === 'org_admin') ?? null
  const subAdmins  = admins.filter(a => a.role === 'sub_admin')

  const canManage =
    viewer?.role === 'super_admin' ||
    viewer?.role === 'sub_super_admin' ||
    viewer?.role === 'org_admin'

  return (
    <OrgAdminsClient
      orgId={orgId}
      orgAdmin={orgAdmin}
      subAdmins={subAdmins}
      canManage={canManage}
    />
  )
}
