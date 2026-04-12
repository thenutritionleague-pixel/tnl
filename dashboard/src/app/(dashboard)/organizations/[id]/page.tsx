import Link from 'next/link'
import { Trophy, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getOrgOverview } from '@/lib/supabase/admin-queries'

export default async function OrgOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const base = `/organizations/${orgId}`
  const org = await getOrgOverview(orgId)

  if (!org) return <p className="text-sm text-muted-foreground">Organization not found.</p>

  return (
    <div className="space-y-6">
      {/* Org identity bar */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{org.logo}</span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl text-foreground">{org.name}</h1>
            {org.isActive
              ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Active</Badge>
              : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">/{org.slug} · Created {org.createdAt}</p>
        </div>
        <div className="ml-auto">
          <Link href={`${base}/settings`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Org Settings
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Members',           value: org.stats.members },
          { label: 'Teams',             value: org.stats.teams },
          { label: 'Total Points 🥦',   value: org.stats.totalPoints.toLocaleString() },
          { label: 'Pending Approvals', value: org.stats.pendingApprovals, alert: true },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className={cn('text-2xl font-bold', s.alert && Number(s.value) > 0 ? 'text-destructive' : 'text-foreground')}>
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team leaderboard */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Team Leaderboard</h2>
            <Link href={`${base}/teams`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border">
            {org.teams.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No teams yet.</p>
            ) : org.teams.map((team, i) => (
              <div key={team.id} className="px-5 py-3 flex items-center gap-3">
                <span className={cn(
                  'text-xs font-mono w-5 shrink-0',
                  i === 0 && 'text-amber-500 font-bold',
                  i === 1 && 'text-slate-400',
                  i === 2 && 'text-orange-600',
                )}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.captain} · {team.members} members</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground">🥦 {team.points.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Org Admin */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-foreground text-sm">Org Admin</h2>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{org.orgAdmin}</p>
                <p className="text-xs text-muted-foreground truncate">{org.orgAdminEmail}</p>
              </div>
            </div>
          </div>

          {/* Active challenges */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-foreground text-sm">Active Challenges</h2>
            {org.stats.activeChallenges.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active challenge.</p>
            ) : (
              <div className="space-y-2">
                {org.stats.activeChallenges.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.dates}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending approvals CTA */}
          {org.stats.pendingApprovals > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 space-y-2">
              <h2 className="font-semibold text-destructive text-sm">Pending Approvals</h2>
              <p className="text-2xl font-bold text-destructive">{org.stats.pendingApprovals}</p>
              <Link href={`${base}/approvals`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-full border-destructive text-destructive justify-center')}>
                Review Now
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
