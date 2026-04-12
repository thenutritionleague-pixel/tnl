'use client'

import { useState } from 'react'
import { Shield, Plus, MoreHorizontal, UserCog, Trash2, ShieldCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createSubAdmin, removeSubAdmin } from '../actions'
import type { OrgAdminUser } from '@/lib/supabase/admin-queries'

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
function avatarColor(email: string) {
  let hash = 0
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

interface Props {
  orgId: string
  orgAdmin: OrgAdminUser | null
  subAdmins: OrgAdminUser[]
  canManage: boolean
}

export function OrgAdminsClient({ orgId, orgAdmin, subAdmins: initialSubAdmins, canManage }: Props) {
  const [subAdmins, setSubAdmins] = useState(initialSubAdmins)
  const [formName, setFormName]   = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [saving, setSaving]       = useState(false)
  const [removeTarget, setRemoveTarget] = useState<OrgAdminUser | null>(null)
  const [removing, setRemoving]   = useState(false)

  async function handleAdd() {
    const name  = formName.trim()
    const email = formEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address.')
      return
    }
    setSaving(true)
    const result = await createSubAdmin(orgId, name, email)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${name || email} added as Sub Admin.`)
      // Optimistically add to list
      setSubAdmins(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: name || email.split('@')[0],
        email,
        role: 'sub_admin' as const,
        status: 'active',
        createdAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      }])
      setFormName('')
      setFormEmail('')
    }
    setSaving(false)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    const result = await removeSubAdmin(orgId, removeTarget.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${removeTarget.name} removed.`)
      setSubAdmins(prev => prev.filter(a => a.id !== removeTarget.id))
      setRemoveTarget(null)
    }
    setRemoving(false)
  }

  const activeAdmins  = subAdmins.filter(a => a.status === 'active')
  const pendingAdmins = subAdmins.filter(a => a.status !== 'active')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Admins</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage dashboard access for this organization.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* Left — admin list */}
        <div className="space-y-4">

          {/* Org Admin card */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground text-sm">Org Admin</h2>
              </div>
              <span className="text-xs text-muted-foreground">Set by Super Admin · read-only</span>
            </div>
            {orgAdmin ? (
              <div className="px-5 py-4 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: avatarColor(orgAdmin.email) }}
                >
                  {initials(orgAdmin.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{orgAdmin.name}</p>
                  <p className="text-xs text-muted-foreground">{orgAdmin.email}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  Org Admin
                </span>
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">No org admin assigned.</p>
            )}
          </div>

          {/* Sub admins */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground text-sm">Sub Admins</h2>
              </div>
              <span className="text-xs text-muted-foreground">{subAdmins.length} total</span>
            </div>

            {subAdmins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <UserCog className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No sub admins yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeAdmins.length > 0 && (
                  <>
                    <div className="px-5 py-2 bg-muted/30">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Active ({activeAdmins.length})
                      </p>
                    </div>
                    {activeAdmins.map(admin => (
                      <AdminRow key={admin.id} admin={admin} canManage={canManage} onRemove={setRemoveTarget} />
                    ))}
                  </>
                )}
                {pendingAdmins.length > 0 && (
                  <>
                    <div className="px-5 py-2 bg-muted/30">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Pending ({pendingAdmins.length})
                      </p>
                    </div>
                    {pendingAdmins.map(admin => (
                      <AdminRow key={admin.id} admin={admin} canManage={canManage} onRemove={setRemoveTarget} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — add form */}
        {canManage && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Add Sub Admin</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Sub admins can manage challenges, approvals, teams, members, and settings for this org.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-name">Full Name</Label>
                <Input
                  id="sa-name"
                  placeholder="e.g. Priya Sharma"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sa-email">Email Address <span className="text-destructive">*</span></Label>
                <Input
                  id="sa-email"
                  type="email"
                  placeholder="priya@example.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </div>
            <Button
              onClick={handleAdd}
              disabled={saving || !formEmail}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</> : <><Plus className="w-3.5 h-3.5" /> Add Sub Admin</>}
            </Button>
          </div>
        )}
      </div>

      {/* Remove confirm dialog */}
      <Dialog open={!!removeTarget} onOpenChange={v => { if (!v) setRemoveTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              They will lose access to this org&apos;s dashboard immediately.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setRemoveTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>
              Cancel
            </button>
            <Button
              onClick={confirmRemove}
              disabled={removing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminRow({ admin, canManage, onRemove }: { admin: OrgAdminUser; canManage: boolean; onRemove: (a: OrgAdminUser) => void }) {
  const color = AVATAR_COLORS[admin.email.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials(admin.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{admin.name}</p>
        <p className="text-xs text-muted-foreground truncate">{admin.email} · Added {admin.createdAt}</p>
      </div>
      <span className={cn(
        'text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0',
        admin.status === 'active'  && 'bg-emerald-100 text-emerald-700',
        admin.status !== 'active'  && 'bg-amber-100 text-amber-700',
      )}>
        {admin.status === 'active' ? 'Active' : 'Pending'}
      </span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem
              onClick={() => onRemove(admin)}
              variant="destructive"
              className="gap-2 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" /> Remove Admin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
