'use client'

import React, { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Crown, Shield, CheckCircle2, XCircle, Clock,
  SlidersHorizontal, Eye, Loader2, ImageIcon, ChevronDown, ChevronUp,
  ListOrdered, History, Pencil, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AdjustPointsModal } from '@/components/adjust-points-modal'
import { approveMemberSubmission, rejectMemberSubmission, getProofSignedUrl } from '../actions'
import { updateManualAdjustment, deleteManualAdjustment } from '../../../points/adjust/actions'
import type { MemberDetailAdmin, OrgMemberForAdjust } from '@/lib/supabase/admin-queries'

// ── Types ─────────────────────────────────────────────────────────────────────

type Submission = MemberDetailAdmin['submissions'][number]
type SubmissionStatus = Submission['status']

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const roleLabel = {
  team_captain: 'Captain',
  vice_captain: 'Vice Captain',
  member: 'Member',
} as const

const statusConfig: Record<SubmissionStatus, { icon: React.ReactNode; label: string; className: string }> = {
  approved: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: 'Approved',
    className: 'text-emerald-600 bg-emerald-50',
  },
  rejected: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: 'Rejected',
    className: 'text-red-600 bg-red-50',
  },
  pending: {
    icon: <Clock className="w-3.5 h-3.5" />,
    label: 'Pending',
    className: 'text-amber-600 bg-amber-50',
  },
}

// ── ProofViewer ───────────────────────────────────────────────────────────────

function ProofViewer({ proofUrl }: { proofUrl: string | null }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [imgState, setImgState] = useState<'none' | 'loading' | 'loaded' | 'error'>('none')

  async function load() {
    if (!proofUrl) return
    setImgState('loading')
    const url = await getProofSignedUrl(proofUrl)
    if (!url) { setImgState('error'); return }
    setSignedUrl(url)
  }

  return (
    <div className="relative h-56 w-full rounded-xl overflow-hidden bg-muted/30 border border-border flex items-center justify-center">
      {/* No proof */}
      {!proofUrl && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8" />
          <p className="text-xs">No proof image</p>
        </div>
      )}

      {/* Load button */}
      {proofUrl && imgState === 'none' && (
        <button
          type="button"
          onClick={load}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
        >
          <Eye className="w-3.5 h-3.5" /> View Proof
        </button>
      )}

      {/* Shimmer */}
      {imgState === 'loading' && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {imgState === 'error' && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8 opacity-40" />
          <p className="text-xs">Failed to load image</p>
        </div>
      )}

      {/* Image */}
      {signedUrl && (
        <img
          src={signedUrl}
          alt="Proof"
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            imgState === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setImgState('loaded')}
          onError={() => setImgState('error')}
        />
      )}
    </div>
  )
}

// ── Review Modal ──────────────────────────────────────────────────────────────

interface ReviewModalProps {
  submission: Submission | null
  orgId: string
  memberId: string
  onClose: () => void
  onDone: (updatedId: string, newStatus: SubmissionStatus, newPoints: number) => void
}

