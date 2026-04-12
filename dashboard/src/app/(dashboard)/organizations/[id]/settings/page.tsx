'use client'

import { use, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import {
  getOrgSettings, updateOrgSettings, setOrgActive, deleteOrg,
} from '@/lib/supabase/queries'

// ── Data ──────────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { label: 'India',          value: 'IN' },
  { label: 'Nepal',          value: 'NP' },
  { label: 'Bangladesh',     value: 'BD' },
  { label: 'Sri Lanka',      value: 'LK' },
  { label: 'Pakistan',       value: 'PK' },
  { label: 'Thailand',       value: 'TH' },
  { label: 'Indonesia',      value: 'ID' },
  { label: 'Malaysia',       value: 'MY' },
  { label: 'Singapore',      value: 'SG' },
  { label: 'Philippines',    value: 'PH' },
  { label: 'Japan',          value: 'JP' },
  { label: 'South Korea',    value: 'KR' },
  { label: 'Australia',      value: 'AU' },
  { label: 'UAE',            value: 'AE' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'Germany',        value: 'DE' },
  { label: 'France',         value: 'FR' },
  { label: 'United States',  value: 'US' },
  { label: 'Canada',         value: 'CA' },
  { label: 'Other',          value: 'XX' },
]

const TIMEZONES = [
  { label: '(UTC+5:30) Kolkata / Mumbai',   value: 'Asia/Kolkata' },
  { label: '(UTC+5:45) Kathmandu',          value: 'Asia/Kathmandu' },
  { label: '(UTC+6:00) Dhaka',              value: 'Asia/Dhaka' },
  { label: '(UTC+7:00) Bangkok / Jakarta',  value: 'Asia/Bangkok' },
  { label: '(UTC+8:00) Singapore / KL',     value: 'Asia/Singapore' },
  { label: '(UTC+9:00) Tokyo / Seoul',      value: 'Asia/Tokyo' },
  { label: '(UTC+10:00) Sydney',            value: 'Australia/Sydney' },
  { label: '(UTC+3:00) Nairobi / Riyadh',  value: 'Africa/Nairobi' },
  { label: '(UTC+4:00) Dubai / Abu Dhabi',  value: 'Asia/Dubai' },
  { label: '(UTC+0:00) London (GMT/BST)',   value: 'Europe/London' },
  { label: '(UTC+1:00) Paris / Berlin',     value: 'Europe/Paris' },
  { label: '(UTC-5:00) New York / Toronto', value: 'America/New_York' },
  { label: '(UTC-8:00) Los Angeles',        value: 'America/Los_Angeles' },
  { label: '(UTC+0:00) UTC',               value: 'UTC' },
]

// ── Shared styles ─────────────────────────────────────────────────────────────

const selectCls = cn(
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground',
  'focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none',
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-no-repeat bg-[right_12px_center]",
)

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = use(params)
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [name, setName]         = useState('')
  const [country, setCountry]   = useState('IN')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [isActive, setIsActive] = useState(true)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    getOrgSettings(orgId).then(s => {
      if (s) { setName(s.name); setCountry(s.country); setTimezone(s.timezone); setIsActive(s.isActive) }
    }).finally(() => setIsLoading(false))
  }, [orgId])

  const [showDeactivate, setShowDeactivate] = useState(false)
  const [showDelete, setShowDelete]         = useState(false)
  const [deleteConfirm, setDeleteConfirm]   = useState('')

  async function handleSave() {
    await updateOrgSettings(orgId, { name, country, timezone })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return <SettingsSkeleton />

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage this organization's details and status</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

        {/* Left — Organization Details */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Organization Details</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-country">Country</Label>
              <select
                id="org-country"
                value={country}
                onChange={e => setCountry(e.target.value)}
                className={selectCls}
              >
                {COUNTRIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-timezone">Timezone</Label>
              <select
                id="org-timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className={selectCls}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                All challenge dates apply at 12:00 AM in this timezone.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <Button onClick={handleSave} className={saved ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
              {saved ? 'Saved ✓' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Right — Status + Danger Zone */}
        <div className="space-y-5">

          {/* Organization Status */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Organization Status</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-block w-2 h-2 rounded-full shrink-0',
                  isActive ? 'bg-emerald-500' : 'bg-muted-foreground',
                )} />
                <p className="text-sm font-medium text-foreground">
                  Currently {isActive ? 'Active' : 'Inactive'}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {isActive
                  ? 'Members can log in, submit activities, and earn points.'
                  : 'All member access is suspended.'}
              </p>
              {isActive ? (
                <button
                  onClick={() => setShowDeactivate(true)}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-destructive text-destructive hover:bg-destructive/10 w-full')}
                >
                  Deactivate Organization
                </button>
              ) : (
                <Button size="sm" onClick={async () => { await setOrgActive(orgId, true); setIsActive(true) }} className="w-full">
                  Activate Organization
                </Button>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-card border border-destructive/40 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
              <h2 className="font-semibold text-destructive">Danger Zone</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Delete Organization</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Permanently removes all teams, members, challenges, and data. Cannot be undone.
                </p>
              </div>
              <button
                onClick={() => { setDeleteConfirm(''); setShowDelete(true) }}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-destructive text-destructive hover:bg-destructive/10 w-full')}
              >
                Delete Organization
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Deactivate confirm */}
      <Dialog open={showDeactivate} onOpenChange={v => { if (!v) setShowDeactivate(false) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Deactivate Organization?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Members will lose access immediately. You can reactivate at any time.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setShowDeactivate(false)} className={cn(buttonVariants({ variant: 'outline' }))}>
              Cancel
            </button>
            <Button onClick={async () => { await setOrgActive(orgId, false); setIsActive(false); setShowDeactivate(false) }} className="bg-destructive text-white hover:bg-destructive/90">
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={v => { if (!v) setShowDelete(false) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Organization?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently delete all data. Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
            </p>
          </DialogHeader>
          <Input
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="mt-1"
            autoFocus
          />
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2 pt-1">
            <button onClick={() => setShowDelete(false)} className={cn(buttonVariants({ variant: 'outline' }))}>
              Cancel
            </button>
            <Button
              disabled={deleteConfirm !== 'DELETE'}
              onClick={async () => { await deleteOrg(orgId); router.push('/organizations') }}
              className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-40"
            >
              Delete Forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-8 w-24 bg-muted rounded-md" />
        <div className="h-4 w-56 bg-muted rounded" />
      </div>
      {/* Details card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <div className="h-4 w-40 bg-muted rounded" />
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <div className="h-3.5 w-12 bg-muted rounded" />
            <div className="h-9 bg-muted rounded-lg" />
          </div>
          <div className="space-y-1.5">
              <div className="h-3.5 w-16 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
          </div>
          <div className="space-y-1.5">
              <div className="h-3.5 w-20 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Right column skeleton */}
      <div className="space-y-5">
        {/* Status card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <div className="h-4 w-44 bg-muted rounded" />
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3.5 w-56 bg-muted rounded" />
            <div className="h-8 bg-muted rounded-lg w-full" />
          </div>
        </div>
        {/* Danger card */}
        <div className="bg-card border border-destructive/30 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-destructive/20">
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="space-y-1.5">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-3.5 w-56 bg-muted rounded" />
            </div>
            <div className="h-8 bg-muted rounded-lg w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
