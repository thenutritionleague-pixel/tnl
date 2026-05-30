'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Trophy, TrendingUp, TrendingDown, Users, Activity, Award, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { computeInsights, type Insights, type TeamInsights } from '@/lib/challenge-report-insights'
import type { ReportStats } from '../actions'

interface Props {
  orgId: string
  challengeId: string
  stats: ReportStats
}

export function ReportClient({ orgId, challengeId, stats }: Props) {
  const insights: Insights = useMemo(() => computeInsights(stats), [stats])
  const sortedTeams = useMemo(() => [...stats.teams].sort((a, b) => b.teamPoints - a.teamPoints), [stats.teams])
  const [activeTab, setActiveTab] = useState<'overall' | string>('overall')

  const currentTeam = activeTab !== 'overall' ? sortedTeams.find(t => t.teamId === activeTab) : null
  const currentInsights = currentTeam ? insights.perTeam[currentTeam.teamId] : null

  function handlePrint() { window.print() }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header — hidden in print */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <Link
            href={`/organizations/${orgId}/challenges/${challengeId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to challenge
          </Link>
          <h1 className="font-heading text-2xl text-foreground">Final Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.challenge.name} · {fmtDate(stats.challenge.startDate)} → {fmtDate(stats.challenge.endDate)} · {stats.challenge.totalWeeks} weeks
          </p>
        </div>
        <button onClick={handlePrint} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
          <Printer className="w-3.5 h-3.5" /> Print / PDF
        </button>
      </div>

      {/* Print-only title */}
      <div className="hidden print:block space-y-1">
        <h1 className="font-heading text-3xl text-foreground">{stats.challenge.name}</h1>
        <p className="text-sm text-muted-foreground">
          Final Report · {fmtDate(stats.challenge.startDate)} → {fmtDate(stats.challenge.endDate)} · {stats.challenge.totalWeeks} weeks
        </p>
      </div>

      {/* Org headline stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 print:grid-cols-4">
        <StatCard icon={<Trophy className="w-4 h-4" />} label="Total Points" value={stats.overall.totalPointsAwarded.toLocaleString()} accent="text-amber-700" />
        <StatCard icon={<Users className="w-4 h-4" />} label="Active Members" value={`${stats.overall.activeMembers}/${stats.overall.totalMembers}`} accent="text-emerald-700" />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Approved Submissions" value={stats.overall.approvedTotal.toLocaleString()} accent="text-emerald-700" />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Teams" value={stats.overall.teamCount.toString()} accent="text-primary" />
      </div>

      {/* Tabs */}
      <div className="border-b border-border print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto">
          <TabBtn active={activeTab === 'overall'} onClick={() => setActiveTab('overall')}>League Overview</TabBtn>
          {sortedTeams.map((t, i) => (
            <TabBtn key={t.teamId} active={activeTab === t.teamId} onClick={() => setActiveTab(t.teamId)}>
              <span className="text-[10px] font-bold text-muted-foreground mr-1.5">#{i + 1}</span>
              {t.teamName}
            </TabBtn>
          ))}
        </div>
      </div>

      {/* Interactive body */}
      <div className="print:hidden">
        {activeTab === 'overall' ? (
          <OverallSection stats={stats} sortedTeams={sortedTeams} insights={insights} onPickTeam={setActiveTab} />
        ) : currentTeam && currentInsights ? (
          <TeamSection team={currentTeam} totalDays={stats.challenge.totalDays} insights={currentInsights} />
        ) : null}
      </div>

      {/* Print body — every section expanded */}
      <div className="hidden print:block space-y-8">
        <OverallSection stats={stats} sortedTeams={sortedTeams} insights={insights} onPickTeam={() => {}} />
        {sortedTeams.map(t => (
          <div key={t.teamId} className="break-before-page">
            <TeamSection team={t} totalDays={stats.challenge.totalDays} insights={insights.perTeam[t.teamId]} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Reusable bits ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3.5 print:py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Callout({ icon, accent, label, value, sub }: { icon: React.ReactNode; accent: string; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3.5 print:py-2">
      <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1.5', accent)}>
        {icon}
        {label}
      </div>
      <p className="text-base font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Overall ──────────────────────────────────────────────────────────────────

function OverallSection({ stats, sortedTeams, insights, onPickTeam }: {
  stats: ReportStats
  sortedTeams: ReportStats['teams']
  insights: Insights
  onPickTeam: (id: string) => void
}) {
  const maxPoints = Math.max(...sortedTeams.map(t => t.teamPoints), 1)
  const o = insights.overall

  return (
    <div className="space-y-6">
      {/* Headline callouts derived from the rule engine */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 print:grid-cols-3">
        <Callout
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          accent="text-emerald-700"
          label="Peak Week"
          value={`Week ${o.peakWeek.week}`}
          sub={`${o.peakWeek.points.toLocaleString()} pts across the league`}
        />
        <Callout
          icon={<Users className="w-3.5 h-3.5" />}
          accent="text-primary"
          label="Engagement"
          value={`${o.engagementPct}%`}
          sub={`${stats.overall.activeMembers} of ${stats.overall.totalMembers} members active`}
        />
        <Callout
          icon={<Award className="w-3.5 h-3.5" />}
          accent="text-amber-700"
          label="League Consistency"
          value={`${o.leagueConsistencyAvg}%`}
          sub={`Average across ${stats.overall.teamCount} teams`}
        />
        {o.mostImproved && (
          <Callout
            icon={<Sparkles className="w-3.5 h-3.5" />}
            accent="text-emerald-700"
            label="Most Improved"
            value={o.mostImproved.teamName}
            sub={`+${o.mostImproved.growthPct}% from Week ${o.mostImproved.fromWeek} → ${o.mostImproved.toWeek}`}
          />
        )}
        {o.biggestDrop && (
          <Callout
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            accent="text-red-600"
            label="Biggest Dip"
            value={o.biggestDrop.teamName}
            sub={`${o.biggestDrop.dropPct}% from Week ${o.biggestDrop.fromWeek} → ${o.biggestDrop.toWeek}`}
          />
        )}
        <Callout
          icon={<Activity className="w-3.5 h-3.5" />}
          accent="text-emerald-700"
          label="Acceptance Rate"
          value={`${o.acceptanceRate}%`}
          sub={`${stats.overall.approvedTotal.toLocaleString()} approved / ${stats.overall.rejectedTotal.toLocaleString()} rejected`}
        />
      </div>

      {/* Podium */}
      {o.topThree.length >= 1 && (
        <div className="bg-card border border-border rounded-xl px-5 py-4 print:p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">🏆 Podium</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {o.topThree.map(t => (
              <div key={t.rank} className={cn(
                'rounded-xl border px-4 py-3.5',
                t.rank === 1 ? 'border-amber-300 bg-amber-50' : t.rank === 2 ? 'border-zinc-300 bg-zinc-50' : 'border-orange-300 bg-orange-50',
              )}>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-2xl font-bold text-foreground">#{t.rank}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t.rank === 1 ? 'GOLD' : t.rank === 2 ? 'SILVER' : 'BRONZE'}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground truncate">{t.teamName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.points.toLocaleString()} pts · {t.consistencyPct}% consistency
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team leaderboard */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full leaderboard</h3>
        </div>
        <div className="divide-y divide-border">
          {sortedTeams.map((t, i) => {
            const widthPct = (t.teamPoints / maxPoints) * 100
            return (
              <button
                key={t.teamId}
                onClick={() => onPickTeam(t.teamId)}
                className="w-full text-left px-5 py-3.5 hover:bg-muted/30 transition-colors grid items-center gap-3 print:hover:bg-transparent"
                style={{ gridTemplateColumns: '36px 1fr 110px 100px 80px' }}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-zinc-100 text-zinc-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'
                )}>
                  #{i + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t.teamName}</p>
                  <div className="mt-1.5 h-1.5 w-full max-w-xs rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${widthPct}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{t.teamPoints.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">total pts</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{t.avgPointsPerMember.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">avg/member</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', t.consistencyPct >= 80 ? 'text-emerald-700' : t.consistencyPct >= 60 ? 'text-amber-700' : 'text-red-600')}>
                    {t.consistencyPct}%
                  </p>
                  <p className="text-[11px] text-muted-foreground">consistency</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Per team ─────────────────────────────────────────────────────────────────

function TeamSection({ team, totalDays, insights }: { team: ReportStats['teams'][number]; totalDays: number; insights: TeamInsights }) {
  const sortedMembers = useMemo(() => [...team.members].sort((a, b) => b.points - a.points), [team.members])
  const maxWeekly = Math.max(...team.weeklyBreakdown.map(w => w.points), 1)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl text-foreground">{team.teamName}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Rank #{insights.rank} · {team.memberCount} members · {team.teamPoints.toLocaleString()} pts · {team.consistencyPct}% consistency
        </p>
      </div>

      {/* Rule-based summary */}
      <div className="bg-card border border-border rounded-xl px-5 py-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Team summary</h3>
        <p className="text-sm text-foreground leading-relaxed">{insights.summary}</p>
      </div>

      {/* Quick stats row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 print:grid-cols-4">
        <Callout
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          accent="text-emerald-700"
          label="Best Week"
          value={`Week ${insights.bestWeek.week}`}
          sub={`${insights.bestWeek.points.toLocaleString()} pts`}
        />
        {insights.bestWeek.week !== insights.worstWeek.week && (
          <Callout
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            accent="text-red-600"
            label="Quietest Week"
            value={`Week ${insights.worstWeek.week}`}
            sub={`${insights.worstWeek.points.toLocaleString()} pts`}
          />
        )}
        <Callout
          icon={<Activity className="w-3.5 h-3.5" />}
          accent="text-emerald-700"
          label="Acceptance Rate"
          value={`${insights.acceptanceRate}%`}
          sub={`${team.approvedTotal} approved`}
        />
        {insights.captainEffect && (
          <Callout
            icon={<Award className="w-3.5 h-3.5" />}
            accent={insights.captainEffect.aboveAverage ? 'text-emerald-700' : 'text-amber-700'}
            label="Captain Effect"
            value={`${insights.captainEffect.captainActiveDays}/${totalDays} days`}
            sub={`${insights.captainEffect.captainName} — ${insights.captainEffect.aboveAverage ? 'above' : 'below'} team avg (${insights.captainEffect.teamAvgActiveDays})`}
          />
        )}
      </div>

      {/* Backbone + tapered off + perfect attendance */}
      <div className="grid gap-3 md:grid-cols-2">
        {insights.backbone.length > 0 && (
          <div className="bg-card border border-border rounded-xl px-5 py-4">
            <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3">🏅 Backbone (top contributors)</h3>
            <ul className="space-y-2.5">
              {insights.backbone.map(m => (
                <li key={m.fullName} className="text-sm">
                  <span className="font-semibold text-foreground">{m.fullName}</span>
                  <span className="text-muted-foreground"> — {m.points.toLocaleString()} pts, active {m.activeDays}/{totalDays} days</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {insights.perfectAttendance.length > 0 && (
          <div className="bg-card border border-border rounded-xl px-5 py-4">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">✨ Perfect attendance</h3>
            <ul className="space-y-2.5">
              {insights.perfectAttendance.map(m => (
                <li key={m.fullName} className="text-sm">
                  <span className="font-semibold text-foreground">{m.fullName}</span>
                  <span className="text-muted-foreground"> — active all {m.activeDays} days</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {insights.taperedOff.length > 0 && (
          <div className="bg-card border border-border rounded-xl px-5 py-4">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">📉 Tapered off</h3>
            <ul className="space-y-2.5">
              {insights.taperedOff.map(m => (
                <li key={m.fullName} className="text-sm">
                  <span className="font-semibold text-foreground">{m.fullName}</span>
                  <span className="text-muted-foreground"> — last submission {m.lastActiveOn ?? 'unknown'}, ~{m.missedRecentWeeks} weeks ago</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {insights.lowConsistency.length > 0 && (
          <div className="bg-card border border-border rounded-xl px-5 py-4">
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">⚠️ Low consistency (&lt;50%)</h3>
            <ul className="space-y-2.5">
              {insights.lowConsistency.map(m => (
                <li key={m.fullName} className="text-sm">
                  <span className="font-semibold text-foreground">{m.fullName}</span>
                  <span className="text-muted-foreground"> — active {m.activeDays}/{totalDays} days</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Week-by-week bar chart */}
      <div className="bg-card border border-border rounded-xl px-5 py-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Week-by-week</h3>
        <div className="flex items-end gap-2 h-32">
          {team.weeklyBreakdown.map(w => {
            const h = (w.points / maxWeekly) * 100
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold text-foreground">{w.points.toLocaleString()}</span>
                <div className="w-full bg-primary/80 rounded-t-md transition-all" style={{ height: `${Math.max(h, 4)}%` }} />
                <span className="text-[10px] text-muted-foreground">Wk {w.week}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Member roster */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-5 py-2.5">Member</th>
              <th className="text-left px-5 py-2.5">Role</th>
              <th className="text-right px-5 py-2.5">Active days</th>
              <th className="text-right px-5 py-2.5">Approved</th>
              <th className="text-right px-5 py-2.5">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedMembers.map(m => (
              <tr key={m.userId} className="hover:bg-muted/20">
                <td className="px-5 py-2.5 font-medium text-foreground">{m.fullName}</td>
                <td className="px-5 py-2.5">
                  <span className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-full',
                    m.role === 'captain' ? 'bg-amber-100 text-amber-700' :
                    m.role === 'vice_captain' ? 'bg-blue-100 text-blue-700' :
                    'bg-muted text-muted-foreground',
                  )}>
                    {m.role === 'captain' ? 'Captain' : m.role === 'vice_captain' ? 'Vice Captain' : 'Member'}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right text-foreground">{m.activeDays}/{totalDays}</td>
                <td className="px-5 py-2.5 text-right text-foreground">{m.approved}</td>
                <td className="px-5 py-2.5 text-right font-bold text-foreground">{m.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
