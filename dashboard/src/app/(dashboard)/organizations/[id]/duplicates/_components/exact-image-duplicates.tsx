'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, User, Loader2, ShieldCheck, ImageOff, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExactImageGroup, ExactImageEntry } from '@/lib/supabase/admin-queries'
import {
  getGroupProofUrls, rejectExactImageDuplicate,
  reviewDuplicateGroup, clearDuplicateReview, type ProofEvidence,
} from '../actions'

/** Exact-match image groups key on the eTag, so the review row uses this title. */
const EXACT_TITLE_KEY = '(image-exact)'

const fmtBytes = (n: number | null) =>
  n == null ? '—' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

const KIND_LABEL: Record<ExactImageGroup['kind'], string> = {
  shared_across_members: 'Same photo under two different members',
  same_member_different_tasks: 'Same photo claimed for different tasks',
  same_member_different_days: 'Same photo submitted on more than one day',
}

export default function ExactImageDuplicates({ orgId, groups }: { orgId: string; groups: ExactImageGroup[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, Record<string, ProofEvidence>>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [filter, setFilter] = useState<'unreviewed' | 'all' | 'shared'>('unreviewed')

  async function toggle(g: ExactImageGroup) {
    if (open === g.fingerprint) { setOpen(null); return }
    setOpen(g.fingerprint)
    if (urls[g.fingerprint]) return
    setLoading(g.fingerprint)
    const paths = g.entries.map(e => e.proofUrl).filter((p): p is string => !!p)
    const got = await getGroupProofUrls(paths)
    setUrls(u => ({ ...u, [g.fingerprint]: got }))
    setLoading(null)
  }

  async function mark(g: ExactImageGroup, verdict: 'safe' | 'confirmed') {
    setBusy(g.fingerprint)
    await reviewDuplicateGroup(orgId, g.fingerprint, EXACT_TITLE_KEY, verdict)
    setBusy(null); router.refresh()
  }
  async function unmark(g: ExactImageGroup) {
    setBusy(g.fingerprint)
    await clearDuplicateReview(orgId, g.fingerprint, EXACT_TITLE_KEY)
    setBusy(null); router.refresh()
  }
  async function reject(e: ExactImageEntry) {
    setBusy(e.submissionId)
    const res = await rejectExactImageDuplicate(orgId, e.submissionId)
    setBusy(null); setConfirming(null)
    if (res?.error) alert(res.error)
    router.refresh()
  }

  const shown = groups.filter(g =>
    filter === 'all' ? true
      : filter === 'unreviewed' ? !g.reviewVerdict
      : g.kind === 'shared_across_members')

  const sharedCount = groups.filter(g => g.kind === 'shared_across_members').length
  const pointsAtStake = groups.reduce((a, g) => a + g.approvedPoints, 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" /> Re-used Photos — identical file
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          The exact same image file submitted more than once. {groups.length} group
          {groups.length === 1 ? '' : 's'}, {pointsAtStake.toLocaleString('en-IN')} approved points involved.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
        <p>
          <span className="font-semibold text-foreground">This list is proof, not a shortlist.</span>{' '}
          Grouping is on the file&rsquo;s own checksum recorded by storage, so a match means the identical
          file was uploaded twice — not a similar-looking photo. Byte sizes match in every group as well.
        </p>
        <p>
          It exists because the look-alike list above cannot see these. A step-counter screenshot is mostly
          flat dark pixels, so its visual fingerprint carries too little signal and is discarded to avoid
          mass false positives — leaving roughly a quarter of Steps submissions unchecked. This closes that
          gap. It will not catch a photo that was re-encoded or cropped; that is what the list above is for.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['unreviewed', `Needs review (${groups.filter(g => !g.reviewVerdict).length})`],
          ['all', `All groups (${groups.length})`],
          ['shared', `Shared between members (${sharedCount})`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
              filter === k
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-14 gap-2">
          <ImageOff className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No re-used photos in this view.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(g => {
            const isOpen = open === g.fingerprint
            const serious = g.kind === 'shared_across_members'
            return (
              <div key={g.fingerprint}
                className={cn('bg-card border rounded-2xl overflow-hidden',
                  serious ? 'border-red-300 dark:border-red-800' : 'border-border')}>

                <button onClick={() => toggle(g)} className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                          serious
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300')}>
                          {serious ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {KIND_LABEL[g.kind]}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          <ShieldCheck className="w-3 h-3" /> Identical file
                        </span>
                        {g.reviewVerdict && (
                          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',
                            g.reviewVerdict === 'confirmed'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300')}>
                            {g.reviewVerdict === 'confirmed' ? 'Confirmed duplicate' : 'Marked OK'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">
                        {[...new Set(g.entries.map(e => e.member))].join(' · ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.entries.length} submissions · {[...new Set(g.entries.map(e => e.taskTitle))].join(', ')} ·{' '}
                        <span className="font-semibold text-foreground">
                          {g.approvedPoints.toLocaleString('en-IN')} pts approved
                        </span>
                      </p>
                    </div>
                    <Layers className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {loading === g.fingerprint && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading photos…
                      </p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.entries.map(e => {
                        const ev = e.proofUrl ? urls[g.fingerprint]?.[e.proofUrl] : undefined
                        const isRejected = e.status === 'rejected'
                        return (
                          <figure key={e.submissionId} className="space-y-1.5">
                            <figcaption className="text-xs">
                              <span className="font-semibold text-foreground">{e.member}</span>
                              <span className="text-muted-foreground"> · {e.team}</span>
                            </figcaption>
                            <p className="text-[11px] text-muted-foreground">
                              {e.taskTitle} · {e.submittedDate} ·{' '}
                              <span className={cn('font-semibold',
                                isRejected ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
                                {e.status}
                              </span>
                              {e.pointsAwarded != null && ` · ${e.pointsAwarded} pts`}
                            </p>

                            {ev?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={ev.url} alt={`Proof from ${e.member}`}
                                className="w-full rounded-lg border border-border bg-muted/40 object-contain max-h-64" />
                            ) : (
                              <div className="w-full rounded-lg border border-border bg-muted/40 h-40 flex items-center justify-center">
                                <ImageOff className="w-6 h-6 text-muted-foreground/30" />
                              </div>
                            )}

                            <dl className="text-[11px] text-muted-foreground space-y-0.5 font-mono">
                              <div className="flex gap-1.5">
                                <dt className="shrink-0">size</dt>
                                <dd className="text-foreground">{fmtBytes(e.fileBytes)}</dd>
                                <dt className="shrink-0 ml-2">md5</dt>
                                <dd className="text-foreground truncate">{g.fingerprint.slice(0, 16)}…</dd>
                              </div>
                            </dl>

                            {!isRejected && (
                              confirming === e.submissionId ? (
                                <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30 p-2.5 space-y-2">
                                  <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed">
                                    This rejects the submission and removes its {e.pointsAwarded ?? 0} points.
                                    The member is shown a reason quoting the matching date, file size and checksum.
                                  </p>
                                  <div className="flex gap-2">
                                    <button onClick={() => reject(e)} disabled={busy === e.submissionId}
                                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                      {busy === e.submissionId
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : 'Yes, reject and remove points'}
                                    </button>
                                    <button onClick={() => setConfirming(null)}
                                      className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setConfirming(e.submissionId)}
                                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40">
                                  Reject this one
                                </button>
                              )
                            )}
                          </figure>
                        )
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
                      <span className="text-xs text-muted-foreground mt-2">Group verdict:</span>
                      {g.reviewVerdict ? (
                        <button onClick={() => unmark(g)} disabled={busy === g.fingerprint}
                          className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                          {busy === g.fingerprint ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Undo verdict'}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => mark(g, 'confirmed')} disabled={busy === g.fingerprint}
                            className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                            Confirmed duplicate
                          </button>
                          <button onClick={() => mark(g, 'safe')} disabled={busy === g.fingerprint}
                            className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                            Not a problem
                          </button>
                        </>
                      )}
                      {g.reviewedEmail && (
                        <span className="mt-2 text-[11px] text-muted-foreground">
                          by {g.reviewedEmail}
                          {g.reviewedAt && ` · ${new Date(g.reviewedAt).toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
