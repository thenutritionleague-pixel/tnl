'use client'

import { useCallback, useRef, useState } from 'react'
import { Trash2, MoreHorizontal, UserPlus, Users, ChevronDown, Loader2, Edit2, Upload, CheckCircle2, AlertCircle, AlertTriangle, FileDown, FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { addToWhitelist, csvImportToWhitelist, getTeamRoleStatus, removeFromWhitelist, updateWhitelistEntry } from '../actions'
import type { InviteEntry } from '@/lib/supabase/admin-queries'

type InviteRole = 'member' | 'vice_captain' | 'captain'

const roleLabel: Record<InviteRole, string> = {
  member: 'Member', vice_captain: 'Vice Captain', captain: 'Captain',
}

interface CsvRow {
  email: string
  teamId: string | null
  teamName: string
  teamFound: boolean
  role: InviteRole
  valid: boolean       // email format ok
  error?: string       // email format error
  conflict?: string    // role conflict or duplicate error
}

function parseCsv(text: string, teams: Array<{ id: string; name: string }>): CsvRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes(';') ? ';' : ','
  const firstLower = lines[0].toLowerCase()
  const hasHeader = firstLower.includes('email') || !firstLower.includes('@')
  const dataLines = hasHeader ? lines.slice(1) : lines

  let emailIdx = 0, teamIdx = 1, roleIdx = 2
  if (hasHeader) {
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const ei = headers.findIndex(h => h.includes('email')); if (ei >= 0) emailIdx = ei
    const ti = headers.findIndex(h => h.includes('team'));  if (ti >= 0) teamIdx = ti
    const ri = headers.findIndex(h => h.includes('role'));  if (ri >= 0) roleIdx = ri
  }

  const result: CsvRow[] = []
  for (const line of dataLines) {
    const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '').trim())
    const email = (cols[emailIdx] ?? '').toLowerCase().trim()
    if (!email) continue
    const rawTeam = cols[teamIdx]?.trim() ?? ''
    const rawRole = cols[roleIdx]?.toLowerCase().trim() ?? ''
    const team = teams.find(t => t.name.toLowerCase() === rawTeam.toLowerCase())
    const role: InviteRole =
      rawRole === 'captain' ? 'captain'
      : rawRole === 'vice_captain' || rawRole === 'vc' || rawRole === 'vice captain' ? 'vice_captain'
      : 'member'
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    result.push({
      email,
      teamId: team?.id ?? null,
      teamName: team?.name ?? (rawTeam || '—'),
      teamFound: !!team || !rawTeam,
      role,
      valid,
      ...(valid ? {} : { error: 'Invalid email' }),
    })
  }
  return result
}

interface Props {
  orgId: string
  initialInvites: InviteEntry[]
  teams: Array<{ id: string; name: string }>
}

