'use client'

import { useState } from 'react'
import { Trash2, Loader2, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { removeSubSuperAdmin } from '../actions'
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
import { buttonVariants, Button } from '@/components/ui/button'

interface Props {
  admin: {
    id: string
    name: string
    email: string
    role: string
  }
  isSuperAdmin: boolean
}

export function PlatformAdminRowActions({ admin, isSuperAdmin }: Props) {
  const [removed, setRemoved] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  if (removed) return null

  // Safety: Cannot delete self or other super admins from this UI
  const canDelete = isSuperAdmin && admin.role === 'sub_super_admin'
  if (!canDelete) return null

  async function handleRemove() {
    setLoading(true)
    const result = await removeSubSuperAdmin(admin.id)
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
    } else {
      toast.success(`${admin.name} removed as platform admin.`)
      setRemoved(true)
      setShowConfirm(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            onClick={() => setShowConfirm(true)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="size-3.5" />
            Remove Admin
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove Platform Admin?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {admin.name} will lose all platform access immediately. Their authentication record will also be purged.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleRemove}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
