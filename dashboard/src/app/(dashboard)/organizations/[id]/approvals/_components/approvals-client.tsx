'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2, XCircle, ImageIcon, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  X, Search, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { approveSubmission, rejectSubmission, getProofSignedUrl } from '../actions'
import type { OrgApproval } from '@/lib/supabase/admin-queries'

// ── DatePicker ────────────────────────────────────────────────────────────────

function DatePicker({ value, onChange, placeholder = 'Pick a date' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const today = new Date()
  const selected = value ? new Date(value + 'T12:00:00') : null
  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<DOMRect | null>(null)
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (value) { const d = new Date(value + 'T12:00:00'); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || portalRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() { if (!open && buttonRef.current) setDropRect(buttonRef.current.getBoundingClientRect()); setOpen(v => !v) }
  function selectDay(year: number, month: number, day: number) {
    const d = new Date(year, month, day)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    setOpen(false)
  }
  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const openUp = dropRect ? window.innerHeight - dropRect.bottom < 300 : false
  const flipLeft = dropRect ? dropRect.left + 256 > window.innerWidth : false
  const dropStyle: React.CSSProperties = dropRect ? {
    position: 'fixed', zIndex: 9999,
    ...(openUp ? { bottom: window.innerHeight - dropRect.top + 4 } : { top: dropRect.bottom + 4 }),
    ...(flipLeft ? { right: window.innerWidth - dropRect.right } : { left: dropRect.left }),
  } : {}
  const displayValue = selected ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <div className="sm:w-44">
      <button ref={buttonRef} type="button" onClick={handleOpen} className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm text-left hover:border-primary/40 transition-colors">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className={cn('flex-1 truncate', displayValue ? 'text-foreground' : 'text-muted-foreground')}>{displayValue || placeholder}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && dropRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div ref={portalRef} className="bg-popover border border-border rounded-xl shadow-xl p-3 w-64" style={dropStyle}>
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-semibold text-foreground">{monthNames[viewMonth]} {viewYear}</span>
              <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 mb-1">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const thisDate = new Date(viewYear, viewMonth, day)
                const isToday = thisDate.toDateString() === today.toDateString()
                const isSelected = selected ? thisDate.toDateString() === selected.toDateString() : false
                return (
                  <button key={day} type="button" onClick={() => selectDay(viewYear, viewMonth, day)} className={cn('h-7 w-7 mx-auto rounded-lg text-xs font-medium transition-colors', isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'border border-primary text-primary hover:bg-primary/10' : 'hover:bg-accent text-foreground')}>
                    {day}
                  </button>
                )
              })}
            </div>
            {value && <div className="mt-2 pt-2 border-t border-border"><button type="button" onClick={() => { onChange(''); setOpen(false) }} className="text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors">Clear date</button></div>}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// ── Proof image viewer ────────────────────────────────────────────────────────

function ProofViewer({ proofUrl }: { proofUrl: string | null }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  // 'loading' | 'loaded' | 'error' | 'none'
  const [state, setState] = useState<'loading' | 'loaded' | 'error' | 'none'>('none')

  useEffect(() => {
    if (!proofUrl) { setState('none'); return }
    setState('loading')
    setSignedUrl(null)
    getProofSignedUrl(proofUrl).then(url => {
      if (url) { setSignedUrl(url); setState('loaded') }
      else setState('error')
    })
  }, [proofUrl])

  return (
    // Fixed-height container — height never changes, no dialog resize
    <div className="relative rounded-lg bg-muted h-56 overflow-hidden flex items-center justify-center">
      {/* Shimmer while fetching the signed URL */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground/10 to-muted animate-pulse" />
          <Loader2 className="relative w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No proof uploaded */}
      {state === 'none' && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8" />
          <span className="text-xs">No proof image uploaded.</span>
        </div>
      )}

      {/* Could not load */}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8" />
          <span className="text-xs">Could not load proof image.</span>
        </div>
      )}

      {/* Image — crossfades in once the URL resolves */}
      {signedUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signedUrl}
          alt="Submission proof"
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
          style={{ opacity: state === 'loaded' ? 1 : 0 }}
          onLoad={() => setState('loaded')}
        />
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

interface Props {
  orgId: string
  initialApprovals: OrgApproval[]
}

