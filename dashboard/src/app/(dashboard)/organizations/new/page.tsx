'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, Globe, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { toast } from 'sonner'
import { createOrganization } from './actions'

const EMOJI_OPTIONS = ['🏙️', '🕌', '🌿', '🏔️', '🌊', '🏛️', '🌆', '🌇', '🏢', '🎯', '🚀', '⚡']

const COUNTRIES: { label: string; value: string; timezone: string }[] = [
  { label: 'India',               value: 'IN', timezone: 'Asia/Kolkata' },
  { label: 'Nepal',               value: 'NP', timezone: 'Asia/Kathmandu' },
  { label: 'Bangladesh',          value: 'BD', timezone: 'Asia/Dhaka' },
  { label: 'Sri Lanka',           value: 'LK', timezone: 'Asia/Colombo' },
  { label: 'Pakistan',            value: 'PK', timezone: 'Asia/Karachi' },
  { label: 'Thailand',            value: 'TH', timezone: 'Asia/Bangkok' },
  { label: 'Indonesia',           value: 'ID', timezone: 'Asia/Bangkok' },
  { label: 'Malaysia',            value: 'MY', timezone: 'Asia/Singapore' },
  { label: 'Singapore',           value: 'SG', timezone: 'Asia/Singapore' },
  { label: 'Philippines',         value: 'PH', timezone: 'Asia/Singapore' },
  { label: 'Japan',               value: 'JP', timezone: 'Asia/Tokyo' },
  { label: 'South Korea',         value: 'KR', timezone: 'Asia/Tokyo' },
  { label: 'China',               value: 'CN', timezone: 'Asia/Singapore' },
  { label: 'Australia',           value: 'AU', timezone: 'Australia/Sydney' },
  { label: 'New Zealand',         value: 'NZ', timezone: 'Pacific/Auckland' },
  { label: 'Kenya',               value: 'KE', timezone: 'Africa/Nairobi' },
  { label: 'Saudi Arabia',        value: 'SA', timezone: 'Africa/Nairobi' },
  { label: 'UAE',                 value: 'AE', timezone: 'Asia/Dubai' },
  { label: 'United Kingdom',      value: 'GB', timezone: 'Europe/London' },
  { label: 'Germany',             value: 'DE', timezone: 'Europe/Paris' },
  { label: 'France',              value: 'FR', timezone: 'Europe/Paris' },
  { label: 'Egypt',               value: 'EG', timezone: 'Europe/Athens' },
  { label: 'South Africa',        value: 'ZA', timezone: 'Europe/Athens' },
  { label: 'Brazil',              value: 'BR', timezone: 'America/Sao_Paulo' },
  { label: 'United States',       value: 'US', timezone: 'America/New_York' },
  { label: 'Canada',              value: 'CA', timezone: 'America/New_York' },
  { label: 'Other',               value: 'XX', timezone: 'UTC' },
]

const TIMEZONES = [
  { label: '(UTC+5:30) Kolkata / Mumbai',   value: 'Asia/Kolkata' },
  { label: '(UTC+5:45) Kathmandu',          value: 'Asia/Kathmandu' },
  { label: '(UTC+6:00) Dhaka',              value: 'Asia/Dhaka' },
  { label: '(UTC+7:00) Bangkok / Jakarta',  value: 'Asia/Bangkok' },
  { label: '(UTC+8:00) Singapore / KL',     value: 'Asia/Singapore' },
  { label: '(UTC+9:00) Tokyo / Seoul',      value: 'Asia/Tokyo' },
  { label: '(UTC+10:00) Sydney',            value: 'Australia/Sydney' },
  { label: '(UTC+12:00) Auckland',          value: 'Pacific/Auckland' },
  { label: '(UTC+3:00) Nairobi / Riyadh',  value: 'Africa/Nairobi' },
  { label: '(UTC+4:00) Dubai / Abu Dhabi',  value: 'Asia/Dubai' },
  { label: '(UTC+0:00) London (GMT/BST)',   value: 'Europe/London' },
  { label: '(UTC+1:00) Paris / Berlin',     value: 'Europe/Paris' },
  { label: '(UTC+2:00) Cairo / Athens',     value: 'Europe/Athens' },
  { label: '(UTC-3:00) São Paulo',          value: 'America/Sao_Paulo' },
  { label: '(UTC-5:00) New York / Toronto', value: 'America/New_York' },
  { label: '(UTC-6:00) Chicago',            value: 'America/Chicago' },
  { label: '(UTC-7:00) Denver / Phoenix',   value: 'America/Denver' },
  { label: '(UTC-8:00) Los Angeles',        value: 'America/Los_Angeles' },
  { label: '(UTC+0:00) UTC',                value: 'UTC' },
]

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

