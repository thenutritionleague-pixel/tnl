'use client'

import { useState } from 'react'
import { Users, User, TrendingUp, Trophy, Zap, ChevronDown, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdjustPointsModal } from '@/components/adjust-points-modal'
import type { MemberStatAdmin, TeamStatAdmin, WeekPoints, ManualAdjustment, OrgMemberForAdjust, SubmissionEntry } from '@/lib/supabase/admin-queries'

const WEEKS = [1, 2, 3, 4]

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function weekPts(member: MemberStatAdmin, week: number) {
  return member.weekPoints.find(w => w.week === week)?.points ?? 0
}

const statusStyle: Record<SubmissionEntry['status'], { bg: string; label: string; icon: string; pts: string }> = {
  approved: { bg: '',                                    label: '',         icon: '✅', pts: 'text-emerald-600 font-semibold' },
  rejected: { bg: 'bg-red-50/50 dark:bg-red-950/20',    label: 'Rejected', icon: '❌', pts: 'text-red-400' },
  missed:   { bg: 'bg-red-50/30 dark:bg-red-950/10',    label: 'Missed',   icon: '➖', pts: 'text-red-300' },
}

function aggregateEntries(entries: SubmissionEntry[]) {
  const byTask: Record<string, { icon: string; approved: SubmissionEntry[]; missed: number; rejected: number }> = {}
  for (const e of entries) {
    if (!byTask[e.taskTitle]) byTask[e.taskTitle] = { icon: e.taskIcon, approved: [], missed: 0, rejected: 0 }
    if (e.status === 'approved') byTask[e.taskTitle].approved.push(e)
    else if (e.status === 'missed') byTask[e.taskTitle].missed++
    else byTask[e.taskTitle].rejected++
  }
  return byTask
}

