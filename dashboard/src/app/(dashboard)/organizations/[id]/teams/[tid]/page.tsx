'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crown, Shield, ChevronDown, ChevronRight, CheckCircle2, XCircle, UserMinus, Gift, Plus, Trash2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { getTeamDetail, addTeamTransaction, deleteTeamTransaction, updateTeamTransaction, type TeamDetailUI, type TeamLegacyEntryUI } from '@/lib/supabase/queries'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

/// '2026-08-16' -> '16 Aug 2026'. Parsed as UTC on purpose: a plain
/// `new Date('2026-08-16')` is midnight UTC, which in a negative-offset
/// timezone renders as the 15th.
function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

const WEEKS = [1, 2, 3, 4]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamDetailPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id: orgId, tid } = use(params)

  const [team, setTeam] = useState<TeamDetailUI | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  // Team bonus dialog state
  const [bonusOpen, setBonusOpen] = useState(false)
  const [bonusAmount, setBonusAmount] = useState('')
  const [bonusReason, setBonusReason] = useState('')
  const [bonusDate, setBonusDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [bonusSubmitting, setBonusSubmitting] = useState(false)
  const [bonusError, setBonusError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Edit team transaction state
  const [editTarget, setEditTarget] = useState<TeamLegacyEntryUI | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editDate, setEditDate]     = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError]   = useState<string | null>(null)

  async function reload() {
    const fresh = await getTeamDetail(tid, orgId)
    if (fresh) setTeam(fresh)
  }

  useEffect(() => {
    getTeamDetail(tid, orgId).then(setTeam).finally(() => setIsLoading(false))
  }, [tid, orgId])

  function openBonus() {
    setBonusAmount('')
    setBonusReason('')
    setBonusDate(new Date().toISOString().slice(0, 10))
    setBonusError(null)
    setBonusOpen(true)
  }

  function openEdit(entry: TeamLegacyEntryUI) {
    setEditTarget(entry)
    setEditAmount(String(entry.amount))
    setEditReason(entry.reason)
    setEditDate(entry.eventDate)
    setEditError(null)
  }

  async function submitEdit() {
    if (!editTarget) return
    setEditError(null)
    const amt = parseInt(editAmount, 10)
    if (!Number.isFinite(amt) || amt === 0) { setEditError('Enter a non-zero whole number.'); return }
    if (!editReason.trim()) { setEditError('Reason is required.'); return }
    if (!editDate) { setEditError('Event date is required.'); return }
    if (team?.challengeStart && team?.challengeEnd &&
        (editDate < team.challengeStart || editDate > team.challengeEnd)) {
      setEditError(
        `Date must be between ${fmtDay(team.challengeStart)} and ${fmtDay(team.challengeEnd)} — the challenge dates. Points dated outside that range never appear on the leaderboard.`,
      )
      return
    }
    setEditSubmitting(true)
    const result = await updateTeamTransaction(editTarget.id, orgId, amt, editReason.trim(), editDate)
    setEditSubmitting(false)
    if (!result.success) { setEditError(result.error); return }
    setEditTarget(null)
    await reload()
  }

  async function submitBonus() {
    setBonusError(null)
    const amt = parseInt(bonusAmount, 10)
    if (!Number.isFinite(amt) || amt === 0) {
      setBonusError('Enter a non-zero whole number (negative to deduct).')
      return
    }
    if (!bonusReason.trim()) {
      setBonusError('Reason is required.')
      return
    }
    if (!bonusDate) {
      setBonusError('Event date is required.')
      return
    }
    // Outside the challenge window the points are stored but never counted by
    // team_points_view, so the admin sees "saved" and the leaderboard never
    // moves. Block it here with the allowed range spelled out.
    if (team?.challengeStart && team?.challengeEnd &&
        (bonusDate < team.challengeStart || bonusDate > team.challengeEnd)) {
      setBonusError(
        `Date must be between ${fmtDay(team.challengeStart)} and ${fmtDay(team.challengeEnd)} — the challenge dates. Points dated outside that range never appear on the leaderboard.`,
      )
      return
    }
    setBonusSubmitting(true)
    const result = await addTeamTransaction(tid, orgId, amt, bonusReason.trim(), bonusDate)
    setBonusSubmitting(false)
    if (!result.success) {
      setBonusError(result.error)
      return
    }
    setBonusOpen(false)
    await reload()
  }

  async function confirmDelete() {
    if (!deleteTargetId) return
    const result = await deleteTeamTransaction(deleteTargetId, orgId)
    setDeleteTargetId(null)
    if (result.success) await reload()
  }

  if (isLoading) return <TeamDetailSkeleton />
  if (!team) return <p className="text-sm text-muted-foreground">Team not found.</p>

  function weekPts(member: TeamDetailUI['members'][number], week: number) {
    return member.weekGroups.find(wg => wg.week === week)?.totalPoints ?? 0
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

                {/* Expanded breakdown — flat entry list per week, matching mobile */}
                {isExpanded && (
                  <div className="bg-muted/20 border-t border-border">
                    {member.weekGroups.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-muted-foreground">No activity yet.</p>
                    ) : (
                      member.weekGroups.map(wg => (
                        <div key={wg.week} className="border-t border-border/60">
                          {/* Week header */}
                          <div className="flex items-center justify-between px-5 py-1.5 bg-muted/30">
                            <p className="text-xs font-semibold text-muted-foreground">Week {wg.week}</p>
                            <p className="text-xs font-semibold" style={{ color: '#059669' }}>
                              🥦 {wg.totalPoints}
                            </p>
                          </div>
                          {/* Entry rows */}
                          {wg.entries.map((entry, i) => (
                            <div key={i} className="flex items-center gap-3 px-5 py-2.5 border-t border-border/40">
                              {/* Status icon */}
                              <div className="shrink-0 w-5 flex items-center justify-center">
                                {entry.status === 'approved' && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                )}
                                {entry.status === 'missed' && (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                {entry.status === 'rejected' && (
                                  <XCircle className="w-4 h-4 text-red-500" />
                                )}
                                {entry.status === 'adjustment' && (
                                  <span className="text-sm leading-none">✏️</span>
                                )}
                              </div>
                              {/* Task icon */}
                              <span className="text-base leading-none shrink-0">{entry.icon}</span>
                              {/* Title + subtitle */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{entry.title}</p>
                                {entry.subtitle && (
                                  <p className="text-xs text-muted-foreground">{entry.subtitle}</p>
                                )}
                              </div>
                              {/* Date + points */}
                              <div className="shrink-0 text-right">
                                <p className="text-xs text-muted-foreground">{entry.date}</p>
                                {entry.status === 'missed' ? (
                                  <p className="text-xs font-semibold text-red-500">Missed</p>
                                ) : entry.status === 'rejected' ? (
                                  <p className="text-xs font-semibold text-red-500">Not approved</p>
                                ) : (
                                  <p className={cn(
                                    'text-xs font-semibold',
                                    entry.points >= 0 ? 'text-emerald-600' : 'text-red-500',
                                  )}>
                                    {entry.points >= 0 ? '+' : ''}{entry.points} 🥦
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                    <div className="h-2" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Team Adjustments — both manual bonuses and legacy transfers from removed members */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base text-foreground flex items-center gap-2">
              <Gift className="w-4 h-4 text-muted-foreground" />
              Team Adjustments
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manual team bonuses and points inherited from members who left
            </p>
          </div>
          <button
            type="button"
            onClick={openBonus}
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 shrink-0')}
          >
            <Plus className="w-3.5 h-3.5" /> Add Adjustment
          </button>
        </div>
        {team.legacyEntries.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No team adjustments yet. Click <strong>Add Adjustment</strong> to award a team bonus or correction.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {team.legacyEntries.map(entry => {
              const dateStr = (() => {
                try {
                  const d = new Date(entry.eventDate + 'T12:00:00')
                  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
                } catch { return entry.eventDate }
              })()
              const isLegacy = entry.kind === 'legacy_transfer'
              const isPositive = entry.amount >= 0
              return (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    isLegacy ? 'bg-muted/60 text-muted-foreground' : 'bg-emerald-100 text-emerald-700',
                  )}>
                    {isLegacy ? <UserMinus className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm truncate',
                      isLegacy ? 'italic text-muted-foreground' : 'text-foreground',
                    )}>
                      {entry.reason}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{dateStr}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn(
                      'text-sm font-semibold',
                      isPositive ? 'text-emerald-600' : 'text-red-500',
                    )}>
                      {isPositive ? '+' : ''}{entry.amount} 🥦
                    </p>
                  </div>
                  {entry.kind !== 'legacy_transfer' && (
                    <button
                      type="button"
                      onClick={() => openEdit(entry)}
                      title="Edit this adjustment"
                      className="shrink-0 text-muted-foreground/60 hover:text-foreground p-1 rounded transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(entry.id)}
                    title="Remove this adjustment"
                    className="shrink-0 text-muted-foreground/60 hover:text-destructive p-1 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add bonus dialog */}
      <Dialog open={bonusOpen} onOpenChange={v => { if (!v && !bonusSubmitting) setBonusOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Adjustment</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Awards or deducts points at the <strong>team level</strong>. Doesn&apos;t affect any individual member&apos;s personal points.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="bonusAmount" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Amount <span className="font-normal normal-case">(negative to deduct)</span>
              </label>
              <input
                id="bonusAmount"
                type="number"
                placeholder="e.g. 100 or -50"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bonusReason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Reason
              </label>
              <input
                id="bonusReason"
                type="text"
                placeholder="e.g. Team won the wellness quiz"
                value={bonusReason}
                onChange={e => setBonusReason(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bonusDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Event Date <span className="font-normal normal-case">(determines which week this counts toward)</span>
              </label>
              <input
                id="bonusDate"
                type="date"
                value={bonusDate}
                min={team.challengeStart ?? undefined}
                max={team.challengeEnd ?? undefined}
                onChange={e => setBonusDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {team.challengeStart && team.challengeEnd && (
                <p className="text-xs text-muted-foreground">
                  Pick any day of the challenge — {fmtDay(team.challengeStart)} to {fmtDay(team.challengeEnd)}.
                  Dates outside this range are not counted on the leaderboard.
                </p>
              )}
            </div>
            {bonusError && (
              <p className="text-xs text-destructive">{bonusError}</p>
            )}
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <button
              type="button"
              onClick={() => setBonusOpen(false)}
              disabled={bonusSubmitting}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button onClick={submitBonus} disabled={bonusSubmitting}>
              {bonusSubmitting ? 'Saving…' : 'Add Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit team transaction dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => { if (!v && !editSubmitting) setEditTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Amount <span className="font-normal normal-case">(negative to deduct)</span>
              </label>
              <input
                type="number"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
              <input
                type="text"
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Event Date <span className="font-normal normal-case">(determines which week)</span>
              </label>
              <input
                type="date"
                value={editDate}
                min={team.challengeStart ?? undefined}
                max={team.challengeEnd ?? undefined}
                onChange={e => setEditDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {team.challengeStart && team.challengeEnd && (
                <p className="text-xs text-muted-foreground">
                  Pick any day of the challenge — {fmtDay(team.challengeStart)} to {fmtDay(team.challengeEnd)}.
                </p>
              )}
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <button type="button" onClick={() => setEditTarget(null)} disabled={editSubmitting} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={submitEdit} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTargetId} onOpenChange={v => { if (!v) setDeleteTargetId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this adjustment?</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The team total will recalculate immediately. This cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTargetId(null)}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
