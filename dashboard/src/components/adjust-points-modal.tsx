'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { addManualAdjustment } from '@/app/(dashboard)/organizations/[id]/points/adjust/actions'
import type { OrgMemberForAdjust } from '@/lib/supabase/admin-queries'

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

interface Props {
  orgId: string
  members: OrgMemberForAdjust[]
  /** Pre-select a member. Pass together with lockMember to prevent changing. */
  defaultUserId?: string
  lockMember?: boolean
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AdjustPointsModal({
  orgId,
  members,
  defaultUserId,
  lockMember,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [userId, setUserId] = useState(defaultUserId ?? '')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Sync userId when defaultUserId changes (e.g. modal re-opened for different member)
  useEffect(() => {
    if (open) setUserId(defaultUserId ?? '')
  }, [open, defaultUserId])

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setAmount('')
      setReason('')
      if (!lockMember) setUserId('')
      onClose()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { toast.error('Please select a member.'); return }
    const pts = parseInt(amount, 10)
    if (!Number.isFinite(pts) || pts === 0) { toast.error('Enter a non-zero integer amount.'); return }
    if (!reason.trim()) { toast.error('Reason is required.'); return }

    setSubmitting(true)
    const result = await addManualAdjustment(orgId, userId, pts, reason)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Points adjustment saved.')
      setAmount('')
      setReason('')
      if (!lockMember) setUserId('')
      onSuccess?.()
      onClose()
    }
  }

  const lockedMember = lockMember ? members.find(m => m.id === defaultUserId) : undefined

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Points Adjustment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Member */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</label>
            {lockedMember ? (
              <div className={cn(inputCls, 'bg-muted/40 text-foreground select-none')}>
                {lockedMember.name}
                {lockedMember.teamName !== 'Unassigned' && (
                  <span className="text-muted-foreground"> — {lockedMember.teamName}</span>
                )}
              </div>
            ) : (
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                required
                className={cn(inputCls, !userId && 'text-muted-foreground')}
              >
                <option value="">Select a member…</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.teamName}</option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Points Amount{' '}
              <span className="font-normal normal-case text-muted-foreground">(positive = add, negative = remove)</span>
            </label>
            <input
              type="number"
              placeholder="e.g. 50 or -20"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className={inputCls}
            />
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Reason{' '}
              <span className="font-normal normal-case text-muted-foreground">(required — shown in breakdown)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Bonus for event attendance, deduction for rule violation…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={cn(buttonVariants(), 'w-full')}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Adjustment
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
