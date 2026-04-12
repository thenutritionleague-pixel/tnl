'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updateAdminName, finalizeEmailChange } from '../actions'
import type { AdminUser } from '@/types/database.types'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  sub_super_admin: 'Sub Super Admin',
  org_admin: 'Org Admin',
  sub_admin: 'Sub Admin',
}

type EmailStep = 'idle' | 'enter' | 'otp'

export function SettingsForm({ profile }: { profile: AdminUser }) {
  const supabase = createClient()
  const isPlatformAdmin = profile.role === 'super_admin' || profile.role === 'sub_super_admin'

  // Name
  const [name, setName] = useState(profile.name ?? '')
  const [savingName, setSavingName] = useState(false)

  // Email change
  const [emailStep, setEmailStep] = useState<EmailStep>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [sendingCode, setSendingCode] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setSavingName(true)
    const result = await updateAdminName(name)
    if (result.error) toast.error(result.error)
    else toast.success('Name updated.')
    setSavingName(false)
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail || newEmail === profile.email) {
      toast.error('Enter a different email address.')
      return
    }
    setSendingCode(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: newEmail,
      options: { shouldCreateUser: true },
    })
    if (error) {
      toast.error(error.message)
      setSendingCode(false)
      return
    }
    setEmailStep('otp')
    setSendingCode(false)
    toast.success('Code sent to ' + newEmail)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const token = otp.join('')
    if (token.length < 6) return
    setVerifying(true)

    // Verify OTP — this creates a session for the new email user
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: newEmail,
      token,
      type: 'email',
    })
    if (otpError) {
      toast.error('Invalid or expired code. Try again.')
      setVerifying(false)
      return
    }

    // OTP verified — finalize on server (updates original auth user + admin_users, cleans up temp user)
    const result = await finalizeEmailChange(profile.id, profile.user_id, newEmail)
    if (result.error) {
      toast.error(result.error)
      setVerifying(false)
      return
    }

    toast.success('Email updated! Please sign in with your new email.')
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otp]
    pasted.split('').forEach((d, i) => { next[i] = d })
    setOtp(next)
    otpRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  function resetEmailFlow() {
    setEmailStep('idle')
    setNewEmail('')
    setOtp(['', '', '', '', '', ''])
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account details.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left: Admin Account ── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Admin Account</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Your personal admin profile.</p>
          </div>

          {/* Name */}
          <form onSubmit={handleSaveName} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-name">Name</Label>
              <Input
                id="admin-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <Button type="submit" disabled={savingName} className="bg-primary text-primary-foreground">
              {savingName ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Name'}
            </Button>
          </form>

          <div className="h-px bg-border" />

          {/* Current email */}
          <div className="space-y-1.5">
            <Label>Current Email</Label>
            <Input
              value={profile.email}
              readOnly
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* ── Email change flow ── */}
          {emailStep === 'idle' && (
            <Button variant="outline" onClick={() => setEmailStep('enter')} className="w-full">
              Change Email
            </Button>
          )}

          {emailStep === 'enter' && (
            <form onSubmit={handleSendCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">New Email Address</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  A 6-digit verification code will be sent to your new email.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={resetEmailFlow} className="flex-1">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={sendingCode || !newEmail}
                  className="flex-1 bg-primary text-primary-foreground"
                >
                  {sendingCode ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send Code'}
                </Button>
              </div>
            </form>
          )}

          {emailStep === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label>Enter the 6-digit code sent to</Label>
                <p className="text-sm font-medium text-foreground -mt-1">{newEmail}</p>
                <div className="flex gap-2" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      className="w-full h-12 text-center text-lg font-semibold border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setEmailStep('enter'); setOtp(['', '', '', '', '', '']) }}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={verifying || otp.join('').length < 6}
                  className="flex-1 bg-primary text-primary-foreground"
                >
                  {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify & Update'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* ── Right: Account Details + Security ── */}
        <div className="space-y-6">
          {/* Account Details */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Account Details</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Your role and access information.</p>
            </div>
            <div className="space-y-0">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <span className="text-sm text-muted-foreground">Role</span>
                <span className="text-sm font-medium text-foreground">{ROLE_LABEL[profile.role] ?? profile.role}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm font-medium text-foreground">
                  {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone — org admins only */}
          {!isPlatformAdmin && (
            <div className="bg-card border border-destructive/30 rounded-xl p-6 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Deactivating your account will immediately revoke your access. Contact a super admin to reactivate.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground w-full transition-colors"
                onClick={() => toast.error('Contact your super admin to deactivate your account.')}
              >
                Deactivate Account
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