function ReviewModal({ submission, orgId, memberId, onClose, onDone }: ReviewModalProps) {
  const [pointsInput, setPointsInput] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null)

  const open = submission !== null

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) { setPointsInput(''); setRejectReason(''); onClose() }
  }

  async function handleApprove() {
    if (!submission) return
    const override = pointsInput.trim() ? parseInt(pointsInput, 10) : null
    if (override !== null && (!Number.isFinite(override) || override < 0)) {
      toast.error('Points override must be a non-negative integer.')
      return
    }
    setSubmitting('approve')
    const result = await approveMemberSubmission(submission.id, orgId, memberId, override)
    setSubmitting(null)
    if (result.error) { toast.error(result.error); return }
    toast.success('Submission approved.')
    // Optimistic: estimate points awarded
    const awarded = override ?? 0
    onDone(submission.id, 'approved', awarded)
    onClose()
    setPointsInput('')
  }

  async function handleReject() {
    if (!submission) return
    setSubmitting('reject')
    const result = await rejectMemberSubmission(submission.id, orgId, memberId, rejectReason)
    setSubmitting(null)
    if (result.error) { toast.error(result.error); return }
    toast.success('Submission rejected.')
    onDone(submission.id, 'rejected', 0)
    onClose()
    setRejectReason('')
  }

  const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review Submission</DialogTitle>
        </DialogHeader>

        {submission && (
          <div className="space-y-4 mt-1">
            {/* Task info */}
            <div className="bg-muted/30 rounded-lg px-4 py-3 space-y-0.5">
              <p className="text-sm font-semibold text-foreground">{submission.taskTitle}</p>
              <p className="text-xs text-muted-foreground">{submission.challenge} · WK{submission.week} · {submission.submittedDate}</p>
            </div>

            {/* Proof image */}
            <ProofViewer proofUrl={submission.proofUrl} />

            {/* Points override */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Points Override <span className="font-normal normal-case">(leave blank for task default)</span>
              </Label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 10"
                value={pointsInput}
                onChange={e => setPointsInput(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Rejection reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Rejection Reason <span className="font-normal normal-case">(optional — shown to member)</span>
              </Label>
              <input
                type="text"
                placeholder="e.g. Photo unclear, wrong meal…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={!!submitting}
                onClick={handleApprove}
                className={cn(buttonVariants({ size: 'sm' }), 'flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5')}
              >
                {submitting === 'approve'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                type="button"
                disabled={!!submitting}
                onClick={handleReject}
                className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }), 'flex-1 gap-1.5')}
              >
                {submitting === 'reject'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <XCircle className="w-3.5 h-3.5" />}
                Reject
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Proof-only Dialog ─────────────────────────────────────────────────────────

interface ProofDialogProps {
  submission: Submission | null
  onClose: () => void
}

function ProofDialog({ submission, onClose }: ProofDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading')

  // Auto-load the image whenever the dialog opens with a new submission
  useEffect(() => {
    if (!submission?.proofUrl) return
    setSignedUrl(null)
    setImgState('loading')
    getProofSignedUrl(submission.proofUrl).then(url => {
      if (url) { setSignedUrl(url) }
      else setImgState('error')
    })
  }, [submission?.id])

  return (
    <Dialog open={!!submission} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{submission?.taskTitle ?? ''}</DialogTitle>
        </DialogHeader>
        {submission && (
          <div className="space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">{submission.challenge} · WK{submission.week} · {submission.submittedDate}</p>
            <div className="relative w-full rounded-xl overflow-hidden bg-muted/30 border border-border flex items-center justify-center" style={{ minHeight: 280 }}>
              {imgState === 'loading' && !signedUrl && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs">Loading proof…</span>
                </div>
              )}
              {imgState === 'error' && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <p className="text-xs">Failed to load image</p>
                </div>
              )}
              {signedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt="Proof"
                  className={cn('max-w-full max-h-[60vh] object-contain transition-opacity duration-300', imgState === 'loaded' ? 'opacity-100' : 'opacity-0')}
                  onLoad={() => setImgState('loaded')}
                  onError={() => setImgState('error')}
                />
              )}
            </div>
            {submission.rejectionReason && (
              <p className="text-xs text-destructive">Rejection reason: {submission.rejectionReason}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main Client Component ─────────────────────────────────────────────────────

interface Props {
  member: MemberDetailAdmin
  orgId: string
  adjustMember: OrgMemberForAdjust
}

type Tab = 'submissions' | 'history'

type PointsTx = MemberDetailAdmin['pointsHistory'][number]

export function MemberDetailClient({ member, orgId, adjustMember }: Props) {
  const [submissions, setSubmissions] = useState(member.submissions)
  const [pointsHistory, setPointsHistory] = useState(member.pointsHistory)
  const [reviewSub, setReviewSub] = useState<Submission | null>(null)
  const [viewSub, setViewSub] = useState<Submission | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('submissions')

  // Edit manual adjustment
  const [editTx, setEditTx] = useState<PointsTx | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editDate, setEditDate]     = useState('')
  const [editError, setEditError]   = useState<string | null>(null)
  const [editPending, startEditTransition] = useTransition()

  // Delete manual adjustment
  const [deleteTx, setDeleteTx] = useState<PointsTx | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  function openEdit(tx: PointsTx) {
    const rawReason = tx.reason.replace(/\s*\[by [^\]]+\]\s*$/, '').trim()
    setEditTx(tx)
    setEditAmount(String(tx.amount))
    setEditReason(rawReason)
    setEditDate(tx.eventDateRaw)
    setEditError(null)
  }

  function submitEdit() {
    if (!editTx) return
    const amt = parseInt(editAmount, 10)
    if (!Number.isFinite(amt) || amt === 0) { setEditError('Amount must be a non-zero number.'); return }
    if (!editReason.trim()) { setEditError('Reason is required.'); return }
    if (!editDate) { setEditError('Date is required.'); return }
    startEditTransition(async () => {
      const res = await updateManualAdjustment(orgId, member.id, editTx.id, amt, editReason.trim(), editDate)
      if (res.error) { setEditError(res.error); return }
      setPointsHistory(prev => prev.map(t => t.id === editTx.id
        ? { ...t, amount: amt, reason: `${editReason.trim()} [by ${t.reason.match(/\[by ([^\]]+)\]/)?.[1] ?? 'admin'}]`, eventDateRaw: editDate }
        : t,
      ))
      toast.success('Adjustment updated.')
      setEditTx(null)
    })
  }

  function submitDelete() {
    if (!deleteTx) return
    startDeleteTransition(async () => {
      const res = await deleteManualAdjustment(orgId, member.id, deleteTx.id)
      if (res.error) { toast.error(res.error); return }
      setPointsHistory(prev => prev.filter(t => t.id !== deleteTx.id))
      toast.success('Adjustment deleted.')
      setDeleteTx(null)
    })
  }

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalTasks = member.tasksCompleted + member.tasksRejected + member.tasksPending
  const approvalRate = totalTasks > 0 ? Math.round((member.tasksCompleted / totalTasks) * 100) : 0

  function handleReviewDone(updatedId: string, newStatus: Submission['status'], newPoints: number) {
    setSubmissions(prev =>
      prev.map(s => s.id === updatedId
        ? { ...s, status: newStatus, pointsAwarded: newPoints }
        : s,
      ),
    )
  }

  return (
    <>
      <ReviewModal
        submission={reviewSub}
        orgId={orgId}
        memberId={member.id}
        onClose={() => setReviewSub(null)}
        onDone={handleReviewDone}
      />
      <ProofDialog submission={viewSub} onClose={() => setViewSub(null)} />
      <AdjustPointsModal
        orgId={orgId}
        members={[adjustMember]}
        defaultUserId={member.id}
        lockMember
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/organizations/${orgId}/members`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Members
          </Link>

          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: member.avatarColor }}
            >
              {initials(member.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-2xl text-foreground">{member.name}</h1>
                <span className={cn(
                  'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                  member.role === 'team_captain' && 'bg-amber-100 text-amber-700',
                  member.role === 'vice_captain' && 'bg-blue-100 text-blue-700',
                  member.role === 'member'       && 'bg-muted text-muted-foreground',
                )}>
                  {member.role === 'team_captain' && <Crown className="w-3 h-3" />}
                  {member.role === 'vice_captain' && <Shield className="w-3 h-3" />}
                  {roleLabel[member.role]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{member.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{member.team} · Joined {member.joinedAt}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-1 text-lg font-bold text-foreground">
                🥦 {member.totalPoints.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Rank #{member.rank}</p>
              <button
                type="button"
                onClick={() => setAdjustOpen(true)}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust Points
              </button>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Tasks Completed', value: member.tasksCompleted, color: 'text-emerald-600' },
            { label: 'Tasks Rejected',  value: member.tasksRejected,  color: 'text-red-500' },
            { label: 'Pending Review',  value: member.tasksPending,   color: 'text-amber-500' },
            { label: 'Approval Rate',   value: `${approvalRate}%`,    color: 'text-primary' },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={cn('text-xl font-bold mt-0.5', card.color)}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-border">
            {([
              { id: 'submissions' as Tab, label: 'Submissions', icon: <ListOrdered className="w-3.5 h-3.5" />, count: submissions.length },
              { id: 'history'     as Tab, label: 'Points History', icon: <History className="w-3.5 h-3.5" />, count: member.pointsHistory.length },
            ]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.icon} {tab.label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                  activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Submissions tab */}
          {activeTab === 'submissions' && (
            submissions.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Task</th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Challenge</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Week</th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Submitted</th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Points</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {submissions.map(sub => {
                    const cfg = statusConfig[sub.status]
                    const isExpanded = expandedRows.has(sub.id)
                    const hasPrev = (sub.previousAttempts?.length ?? 0) > 0
                    return (
                      <React.Fragment key={sub.id}>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-1.5">
                              {sub.taskTitle}
                              {hasPrev && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(sub.id)}
                                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <span className="bg-muted rounded px-1">{sub.previousAttempts.length} prev</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs hidden sm:table-cell">{sub.challenge}</td>
                          <td className="px-4 py-3 text-center"><span className="text-xs text-muted-foreground">WK{sub.week}</span></td>
                          <td className="px-5 py-3 text-muted-foreground text-xs hidden md:table-cell">{sub.submittedDate}</td>
                          <td className="px-5 py-3">
                            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.className)}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {sub.pointsAwarded > 0
                              ? <span className="font-semibold text-foreground">🥦 {sub.pointsAwarded}</span>
                              : <span className="text-muted-foreground/40 text-xs">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {sub.status === 'pending' && (
                                <button type="button" onClick={() => setReviewSub(sub)}
                                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 text-xs h-7')}>
                                  <Eye className="w-3 h-3" /> Review
                                </button>
                              )}
                              {sub.proofUrl && sub.status !== 'pending' && (
                                <button type="button" onClick={() => setViewSub(sub)}
                                  className="text-xs text-primary hover:underline">
                                  View Proof
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {hasPrev && isExpanded && sub.previousAttempts.map(prev => {
                          const pcfg = statusConfig[prev.status]
                          return (
                            <tr key={`prev-${prev.id}`} className="bg-muted/20">
                              <td className="px-5 py-2 text-xs text-muted-foreground pl-10">↳ Earlier attempt · {prev.submittedAt}</td>
                              <td className="hidden sm:table-cell" /><td className="hidden" /><td className="hidden md:table-cell" />
                              <td className="px-5 py-2">
                                <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', pcfg.className)}>
                                  {pcfg.icon} {pcfg.label}
                                </span>
                              </td>
                              <td className="px-5 py-2 text-right text-xs text-muted-foreground">
                                {prev.pointsAwarded > 0 ? `🥦 ${prev.pointsAwarded}` : '—'}
                              </td>
                              <td className="px-5 py-2 text-right">
                                {prev.proofUrl && (
                                  <button type="button"
                                    onClick={() => setViewSub({ ...sub, id: prev.id, status: prev.status, proofUrl: prev.proofUrl, rejectionReason: prev.rejectionReason, pointsAwarded: prev.pointsAwarded, previousAttempts: [] })}
                                    className="text-xs text-primary hover:underline">View Proof</button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )
          )}

          {/* Points History tab */}
          {activeTab === 'history' && (
            pointsHistory.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No points transactions yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {pointsHistory.map(tx => {
                  const isMissed = tx.amount === 0 && !tx.isManual
                  const isManual = tx.isManual
                  const isEarned = tx.amount > 0 && !tx.isManual
                  const displayReason = tx.reason.replace(/\s*\[by [^\]]+\]$/, '')
                  const date = new Date(tx.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })

                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm',
                        isEarned && 'bg-emerald-100 text-emerald-700',
                        isMissed && 'bg-muted text-muted-foreground',
                        isManual && tx.amount > 0 && 'bg-blue-100 text-blue-700',
                        isManual && tx.amount < 0 && 'bg-red-100 text-red-600',
                      )}>
                        {isMissed ? '✗' : isManual ? '✏️' : '🥦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{displayReason}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                      </div>
                      <div className={cn(
                        'text-sm font-bold shrink-0',
                        isEarned && 'text-emerald-600',
                        isMissed && 'text-muted-foreground',
                        isManual && tx.amount > 0 && 'text-blue-600',
                        isManual && tx.amount < 0 && 'text-red-600',
                      )}>
                        {isMissed ? 'Missed' : tx.amount > 0 ? `+${tx.amount} 🥦` : `${tx.amount} 🥦`}
                      </div>
                      {isManual && (
                        <>
                          <button type="button" onClick={() => openEdit(tx)} title="Edit" className="shrink-0 text-muted-foreground/60 hover:text-foreground p-1 rounded transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setDeleteTx(tx)} title="Delete" className="shrink-0 text-muted-foreground/60 hover:text-destructive p-1 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Edit manual adjustment */}
      <Dialog open={!!editTx} onOpenChange={v => { if (!v && !editPending) setEditTx(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</label>
              <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
              <input type="text" value={editReason} onChange={e => setEditReason(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Event Date <span className="font-normal normal-case">(determines which week)</span>
              </label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <button type="button" onClick={() => setEditTx(null)} disabled={editPending}
              className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <button type="button" onClick={submitEdit} disabled={editPending}
              className={cn(buttonVariants())}>{editPending ? 'Saving…' : 'Save'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete manual adjustment */}
      <Dialog open={!!deleteTx} onOpenChange={v => { if (!v && !deletePending) setDeleteTx(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Adjustment?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will reverse <span className="font-semibold text-foreground">
              {deleteTx && (deleteTx.amount >= 0 ? '+' : '')}{deleteTx?.amount} pts
            </span> from this member&apos;s total. Cannot be undone.
          </p>
          <DialogFooter className="flex-row justify-end gap-2 mt-2">
            <button type="button" onClick={() => setDeleteTx(null)} disabled={deletePending}
              className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <button type="button" onClick={submitDelete} disabled={deletePending}
              className={cn(buttonVariants(), 'bg-destructive text-white hover:bg-destructive/90')}>
              {deletePending ? 'Deleting…' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
