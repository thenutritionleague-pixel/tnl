'use client'

import { useState } from 'react'
import { Users, User, TrendingUp, Trophy, Zap, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { MemberStatAdmin, TeamStatAdmin, WeekPoints } from '@/lib/supabase/admin-queries'

const WEEKS = [1, 2, 3, 4]

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function weekPts(member: MemberStatAdmin, week: number) {
  return member.weekPoints.find(w => w.week === week)?.points ?? 0
}

function TaskBreakdownSection({ weekPoints, color }: { weekPoints: WeekPoints[]; color: string }) {
  return (
    <div className="bg-muted/20 border-t border-border">
      <div className="px-5 py-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Task Breakdown</p>
      </div>
      {WEEKS.map(w => {
        const wk = weekPoints.find(x => x.week === w)
        if (!wk || wk.tasks.length === 0) return null
        return (
          <div key={w} className="border-t border-border/60">
            <div className="flex items-center justify-between px-5 py-1.5 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground">Week {w}</p>
              <p className="text-xs font-semibold" style={{ color }}>{wk.points} pts</p>
            </div>
            {wk.tasks.map((task, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{task.icon}</span>
                  <p className="text-sm text-foreground">{task.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">{task.daysCompleted} days × {task.pointsPerDay} pts</p>
                  <p className="text-xs font-semibold text-foreground w-14 text-right">{task.subtotal} pts</p>
                </div>
              </div>
            ))}
          </div>
        )
      })}
      <div className="h-2" />
    </div>
  )
}

function MemberRow({ member, rank, color, expanded, onToggle }: { member: MemberStatAdmin; rank?: number; color: string; expanded: boolean; onToggle: () => void }) {
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
      {expanded && <TaskBreakdownSection weekPoints={member.weekPoints} color={color} />}
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
  members: MemberStatAdmin[]
  teams: TeamStatAdmin[]
}

export function PointsClient({ members, teams }: Props) {
  const [view, setView]             = useState<View>('individual')
  const [search, setSearch]         = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

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
    <div className="space-y-5">
      {/* Header + toggle */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Points</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and compare points across members and teams.</p>
        </div>
        <div className="flex items-center bg-muted rounded-xl p-1 gap-1">
          <button onClick={() => { setView('individual'); setExpandedRows(new Set()) }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'individual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <User className="w-3.5 h-3.5" /> Individual
          </button>
          <button onClick={() => { setView('team'); setExpandedRows(new Set()) }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'team' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Users className="w-3.5 h-3.5" /> Team
          </button>
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
                <MemberRow key={m.id} member={m} rank={idx + 1} color="#059669" expanded={expandedRows.has(m.id)} onToggle={() => toggleRow(m.id)} />
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
                    return <MemberRow key={rowKey} member={member} color={team.color} expanded={expandedRows.has(rowKey)} onToggle={() => toggleRow(rowKey)} />
                  })}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}
