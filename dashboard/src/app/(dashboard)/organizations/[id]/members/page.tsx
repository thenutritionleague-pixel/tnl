'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MoreHorizontal, Search, UserMinus, Eye, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getOrgMembers, removeMember, updateTeamMemberRole,
  type OrgMember,
} from '@/lib/supabase/queries'

// ── Helpers ───────────────────────────────────────────────────────────────────

type DisplayRole = 'captain' | 'vice_captain' | 'member'

const roleLabel: Record<DisplayRole, string> = {
  captain:      'Captain',
  vice_captain: 'Vice Captain',
  member:       'Member',
}

const roleStyle: Record<DisplayRole, string> = {
  captain:      'bg-amber-100 text-amber-700',
  vice_captain: 'bg-blue-100 text-blue-700',
  member:       'bg-muted text-muted-foreground',
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function displayRole(m: OrgMember): DisplayRole {
  return (m.teamRole as DisplayRole) ?? 'member'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = use(params)
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [members, setMembers]     = useState<OrgMember[]>([])
  const [search, setSearch]       = useState('')
  const [teamFilter, setTeamFilter] = useState('')

  // Edit (role only) modal
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [editRole, setEditRole]     = useState<DisplayRole>('member')
  const [saving, setSaving]         = useState(false)

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)
  const [removing, setRemoving]         = useState(false)

  useEffect(() => {
    getOrgMembers(orgId).then(setMembers).finally(() => setIsLoading(false))
  }, [orgId])

  const teamList = useMemo(
    () => [...new Set(members.map(m => m.team).filter(t => t !== 'Unassigned'))].sort(),
    [members],
  )

  const filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
                        m.email.toLowerCase().includes(search.toLowerCase())
    const matchTeam   = !teamFilter || m.team === teamFilter
    return matchSearch && matchTeam
  })

  function openEdit(m: OrgMember) {
    setEditTarget(m)
    setEditRole(displayRole(m))
  }

  async function confirmEdit() {
    if (!editTarget || !editTarget.teamId) return
    setSaving(true)
    await updateTeamMemberRole(editTarget.teamId, editTarget.id, editRole)
    setMembers(prev => prev.map(m =>
      m.id === editTarget.id ? { ...m, teamRole: editRole } : m
    ))
    setEditTarget(null)
    setSaving(false)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    await removeMember(orgId, removeTarget.id)
    setMembers(prev => prev.filter(m => m.id !== removeTarget.id))
    setRemoveTarget(null)
    setRemoving(false)
  }

  if (isLoading) return <MembersSkeleton />

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{members.length} members in this organization</p>
        </div>
        <Link
          href={`/organizations/${orgId}/invite`}
          className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
        >
          <Plus className="size-3.5" /> Invite Member
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="relative">
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className={cn(
              'appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
              !teamFilter && 'text-muted-foreground',
            )}
          >
            <option value="">All Teams</option>
            {teamList.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Team</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Points</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Joined</th>
              <th className="px-5 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No members found.
                </td>
              </tr>
            ) : filtered.map(m => {
              const dr = displayRole(m)
              return (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: m.avatarColor }}
                      >
                        {initials(m.name)}
                      </div>
                      <Link
                        href={`/organizations/${orgId}/members/${m.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {m.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs hidden sm:table-cell">{m.email}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-sm">{m.team}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', roleStyle[dr])}>
                      {roleLabel[dr]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-foreground">🥦 {m.points}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs hidden md:table-cell">{m.joinedAt}</td>
                  <td className="px-5 py-3.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom" className="min-w-[168px]">
                        <DropdownMenuItem
                          onClick={() => router.push(`/organizations/${orgId}/members/${m.id}`)}
                          className="gap-2 whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" /> View Member
                        </DropdownMenuItem>
                        {m.teamId && (
                          <DropdownMenuItem onClick={() => openEdit(m)} className="gap-2 whitespace-nowrap">
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" /> Change Role
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setRemoveTarget(m)}
                          variant="destructive"
                          className="gap-2 whitespace-nowrap"
                        >
                          <UserMinus className="w-3.5 h-3.5" /> Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Edit role modal */}
      <Dialog open={!!editTarget} onOpenChange={v => { if (!v) setEditTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-5 py-1">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: editTarget.avatarColor }}
                >
                  {initials(editTarget.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{editTarget.name}</p>
                  <p className="text-xs text-muted-foreground">{editTarget.team}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Team Role</label>
                <div className="relative">
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as DisplayRole)}
                    className={cn(
                      'w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
                    )}
                  >
                    <option value="member">Member</option>
                    <option value="vice_captain">Vice Captain</option>
                    <option value="captain">Captain</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
          )}

          <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-1">
            <button
              onClick={() => setEditTarget(null)}
              className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
            >
              Cancel
            </button>
            <Button
              onClick={confirmEdit}
              disabled={saving}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={!!removeTarget} onOpenChange={v => { if (!v) setRemoveTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              They will be removed from the org and lose access to the app.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button
              onClick={() => setRemoveTarget(null)}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button
              onClick={confirmRemove}
              disabled={removing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MembersSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-28 bg-muted rounded-md" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-8 w-32 bg-muted rounded-lg" />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 flex-1 min-w-48 max-w-xs bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/30">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-3 w-16 bg-muted rounded flex-1" />)}
          <div className="w-10 shrink-0" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
              <div className="h-3.5 w-32 bg-muted rounded hidden sm:block shrink-0" />
              <div className="h-3.5 w-20 bg-muted rounded shrink-0" />
              <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
              <div className="h-4 w-10 bg-muted rounded shrink-0" />
              <div className="h-3.5 w-12 bg-muted rounded hidden md:block shrink-0" />
              <div className="w-6 h-6 bg-muted rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
