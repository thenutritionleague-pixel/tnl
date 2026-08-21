'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2, XCircle, ImageIcon, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  X, Search, Calendar, Sparkles, ListFilter, Eye,
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
import { approveSubmission, rejectSubmission, allowResubmit, getProofSignedUrl, loadApprovalsPage, loadApprovalCounts, loadOrgTaskBreakdown, getDuplicateMatch, getPipelineHealth, getIdentityReferences, type DuplicateMatch, type PipelineHealth, type IdentityReference } from '../actions'
import { runAiAnalysis, getSubmissionAiStatus } from '../ai-actions'
import type { OrgApproval, PreviousSubmission, OrgTaskBreakdown } from '@/lib/supabase/admin-queries'

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
  const [state, setState] = useState<'loading' | 'loaded' | 'error' | 'unsupported' | 'none'>('none')

  const isVideo = !!proofUrl && (
    proofUrl.startsWith('bunny://') ||
    /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(proofUrl)
  )
  const isHeic = !!proofUrl && /\.heic$|\.heif$/i.test(proofUrl)

  useEffect(() => {
    if (!proofUrl) { setState('none'); return }
    if (isHeic) { setState('unsupported'); return }
    setState('loading')
    setSignedUrl(null)
    getProofSignedUrl(proofUrl).then(url => {
      if (url) setSignedUrl(url)
      else setState('error')
    })
  }, [proofUrl, isHeic])

  return (
    <div className="relative rounded-lg bg-muted h-56 overflow-hidden flex items-center justify-center">
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground/10 to-muted animate-pulse" />
          <Loader2 className="relative w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === 'none' && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8" />
          <span className="text-xs">No proof uploaded.</span>
        </div>
      )}
      {state === 'unsupported' && signedUrl == null && proofUrl && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
          <ImageIcon className="w-8 h-8" />
          <span className="text-xs font-semibold">Unsupported format ({proofUrl.split('.').pop()?.toUpperCase()})</span>
          <span className="text-[11px]">The member uploaded a HEIC photo. Browsers can&apos;t render this format.</span>
          <button type="button" className="text-xs text-primary hover:underline" onClick={async () => { const url = await getProofSignedUrl(proofUrl); if (url) window.open(url, '_blank') }}>Download to view →</button>
        </div>
      )}
      {state === 'error' && proofUrl?.startsWith('bunny://') && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-semibold">Video is being processed</span>
          <span className="text-[11px]">Bunny is transcoding this video (usually 30-90 seconds). Reopen this review in a moment.</span>
        </div>
      )}
      {state === 'error' && !proofUrl?.startsWith('bunny://') && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
          <ImageIcon className="w-8 h-8" />
          <span className="text-xs font-semibold">Could not load proof</span>
          <span className="text-[11px]">URL may have expired. Close and reopen this review.</span>
        </div>
      )}
      {signedUrl && isVideo && state !== 'unsupported' && (
        <video src={signedUrl} controls preload="metadata" playsInline className="absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300" style={{ opacity: state === 'loaded' ? 1 : 0 }} onLoadedMetadata={() => setState('loaded')} onError={() => setState('error')} />
      )}
      {signedUrl && !isVideo && state !== 'unsupported' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt="Submission proof" className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: state === 'loaded' ? 1 : 0 }} onLoad={() => setState('loaded')} onError={() => setState('error')} />
      )}
    </div>
  )
}

// ── Previous Submissions History ──────────────────────────────────────────────

