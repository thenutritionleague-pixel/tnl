'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Check, ArrowLeft, Mail } from 'lucide-react'
import { checkAdminEmail } from './actions'

const features = [
  'Approve daily task submissions',
  'Track team & individual leaderboards',
  'Manage challenges, events & members',
]

type Step = 'email' | 'otp'

function LoginContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      setError('Your account is not active. Contact your administrator.')
    }
  }, [searchParams])

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const check = await checkAdminEmail(email)
    if ('error' in check) {
      setError(check.error ?? 'Not authorized.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) {
      setError('Failed to send sign-in code. Please try again.')
      setLoading(false)
      return
    }

    setStep('otp')
    setResendCooldown(60)
    setLoading(false)
    toast.success('OTP sent — check your email')
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const token = otp.join('')
    if (token.length < 6) { setError('Enter the full 6-digit code.'); return }

    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      setError('Invalid or expired code. Try again.')
      setLoading(false)
      return
    }

    if (data.user) {
      const { data: adminUser, error: adminError } = await supabase
        .from('admin_users')
        .select('role, status, org_id')
        .eq('email', email)
        .single()

      console.log('[login] adminUser:', adminUser, 'error:', adminError)

      if (!adminUser) {
        await supabase.auth.signOut()
        setError('Access denied. This dashboard is for admins only.')
        setLoading(false)
        return
      }

      if (adminUser.status !== 'active') {
        await supabase.auth.signOut()
        setError('Your account is pending approval.')
        setLoading(false)
        return
      }

      toast.success('Welcome back!')

      if (adminUser.role === 'org_admin' || adminUser.role === 'sub_admin') {
        window.location.href = `/organizations/${adminUser.org_id}`
      } else {
        window.location.href = '/dashboard'
      }
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (error) { setError('Failed to resend. Try again.'); return }
    setResendCooldown(60)
    toast.success('New OTP sent')
  }

  function handleOtpChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)

    // Auto-advance to next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
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
    const lastFilled = Math.min(pasted.length, 5)
    otpRefs.current[lastFilled]?.focus()
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-center px-14 py-16 relative overflow-hidden"
        style={{ backgroundColor: '#1e293b' }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Emerald glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #059669, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-md">
          <div className="text-8xl mb-8 select-none">🥦</div>

          <h1 className="font-heading text-white leading-none mb-3" style={{ fontSize: '3.5rem' }}>
            Yi Nutrition<br />League
          </h1>

          <p className="text-slate-400 text-base mb-10 leading-relaxed">
            Admin Dashboard — Manage your wellness competition
          </p>

          <ul className="space-y-4">
            {features.map(feature => (
              <li key={feature} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-400" />
                </span>
                <span className="text-slate-300 text-sm">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 mt-auto pt-12">
          <p className="text-slate-600 text-xs">The Nutrition League · Admin Portal · 2026</p>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Top label */}
          <div className="flex items-center gap-2">
            <span className="text-2xl select-none">🥦</span>
            <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Admin Sign In</span>
          </div>

          {step === 'email' ? (
            <>
              <div className="space-y-1">
                <h2 className="font-heading text-3xl text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm">Enter your email to receive a sign-in code</p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@yinutrition.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="h-10"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                    : <><Mail className="mr-2 h-4 w-4" />Send Sign-In Code</>
                  }
                </Button>
              </form>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                <span>Admin access only</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          ) : (
            <>
              {/* Back button */}
              <button
                onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError('') }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change email
              </button>

              <div className="space-y-1">
                <h2 className="font-heading text-3xl text-foreground">Check your email</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a 6-digit code to<br />
                  <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="space-y-2">
                  <Label>Sign-in code</Label>
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

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                  disabled={loading || otp.join('').length < 6}
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                    : 'Verify & Sign In'
                  }
                </Button>
              </form>

              {/* Resend */}
              <p className="text-center text-sm text-muted-foreground">
                Didn't receive it?{' '}
                {resendCooldown > 0 ? (
                  <span className="text-muted-foreground">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    onClick={handleResend}
                    className="text-primary font-medium hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
