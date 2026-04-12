import Link from 'next/link'
import { Building2, Users, Trophy, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { getDashboardStats, getDashboardOrgs, getRecentActivity } from '@/lib/supabase/admin-queries'

const statusStyle: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export default async function DashboardPage() {
  const [stats, orgs, activity] = await Promise.all([
    getDashboardStats(),
    getDashboardOrgs(),
    getRecentActivity(),
  ])

  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">All organizations · {monthYear}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Organizations',     value: stats.totalOrgs,        icon: Building2, alert: false },
          { label: 'Total Members',     value: stats.totalMembers,     icon: Users,     alert: false },
          { label: 'Active Challenges', value: stats.activeChallenges, icon: Trophy,    alert: false },
          { label: 'Pending Approvals', value: stats.pendingApprovals, icon: Clock,     alert: stats.pendingApprovals > 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
              <stat.icon className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <p className={cn('text-3xl font-bold', stat.alert ? 'text-destructive' : 'text-foreground')}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Organizations</h2>
            <Link href="/organizations" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {orgs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No organizations yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {orgs.map(org => (
                <div key={org.id} className="px-5 py-4 flex items-center gap-4">
                  <span className="text-xl shrink-0">{org.logo}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{org.name}</p>
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                        org.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                      )}>
                        {org.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {org.memberCount} members · {org.teamCount} teams
                      {org.pendingApprovals > 0 && (
                        <span className="text-destructive font-medium"> · {org.pendingApprovals} pending</span>
                      )}
                    </p>
                  </div>
                  <Link href={"/organizations/" + org.id} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}>
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {activity.map(item => (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-foreground mt-0.5">
                    {item.memberName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{item.memberName}</p>
                    <p className="text-xs text-muted-foreground truncate">"{item.taskTitle}"</p>
                    <p className="text-xs text-muted-foreground">{item.orgName} · {item.submittedAt}</p>
                  </div>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 mt-1 capitalize', statusStyle[item.status])}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
