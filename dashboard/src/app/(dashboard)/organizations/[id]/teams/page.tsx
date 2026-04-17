'use client'

import { use, useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Crown, Shield, Trash2, UserPlus, MoreHorizontal, Pencil, Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  getOrgTeams, getAvailableMembers,
  createTeam, updateTeam, deleteTeam,
  addTeamMember, removeTeamMember, updateTeamMemberRole,
  type TeamUI, type TeamMemberUI, type AvailableMember,
} from '@/lib/supabase/queries'

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRole = 'captain' | 'vice_captain' | 'member'
type Team = TeamUI
type Member = TeamMemberUI

// ── Constants ─────────────────────────────────────────────────────────────────

const teamColors = [
  { label: 'Red',     value: '#ef4444' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Purple',  value: '#8b5cf6' },
  { label: 'Pink',    value: '#ec4899' },
]

const teamEmojis = ['🥦', '🥕', '🍎', '🥑', '🍇', '🌽', '🫐', '🍊']

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = use(params)

  const [isLoading, setIsLoading] = useState(true)
  const [teams, setTeams]               = useState<Team[]>([])
  const [availablePool, setAvailablePool] = useState<AvailableMember[]>([])
  const [modalOpen, setModalOpen]       = useState(false)
  const [editTarget, setEditTarget]     = useState<Team | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)

  // Member remove confirmation
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ teamId: string; member: Member } | null>(null)

  // Role change confirmation
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    teamId: string
    member: Member
    role: 'captain' | 'vice_captain'
    displaced?: string
  } | null>(null)

  // Add member modal state
  const [addMemberTeamId, setAddMemberTeamId]   = useState<string | null>(null)
  const [memberSearch, setMemberSearch]         = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName]   = useState('')
  const [formColor, setFormColor] = useState(teamColors[3].value)
  const [formEmoji, setFormEmoji] = useState(teamEmojis[0])

  useEffect(() => {
    Promise.all([
      getOrgTeams(orgId),
      getAvailableMembers(orgId),
    ]).then(([t, a]) => {
      setTeams(t)
      setAvailablePool(a)
    }).finally(() => setIsLoading(false))
  }, [orgId])

  function openNew() {
    setEditTarget(null)
    setFormName('')
    setFormColor(teamColors[3].value)
    setFormEmoji(teamEmojis[0])
    setModalOpen(true)
  }

  function openEdit(team: Team) {
    setEditTarget(team)
    setFormName(team.name)
    setFormColor(team.color)
    setFormEmoji(team.emoji)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) return
    if (editTarget) {
      await updateTeam(editTarget.id, { name: formName, emoji: formEmoji, color: formColor })
      setTeams(prev => prev.map(t =>
        t.id === editTarget.id ? { ...t, name: formName, color: formColor, emoji: formEmoji } : t
      ))
    } else {
      const { data: newTeam } = await createTeam(orgId, { name: formName, emoji: formEmoji, color: formColor })
      if (newTeam) {
        setTeams(prev => [...prev, { id: newTeam.id, name: formName, emoji: formEmoji, color: formColor, points: 0, members: [] }])
      }
    }
    setModalOpen(false)
  }

  function requestRoleChange(team: Team, member: Member, role: 'captain' | 'vice_captain') {
    if (member.role === role) return
    const displaced = team.members.find(m => m.id !== member.id && m.role === role)
    setRoleChangeTarget({ teamId: team.id, member, role, displaced: displaced?.name })
  }

  async function confirmRoleChange() {
    if (!roleChangeTarget) return
    await updateTeamMemberRole(roleChangeTarget.teamId, roleChangeTarget.member.id, roleChangeTarget.role)
    setTeams(prev => prev.map(t => {
      if (t.id !== roleChangeTarget.teamId) return t
      return {
        ...t,
        members: t.members.map(m => {
          if (m.id === roleChangeTarget.member.id) return { ...m, role: roleChangeTarget.role }
          if (m.role === roleChangeTarget.role) return { ...m, role: 'member' as MemberRole }
          return m
        }),
      }
    }))
    setRoleChangeTarget(null)
  }

  function requestRemoveMember(teamId: string, member: Member) {
    setRemoveMemberTarget({ teamId, member })
  }

  async function confirmRemoveMember() {
    if (!removeMemberTarget) return
    await removeTeamMember(removeMemberTarget.teamId, removeMemberTarget.member.id)
    setTeams(prev => prev.map(t =>
      t.id !== removeMemberTarget.teamId ? t : {
        ...t, members: t.members.filter(m => m.id !== removeMemberTarget.member.id),
      }
    ))
    // Return member to available pool
    const removed = removeMemberTarget.member
    setAvailablePool(prev => [...prev, { id: removed.id, name: removed.name, avatarColor: removed.avatarColor }])
    setRemoveMemberTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteTeam(deleteTarget.id)
    setTeams(prev => prev.filter(t => t.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  // Add member helpers
  const addMemberTeam = useMemo(
    () => teams.find(t => t.id === addMemberTeamId) ?? null,
    [teams, addMemberTeamId],
  )

  const availableMembers = useMemo(() => {
    return availablePool.filter(p =>
      p.name.toLowerCase().includes(memberSearch.toLowerCase())
    )
  }, [availablePool, memberSearch])

  function openAddMember(teamId: string) {
    setAddMemberTeamId(teamId)
    setMemberSearch('')
    setSelectedMemberId(null)
  }

  async function confirmAddMember() {
    if (!addMemberTeamId || !selectedMemberId) return
    const person = availablePool.find(p => p.id === selectedMemberId)
    if (!person) return
    await addTeamMember(addMemberTeamId, person.id, orgId)
    setTeams(prev => prev.map(t =>
      t.id !== addMemberTeamId ? t : {
        ...t,
        members: [...t.members, { id: person.id, name: person.name, role: 'member', avatarColor: person.avatarColor }],
      }
    ))
    setAvailablePool(prev => prev.filter(p => p.id !== person.id))
    setAddMemberTeamId(null)
  }

  const totalMembers = teams.reduce((s, t) => s + t.members.length, 0)

  if (isLoading) return <TeamsSkeleton />

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {teams.length} teams · {totalMembers} members
          </p>
        </div>
        <button onClick={openNew} className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
          <Plus className="size-3.5" /> New Team
        </button>
      </div>

      {/* Team cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {teams.map(team => (
          <div key={team.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">

            {/* Card header */}
            <div className="p-4 flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
                style={{ backgroundColor: team.color + '22', border: `1.5px solid ${team.color}44` }}
              >
                {team.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg text-foreground leading-snug">{team.name}</p>
                <p className="text-xs text-muted-foreground">Yi Nutrition League 2.0</p>
                <p className="text-xs text-muted-foreground">{team.members.length} members</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold"
                  style={{ backgroundColor: team.color + '1a', color: team.color }}
                >
                  🥦 {team.points.toLocaleString()}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(team)} className="gap-2">
                      <Pencil className="w-3.5 h-3.5" /> Edit Team
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteTarget(team)} variant="destructive" className="gap-2">
                      <Trash2 className="w-3.5 h-3.5" /> Delete Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Members */}
            <div className="border-t border-border flex-1 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Members ({team.members.length})
                </p>
                <button
                  onClick={() => openAddMember(team.id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              <div className="divide-y divide-border flex-1">
                {team.members.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No members yet. Add the first member.
                  </div>
                ) : team.members.map(member => (
                  <div
                    key={member.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5',
                      member.role === 'captain'      && 'bg-amber-50/60',
                      member.role === 'vice_captain' && 'bg-blue-50/60',
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: member.avatarColor }}
                    >
                      {initials(member.name)}
                    </div>

                    {/* Name + badge */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      {member.role === 'captain' && (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          <Crown className="w-3 h-3" /> Captain
                        </span>
                      )}
                      {member.role === 'vice_captain' && (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                          <Shield className="w-3 h-3" /> Vice Captain
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => requestRoleChange(team, member, 'captain')}
                        title="Make Captain"
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          member.role === 'captain'
                            ? 'text-amber-500 bg-amber-100'
                            : 'text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-50'
                        )}
                      >
                        <Crown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => requestRoleChange(team, member, 'vice_captain')}
                        title="Make Vice Captain"
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          member.role === 'vice_captain'
                            ? 'text-blue-500 bg-blue-100'
                            : 'text-muted-foreground/30 hover:text-blue-500 hover:bg-blue-50'
                        )}
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend + View Team */}
              <div className="px-4 py-2.5 border-t border-border flex items-center gap-4">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Crown className="w-3 h-3 text-amber-400" /> Captain
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3 text-blue-400" /> Vice Captain
                </span>
                <Link
                  href={`/organizations/${orgId}/teams/${team.id}`}
                  className="ml-auto flex items-center gap-0.5 text-xs text-primary hover:underline"
                >
                  View Team <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Team modal */}
      <Dialog open={modalOpen} onOpenChange={v => { if (!v) setModalOpen(false) }}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Team' : 'Create New Team'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team Name <span className="text-destructive">*</span></Label>
              <Input
                id="team-name"
                placeholder="e.g. Team Avocado"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Team Color</Label>
              <div className="flex gap-2">
                {teamColors.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setFormColor(c.value)}
                    title={c.label}
                    className={cn(
                      'flex-1 h-9 rounded-xl border-2 transition-all',
                      formColor === c.value ? 'border-foreground scale-105' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Team Emoji</Label>
              <div className="flex gap-2">
                {teamEmojis.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setFormEmoji(e)}
                    className={cn(
                      'flex-1 h-10 rounded-xl text-xl border-2 transition-all flex items-center justify-center bg-muted/50',
                      formEmoji === e
                        ? 'border-primary bg-primary/10 scale-105'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
            >
              Cancel
            </button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim()}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {editTarget ? 'Save Changes' : 'Create Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member modal */}
      <Dialog open={!!addMemberTeamId} onOpenChange={v => { if (!v) setAddMemberTeamId(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Member to {addMemberTeam?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search members…"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border max-h-56 overflow-y-auto">
              {availableMembers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {memberSearch ? 'No members match your search.' : 'All org members are already in a team.'}
                </p>
              ) : availableMembers.map(person => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedMemberId(prev => prev === person.id ? null : person.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    selectedMemberId === person.id
                      ? 'bg-primary/8 text-primary'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: person.avatarColor }}
                  >
                    {initials(person.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{person.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Unassigned</p>
                  </div>
                  {selectedMemberId === person.id && (
                    <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-1">
            <button
              onClick={() => setAddMemberTeamId(null)}
              className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
            >
              Cancel
            </button>
            <Button
              onClick={confirmAddMember}
              disabled={!selectedMemberId}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add to Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirm */}
      <Dialog open={!!removeMemberTarget} onOpenChange={v => { if (!v) setRemoveMemberTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove {removeMemberTarget?.member.name}?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              They will be removed from the team but remain an org member.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button
              onClick={() => setRemoveMemberTarget(null)}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button onClick={confirmRemoveMember} className="bg-destructive text-white hover:bg-destructive/90">
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirm */}
      <Dialog open={!!roleChangeTarget} onOpenChange={v => { if (!v) setRoleChangeTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              Make {roleChangeTarget?.member.name}{' '}
              {roleChangeTarget?.role === 'captain' ? 'Captain' : 'Vice Captain'}?
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {roleChangeTarget?.displaced
                ? `${roleChangeTarget.displaced} will be demoted to Member.`
                : `${roleChangeTarget?.member.name} will be assigned this role.`}
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button
              onClick={() => setRoleChangeTarget(null)}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button onClick={confirmRoleChange} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm modal */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This will remove the team and unassign all members. Cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </button>
            <Button onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TeamsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-20 bg-muted rounded-md" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-8 w-28 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[4, 3, 5, 4, 3].map((memberCount, i) => (
          <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-muted rounded-lg shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
              </div>
              <div className="h-7 w-7 bg-muted rounded-lg shrink-0" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: memberCount }).map((_, j) => (
                <div key={j} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                  <div className="flex-1 h-3.5 bg-muted rounded" />
                  <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="h-7 w-16 bg-muted rounded-lg" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