export default function NewOrganizationPage() {
  const router = useRouter()
  const [emoji, setEmoji] = useState('🏙️')
  const [name, setName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [country, setCountry] = useState('IN')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setSaving(true)
    const result = await createOrganization({ name, logo: emoji, country, timezone, adminName, adminEmail })
    if (result.error) {
      toast.error(result.error)
      setSaving(false)
      return
    }
    toast.success('Organization created.')
    router.push('/organizations/' + result.orgId)
  }

  const selectedCountry = COUNTRIES.find(c => c.value === country)
  const valid = name.trim().length > 0 && adminEmail.includes('@')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/organizations"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 text-muted-foreground')}
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </div>

      <div>
        <h1 className="font-heading text-3xl text-foreground">New Organization</h1>
        <p className="text-muted-foreground mt-1 text-sm">Set up a new organization on the platform.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Left: form ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Identity */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-5">
              <h2 className="font-semibold text-foreground">Organization Identity</h2>

              {/* Emoji + Name side by side */}
              <div className="flex gap-4 items-start">
                <div className="space-y-2 shrink-0">
                  <label className="text-sm font-medium text-foreground">Logo</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {EMOJI_OPTIONS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className={cn(
                          'w-10 h-10 rounded-lg text-xl border-2 transition-colors',
                          emoji === e
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-muted hover:border-primary/40'
                        )}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-4 min-w-0">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium text-foreground">
                      Organization Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Young Indians Mumbai"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Country + Timezone side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="country" className="text-sm font-medium text-foreground">
                    Country <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="country"
                    value={country}
                    onChange={e => {
                      const c = COUNTRIES.find(x => x.value === e.target.value)
                      setCountry(e.target.value)
                      if (c) setTimezone(c.timezone)
                    }}
                    className={inputCls}
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="timezone" className="text-sm font-medium text-foreground">
                    Timezone <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className={inputCls}
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Timezone is auto-filled from country. Challenge dates apply at 12:00 AM in this timezone.
              </p>
            </div>

            {/* Org Admin */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-foreground">Org Admin</h2>
                <p className="text-sm text-muted-foreground mt-0.5">This person will manage the organization and its members.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="adminName" className="text-sm font-medium text-foreground">Full Name</label>
                  <input
                    id="adminName"
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="Rahul Mehta"
                    className={inputCls}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="adminEmail" className="text-sm font-medium text-foreground">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="adminEmail"
                    type="email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="rahul@example.com"
                    className={inputCls}
                    required
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                An invite will be sent to this email. They&apos;ll set up their account via OTP.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Link href="/organizations" className={cn(buttonVariants({ variant: 'outline' }))}>
                Cancel
              </Link>
              <button
                type="submit"
                disabled={!valid || saving}
                className={cn(buttonVariants(), 'gap-2', (!valid || saving) && 'opacity-50 cursor-not-allowed')}
              >
                <Building2 className="size-4" />
                {saving ? 'Creating…' : 'Create Organization'}
              </button>
            </div>
          </div>

          {/* ── Right: sticky preview ── */}
          <div className="space-y-4 lg:sticky lg:top-6">

            {/* Live preview */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Live Preview</h2>

              {/* Org card preview */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="p-4 flex items-center gap-3 border-b border-border bg-muted/30">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl shrink-0">
                    {emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="font-heading text-base text-foreground truncate">
                      {name || <span className="text-muted-foreground">Organization Name</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">auto-generated from name</p>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Org Admin</p>
                    <p className="font-medium text-foreground mt-0.5 truncate">
                      {adminName || <span className="text-muted-foreground">—</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="font-medium text-foreground mt-0.5">{selectedCountry?.label ?? '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Timezone</p>
                    <p className="font-medium text-foreground mt-0.5 truncate">{timezone}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Org Admin invite</p>
                  <p className="text-xs text-muted-foreground mt-0.5">An OTP invite is automatically sent to the admin email on creation.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Timezone matters</p>
                  <p className="text-xs text-muted-foreground mt-0.5">All challenge start/end dates are interpreted as 12:00 AM in the org&apos;s timezone.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}
