'use client'

import { useState } from 'react'
import { Trash2, MoreHorizontal, UserPlus, Users, ChevronDown, Loader2, Edit2 } from 'lucide-react'
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
import { addToWhitelist, bulkAddToWhitelist, removeFromWhitelist, updateWhitelistEntry } from '../actions'
import type { InviteEntry } from '@/lib/supabase/admin-queries'

type InviteRole = 'member' | 'vice_captain' | 'captain'

const roleLabel: Record<InviteRole, string> = {
  member: 'Member', vice_captain: 'Vice Captain', captain: 'Captain',
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

  // Bulk form
  const [bulkMode, setBulkMode]       = useState(false)
  const [bulkEmails, setBulkEmails]   = useState('')
  const [bulkTeam, setBulkTeam]       = useState('')
  const [bulkRole, setBulkRole]       = useState<InviteRole>('member')
  const [bulkError, setBulkError]     = useState('')
  const [bulkSaving, setBulkSaving]   = useState(false)

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

  async function addBulk() {
    if (!bulkTeam) { setBulkError('Select a team.'); return }
    const lines = bulkEmails.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
    if (lines.length === 0) { setBulkError('Enter at least one email.'); return }
    const invalid = lines.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (invalid.length > 0) { setBulkError(`Invalid: ${invalid.slice(0, 2).join(', ')}`); return }
    setBulkSaving(true)
    const result = await bulkAddToWhitelist(orgId, lines, bulkTeam, bulkRole)
    if (result.error) {
      setBulkError(result.error)
    } else {
      toast.success(`${lines.length} email(s) added to whitelist.`)
      const teamName = teams.find(t => t.id === bulkTeam)?.name ?? 'Unassigned'
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const newEntries: InviteEntry[] = lines.map(email => ({
        id: (result.data as any[])?.find(d => d.email === email)?.id ?? Math.random().toString(36).slice(2),
        email, teamId: bulkTeam, teamName, role: bulkRole, addedAt: today, status: 'pending',
      }))
      setInvites(prev => [...newEntries, ...prev.filter(i => !lines.includes(i.email))])
      setBulkEmails('')
      setBulkMode(false)
    }
    setBulkSaving(false)
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
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Invite Whitelist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Only whitelisted emails can sign up on the mobile app. No email is sent — share the app link manually.</p>
        </div>
        <button onClick={() => setBulkMode(v => !v)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 shrink-0')}>
          <Users className="size-3.5" /> Bulk Add
        </button>
      </div>

      {/* Single form */}
      {!bulkMode && (
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
      )}

      {/* Bulk form */}
      {bulkMode && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Bulk Add</h2>
            </div>
            <button onClick={() => { setBulkMode(false); setBulkError('') }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
          <div className="space-y-1.5">
            <Label>Emails <span className="text-muted-foreground font-normal">(one per line)</span></Label>
            <textarea value={bulkEmails} onChange={e => { setBulkEmails(e.target.value); setBulkError('') }} placeholder={"alice@email.com\nbob@email.com\ncarol@email.com"} rows={5} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assign all to team</Label>
              <div className="relative">
                <select value={bulkTeam} onChange={e => { setBulkTeam(e.target.value); setBulkError('') }} className={cn('w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer', !bulkTeam && 'text-muted-foreground')}>
                  <option value="">Select team…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="relative">
                <select value={bulkRole} onChange={e => setBulkRole(e.target.value as InviteRole)} className="w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="member">Member</option>
                  <option value="vice_captain">Vice Captain</option>
                  <option value="captain">Captain</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
          {bulkError && <p className="text-xs text-destructive">{bulkError}</p>}
          <div className="flex justify-end">
            <Button onClick={addBulk} disabled={bulkSaving} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
              {bulkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Users className="w-3.5 h-3.5" /> Add All to Whitelist</>}
            </Button>
          </div>
        </div>
      )}

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
