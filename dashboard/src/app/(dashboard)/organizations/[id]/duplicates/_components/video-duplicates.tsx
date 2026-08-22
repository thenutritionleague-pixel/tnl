'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, User, Loader2, AlertTriangle, ShieldCheck, Video, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VideoDuplicateGroup, VideoDuplicateEntry } from '@/lib/supabase/admin-queries'
import {
  getVideoPlaybackUrls, rejectVideoDuplicate,
  reviewDuplicateGroup, clearDuplicateReview,
} from '../actions'

/** Videos are keyed on fingerprint alone, so the review row uses this sentinel. */
const VIDEO_TITLE_KEY = '(video)'

const fmtBytes = (n: number | null) =>
  n == null ? '—' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

const KIND_LABEL: Record<VideoDuplicateGroup['kind'], string> = {
  shared_across_members: 'Same video under two different members',
  same_member_different_tasks: 'Same video claimed for different tasks',
  same_member_different_days: 'Same video submitted on more than one day',
}

export default function VideoDuplicates({ orgId, groups }: { orgId: string; groups: VideoDuplicateGroup[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [filter, setFilter] = useState<'unreviewed' | 'all' | 'shared' | 'proven'>('unreviewed')

  async function toggle(g: VideoDuplicateGroup) {
    if (open === g.fingerprint) { setOpen(null); return }
    setOpen(g.fingerprint)
    if (urls[g.fingerprint]) return
    setLoading(g.fingerprint)
    const guids = g.entries.map(e => e.guid).filter((s): s is string => !!s)
    const got = await getVideoPlaybackUrls(guids)
    setUrls(u => ({ ...u, [g.fingerprint]: { ...(u[g.fingerprint] ?? {}), ...got } }))
    setLoading(null)
  }

  async function mark(g: VideoDuplicateGroup, verdict: 'safe' | 'confirmed') {
    setBusy(g.fingerprint)
    await reviewDuplicateGroup(orgId, g.fingerprint, VIDEO_TITLE_KEY, verdict)
    setBusy(null); router.refresh()
  }
  async function unmark(g: VideoDuplicateGroup) {
    setBusy(g.fingerprint)
    await clearDuplicateReview(orgId, g.fingerprint, VIDEO_TITLE_KEY)
    setBusy(null); router.refresh()
  }
  async function reject(e: VideoDuplicateEntry) {
    setBusy(e.submissionId)
    const res = await rejectVideoDuplicate(orgId, e.submissionId)
    setBusy(null); setConfirming(null)
    if (res?.error) alert(res.error)
    router.refresh()
  }

  const shown = groups.filter(g =>
    filter === 'all' ? true
      : filter === 'unreviewed' ? !g.reviewVerdict
      : filter === 'shared' ? g.kind === 'shared_across_members'
      : g.provenIdentical)

  const sharedCount = groups.filter(g => g.kind === 'shared_across_members').length
  const provenCount = groups.filter(g => g.provenIdentical).length
  const pointsAtStake = groups.reduce((a, g) => a + g.approvedPoints, 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl text-foreground flex items-center gap-2">
          <Video className="w-5 h-5 text-muted-foreground" /> Duplicate Videos
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          The same video submitted more than once. {groups.length} group{groups.length === 1 ? '' : 's'},{' '}
          {pointsAtStake.toLocaleString('en-IN')} approved points involved.
        </p>
      </div>

      {/* What the evidence does and does not prove. An admin acting on this is
          going to have to defend it to a member who lost points. */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
        <p>
          Grouping is by the video&rsquo;s thumbnail, which Bunny renders from a fixed frame — so an
          identical source file gives an identical thumbnail.{' '}
          <span className="font-semibold text-foreground">
            Where the full file was also hashed and matched, the group is marked “Identical file”, and that
            is proof a member re-uploaded the same recording.
          </span>{' '}
          A group without that badge matched on thumbnail alone — check it before acting.
        </p>
        <p>
          Exact re-uploads only. Someone who re-encodes, trims a second or re-records gets a different
          fingerprint and will not appear here, so treat this as a floor rather than a total.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['unreviewed', `Needs review (${groups.filter(g => !g.reviewVerdict).length})`],
          ['all', `All groups (${groups.length})`],
          ['shared', `Shared between members (${sharedCount})`],
          ['proven', `Identical file (${provenCount})`],
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
          <Video className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No duplicate videos in this view.</p>
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

                        {g.provenIdentical ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            <ShieldCheck className="w-3 h-3" /> Identical file — proven
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            <AlertTriangle className="w-3 h-3" /> Thumbnail match only — not proof
                          </span>
                        )}

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
                        <span className="font-semibold text-foreground">{g.approvedPoints.toLocaleString('en-IN')} pts approved</span>
                      </p>
                    </div>
                    <Layers className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {loading === g.fingerprint && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading videos…
                      </p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.entries.map(e => {
                        const src = e.guid ? urls[g.fingerprint]?.[e.guid] : undefined
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

                            {src ? (
                              // eslint-disable-next-line jsx-a11y/media-has-caption
                              <video src={src} controls preload="metadata"
                                className="w-full rounded-lg border border-border bg-black aspect-video" />
                            ) : (
                              <div className="w-full rounded-lg border border-border bg-muted/40 aspect-video flex items-center justify-center">
                                <Video className="w-6 h-6 text-muted-foreground/30" />
                              </div>
                            )}

                            {/* The checkable facts. This is what gets quoted back
                                to a member who asks why their points changed. */}
                            <dl className="text-[11px] text-muted-foreground space-y-0.5 font-mono">
                              <div className="flex gap-1.5">
                                <dt className="shrink-0">length</dt>
                                <dd className="text-foreground">{e.seconds != null ? `${e.seconds}s` : '—'}</dd>
                                <dt className="shrink-0 ml-2">size</dt>
                                <dd className="text-foreground">{fmtBytes(e.fileBytes)}</dd>
                              </div>
                              <div className="flex gap-1.5">
                                <dt className="shrink-0">sha256</dt>
                                <dd className="text-foreground truncate">{e.fileSha ? `${e.fileSha.slice(0, 24)}…` : '—'}</dd>
                              </div>
                            </dl>

                            {!isRejected && (
                              confirming === e.submissionId ? (
                                <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30 p-2.5 space-y-2">
                                  <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed">
                                    This rejects the submission and removes its {e.pointsAwarded ?? 0} points.
                                    The member is shown a reason quoting the matching date, file size and SHA-256.
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
