'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Users, User, Loader2, AlertTriangle, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DuplicateGroup } from '@/lib/supabase/admin-queries'
import { getGroupProofUrls, reviewDuplicateGroup, clearDuplicateReview, type ProofEvidence } from '../actions'

function fmtBytes(n: number | null) {
  if (n == null) return '—'
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

export default function DuplicatesClient({ orgId, groups }: { orgId: string; groups: DuplicateGroup[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, Record<string, ProofEvidence>>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'shared' | 'identical' | 'unreviewed'>('unreviewed')
  const [busy, setBusy] = useState<string | null>(null)

  async function mark(g: DuplicateGroup, verdict: 'safe' | 'confirmed') {
    const key = g.hash + g.taskTitle
    setBusy(key)
    await reviewDuplicateGroup(orgId, g.hash, g.taskTitle, verdict)
    setBusy(null)
    router.refresh()
  }
  async function unmark(g: DuplicateGroup) {
    const key = g.hash + g.taskTitle
    setBusy(key)
    await clearDuplicateReview(orgId, g.hash, g.taskTitle)
    setBusy(null)
    router.refresh()
  }

  async function toggle(g: DuplicateGroup) {
    const key = g.hash + g.taskTitle
    if (open === key) { setOpen(null); return }
    setOpen(key)
    if (urls[key]) return
    setLoading(key)
    const paths = g.entries.map(e => e.proofUrl).filter((p): p is string => !!p)
    const got = await getGroupProofUrls(paths)
    setUrls(u => ({ ...u, [key]: got }))
    setLoading(null)
  }

  const shown = groups.filter(g =>
    filter === 'all' ? true
      : filter === 'unreviewed' ? !g.reviewVerdict
      : filter === 'shared' ? g.sharedBetweenMembers
      : g.sameFileSize)

  const sharedCount = groups.filter(g => g.sharedBetweenMembers).length
  const sameSizeCount = groups.filter(g => g.sameFileSize).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Duplicate Proofs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          The same photo submitted more than once. Open a group to see the proofs side by side.
        </p>
      </div>

      {/* What this list does and does not mean. Without it the numbers get read
          as an accusation, and most of them are not. */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
        <p>
          <span className="font-semibold text-foreground">This list is a shortlist, not a verdict.</span>{' '}
          Grouping is by visual fingerprint, which answers &ldquo;do these look alike&rdquo; — not
          &ldquo;are these the same file&rdquo;. <span className="font-semibold text-foreground">Open a group</span>{' '}
          to run the real check: every file is downloaded and hashed, and you are told plainly whether they
          are byte-for-byte identical or merely similar.
        </p>
        <p className="font-semibold text-foreground">
          Only a proven byte-for-byte match is evidence a member re-used a photo. Never penalise anyone on
          the list view alone.
        </p>
        <p>
          Step-counter screenshots are mostly flat white, so their fingerprints collide even when the
          screenshots are unrelated. Those are filtered out, but treat any Steps group here as weak
          evidence and check the images before acting.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['unreviewed', `Needs review (${groups.filter(g => !g.reviewVerdict).length})`],
          ['all', `All groups (${groups.length})`],
          ['shared', `Shared between members (${sharedCount})`],
          ['identical', `Same file size (${sameSizeCount})`],
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
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-2">
          <Copy className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No duplicate proofs in this view.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(g => {
            const key = g.hash + g.taskTitle
            const isOpen = open === key
            return (
              <div key={key} className="bg-card border border-border rounded-2xl overflow-hidden">
                <button onClick={() => toggle(g)}
                  className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                    g.sharedBetweenMembers ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>
                    {g.sharedBetweenMembers ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {g.sharedBetweenMembers
                        ? `${new Set(g.entries.map(e => e.memberId)).size} different members used the same photo`
                        : `${g.entries[0].member} used the same photo ${g.entries.length} times`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {g.taskTitle} · {g.entries.map(e => e.submittedDate).join(', ')}
                    </p>
                  </div>
                  {g.reviewVerdict ? (
                    <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0',
                      g.reviewVerdict === 'safe' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                      {g.reviewVerdict === 'safe' ? 'Checked — not a duplicate' : 'Confirmed duplicate'}
                    </span>
                  ) : (
                    <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0',
                      g.sameFileSize ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground')}>
                      {g.sameFileSize ? 'Same size — open to verify' : 'Looks similar'}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-border pt-4">
                    {g.sharedBetweenMembers && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                          The same image appears under more than one member. If the files are identical this
                          is one photo shared between people; if they are only similar it may be a coincidence.
                        </p>
                      </div>
                    )}
                    {(() => {
                      const ev = urls[key]
                      if (!ev) return null
                      const hashes = g.entries.map(e => e.proofUrl ? ev[e.proofUrl]?.sha256 : null)
                      if (hashes.some(h => !h)) {
                        return (
                          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 mb-3">
                            <p className="text-xs text-muted-foreground">
                              Could not read every file, so identity is unproven. Compare the images yourself
                              before acting.
                            </p>
                          </div>
                        )
                      }
                      const allSame = new Set(hashes).size === 1
                      return (
                        <div className={cn('rounded-lg border px-3 py-2 mb-3',
                          allSame
                            ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                            : 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30')}>
                          <p className={cn('text-xs font-semibold',
                            allSame ? 'text-red-800 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300')}>
                            {allSame
                              ? 'PROVEN: byte-for-byte the same image file.'
                              : 'NOT the same file — these are different images that happen to look alike.'}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {allSame
                              ? 'A SHA-256 match cannot happen by chance. This is a re-upload of the identical file.'
                              : 'Different content hashes. On a task members repeat daily this is normally a genuine new photo — do not penalise on this alone.'}
                          </p>
                        </div>
                      )
                    })()}
                    {loading === key ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-2 py-6 justify-center">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading proofs…
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {g.entries.map(e => {
                          const url = e.proofUrl ? urls[key]?.[e.proofUrl]?.url : undefined
                          return (
                            <figure key={e.submissionId} className="space-y-1.5">
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`${e.member} — ${e.submittedDate}`}
                                    className="w-full rounded-md border border-border object-cover aspect-square" />
                                </a>
                              ) : (
                                <div className="w-full rounded-md border border-border bg-muted/40 aspect-square flex items-center justify-center">
                                  <ImageOff className="w-5 h-5 text-muted-foreground/40" />
                                </div>
                              )}
                              <figcaption className="text-[11px] leading-snug">
                                <span className="font-semibold text-foreground block truncate">{e.member}</span>
                                <span className="text-muted-foreground block truncate">{e.team}</span>
                                <span className="text-muted-foreground block">
                                  {e.submittedDate} · {fmtBytes(e.fileBytes)}
                                  {e.pointsAwarded != null && ` · ${e.pointsAwarded} pts`}
                                </span>
                              </figcaption>
                            </figure>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
                      {g.reviewVerdict ? (
                        <>
                          <span className="text-[11px] text-muted-foreground">
                            Marked <strong className="text-foreground">
                              {g.reviewVerdict === 'safe' ? 'not a duplicate' : 'confirmed duplicate'}
                            </strong>{g.reviewedEmail ? ` by ${g.reviewedEmail}` : ''}
                          </span>
                          <button onClick={() => unmark(g)} disabled={busy === key}
                            className="text-[11px] text-primary hover:underline disabled:opacity-40">
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => mark(g, 'safe')} disabled={busy === key}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                            Not a duplicate
                          </button>
                          <button onClick={() => mark(g, 'confirmed')} disabled={busy === key}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40">
                            Confirm duplicate
                          </button>
                        </>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        Points are changed in <a href={`/organizations/${orgId}/approvals`} className="text-primary hover:underline">Approvals</a>
                      </span>
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
