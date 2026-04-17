import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { UserCog, Shield, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformAdmins } from '@/lib/supabase/admin-queries'
import { getAdminProfile } from '@/lib/auth'
import { isPlatformRole } from '@/types/database.types'
import { InviteForm } from './_components/invite-form'
import { PlatformAdminRowActions } from './_components/platform-admin-row-actions'

const roleLabel: Record<string, string> = {
  super_admin:     'Super Admin',
  sub_super_admin: 'Sub Super Admin',
}
const roleStyle: Record<string, string> = {
  super_admin:     'bg-primary/10 text-primary',
  sub_super_admin: 'bg-violet-100 text-violet-700',
}
const statusStyle: Record<string, string> = {
  active:  'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
}

export default async function AdminsPage() {
  // Route guard: org-level admins cannot see platform admins
  const viewer = await getAdminProfile()
  if (viewer && !isPlatformRole(viewer.role as any) && viewer.org_id) {
    redirect(`/organizations/${viewer.org_id}`)
  }

  const admins = await getPlatformAdmins()
  const isSuperAdmin = viewer?.role === 'super_admin'
  const superAdmins    = admins.filter(a => a.role === 'super_admin')
  const subSuperAdmins = admins.filter(a => a.role === 'sub_super_admin')

  async function refresh() {
    'use server'
    revalidatePath('/admins')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-foreground">Platform Admins</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Super Admins and Sub Super Admins who manage the platform.
          Org Admins and Sub Admins are managed inside each organization.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Platform Admins', value: admins.length,        icon: UserCog    },
          { label: 'Super Admins',          value: superAdmins.length,   icon: ShieldCheck },
          { label: 'Sub Super Admins',      value: subSuperAdmins.length, icon: Shield    },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <s.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Invite form — super admin only */}
      {isSuperAdmin && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-foreground">Invite Sub Super Admin</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sub Super Admins have full platform access but cannot manage other platform admins.
            </p>
          </div>
          <InviteForm onSuccess={refresh} />
        </div>
      )}

      {/* Admins table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Platform Admin Users</h2>
          <p className="text-xs text-muted-foreground">Org Admins are managed inside each org</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Added</th>
              {isSuperAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {admins.map(admin => (
              <tr key={admin.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-foreground">
                      {admin.name.charAt(0)}
                    </div>
                    <span className="font-medium text-foreground">{admin.name}</span>
                    {viewer && admin.id === viewer.id && (
                      <span className="text-[10px] text-muted-foreground">(you)</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{admin.email}</td>
                <td className="px-5 py-3.5">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', roleStyle[admin.role])}>
                    {roleLabel[admin.role]}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', statusStyle[admin.status] ?? 'bg-muted text-muted-foreground')}>
                    {admin.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{admin.createdAt}</td>
                {isSuperAdmin && (
                  <td className="px-5 py-3.5 text-right">
                    <PlatformAdminRowActions admin={admin} isSuperAdmin={isSuperAdmin} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Looking for Org Admins or Sub Admins?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Go to <span className="font-medium text-foreground">Organizations → [Org Name] → Admins</span> to manage org-level admins.
          </p>
        </div>
      </div>
    </div>
  )
}