function SubmissionHistory({ submissions }: { submissions?: PreviousSubmission[] }) {
  const [expanded, setExpanded] = useState(false)
  const [viewingProof, setViewingProof] = useState<string | null>(null)

  if (!submissions || submissions.length === 0) return null

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Previous Attempts ({submissions.length})
      </button>
      {expanded && (
        <div className="space-y-2">
          {submissions.map(p => (
            <div key={p.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full capitalize', p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : p.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>{p.status}</span>
                  <span className="text-xs text-muted-foreground">{p.submittedAt}</span>
                  {p.pointsAwarded != null && p.status === 'approved' && <span className="text-xs text-primary font-medium">🥦 {p.pointsAwarded} pts</span>}
                </div>
                {p.rejectionReason && <p className="text-xs text-destructive mt-1">Reason: {p.rejectionReason}</p>}
              </div>
              {p.proofUrl && (
                <button type="button" onClick={() => setViewingProof(viewingProof === p.id ? null : p.id)} className="text-xs text-primary hover:underline shrink-0">
                  {viewingProof === p.id ? 'Hide' : 'View Proof'}
                </button>
              )}
            </div>
          ))}
          {viewingProof && (() => { const sub = submissions.find(p => p.id === viewingProof); return sub?.proofUrl ? <ProofViewer proofUrl={sub.proofUrl} /> : null })()}
        </div>
      )}
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid items-center px-4 py-3.5 animate-pulse" style={{ gridTemplateColumns: '2fr 3fr 110px 110px 80px' }}>
      <div className="flex items-center gap-3 pr-3">
        <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 bg-muted rounded w-28" />
          <div className="h-2.5 bg-muted rounded w-20" />
        </div>
      </div>
      <div className="space-y-1.5 pr-3">
        <div className="h-3 bg-muted rounded w-40" />
        <div className="h-2.5 bg-muted rounded w-16" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-muted rounded w-14" />
        <div className="h-2.5 bg-muted rounded w-10" />
      </div>
      <div><div className="h-5 bg-muted rounded-full w-16" /></div>
      <div className="flex justify-end"><div className="h-7 bg-muted rounded-lg w-16" /></div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'All'      },
  { value: 'pending',  label: 'Pending'  },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function fmtShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusBadge({ status }: { status: OrgApproval['status'] }) {
  if (status === 'approved') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Approved</span>
  if (status === 'rejected') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">Rejected</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
}

interface Props {
  orgId: string
  initialApprovals: OrgApproval[]
  initialHasMore: boolean
  initialTasks: Array<{ id: string; title: string }>
  initialCounts?: { pending: number; approved: number; rejected: number; rejectedEver: number }
  initialTaskBreakdown?: OrgTaskBreakdown[]
}

export function ApprovalsClient({ orgId, initialApprovals, initialHasMore, initialTasks, initialCounts, initialTaskBreakdown }: Props) {
  const [approvals, setApprovals]       = useState<OrgApproval[]>(initialApprovals)
  const [hasMore, setHasMore]           = useState(initialHasMore)
  const [loading, setLoading]           = useState(false)
  const [currentPage, setCurrentPage]   = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [reviewTarget, setReviewTarget] = useState<OrgApproval | null>(null)
  const [adminNotes, setAdminNotes]     = useState('')
  const [pointsOverride, setPointsOverride] = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [fadingIds, setFadingIds]       = useState<Set<string>>(new Set())
  const [counts, setCounts]             = useState(initialCounts ?? { pending: 0, approved: 0, rejected: 0, rejectedEver: 0 })
  const [taskBreakdown, setTaskBreakdown] = useState<OrgTaskBreakdown[]>(initialTaskBreakdown ?? [])

  const [search, setSearch]         = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [taskFilter, setTaskFilter] = useState('all')
  const [manualOnly, setManualOnly] = useState(false)
  // "AI disagreed" — admin overrode AI verdict (server-side filter).
  const [aiDisagreed, setAiDisagreed] = useState(false)
  // "Needs attention" — server-side filter for the submissions the AI could not
  // settle on its own (handed to a human, escalated after a suspected fake, or
  // decided with little/no confidence). Turns a 1,000-row day into a short queue.
  const [needsAttention, setNeedsAttention] = useState(false)

  const tasks = initialTasks
  const teams = useMemo(() => Array.from(new Set(approvals.map(a => a.teamName))).sort(), [approvals])

  async function loadPage(page: number, status: StatusFilter, date?: string, taskId?: string, searchTerm?: string, disagreed = false, attention = false) {
    setLoading(true)
    const s = (status === 'pending' || status === 'approved' || status === 'rejected') ? status : undefined
    const res = await loadApprovalsPage(orgId, page, s, date || undefined, taskId || undefined, searchTerm || undefined, disagreed, attention)
    if (res) {
      setApprovals(res.approvals)
      setHasMore(res.hasMore)
      setCurrentPage(page)
    }
    setLoading(false)
  }

  // Debounce search so we don't fire a request on every keystroke.
  // Two-character minimum (matches the server-side check) keeps queries cheap.
  useEffect(() => {
    const handle = setTimeout(() => {
      loadPage(0, statusFilter, dateFilter || undefined, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, needsAttention)
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function refreshCounts() {
    const [c, b] = await Promise.all([loadApprovalCounts(orgId), loadOrgTaskBreakdown(orgId)])
    if (c) setCounts(c)
    if (b) setTaskBreakdown(b)
  }

  function handleStatusChange(s: StatusFilter) {
    setStatusFilter(s)
    setSearch(''); setTeamFilter('all'); setDateFilter(''); setTaskFilter('all'); setManualOnly(false); setAiDisagreed(false); setNeedsAttention(false)
    loadPage(0, s)
    refreshCounts()
  }

  function handleDateChange(d: string) {
    setDateFilter(d)
    loadPage(0, statusFilter, d, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, needsAttention)
  }

  function handleTaskChange(t: string) {
    setTaskFilter(t)
    loadPage(0, statusFilter, dateFilter || undefined, t !== 'all' ? t : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, needsAttention)
  }

  function handleNeedsAttentionToggle() {
    const next = !needsAttention
    setNeedsAttention(next)
    loadPage(0, statusFilter, dateFilter || undefined, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, next)
  }

  function handleAiDisagreedToggle() {
    const next = !aiDisagreed
    setAiDisagreed(next)
    loadPage(0, statusFilter, dateFilter || undefined, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, next, needsAttention)
  }

  function clearAllFilters() {
    const needsReload = !!(dateFilter || (taskFilter !== 'all') || aiDisagreed || needsAttention)
    setSearch(''); setTeamFilter('all'); setManualOnly(false); setDateFilter(''); setTaskFilter('all'); setAiDisagreed(false); setNeedsAttention(false)
    if (needsReload) loadPage(0, statusFilter)
  }

  const modalScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (reviewTarget) modalScrollRef.current?.scrollTo({ top: 0 }); setConfirmResubmit(false) }, [reviewTarget?.id])

  // Two-step so a mis-click cannot wipe a member's submission and points.
  const [confirmResubmit, setConfirmResubmit] = useState(false)
  const [aiChecking, setAiChecking]   = useState(false)
  const [dupMatch, setDupMatch] = useState<DuplicateMatch | 'loading' | null>(null)
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [idRefs, setIdRefs] = useState<IdentityReference[] | 'loading' | null>(null)

  // Polled rather than derived from the page, because the answer depends on the
  // whole queue and on how long the video service has been behind, not on the
  // 50 rows currently displayed.
  useEffect(() => {
    let alive = true
    const tick = () => { getPipelineHealth(orgId).then(h => { if (alive) setHealth(h) }).catch(() => {}) }
    tick()
    const t = setInterval(tick, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [orgId])

  // Evidence for a duplicate flag. Loaded on demand rather than with the queue:
  // it downloads both images to compare bytes, which is far too expensive to do
  // for every row up front.
  // The earlier videos the identity check compared against. Loaded on demand:
  // it signs Bunny URLs, which is wasted work on every other row.
  async function loadIdentityRefs(a: OrgApproval) {
    setIdRefs('loading')
    const refs = await getIdentityReferences(a.id)
    setIdRefs(refs)
  }

  async function loadDuplicate(a: OrgApproval) {
    setDupMatch('loading')
    const m = await getDuplicateMatch(a.id)
    setDupMatch(m ?? null)
  }

  // Poll the DB until AI analysis finishes. Analysis runs in the background
  // (fire-and-forget), and video can take up to ~6 min, so we can't hold the
  // trigger request open — we poll for the verdict instead.
  async function pollAiResult(
    submissionId: string,
    timeoutMs = 240_000,
  ): Promise<{ aiStatus: string; aiFeedback: string; aiConfidence: number } | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const s = await getSubmissionAiStatus(submissionId)
      if (s && s.aiStatus && s.aiStatus !== 'analyzing') {
        return { aiStatus: s.aiStatus, aiFeedback: s.aiFeedback, aiConfidence: s.aiConfidence }
      }
    }
    return null
  }

  async function runAiChecks() {
    const toAnalyze = approvals.filter(a => a.status === 'pending' && a.aiStatus !== 'analyzing')
    if (toAnalyze.length === 0) { toast.info('No pending submissions to analyze.'); return }
    setAiChecking(true)
    setApprovals(prev => prev.map(a => toAnalyze.some(t => t.id === a.id) ? { ...a, aiStatus: 'analyzing' } : a))
    await Promise.all(toAnalyze.map(async a => {
      const triggered = await runAiAnalysis(a.id)
      if (!triggered) return
      const res = await pollAiResult(a.id)
      if (!res) return
      setApprovals(prev => prev.map(x => {
        if (x.id !== a.id) return x
        return {
          ...x,
          aiStatus: res.aiStatus, aiFeedback: res.aiFeedback, aiConfidence: res.aiConfidence,
          ...(res.aiStatus === 'approved' ? { status: 'approved' as const, pointsAwarded: x.pointsAwarded ?? x.taskPoints } : {}),
          ...(res.aiStatus === 'rejected' ? { status: 'rejected' as const, rejectionReason: res.aiFeedback || 'Rejected by AI review.' } : {}),
        }
      }))
    }))
    setAiChecking(false)
    toast.success('AI checks complete.')
  }

  async function handleReanalyze(a: OrgApproval) {
    const priorAi = { aiStatus: a.aiStatus, aiFeedback: a.aiFeedback, aiConfidence: a.aiConfidence }
    const patch = { aiStatus: 'analyzing', aiFeedback: null as string | null, aiConfidence: null as number | null }
    setApprovals(prev => prev.map(x => x.id === a.id ? { ...x, ...patch } : x))
    setReviewTarget(t => t?.id === a.id ? { ...t, ...patch } : t)
    const triggered = await runAiAnalysis(a.id, true)
    if (!triggered) {
      setApprovals(prev => prev.map(x => x.id === a.id ? { ...x, ...priorAi } : x))
      setReviewTarget(t => t?.id === a.id ? { ...t, ...priorAi } : t)
      toast.error('Could not start re-analysis — see edge function logs for details.')
      return
    }
    const res = await pollAiResult(a.id)
    if (!res) {
      // Still analyzing after the timeout — the edge fn will finish in the
      // background; the verdict shows on next open/refresh.
      toast.info('Still analyzing — this video is taking a while. The result will appear shortly.')
      return
    }
    const update = { aiStatus: res.aiStatus, aiFeedback: res.aiFeedback, aiConfidence: res.aiConfidence }
    setApprovals(prev => prev.map(x => {
      if (x.id !== a.id) return x
      return { ...x, ...update, ...(res.aiStatus === 'approved' ? { status: 'approved' as const, pointsAwarded: x.pointsAwarded ?? x.taskPoints } : {}), ...(res.aiStatus === 'rejected' ? { status: 'rejected' as const, rejectionReason: res.aiFeedback || 'Rejected by AI review.' } : {}) }
    }))
    setReviewTarget(t => t?.id === a.id ? { ...t, ...update } : t)
  }

  function fadeOutRow(id: string) {
    setFadingIds(prev => new Set(prev).add(id))
    setTimeout(() => {
      setApprovals(prev => prev.filter(a => a.id !== id))
      setFadingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }, 280)
  }

  const filtered = useMemo(() => approvals.filter(a => {
    // member search is server-side now (see loadPage), but a fast client-side
    // pass also runs to narrow further within the loaded page.
    if (search && !a.member.toLowerCase().includes(search.toLowerCase())) return false
    if (teamFilter !== 'all' && a.teamName !== teamFilter) return false
    if (manualOnly && !(a.status === 'approved' && a.aiStatus !== 'approved')) return false
    return true
  }), [approvals, search, teamFilter, manualOnly])

  const hasActiveFilter = !!(search || teamFilter !== 'all' || dateFilter || taskFilter !== 'all' || manualOnly || aiDisagreed || needsAttention)

  function openReview(a: OrgApproval) {
    setReviewTarget(a)
    setAdminNotes('')
    // Clear the previous row's comparison, or one member's photos would appear
    // as evidence against another's.
    setDupMatch(null)
    setIdRefs(null)
    if (a.selectedTier) {
      setPointsOverride(String(a.selectedTier.points))
    } else if (a.taskPointsTiers && a.selectedTierIndex != null && a.taskPointsTiers[a.selectedTierIndex]) {
      setPointsOverride(String(a.taskPointsTiers[a.selectedTierIndex].points))
    } else {
      setPointsOverride('')
    }
  }
  function closeReview() { setReviewTarget(null); setDupMatch(null); setIdRefs(null) }

  async function handleApprove() {
    if (!reviewTarget) return
    setSubmitting(true)
    const pts = pointsOverride !== '' ? Number(pointsOverride) : null
    if (pts !== null && (!Number.isFinite(pts) || pts < 0)) { toast.error('Invalid points value'); setSubmitting(false); return }
    const result = await approveSubmission(reviewTarget.id, orgId, pts)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Submission approved.')
      fadeOutRow(reviewTarget.id)
      closeReview()
      refreshCounts()
    }
    setSubmitting(false)
  }

  async function handleReject() {
    if (!reviewTarget) return
    // Rolling back an APPROVED submission takes points the member already saw,
    // so they are owed an explanation. Without one they get "Approval rolled
    // back by admin.", which tells them nothing — two members are looking at
    // exactly that. A fresh rejection is different: the AI has usually written
    // a specific reason already.
    if (reviewTarget.status === 'approved' && !adminNotes.trim()) {
      toast.error('Add a reason — the member sees this, and their points are being taken back.')
      return
    }
    setSubmitting(true)
    const fallback = reviewTarget.status === 'approved' ? 'Approval rolled back by admin.' : ''
    const reason = adminNotes || fallback
    const result = await rejectSubmission(reviewTarget.id, orgId, reason)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(reviewTarget.status === 'approved' ? 'Submission rejected. Points refunded.' : 'Submission rejected.')
      fadeOutRow(reviewTarget.id)
      closeReview()
      refreshCounts()
    }
    setSubmitting(false)
  }

  async function handleAllowResubmit() {
    if (!reviewTarget) return
    setSubmitting(true)
    const result = await allowResubmit(reviewTarget.id, orgId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Cleared. ${reviewTarget.member} can submit this task again today.`)
      fadeOutRow(reviewTarget.id)
      setConfirmResubmit(false)
      closeReview()
      refreshCounts()
    }
    setSubmitting(false)
  }

  // Tab count label — real DB totals; 'all' = sum of current statuses.
  function tabLabel(tab: typeof STATUS_TABS[number]) {
    let n: number | null = null
    if (tab.value === 'all')       n = counts.pending + counts.approved + counts.rejected
    else if (tab.value === 'pending')  n = counts.pending
    else if (tab.value === 'approved') n = counts.approved
    else if (tab.value === 'rejected') n = counts.rejected
    if (n == null || n <= 0) return tab.label
    return `${tab.label} (${n.toLocaleString()})`
  }

  return (
    <div className="space-y-5">
      {/* Says WHY the queue looks the way it does. "N pending" alone sent an
          admin looking for help on 20 Aug when the real answer was that the
          video service was hours behind and members were never at risk. */}
      {health && (health.level !== 'healthy' || health.pending > 0) && (
        <div className={cn('rounded-lg border px-4 py-3 flex items-start gap-3',
          health.level === 'degraded' ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30' :
          health.level === 'busy' ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' :
          'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
        )}>
          <span className="text-lg leading-none mt-0.5 shrink-0">
            {health.level === 'degraded' ? '\u26D4' : health.level === 'busy' ? '\u23F3' : '\u2705'}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold',
              health.level === 'degraded' ? 'text-red-800 dark:text-red-300' :
              health.level === 'busy' ? 'text-amber-900 dark:text-amber-300' :
              'text-emerald-800 dark:text-emerald-300'
            )}>{health.headline}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{health.detail}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground tabular-nums">
              <span><strong className="text-foreground">{health.videoPending}</strong> videos waiting</span>
              <span><strong className="text-foreground">{health.photoPending}</strong> photos waiting</span>
              <span><strong className="text-foreground">{health.needsReview}</strong> need your decision</span>
              <span>oldest <strong className="text-foreground">{health.oldestMins}m</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${approvals.length} ${statusFilter === 'all' ? 'total' : statusFilter} on this page`}
          </p>
        </div>
        <button
          onClick={runAiChecks}
          disabled={aiChecking || statusFilter !== 'pending' || approvals.length === 0}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 gap-1.5 border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-50')}
        >
          {aiChecking ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</> : <><Sparkles className="w-3.5 h-3.5" /> Run AI Checks</>}
        </button>
      </div>

      {/* Per-task breakdown — click a card to filter to that task.
          ≤4 tasks → responsive grid that fills the row. >4 tasks → horizontally
          scrollable strip with snap so the layout never explodes vertically. */}
      {taskBreakdown.length > 0 && (
        (() => {
          const many = taskBreakdown.length > 4
          return (
            <div className={cn(
              'gap-2.5',
              many
                ? 'flex overflow-x-auto pb-1 snap-x snap-mandatory -mx-1 px-1'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
            )}>
              {taskBreakdown.map(t => {
                const isSelected = taskFilter === t.taskId
                return (
                  <button
                    key={t.taskId}
                    type="button"
                    onClick={() => handleTaskChange(isSelected ? 'all' : t.taskId)}
                    className={cn(
                      'text-left rounded-xl border bg-card px-4 py-3 transition-all hover:border-primary/40 hover:shadow-sm',
                      many && 'snap-start shrink-0 w-[260px]',
                      isSelected ? 'border-primary shadow-sm ring-2 ring-primary/20' : 'border-border',
                    )}
                  >
                    <p className="text-xs font-semibold text-foreground truncate mb-1.5" title={t.title}>{t.title}</p>
                    <div className="flex items-baseline gap-1.5 mb-2">
                      <span className="text-xl font-bold text-foreground">{t.total.toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground">total</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      {t.pending > 0 && (
                        <span className="text-amber-700"><span className="font-semibold">{t.pending}</span> pending</span>
                      )}
                      <span className="text-emerald-700"><span className="font-semibold">{t.approved}</span> approved</span>
                      {t.rejected > 0 && (
                        <span className="text-red-600"><span className="font-semibold">{t.rejected}</span> rejected</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })()
      )}

      {/* Status tabs + filters */}
      <div className="space-y-2.5">
        {/* Status tabs */}
        <div className="flex items-center bg-muted rounded-xl p-1 gap-0.5 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                statusFilter === tab.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex gap-2 flex-wrap">
          {/* Search */}
          <div className="relative min-w-44 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search member…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(inputCls, 'pl-8')}
            />
          </div>

          {/* Task filter */}
          <div className="relative sm:w-52">
            <ListFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={taskFilter}
              onChange={e => handleTaskChange(e.target.value)}
              className={cn(inputCls, 'pl-8 appearance-none')}
            >
              <option value="all">All Tasks</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          {/* Team filter */}
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={cn(inputCls, 'sm:w-40')}>
            <option value="all">All Teams</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Date filter */}
          <DatePicker value={dateFilter} onChange={handleDateChange} placeholder="Filter by date" />

          {/* Manual-only toggle */}
          {statusFilter !== 'pending' && (
            <button
              type="button"
              onClick={() => setManualOnly(v => !v)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium transition-colors',
                manualOnly ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:text-foreground',
              )}
              title="Show only submissions an admin approved manually"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              Manual only
            </button>
          )}

          {/* Needs attention — the short queue worth an admin's time */}
          <button
            type="button"
            onClick={handleNeedsAttentionToggle}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium transition-colors',
              needsAttention ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-input bg-background text-muted-foreground hover:text-foreground',
            )}
            title="Show only submissions the AI could not settle on its own: handed to a human, escalated after a suspected fake, or decided with little/no confidence."
          >
            <Eye className="w-3.5 h-3.5" />
            Needs attention
          </button>

          {/* AI disagreed — server-side filter for admin-overrode-AI cases */}
          <button
            type="button"
            onClick={handleAiDisagreedToggle}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium transition-colors',
              aiDisagreed ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-input bg-background text-muted-foreground hover:text-foreground',
            )}
            title="Show only rows where the admin's verdict differed from the AI's. Useful for QA / catching override mistakes."
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI disagreed
          </button>

          {/* Clear filters */}
          {hasActiveFilter && (
            <button
              onClick={clearAllFilters}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 text-muted-foreground gap-1 px-2')}
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className={cn('bg-card border border-border rounded-2xl overflow-hidden transition-opacity duration-150', loading && 'opacity-60 pointer-events-none')}>
        {/* Table header */}
        <div
          className="grid text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border px-4 py-2.5"
          style={{ gridTemplateColumns: '2fr 3fr 110px 110px 80px' }}
        >
          <div>Member</div>
          <div>Task</div>
          <div>Date</div>
          <div>Status</div>
          <div />
        </div>

        {/* Rows */}
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="font-medium text-foreground">
              {hasActiveFilter ? 'No matching submissions.' : statusFilter === 'pending' ? 'All caught up!' : `No ${statusFilter} submissions.`}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilter ? 'Try adjusting your filters.' : statusFilter === 'pending' ? 'No pending submissions to review.' : ''}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(a => {
              const fading = fadingIds.has(a.id)
              return (
                <div
                  key={a.id}
                  className={cn(
                    'grid items-center px-4 py-3 transition-all duration-300',
                    fading ? 'opacity-0 -translate-y-1 pointer-events-none' : 'hover:bg-muted/30',
                    // A submission the AI has ASKED a human about looks identical
                    // in this list to one merely waiting on the video service.
                    // Only one of them wants attention, so give it a left edge
                    // that can be picked out while scrolling.
                    a.status === 'pending' && a.aiStatus === 'needs_review' &&
                      'border-l-2 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
                  )}
                  style={{ gridTemplateColumns: '2fr 3fr 110px 110px 80px' }}
                >
                  {/* Member */}
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                      a.status === 'pending' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {a.member.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{a.member}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.teamName}</p>
                    </div>
                  </div>

                  {/* Task */}
                  <div className="min-w-0 pr-3">
                    <p className="text-sm text-foreground truncate">{a.taskTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.taskPointsTiers && a.taskPointsTiers.length > 0
                        ? `${a.taskPointsTiers[0].points}–${a.taskPointsTiers[a.taskPointsTiers.length - 1].points}`
                        : a.taskPoints} 🥦 pts
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-xs font-medium text-foreground">{fmtShortDate(a.submittedDate)}</p>
                    <p className="text-xs text-muted-foreground" title={a.submittedAt}>{a.submittedTime}</p>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col gap-1 items-start">
                    <StatusBadge status={a.status} />
                    {a.status === 'pending' && a.aiStatus === 'needs_review' && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white"
                        title="The AI could not decide this one — it needs your judgement"
                      >
                        Needs you
                      </span>
                    )}
                    {a.status === 'approved' && a.aiStatus !== 'approved' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Admin approved manually">Manual</span>
                    )}
                    {a.status === 'rejected' && a.aiStatus !== 'rejected' && a.aiStatus !== null && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Admin rejected manually">Manual</span>
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => openReview(a)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> Review
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination — also shown during search/task/date filters since
          those are now server-side and can return multiple pages. */}
      {(currentPage > 0 || hasMore) && !loading && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">Page {currentPage + 1}</p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 0}
              onClick={() => loadPage(currentPage - 1, statusFilter, dateFilter, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, needsAttention)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 disabled:opacity-40')}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              disabled={!hasMore}
              onClick={() => loadPage(currentPage + 1, statusFilter, dateFilter, taskFilter !== 'all' ? taskFilter : undefined, search.trim().length >= 2 ? search.trim() : undefined, aiDisagreed, needsAttention)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 disabled:opacity-40')}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
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

              <div ref={modalScrollRef} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary shrink-0">
                    {reviewTarget.member.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reviewTarget.member}</p>
                    <p className="text-xs text-muted-foreground">🥦 {reviewTarget.teamName} · {fmtShortDate(reviewTarget.submittedDate)}, {reviewTarget.submittedTime}</p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{reviewTarget.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">{reviewTarget.taskDescription}</p>
                  <p className="text-xs text-primary font-medium">
                    {reviewTarget.taskPointsTiers && reviewTarget.taskPointsTiers.length > 0
                      ? `Range: 🥦 ${reviewTarget.taskPointsTiers[0].points}–${reviewTarget.taskPointsTiers[reviewTarget.taskPointsTiers.length - 1].points} pts`
                      : `Standard: 🥦 ${reviewTarget.taskPoints} pts`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submitted Proof</p>
                  <ProofViewer proofUrl={reviewTarget.proofUrl} />
                </div>

                {/* No verdict yet. Rendering nothing here left an admin staring
                    at a video with no explanation and no way to tell whether the
                    AI had passed it, failed it, or never looked -- the answer is
                    always the third one, so say it. */}
                {!reviewTarget.aiStatus && (
                  <div className="rounded-lg px-4 py-3 border border-border bg-muted/40 flex items-start gap-2.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Not checked by AI yet</p>
                      {/* Only VIDEO waits on the transcoder. Saying "video service"
                          on a photo is simply wrong -- photos average 72 seconds and
                          never touch Bunny at all. */}
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {reviewTarget.proofUrl?.startsWith('bunny://')
                          ? 'Waiting on the video service. It is approved automatically if this takes too long, so nothing is stuck \u2014 you can also decide it now.'
                          : 'The AI check has not run yet. This usually takes under a minute \u2014 you can also decide it now.'}
                      </p>
                    </div>
                  </div>
                )}

                {reviewTarget.aiStatus && (
                  <div className={cn('rounded-lg px-4 py-3 space-y-2 border',
                    reviewTarget.aiStatus === 'approved' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' :
                    reviewTarget.aiStatus === 'rejected' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
                    reviewTarget.aiStatus === 'analyzing' ? 'bg-muted/50 border-border' :
                    'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {reviewTarget.aiStatus === 'analyzing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                        <span className={cn('text-xs font-semibold',
                          reviewTarget.aiStatus === 'approved' ? 'text-emerald-700 dark:text-emerald-400' :
                          reviewTarget.aiStatus === 'rejected' ? 'text-red-700 dark:text-red-400' :
                          reviewTarget.aiStatus === 'analyzing' ? 'text-muted-foreground' :
                          'text-amber-700 dark:text-amber-400'
                        )}>
                          {reviewTarget.aiStatus === 'analyzing' ? 'Waiting for the video service…' : reviewTarget.aiStatus === 'approved' ? '✓ AI Approved' : reviewTarget.aiStatus === 'rejected' ? '✗ AI Rejected' : '⚠ AI: Needs Review'}
                        </span>
                        {reviewTarget.aiConfidence != null && reviewTarget.aiStatus !== 'analyzing' && (
                          <span className="text-xs text-muted-foreground">{Math.round(reviewTarget.aiConfidence * 100)}% confidence</span>
                        )}
                      </div>
                      <button onClick={() => handleReanalyze(reviewTarget)} disabled={reviewTarget.aiStatus === 'analyzing' || submitting} className="text-xs text-primary hover:underline disabled:opacity-40 shrink-0">Re-analyze</button>
                    </div>
                    {reviewTarget.aiFeedback && <p className="text-xs text-muted-foreground leading-relaxed">{reviewTarget.aiFeedback}</p>}
                    {/* Why this one is in the "Needs attention" queue, in words
                        rather than an opaque score, so the admin knows what to
                        look for before playing the video. */}
                    {reviewTarget.riskReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {reviewTarget.riskReasons.map(r => (
                          <span key={r} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Eye className="w-3 h-3" />{r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* An identity flag asks the admin to confirm the person is the
                    same -- against submissions it does not show. This is the one
                    flag that must never be acted on blind, so put the exact
                    videos the AI compared against right here. */}
                {/looks different from this member/i.test(reviewTarget.aiFeedback ?? '') && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Compare with their earlier videos
                      </p>
                      {idRefs === null && (
                        <button type="button" onClick={() => loadIdentityRefs(reviewTarget)}
                          className="text-xs text-primary hover:underline shrink-0">
                          Show past submissions
                        </button>
                      )}
                      {idRefs === 'loading' && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading&hellip;
                        </span>
                      )}
                    </div>

                    {Array.isArray(idRefs) && (
                      idRefs.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No earlier approved videos found &mdash; the AI had nothing to compare against.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {idRefs.map((r, i) => (
                            <figure key={i} className="space-y-1">
                              <figcaption className="text-[11px] font-medium text-muted-foreground truncate">
                                {r.taskTitle} &middot; {r.submittedDate}
                              </figcaption>
                              {r.videoUrl ? (
                                // eslint-disable-next-line jsx-a11y/media-has-caption
                                <video src={r.videoUrl} controls preload="metadata"
                                  poster={r.thumbUrl ?? undefined}
                                  className="w-full rounded-md border border-border bg-black aspect-video" />
                              ) : (
                                <p className="text-xs text-muted-foreground">Video unavailable</p>
                              )}
                            </figure>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* A duplicate flag is only actionable if the admin can SEE the
                    other photo. Without this the message named no submission, so
                    18 flags on 20 Aug could only be trusted or ignored. */}
                {/duplicate|similar to a previous submission|identical image fingerprint/i.test(reviewTarget.aiFeedback ?? '') && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Possible repeat photo</p>
                      {dupMatch === null && (
                        <button type="button" onClick={() => loadDuplicate(reviewTarget)} className="text-xs text-primary hover:underline shrink-0">Compare photos</button>
                      )}
                      {dupMatch === 'loading' && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Loader2 className="w-3 h-3 animate-spin" /> Comparing…</span>
                      )}
                    </div>

                    {dupMatch && dupMatch !== 'loading' && (
                      <>
                        {/* The verdict first: an exact byte match settles it, and
                            saying so plainly stops an admin second-guessing a
                            perceptual-hash warning they cannot verify. */}
                        <p className={dupMatch.identical
                          ? 'text-xs font-semibold text-red-700 dark:text-red-400'
                          : 'text-xs font-semibold text-amber-800 dark:text-amber-300'}>
                          {dupMatch.identical
                            ? `Exactly the same file as ${dupMatch.previousDate} (${dupMatch.currentBytes.toLocaleString()} bytes, identical) — this is a re-upload, not a new photo.`
                            : `Looks similar but the files differ (${dupMatch.currentBytes.toLocaleString()} vs ${dupMatch.previousBytes.toLocaleString()} bytes). Check both before deciding.`}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <figure className="space-y-1">
                            <figcaption className="text-[11px] font-medium text-muted-foreground">This submission</figcaption>
                            <a href={dupMatch.currentUrl} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={dupMatch.currentUrl} alt="Photo submitted now" className="w-full rounded-md border border-border object-cover aspect-square" />
                            </a>
                          </figure>
                          <figure className="space-y-1">
                            <figcaption className="text-[11px] font-medium text-muted-foreground">Approved {dupMatch.previousDate}</figcaption>
                            <a href={dupMatch.previousUrl} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={dupMatch.previousUrl} alt="Previously approved photo" className="w-full rounded-md border border-border object-cover aspect-square" />
                            </a>
                          </figure>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {reviewTarget.note && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member Note</p>
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-sm text-foreground leading-relaxed">{reviewTarget.note}</div>
                  </div>
                )}

                <SubmissionHistory submissions={reviewTarget.previousSubmissions ?? []} />

                <div className="space-y-1.5">
                  <Label htmlFor="adminNotes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin Notes <span className="font-normal normal-case">(optional)</span></Label>
                  <textarea id="adminNotes" rows={2} placeholder="Add a note for your records or to send to the member..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none" />
                </div>

                {reviewTarget.selectedTier && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">Claimed Tier</span>
                    <span className="text-xs text-foreground font-medium">{reviewTarget.selectedTier.label}</span>
                    {reviewTarget.selectedTier.description && <span className="text-xs text-muted-foreground">— {reviewTarget.selectedTier.description}</span>}
                    <span className="ml-auto text-xs font-bold text-primary">🥦 {reviewTarget.selectedTier.points} pts</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="pointsOverride" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Points Override <span className="font-normal normal-case">(optional)</span></Label>
                  <input id="pointsOverride" type="number" min={0} placeholder={reviewTarget.selectedTier ? `Default: ${reviewTarget.selectedTier.points} pts (claimed tier)` : `Default: ${reviewTarget.taskPoints} pts`} value={pointsOverride} onChange={e => setPointsOverride(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-border space-y-2">
                {/* Let the member try again today. Day 1 produced several
                    "picked the wrong tier" requests that otherwise need a
                    developer to clear the row by hand. */}
                {confirmResubmit ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-2">
                    <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                      This deletes {reviewTarget.member}&apos;s submission, its points and the uploaded
                      proof, so they can submit this task again today. Whatever they submit next decides
                      the points &mdash; higher or lower. They must resubmit before midnight or they score
                      nothing for today.
                    </p>
                    <div className="flex gap-2">
                      <button disabled={submitting} onClick={() => setConfirmResubmit(false)}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}>Cancel</button>
                      <button disabled={submitting} onClick={handleAllowResubmit}
                        className={cn(buttonVariants({ size: 'sm' }), 'flex-1 bg-amber-600 hover:bg-amber-700')}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, clear it'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button disabled={submitting} onClick={() => setConfirmResubmit(true)}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full text-muted-foreground hover:text-foreground')}>
                    Allow resubmit today
                  </button>
                )}

                {reviewTarget.status === 'pending' && (
                  <div className="flex gap-2">
                    <button disabled={submitting} onClick={handleReject} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 border-destructive text-destructive hover:bg-destructive/10')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1.5" /> Reject</>}
                    </button>
                    <button disabled={submitting} onClick={handleApprove} className={cn(buttonVariants(), 'flex-1')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve</>}
                    </button>
                  </div>
                )}
                {reviewTarget.status === 'approved' && (
                  <div className="flex gap-2">
                    <button disabled={submitting} onClick={handleReject} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 border-destructive text-destructive hover:bg-destructive/10')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1.5" /> Reject</>}
                    </button>
                    <button disabled={submitting} onClick={handleApprove} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50')}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Points'}
                    </button>
                  </div>
                )}
                {reviewTarget.status === 'rejected' && (
                  <button disabled={submitting} onClick={handleApprove} className={cn(buttonVariants(), 'w-full')}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve</>}
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
