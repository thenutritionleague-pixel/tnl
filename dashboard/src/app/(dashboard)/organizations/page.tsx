import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Plus, Users, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getOrgsAdmin } from '@/lib/supabase/admin-queries'
import { getAdminProfile } from '@/lib/auth'
import { isPlatformRole } from '@/types/database.types'

export default async function OrganizationsPage() {
  // Route guard: org-level admins cannot see the global organizations list
  const profile = await getAdminProfile()
  if (profile && !isPlatformRole(profile.role as any) && profile.org_id) {
    redirect(`/organizations/${profile.org_id}`)
  }

  const orgs = await getOrgsAdmin()
  const totalMembers    = orgs.reduce((s, o) => s + o.memberCount, 0)
  const totalChallenges = orgs.reduce((s, o) => s + o.activeChallenges.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Organizations</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage all organizations on the platform.</p>
        </div>
        <Link href="/organizations/new" className={cn(buttonVariants(), 'gap-2')}>
          <Plus className="size-4" />
          New Organization
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Organizations', value: orgs.length,      icon: Building2 },
          { label: 'Total Members',       value: totalMembers,     icon: Users     },
          { label: 'Active Challenges',   value: totalChallenges,  icon: Trophy    },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Org Cards */}
      {orgs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No organizations yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first organization to get started.</p>
          <Link href="/organizations/new" className={cn(buttonVariants({ size: 'sm' }), 'mt-4 gap-1.5')}>
            <Plus className="size-3.5" /> New Organization
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map(org => (
            <div key={org.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="p-5 flex items-start gap-4 border-b border-border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl shrink-0">
                  {org.logo}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading text-lg text-foreground truncate">{org.name}</h3>
                    {org.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">/{org.slug}</p>
                </div>
              </div>

              <div className="px-5 py-4 grid grid-cols-2 gap-3 flex-1">
                <div>
                  <p className="text-xs text-muted-foreground">Members</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{org.memberCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Teams</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{org.teamCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Org Admin</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{org.orgAdmin}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Challenges</p>
                  {org.activeChallenges.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-0.5">None</p>
                  ) : org.activeChallenges.length === 1 ? (
                    <p className="text-sm font-semibold text-primary mt-0.5 truncate">{org.activeChallenges[0]}</p>
                  ) : (
                    <p className="text-sm font-semibold text-primary mt-0.5">{org.activeChallenges.length} active</p>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Created {org.createdAt}</p>
                <Link href={"/organizations/" + org.id} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
