'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crown, Shield, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTeamDetail, type TeamDetailUI } from '@/lib/supabase/queries'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const WEEKS = [1, 2, 3, 4]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamDetailPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id: orgId, tid } = use(params)

  const [team, setTeam] = useState<TeamDetailUI | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  useEffect(() => {
    getTeamDetail(tid, orgId).then(setTeam).finally(() => setIsLoading(false))
  }, [tid, orgId])

  if (isLoading) return <TeamDetailSkeleton />
  if (!team) return <p className="text-sm text-muted-foreground">Team not found.</p>

  function weekPts(member: TeamDetailUI['members'][number], week: number) {
    return member.weekPoints.find(w => w.week === week)?.points ?? 0
  }

  function weekBreakdown(member: TeamDetailUI['members'][number], week: number) {
    return member.weekPoints.find(w => w.week === week)?.tasks ?? []
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <Link
          href={`/organizations/${orgId}/teams`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Teams
        </Link>

        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0"
            style={{ backgroundColor: team.color + '22', border: `1.5px solid ${team.color}44` }}
          >
            {team.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-2xl text-foreground">{team.name}</h1>
            <p className="text-sm text-muted-foreground">{team.members.length} members</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold"
              style={{ backgroundColor: team.color + '1a', color: team.color }}
            >
              🥦 {team.totalPoints.toLocaleString()} pts
            </div>
            <p className="text-xs text-muted-foreground">
              Rank #{team.rank} among all teams
            </p>
          </div>
        </div>
      </div>

      {/* Team info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Captain',      value: team.captain },
          { label: 'Vice Captain', value: team.viceCaptain },
          { label: 'Total Points', value: `🥦 ${team.totalPoints.toLocaleString()}` },
          { label: 'Team Rank',    value: `#${team.rank}` },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Member point history table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-heading text-base text-foreground">Member Point History</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Points per week · click a row to see task breakdown
          </p>
        </div>

        {/* Table header */}
        <div className="grid text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border"
          style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 32px' }}
        >
          <div className="px-5 py-2.5">Member</div>
          {WEEKS.map(w => (
            <div key={w} className="py-2.5 text-center">WK{w}</div>
          ))}
          <div className="py-2.5 text-center">Total</div>
          <div />
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {team.members.map(member => {
            const isExpanded = expandedMember === member.id
            return (
              <div key={member.id}>
                {/* Main row */}
                <button
                  type="button"
                  onClick={() => setExpandedMember(isExpanded ? null : member.id)}
                  className={cn(
                    'w-full grid items-center text-left transition-colors hover:bg-muted/30',
                    member.role === 'captain'      && 'bg-amber-50/50',
                    member.role === 'vice_captain' && 'bg-blue-50/50',
                  )}
                  style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 32px' }}
                >
                  {/* Member info */}
                  <div className="px-5 py-3 flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: member.avatarColor }}
                    >
                      {initials(member.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {member.role === 'captain' && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            <Crown className="w-2.5 h-2.5" /> Captain
                          </span>
                        )}
                        {member.role === 'vice_captain' && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                            <Shield className="w-2.5 h-2.5" /> Vice Captain
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Week columns */}
                  {WEEKS.map(w => {
                    const pts = weekPts(member, w)
                    return (
                      <div key={w} className="py-3 flex justify-center">
                        {pts > 0 ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: '#05966918', color: '#059669' }}
                          >
                            {pts}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>
                    )
                  })}

                  {/* Total */}
                  <div className="py-3 text-center">
                    <span className="text-sm font-semibold text-foreground">
                      🥦 {member.total}
                    </span>
                  </div>

                  {/* Chevron */}
                  <div className="py-3 flex justify-center text-muted-foreground">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />
                    }
                  </div>
                </button>

                {/* Expanded task breakdown */}
                {isExpanded && (
                  <div className="bg-muted/20 border-t border-border">
                    <div className="px-5 py-2 flex items-center gap-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Task Breakdown
                      </p>
                    </div>

                    {WEEKS.map(w => {
                      const tasks = weekBreakdown(member, w)
                      const weekTotal = tasks.reduce((s, t) => s + t.subtotal, 0)
                      if (tasks.length === 0) return null
                      return (
                        <div key={w} className="border-t border-border/60">
                          {/* Week header */}
                          <div className="flex items-center justify-between px-5 py-1.5 bg-muted/30">
                            <p className="text-xs font-semibold text-muted-foreground">Week {w}</p>
                            <p className="text-xs font-semibold" style={{ color: '#059669' }}>
                              {weekTotal} pts
                            </p>
                          </div>
                          {/* Task rows */}
                          {tasks.map((task, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-2 border-t border-border/40">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{task.icon}</span>
                                <p className="text-sm text-foreground">{task.taskTitle}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-xs text-muted-foreground">
                                  {task.daysCompleted} days × {task.pointsPerDay} pts
                                </p>
                                <p className="text-xs font-semibold text-foreground w-12 text-right">
                                  {task.subtotal} pts
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}

                    <div className="h-2" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TeamDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back link + header */}
      <div>
        <div className="h-3.5 w-24 bg-muted rounded mb-3" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-muted rounded-2xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-7 w-40 bg-muted rounded" />
            <div className="h-3.5 w-20 bg-muted rounded" />
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="h-7 w-28 bg-muted rounded-full" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Member table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border space-y-1">
          <div className="h-4 w-44 bg-muted rounded" />
          <div className="h-3 w-64 bg-muted rounded" />
        </div>
        {/* Header row */}
        <div className="grid bg-muted/40 border-b border-border px-5 py-2.5 gap-2"
          style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 32px' }}>
          <div className="h-3 w-16 bg-muted rounded" />
          {[1,2,3,4].map(w => <div key={w} className="h-3 bg-muted rounded mx-auto w-8" />)}
          <div className="h-3 bg-muted rounded mx-auto w-10" />
          <div />
        </div>
        {/* Member rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid items-center px-5 py-3"
              style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 32px' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
                <div className="space-y-1">
                  <div className="h-3.5 w-28 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
              {[1,2,3,4].map(w => (
                <div key={w} className="flex justify-center">
                  <div className="h-5 w-10 bg-muted rounded-full" />
                </div>
              ))}
              <div className="h-4 w-14 bg-muted rounded mx-auto" />
              <div className="h-4 w-4 bg-muted rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
