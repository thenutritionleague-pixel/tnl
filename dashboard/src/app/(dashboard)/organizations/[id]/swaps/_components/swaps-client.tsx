'use client'

import { useMemo, useState } from 'react'
import { Search, ArrowRight, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { TeamSwapRow } from '@/lib/supabase/queries'

// The league allows each team ONE swap. Anything above this is flagged so an
// admin can see it before approving the next request.
const SWAP_LIMIT = 1

export default function SwapsClient({ rows }: { rows: TeamSwapRow[] }) {
  const [q, setQ] = useState('')

  const swapped = useMemo(() => rows.filter(r => r.swapsUsed > 0), [rows])
  const overLimit = useMemo(() => swapped.filter(r => r.swapsUsed > SWAP_LIMIT), [swapped])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return swapped
    return swapped.filter(r =>
      r.team.toLowerCase().includes(needle) ||
      (r.swappedIn ?? '').toLowerCase().includes(needle) ||
      (r.swappedOut ?? '').toLowerCase().includes(needle))
  }, [swapped, q])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team Swaps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Each team is allowed {SWAP_LIMIT} swap. Check here before approving a new request.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Teams that swapped" value={swapped.length} />
        <StatCard label={`Over the ${SWAP_LIMIT}-swap limit`} value={overLimit.length} tone={overLimit.length ? 'warn' : 'ok'} />
        <StatCard label="Swaps in total" value={swapped.reduce((n, r) => n + r.swapsUsed, 0)} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search team or member…"
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead className="w-20 text-center">Swaps</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>In</TableHead>
              <TableHead className="w-28">Last swap</TableHead>
              <TableHead className="w-24 text-center">Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  {q ? 'No team matches that search.' : 'No swaps yet.'}
                </TableCell>
              </TableRow>
            )}
            {visible.map(r => {
              const over = r.swapsUsed > SWAP_LIMIT
              return (
                <TableRow key={r.teamId} className={over ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {over && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
                      {r.team}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={over ? 'destructive' : 'secondary'}>{r.swapsUsed}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.swappedOut ?? <span className="italic">not recorded</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.swappedIn ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {r.lastSwapDate ?? '—'}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    <span className={r.currentMembers < 10 ? 'text-amber-600 font-medium' : undefined}>
                      {r.currentMembers}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Stated plainly because the count and the name have different
          reliability, and an admin acting on this should know which is which. */}
      <p className="text-xs text-muted-foreground max-w-3xl">
        The swap <strong>count</strong> is always accurate. The <strong>Out</strong> name is only
        recorded when the departing member had already earned points, so it can be blank for a
        member who left on zero — the swap is still counted.
      </p>
    </div>
  )
}

function StatCard({ label, value, tone = 'plain' }: {
  label: string; value: number; tone?: 'plain' | 'ok' | 'warn'
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={[
        'text-3xl font-semibold tabular-nums mt-1',
        tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : '',
      ].join(' ')}>
        {value}
      </div>
    </div>
  )
}