export function InviteClient({ orgId, initialInvites, teams }: Props) {
  const [invites, setInvites] = useState<InviteEntry[]>(initialInvites)

  // Single form
  const [singleEmail, setSingleEmail] = useState('')
  const [singleTeam, setSingleTeam]   = useState('')
  const [singleRole, setSingleRole]   = useState<InviteRole>('member')
  const [singleError, setSingleError] = useState('')
  const [saving, setSaving]           = useState(false)

  // CSV upload modal
  const csvInputRef                       = useRef<HTMLInputElement>(null)
  const [csvUploadOpen, setCsvUploadOpen] = useState(false)
  const [isDragging, setIsDragging]       = useState(false)

  // CSV preview
  const [csvRows, setCsvRows]             = useState<CsvRow[] | null>(null)
  const [csvFileName, setCsvFileName]     = useState('')
  const [csvImporting, setCsvImporting]   = useState(false)
  // Role status fetched from DB: teamId → {captain, vice_captain}
  const [roleStatus, setRoleStatus]       = useState<Record<string, { captain: boolean; vice_captain: boolean }>>({})
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())

  // Remove
  const [removeTarget, setRemoveTarget] = useState<InviteEntry | null>(null)
  const [removing, setRemoving]         = useState(false)

  // Edit
  const [editTarget, setEditTarget]     = useState<InviteEntry | null>(null)
  const [editEmail, setEditEmail]       = useState('')
  const [editTeam, setEditTeam]         = useState('')
  const [editRole, setEditRole]         = useState<InviteRole>('member')
  const [editError, setEditError]       = useState('')
  const [updating, setUpdating]         = useState(false)

  function openEdit(entry: InviteEntry) {
    setEditTarget(entry)
    setEditEmail(entry.email)
    setEditTeam(entry.teamId ?? '')
    setEditRole(entry.role)
    setEditError('')
  }

  function applyConflicts(
    rows: CsvRow[],
    rs: Record<string, { captain: boolean; vice_captain: boolean }>,
    emails: Set<string>,
  ): CsvRow[] {
    // Track roles claimed within this batch: `${teamId}:${role}` → first email
    const batchClaims = new Map<string, string>()
    // Track emails seen in this batch for intra-CSV duplicate detection
    const batchEmails = new Map<string, number>() // email → first index

    return rows.map((row, i) => {
      if (!row.valid) return { ...row, conflict: undefined }

      // 1. Duplicate email in the whitelist (DB)
      if (emails.has(row.email)) {
        return { ...row, conflict: 'Already in whitelist' }
      }

      // 2. Duplicate email within this CSV
      if (batchEmails.has(row.email)) {
        return { ...row, conflict: `Duplicate of row ${(batchEmails.get(row.email)! + 1)}` }
      }
      batchEmails.set(row.email, i)

      // 3. Role conflict
      if (row.role !== 'member' && row.teamId) {
        const label = row.role === 'captain' ? 'Captain' : 'Vice Captain'
        const key = `${row.teamId}:${row.role}`

        // Intra-batch conflict
        if (batchClaims.has(key)) {
          return { ...row, conflict: `${label} already assigned in this import` }
        }
        // DB conflict
        if (rs[row.teamId]?.[row.role as 'captain' | 'vice_captain']) {
          return { ...row, conflict: `Team already has a ${label}` }
        }
        batchClaims.set(key, row.email)
      }

      return { ...row, conflict: undefined }
    })
  }

  const readFile = useCallback(async (file: File) => {
    setCsvUploadOpen(false)
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = parseCsv(ev.target?.result as string, teams)
      // Fetch DB role status and existing emails in parallel with parsing
      const status = await getTeamRoleStatus(orgId)
      const rawEmails: string[] = (status as any).__existingEmails ?? []
      const emailSet = new Set(rawEmails)
      // Remove the hidden key before storing
      const cleanStatus = Object.fromEntries(Object.entries(status).filter(([k]) => k !== '__existingEmails')) as typeof status
      setRoleStatus(cleanStatus)
      setExistingEmails(emailSet)
      setCsvRows(applyConflicts(rows, cleanStatus, emailSet))
    }
    reader.readAsText(file)
  }, [teams, orgId])

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) readFile(file)
  }

  function updateCsvRow(index: number, patch: Partial<Pick<CsvRow, 'teamId' | 'teamName' | 'teamFound' | 'role'>>) {
    setCsvRows(prev => {
      if (!prev) return prev
      const updated = prev.map((r, i) => i === index ? { ...r, ...patch } : r)
      return applyConflicts(updated, roleStatus, existingEmails)
    })
  }

  async function confirmCsvImport() {
    if (!csvRows) return
    const ready = csvRows.filter(r => r.valid && !r.conflict)
    if (ready.length === 0) return
    setCsvImporting(true)
    const result = await csvImportToWhitelist(orgId, ready.map(r => ({ email: r.email, teamId: r.teamId, role: r.role })))
    if (result.error) {
      toast.error(result.error)
    } else {
      const imported = (result.data as any[]) ?? []
      toast.success(`${imported.length} email(s) imported to whitelist.`)
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const importedEmails = new Set(imported.map((d: any) => d.email))
      const newEntries: InviteEntry[] = ready
        .filter(r => importedEmails.has(r.email))
        .map(r => ({
          id: imported.find((d: any) => d.email === r.email)?.id ?? Math.random().toString(36).slice(2),
          email: r.email, teamId: r.teamId, teamName: r.teamName === '—' ? 'Unassigned' : r.teamName,
          role: r.role, addedAt: today, status: 'pending',
        }))
      setInvites(prev => [...newEntries, ...prev.filter(i => !importedEmails.has(i.email))])
      setCsvRows(null)
      setCsvFileName('')
    }
    setCsvImporting(false)
  }

  function downloadSampleCsv() {
    const teamNames = teams.length > 0 ? teams.map(t => t.name) : ['Team Alpha', 'Team Beta']
    const rows = [
      ['email', 'team', 'role'],
      [`alice@example.com`, teamNames[0], 'member'],
      [`bob@example.com`, teamNames[Math.min(1, teamNames.length - 1)], 'member'],
      [`captain@example.com`, teamNames[0], 'captain'],
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'invite_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function addSingle() {
    const email = singleEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setSingleError('Enter a valid email.'); return }
    if (!singleTeam) { setSingleError('Select a team.'); return }
    setSaving(true)
    const teamId = singleTeam
    const result = await addToWhitelist(orgId, email, teamId, singleRole)
    if (result.error) {
      setSingleError(result.error)
    } else {
      toast.success(`${email} added to whitelist.`)
      const teamName = teams.find(t => t.id === teamId)?.name ?? 'Unassigned'
      setInvites(prev => [{
        id: result.id as string,
        email, teamId, teamName, role: singleRole,
        addedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'pending',
      }, ...prev])
      setSingleEmail('')
    }
    setSaving(false)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    const result = await removeFromWhitelist(orgId, removeTarget.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Removed from whitelist.')
      setInvites(prev => prev.filter(i => i.id !== removeTarget.id))
      setRemoveTarget(null)
    }
    setRemoving(false)
  }

  async function handleUpdate() {
    if (!editTarget) return
    const email = editEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEditError('Enter a valid email.'); return }
    if (!editTeam) { setEditError('Select a team.'); return }

    setUpdating(true)
    const result = await updateWhitelistEntry(orgId, editTarget.id, email, editTeam, editRole)
    if (result.error) {
      setEditError(result.error)
    } else {
      toast.success('Invitation updated.')
      const teamName = teams.find(t => t.id === editTeam)?.name ?? 'Unassigned'
      setInvites(prev => prev.map(inv => 
        inv.id === editTarget.id 
          ? { ...inv, email, teamId: editTeam, teamName, role: editRole }
          : inv
      ))
      setEditTarget(null)
    }
    setUpdating(false)
  }

  const pending  = invites.filter(i => i.status === 'pending')
  const accepted = invites.filter(i => i.status === 'accepted')

  return (
    <div className="space-y-6">
      {/* Hidden CSV input */}
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Invite Whitelist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Only whitelisted emails can sign up on the mobile app. No email is sent — share the app link manually.</p>
        </div>
        <button onClick={() => setCsvUploadOpen(true)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 shrink-0')}>
          <Upload className="size-3.5" /> Import CSV
        </button>
      </div>

      {/* Single form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Add to Whitelist</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_160px] gap-3">
            <Input type="email" placeholder="member@email.com" value={singleEmail} onChange={e => { setSingleEmail(e.target.value); setSingleError('') }} onKeyDown={e => e.key === 'Enter' && addSingle()} className="h-9" />
            <div className="relative">
              <select value={singleTeam} onChange={e => { setSingleTeam(e.target.value); setSingleError('') }} className={cn('w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer', !singleTeam && 'text-muted-foreground')}>
                <option value="">Assign to team…</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="relative">
              <select value={singleRole} onChange={e => setSingleRole(e.target.value as InviteRole)} className="w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                <option value="member">Member</option>
                <option value="vice_captain">Vice Captain</option>
                <option value="captain">Captain</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          {singleError && <p className="text-xs text-destructive">{singleError}</p>}
          <div className="flex justify-end">
            <Button onClick={addSingle} disabled={saving} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><UserPlus className="w-3.5 h-3.5" /> Add to Whitelist</>}
            </Button>
          </div>
      </div>

      {/* Pending table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-foreground text-sm">Pending</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{pending.length} awaiting signup</p>
        </div>
        <InviteTable orgId={orgId} invites={pending} onRemove={setRemoveTarget} onEdit={openEdit} />
      </div>

      {/* Accepted table */}
      {accepted.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Accepted</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{accepted.length} signed up</p>
          </div>
          <InviteTable orgId={orgId} invites={accepted} onRemove={setRemoveTarget} onEdit={openEdit} />
        </div>
      )}

      {/* CSV Upload Modal */}
      <Dialog open={csvUploadOpen} onOpenChange={setCsvUploadOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-primary" /> Import CSV
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CSV file with columns: <span className="font-medium text-foreground">email, team, role</span>
            </p>
          </DialogHeader>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => csvInputRef.current?.click()}
            className={cn(
              'mt-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
            )}
          >
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl transition-colors', isDragging ? 'bg-primary/10' : 'bg-muted')}>
              <Upload className={cn('w-5 h-5 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop your file here' : 'Drag & drop your CSV file'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or <span className="text-primary underline underline-offset-2">click to browse</span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">Supports .csv files</p>
          </div>

          {/* Download sample */}
          <button
            onClick={e => { e.stopPropagation(); downloadSampleCsv() }}
            className="flex items-center gap-2 w-full rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
          >
            <FileDown className="w-4 h-4 text-primary shrink-0" />
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-foreground">Download sample CSV</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Pre-filled with your team names — fill in emails and re-upload
              </p>
            </div>
          </button>

          <DialogFooter showCloseButton={false} className="flex-row justify-end">
            <button onClick={() => setCsvUploadOpen(false)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Preview */}
      <Dialog open={!!csvRows} onOpenChange={v => { if (!v) { setCsvRows(null); setCsvFileName('') } }}>
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" /> Import Preview
            </DialogTitle>
            {csvRows && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                <p className="text-sm text-muted-foreground">{csvFileName}</p>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {csvRows.filter(r => r.valid && !r.conflict).length} ready
                </span>
                {csvRows.filter(r => !r.valid).length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-medium text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {csvRows.filter(r => !r.valid).length} invalid email
                    </span>
                  </>
                )}
                {csvRows.filter(r => r.valid && r.conflict).length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {csvRows.filter(r => r.valid && r.conflict).length} need fixing
                    </span>
                  </>
                )}
              </div>
            )}
          </DialogHeader>
          {csvRows && csvRows.length > 0 ? (
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Team</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows.map((row, i) => (
                    <tr key={i} className={cn(
                      'transition-colors',
                      !row.valid                  && 'opacity-40 bg-red-50/30 dark:bg-red-950/10',
                      row.valid && row.conflict   && 'bg-amber-50/50 dark:bg-amber-950/10',
                    )}>
                      <td className="px-4 py-2.5 font-medium text-foreground text-sm">
                        {row.email || <span className="text-muted-foreground italic">empty</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="relative">
                          <select
                            value={row.teamId ?? ''}
                            disabled={!row.valid}
                            onChange={e => {
                              const t = teams.find(t => t.id === e.target.value)
                              updateCsvRow(i, {
                                teamId: t?.id ?? null,
                                teamName: t?.name ?? '—',
                                teamFound: !!t,
                              })
                            }}
                            className={cn(
                              'w-full appearance-none h-8 pl-2.5 pr-7 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer',
                              !row.teamId && 'text-muted-foreground',
                            )}
                          >
                            <option value="">No team</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="relative">
                          <select
                            value={row.role}
                            disabled={!row.valid}
                            onChange={e => updateCsvRow(i, { role: e.target.value as InviteRole })}
                            className={cn(
                              'w-full appearance-none h-8 pl-2.5 pr-7 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer',
                              row.role === 'captain'      && 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400',
                              row.role === 'vice_captain' && 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-400',
                              row.role === 'member'       && 'border-input bg-background text-foreground',
                            )}
                          >
                            <option value="member">Member</option>
                            <option value="vice_captain">Vice Captain</option>
                            <option value="captain">Captain</option>
                          </select>
                          <ChevronDown className={cn(
                            'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3',
                            row.role === 'captain'      && 'text-amber-500',
                            row.role === 'vice_captain' && 'text-blue-500',
                            row.role === 'member'       && 'text-muted-foreground',
                          )} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 min-w-[120px]">
                        {!row.valid
                          ? <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{row.error}</span>
                          : row.conflict
                          ? <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{row.conflict}</span>
                          : <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Ready</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No rows found in the CSV file.</div>
          )}
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => { setCsvRows(null); setCsvFileName('') }} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button
              onClick={confirmCsvImport}
              disabled={csvImporting || !csvRows || csvRows.filter(r => r.valid && !r.conflict).length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {csvImporting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Upload className="w-3.5 h-3.5" /> Import {csvRows?.filter(r => r.valid && !r.conflict).length ?? 0} entries</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={!!removeTarget} onOpenChange={v => { if (!v) setRemoveTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove from whitelist?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1"><span className="font-medium text-foreground">{removeTarget?.email}</span> will no longer be able to sign up.</p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setRemoveTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={confirmRemove} disabled={removing} className="bg-destructive text-white hover:bg-destructive/90">
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => { if (!v) setEditTarget(null) }}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit Invitation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={e => { setEditEmail(e.target.value); setEditError('') }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Team</Label>
                <div className="relative">
                  <select value={editTeam} onChange={e => { setEditTeam(e.target.value); setEditError('') }} className="w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <div className="relative">
                  <select value={editRole} onChange={e => setEditRole(e.target.value as InviteRole)} className="w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                    <option value="member">Member</option>
                    <option value="vice_captain">Vice Captain</option>
                    <option value="captain">Captain</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setEditTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={handleUpdate} disabled={updating} className="bg-primary text-primary-foreground">
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InviteTable({ orgId, invites, onRemove, onEdit }: { orgId: string; invites: InviteEntry[]; onRemove: (i: InviteEntry) => void; onEdit: (i: InviteEntry) => void }) {
  if (invites.length === 0) return <div className="px-5 py-8 text-center text-sm text-muted-foreground">No entries.</div>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/30">
          <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
          <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Team</th>
          <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Role</th>
          <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Added</th>
          <th className="w-10 px-5 py-2.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {invites.map(inv => (
          <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
            <td className="px-5 py-3 font-medium text-foreground">{inv.email}</td>
            <td className="px-5 py-3 text-muted-foreground text-sm">{inv.teamName}</td>
            <td className="px-5 py-3 hidden sm:table-cell">
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', inv.role === 'captain' && 'bg-amber-100 text-amber-700', inv.role === 'vice_captain' && 'bg-blue-100 text-blue-700', inv.role === 'member' && 'bg-muted text-muted-foreground')}>
                {roleLabel[inv.role]}
              </span>
            </td>
            <td className="px-5 py-3 text-muted-foreground text-xs hidden md:table-cell">{inv.addedAt}</td>
            <td className="px-5 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  {inv.status === 'accepted' ? (
                    <DropdownMenuItem onClick={() => window.location.href = `/organizations/${orgId}/members`} className="gap-2 whitespace-nowrap">
                      <Users className="w-3.5 h-3.5 shrink-0" /> View Members
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(inv)} className="gap-2 whitespace-nowrap">
                        <Edit2 className="w-3.5 h-3.5 shrink-0" /> Edit Invite
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRemove(inv)} variant="destructive" className="gap-2 whitespace-nowrap">
                        <Trash2 className="w-3.5 h-3.5 shrink-0" /> Remove
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
