'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import { addManualAdjustment } from '../actions'
import type { OrgMemberForAdjust } from '@/lib/supabase/admin-queries'

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

interface Props {
  orgId: string
  members: OrgMemberForAdjust[]
}

export function AdjustClient({ orgId, members }: Props) {
  const router = useRouter()
  const [userId, setUserId]   = useState('')
  const [amount, setAmount]   = useState('')
  const [reason, setReason]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { toast.error('Please select a member.'); return }
    const pts = parseInt(amount)
    if (!Number.isFinite(pts) || pts === 0) { toast.error('Enter a non-zero integer amount.'); return }
    if (!reason.trim()) { toast.error('Reason is required.'); return }

    setSubmitting(true)
    const result = await addManualAdjustment(orgId, userId, pts, reason)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Points adjustment saved.')
      setUserId('')
      setAmount('')
      setReason('')
      router.push(`/organizations/${orgId}/points`)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href={`/organizations/${orgId}/points`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-3 text-muted-foreground')}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Points
        </Link>
        <h1 className="font-heading text-2xl text-foreground">Manual Points Adjustment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add or remove points for a member. A record of this adjustment will appear in their breakdown.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {/* Member select */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</label>
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
            Reason <span className="font-normal normal-case text-muted-foreground">(required — shown in breakdown)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Bonus for event attendance, Points deduction for rule violation…"
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
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Adjustment
        </button>
      </form>
    </div>
  )
}
