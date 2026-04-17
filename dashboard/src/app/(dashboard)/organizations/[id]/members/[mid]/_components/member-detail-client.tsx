'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Crown, Shield, CheckCircle2, XCircle, Clock,
  SlidersHorizontal, Eye, Loader2, ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AdjustPointsModal } from '@/components/adjust-points-modal'
import { approveMemberSubmission, rejectMemberSubmission, getProofSignedUrl } from '../actions'
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

// ── Main Client Component ─────────────────────────────────────────────────────

interface Props {
  member: MemberDetailAdmin
  orgId: string
  adjustMember: OrgMemberForAdjust
}

export function MemberDetailClient({ member, orgId, adjustMember }: Props) {
  const [submissions, setSubmissions] = useState(member.submissions)
  const [reviewSub, setReviewSub] = useState<Submission | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)

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

        {/* Task submissions */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-heading text-base text-foreground">Task Submissions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{submissions.length} submissions total</p>
          </div>

          {submissions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No submissions yet.
            </div>
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
                  return (
                    <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">{sub.taskTitle}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs hidden sm:table-cell">{sub.challenge}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-muted-foreground">WK{sub.week}</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs hidden md:table-cell">{sub.submittedDate}</td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.className)}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {sub.pointsAwarded > 0
                          ? <span className="font-semibold text-foreground">🥦 {sub.pointsAwarded}</span>
                          : <span className="text-muted-foreground/40 text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right">
                        {sub.status === 'pending' ? (
                          <button
                            type="button"
                            onClick={() => setReviewSub(sub)}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 text-xs h-7')}
                          >
                            <Eye className="w-3 h-3" /> Review
                          </button>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