export function ApprovalsClient({ orgId, initialApprovals }: Props) {
  const [approvals, setApprovals]         = useState<OrgApproval[]>(initialApprovals)
  const [reviewTarget, setReviewTarget]   = useState<OrgApproval | null>(null)
  const [adminNotes, setAdminNotes]       = useState('')
  const [pointsOverride, setPointsOverride] = useState('')
  const [showReviewed, setShowReviewed]   = useState(true)
  const [submitting, setSubmitting]       = useState(false)

  // Filters
  const [search, setSearch]         = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  const teams = useMemo(
    () => Array.from(new Set(approvals.map(a => a.teamName))).sort(),
    [approvals]
  )

  function applyFilters(list: OrgApproval[]) {
    return list.filter(a => {
      if (search && !a.member.toLowerCase().includes(search.toLowerCase())) return false
      if (teamFilter !== 'all' && a.teamName !== teamFilter) return false
      if (dateFilter && a.submittedDate !== dateFilter) return false
      return true
    })
  }

  const allPending  = approvals.filter(a => a.status === 'pending')
  const allReviewed = approvals.filter(a => a.status !== 'pending')
  const pending  = applyFilters(allPending)
  const reviewed = applyFilters(allReviewed)
  const hasActiveFilter = !!(search || teamFilter !== 'all' || dateFilter)

  function openReview(a: OrgApproval) { setReviewTarget(a); setAdminNotes(''); setPointsOverride('') }
  function closeReview() { setReviewTarget(null) }

  async function handleApprove() {
    if (!reviewTarget) return
    setSubmitting(true)
    const pts = pointsOverride ? parseInt(pointsOverride) : null
    const result = await approveSubmission(reviewTarget.id, orgId, pts)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Submission approved.')
      setApprovals(prev => prev.map(a => a.id === reviewTarget.id
        ? { ...a, status: 'approved' as const, pointsAwarded: pts ?? a.taskPoints }
        : a
      ))
      closeReview()
    }
    setSubmitting(false)
  }

  async function handleReject() {
    if (!reviewTarget) return
    setSubmitting(true)
    const result = await rejectSubmission(reviewTarget.id, orgId, adminNotes)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Submission rejected.')
      setApprovals(prev => prev.map(a => a.id === reviewTarget.id
        ? { ...a, status: 'rejected' as const, rejectionReason: adminNotes || null }
        : a
      ))
      closeReview()
    }
    setSubmitting(false)
  }

  async function handleRevoke() {
    if (!reviewTarget) return
    setSubmitting(true)
    const result = await rejectSubmission(reviewTarget.id, orgId, adminNotes || 'Approval revoked.')
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Approval revoked.')
      setApprovals(prev => prev.map(a => a.id === reviewTarget.id
        ? { ...a, status: 'rejected' as const, rejectionReason: adminNotes || 'Approval revoked.' }
        : a
      ))
      closeReview()
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {allPending.length} pending · {allReviewed.length} reviewed
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search by member name…" value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'pl-8')} />
        </div>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={cn(inputCls, 'sm:w-44')}>
          <option value="all">All Teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <DatePicker value={dateFilter} onChange={setDateFilter} placeholder="Filter by date" />
        {hasActiveFilter && (
          <button onClick={() => { setSearch(''); setTeamFilter('all'); setDateFilter('') }} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 text-muted-foreground')}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </button>
        )}
      </div>

      {/* Pending */}
      {pending.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="font-medium text-foreground">{hasActiveFilter ? 'No matching pending submissions.' : 'All caught up!'}</p>
          <p className="text-sm text-muted-foreground mt-1">{hasActiveFilter ? 'Try adjusting your filters.' : 'No pending submissions to review.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Pending ({pending.length})</h2>
          {pending.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {a.member.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {a.member}<span className="text-muted-foreground font-normal"> · {a.teamName}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">&ldquo;{a.taskTitle}&rdquo; · {a.taskPoints} 🥦 pts · {a.submittedAt}</p>
              </div>
              <button onClick={() => openReview(a)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 gap-1.5')}>
                <ImageIcon className="w-3.5 h-3.5" /> Review Submission
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reviewed */}
      {allReviewed.length > 0 && (
        <div className="space-y-3">
          <button onClick={() => setShowReviewed(v => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            {showReviewed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Recently Reviewed ({reviewed.length}{hasActiveFilter && reviewed.length !== allReviewed.length ? ` of ${allReviewed.length}` : ''})
          </button>
          {showReviewed && (
            reviewed.length === 0
              ? <p className="text-sm text-muted-foreground py-2">No reviewed submissions match your filters.</p>
              : reviewed.map(a => (
                <div key={a.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4 opacity-70">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                    {a.member.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{a.member}<span className="text-muted-foreground font-normal"> · {a.teamName}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">&ldquo;{a.taskTitle}&rdquo; · {a.submittedAt}</p>
                    {a.rejectionReason && <p className="text-xs text-destructive mt-1">Reason: {a.rejectionReason}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => openReview(a)} className="text-xs text-primary hover:underline whitespace-nowrap">Review Submission</button>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', a.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Review Modal */}
      <Dialog open={!!reviewTarget} onOpenChange={v => { if (!v) closeReview() }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden" showCloseButton={false}>
          {reviewTarget && (
            <>
              <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-base font-semibold">Review Submission</DialogTitle>
                  <button onClick={closeReview} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
                </div>
              </DialogHeader>

              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary shrink-0">
                    {reviewTarget.member.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reviewTarget.member}</p>
                    <p className="text-xs text-muted-foreground">🥦 {reviewTarget.teamName} · {reviewTarget.submittedAt}</p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{reviewTarget.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">{reviewTarget.taskDescription}</p>
                  <p className="text-xs text-primary font-medium">Standard: 🥦 {reviewTarget.taskPoints} pts</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submitted Proof</p>
                  <ProofViewer proofUrl={reviewTarget.proofUrl} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adminNotes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Admin Notes <span className="font-normal normal-case">(optional)</span>
                  </Label>
                  <textarea id="adminNotes" rows={2} placeholder="Add a note for your records or to send to the member..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pointsOverride" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Points Override <span className="font-normal normal-case">(optional)</span>
                  </Label>
                  <input id="pointsOverride" type="number" min={0} placeholder={`Default: ${reviewTarget.taskPoints} pts`} value={pointsOverride} onChange={e => setPointsOverride(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-border">
                {reviewTarget.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button disabled={submitting} onClick={handleReject} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 border-destructive text-destructive hover:bg-destructive/10')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1.5" /> Reject</>}
                    </button>
                    <button disabled={submitting} onClick={handleApprove} className={cn(buttonVariants(), 'flex-1')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve</>}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button disabled={submitting} onClick={handleApprove} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Re-approve with Override Points'}
                    </button>
                    <button disabled={submitting} onClick={handleRevoke} className={cn(buttonVariants(), 'flex-1 bg-destructive hover:bg-destructive/90')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revoke Approval'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