function TaskBreakdownSection({ weekPoints, color, manualAdjustments, currentWeek }: { weekPoints: WeekPoints[]; color: string; manualAdjustments: ManualAdjustment[]; currentWeek: number }) {
  const [expandedPastWeeks, setExpandedPastWeeks] = useState<Set<number>>(new Set())
  function togglePastWeek(w: number) {
    setExpandedPastWeeks(prev => { const next = new Set(prev); next.has(w) ? next.delete(w) : next.add(w); return next })
  }

  return (
    <div className="bg-muted/20 border-t border-border">
      <div className="px-5 py-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Task History</p>
      </div>
      {WEEKS.map(w => {
        const wk = weekPoints.find(x => x.week === w)
        if (!wk || wk.entries.length === 0) return null
        const isPastWeek = w < currentWeek
        const isExpanded = !isPastWeek || expandedPastWeeks.has(w)
        const agg = isPastWeek ? aggregateEntries(wk.entries) : null
        return (
          <div key={w} className="border-t border-border/60">
            {/* Week header */}
            {isPastWeek ? (
              <button
                type="button"
                onClick={() => togglePastWeek(w)}
                className="w-full flex items-center justify-between px-5 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {isExpanded
                    ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  }
                  <p className="text-xs font-semibold text-muted-foreground">Week {w}</p>
                </div>
                <p className="text-xs font-semibold" style={{ color }}>{wk.points} pts</p>
              </button>
            ) : (
              <div className="flex items-center justify-between px-5 py-1.5 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground">Week {w} <span className="text-primary/70 ml-1">(current)</span></p>
                <p className="text-xs font-semibold" style={{ color }}>{wk.points} pts</p>
              </div>
            )}

            {/* Rows */}
            {isExpanded && isPastWeek && agg && Object.entries(agg).map(([taskTitle, data]) => {
              const approvedCount = data.approved.length
              const totalDays = approvedCount + data.missed + data.rejected
              const ptsPerDay = data.approved[0]?.points ?? wk.tasks.find(t => t.title === taskTitle)?.pointsPerDay ?? 0
              const earned = data.approved.reduce((s, e) => s + e.points, 0)
              const hasIssues = data.missed > 0 || data.rejected > 0
              const daysLabel = hasIssues
                ? `${approvedCount}/${totalDays} days × ${ptsPerDay} pts`
                : `${totalDays} days × ${ptsPerDay} pts`
              const indicators = [
                data.rejected > 0 ? `${data.rejected} rejected` : '',
                data.missed > 0 ? `${data.missed} missed` : '',
              ].filter(Boolean).join(' · ')
              return (
                <div key={taskTitle} className="flex items-center justify-between px-5 py-2.5 border-t border-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{data.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{taskTitle}</p>
                      {hasIssues && <p className="text-[10px] text-red-400 mt-0.5">{indicators}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 ml-4 text-right">
                    <p className="text-[11px] text-muted-foreground">{daysLabel}</p>
                    <p className={cn('text-xs font-semibold', hasIssues ? 'text-amber-600' : 'text-emerald-600')}>{earned} pts</p>
                  </div>
                </div>
              )
            })}

            {isExpanded && !isPastWeek && wk.entries.map((entry, i) => {
              const s = statusStyle[entry.status]
              return (
                <div key={i} className={cn('flex items-center justify-between px-5 py-2 border-t border-border/40', s.bg)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{entry.taskIcon}</span>
                    <span className="text-sm shrink-0">{s.icon}</span>
                    <p className="text-sm text-foreground truncate">{entry.taskTitle}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <p className="text-xs text-muted-foreground">{entry.date}</p>
                    {entry.status === 'approved'
                      ? <p className={cn('text-xs w-14 text-right', s.pts)}>+{entry.points} pts</p>
                      : <p className={cn('text-xs w-14 text-right', s.pts)}>{s.label}</p>
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* ✏️ Manual adjustments section */}
      {manualAdjustments.length > 0 && (
        <div className="border-t border-border/60">
          <div className="flex items-center justify-between px-5 py-1.5 bg-violet-50/60 dark:bg-violet-950/20">
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">Manual Adjustments</p>
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">
              {manualAdjustments.reduce((s, a) => s + a.amount, 0) >= 0 ? '+' : ''}
              {manualAdjustments.reduce((s, a) => s + a.amount, 0)} pts
            </p>
          </div>
          {manualAdjustments.map((adj, i) => (
            <div key={i} className="flex items-start justify-between px-5 py-2 border-t border-border/40 bg-violet-50/30 dark:bg-violet-950/10">
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5">✏️</span>
                <div>
                  <p className="text-sm text-foreground">{adj.reason}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{adj.createdAt}</p>
                </div>
              </div>
              <p className={cn('text-xs font-semibold w-14 text-right', adj.amount >= 0 ? 'text-violet-600' : 'text-red-500')}>
                {adj.amount >= 0 ? '+' : ''}{adj.amount} pts
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="h-2" />
    </div>
  )
}

function MemberRow({ member, rank, color, expanded, onToggle, currentWeek }: { member: MemberStatAdmin; rank?: number; color: string; expanded: boolean; onToggle: () => void; currentWeek: number }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="w-full grid items-center text-left transition-colors hover:bg-muted/30"
        style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 32px' }}
      >
        <div className="px-5 py-3 flex items-center gap-3 min-w-0">
          {rank !== undefined && (
            <span className="text-xs font-bold w-5 text-center shrink-0" style={{ color: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#f97316' : '#94a3b8' }}>
              {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `#${rank}`}
            </span>
          )}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: member.avatarColor }}>
            {initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
            {rank !== undefined && <p className="text-xs text-muted-foreground">{member.teamName}</p>}
          </div>
        </div>
        {WEEKS.map(w => {
          const pts = weekPts(member, w)
          return (
            <div key={w} className="py-3 flex justify-center">
              {pts > 0
                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: color + '18', color }}>{pts}</span>
                : <span className="text-xs text-muted-foreground/40">—</span>
              }
            </div>
          )
        })}
        <div className="py-3 text-center">
          <span className="text-sm font-bold text-foreground">🥦 {member.total}</span>
        </div>
        <div className="py-3 flex justify-center text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>
      {expanded && <TaskBreakdownSection weekPoints={member.weekPoints} color={color} manualAdjustments={member.manualAdjustments} currentWeek={currentWeek} />}
    </>
  )
}

function TableHeader() {
  return (
    <div className="grid text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border" style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 32px' }}>
      <div className="px-5 py-2.5">Member</div>
      {WEEKS.map(w => <div key={w} className="py-2.5 text-center">WK{w}</div>)}
      <div className="py-2.5 text-center">Total</div>
      <div />
    </div>
  )
}

type View = 'individual' | 'team'

interface Props {
  orgId: string
  members: MemberStatAdmin[]
  teams: TeamStatAdmin[]
  adjustMembers: OrgMemberForAdjust[]
  currentWeek: number
}

export function PointsClient({ orgId, members, teams, adjustMembers, currentWeek }: Props) {
  const [view, setView]             = useState<View>('individual')
  const [search, setSearch]         = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [adjustOpen, setAdjustOpen] = useState(false)

  function toggleRow(id: string) {
    setExpandedRows(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const totalPoints = members.reduce((s, m) => s + m.total, 0)
  const allTeamNames = [...new Set(members.map(m => m.teamName))].filter(t => t !== 'Unassigned')

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (!teamFilter || m.teamName === teamFilter)
  )
  const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
    <AdjustPointsModal
      orgId={orgId}
      members={adjustMembers}
      open={adjustOpen}
      onClose={() => setAdjustOpen(false)}
    />
    <div className="space-y-5">
      {/* Header + toggle */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and compare points across members and teams.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust Points
          </button>
          <div className="flex items-center bg-muted rounded-xl p-1 gap-1">
            <button onClick={() => { setView('individual'); setExpandedRows(new Set()) }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'individual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <User className="w-3.5 h-3.5" /> Individual
            </button>
            <button onClick={() => { setView('team'); setExpandedRows(new Set()) }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'team' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Users className="w-3.5 h-3.5" /> Team
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Zap className="w-3.5 h-3.5" /> Total Points</div>
          <p className="text-xl font-bold text-foreground">🥦 {totalPoints.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><TrendingUp className="w-3.5 h-3.5" /> Active Members</div>
          <p className="text-xl font-bold text-foreground">{members.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Trophy className="w-3.5 h-3.5 text-amber-500" /> Top Member</div>
          <p className="text-sm font-bold text-foreground truncate">{members[0]?.name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">🥦 {members[0]?.total ?? 0} pts</p>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Trophy className="w-3.5 h-3.5 text-primary" /> Top Team</div>
          <p className="text-sm font-bold text-foreground truncate">{teams[0]?.name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">🥦 {teams[0]?.total ?? 0} pts</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Each column shows total 🥦 earned <strong>during that week</strong>. Click any row to see the task-by-task breakdown.</p>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder={view === 'individual' ? 'Search member…' : 'Search team…'} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        {view === 'individual' && (
          <div className="relative">
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={cn('appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer', !teamFilter && 'text-muted-foreground')}>
              <option value="">All Teams</option>
              {allTeamNames.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Individual view */}
      {view === 'individual' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <TableHeader />
          <div className="divide-y divide-border">
            {filteredMembers.length === 0
              ? <div className="px-5 py-10 text-center text-sm text-muted-foreground">No members found.</div>
              : filteredMembers.map((m, idx) => (
                <MemberRow key={m.id} member={m} rank={idx + 1} color="#059669" expanded={expandedRows.has(m.id)} onToggle={() => toggleRow(m.id)} currentWeek={currentWeek} />
              ))
            }
          </div>
        </div>
      )}

      {/* Team view */}
      {view === 'team' && (
        <div className="space-y-5">
          {filteredTeams.length === 0
            ? <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center text-sm text-muted-foreground">No teams found.</div>
            : filteredTeams.map((team, tIdx) => (
              <div key={team.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4 border-b border-border">
                  <span className="text-2xl shrink-0">{team.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-base text-foreground">{team.name}</p>
                      {tIdx === 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">🏆 #1</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{team.members.length} members</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shrink-0" style={{ backgroundColor: team.color + '18', color: team.color }}>
                    🥦 {team.total.toLocaleString()} pts
                  </div>
                </div>
                <TableHeader />
                <div className="divide-y divide-border">
                  {team.members.slice().sort((a, b) => b.total - a.total).map(member => {
                    const rowKey = `${team.id}-${member.id}`
                    return <MemberRow key={rowKey} member={member} color={team.color} expanded={expandedRows.has(rowKey)} onToggle={() => toggleRow(rowKey)} currentWeek={currentWeek} />
                  })}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
    </>
  )
}
