'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { toast } from 'sonner'
import { inviteSubSuperAdmin } from '../actions'

export function InviteForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setLoading(true)
    const result = await inviteSubSuperAdmin(name.trim(), email.trim())
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${name} can now sign in as Sub Super Admin.`)
      setName('')
      setEmail('')
      onSuccess()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="flex justify-end mt-3">
        <button type="submit" disabled={loading} className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
          {loading
            ? <><Loader2 className="size-3.5 animate-spin" />Sending...</>
            : <><Plus className="size-3.5" />Send Invite</>
          }
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        The invited admin will be able to sign in via OTP using this email address.
      </p>
    </form>
  )
}
