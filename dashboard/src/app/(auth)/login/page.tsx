'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Image from 'next/image'
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
      if (error.message?.includes('rate') || (error as any).code === 'over_email_send_rate_limit') {
        const seconds = error.message?.match(/after (\d+) second/)?.[1]
        setError(seconds
          ? `Too many requests — please wait ${seconds} seconds before trying again.`
          : 'Too many requests — please wait a moment before trying again.'
        )
      } else {
        setError('Failed to send sign-in code. Please try again.')
      }
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
    if (error) {
      const seconds = error.message?.match(/after (\d+) second/)?.[1]
      setError(seconds
        ? `Too many requests — please wait ${seconds} seconds before trying again.`
        : 'Failed to resend. Try again.'
      )
      return
    }
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

      {/* ── Left panel — flat solid, no gradients ── */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald-600 flex-col justify-between px-12 py-10">
        <div className="flex items-center gap-2.5">
          <Image src="/broccoli.svg" alt="Broccoli logo" width={28} height={28} />
          <span className="text-sm font-semibold text-white/90 tracking-tight">The Nutrition League</span>
        </div>

        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold text-emerald-200 uppercase tracking-widest mb-4">Admin Portal</p>
            <h2 className="text-4xl font-bold text-white leading-tight">
              Manage your<br />wellness league
            </h2>
          </div>

          <ul className="space-y-3">
            {features.map(f => (
              <li key={f} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
                <span className="text-white/80 text-sm">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-emerald-200/60">The Nutrition League · 2026</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col bg-white">

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 px-6 pt-6">
          <Image src="/broccoli.svg" alt="Broccoli logo" width={24} height={24} />
          <span className="text-sm font-semibold text-stone-800">The Nutrition League</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-[360px]">

            {step === 'email' ? (
              <div className="space-y-8">
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Welcome back</h1>
                  <p className="text-sm text-stone-500">Enter your email to receive a sign-in code</p>
                </div>

                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold text-stone-500 uppercase tracking-widest">
                      Email address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@yinutrition.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="h-11 border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus-visible:ring-1 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
                    disabled={loading}
                  >
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                      : <><Mail className="mr-2 h-4 w-4" />Send Sign-In Code</>
                    }
                  </Button>
                </form>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-stone-100" />
                  <span className="text-xs text-stone-400">Admin access only</span>
                  <div className="flex-1 h-px bg-stone-100" />
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <button
                  onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError('') }}
                  className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change email
                </button>

                <div className="space-y-1">
                  <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Check your email</h1>
                  <p className="text-sm text-stone-500">
                    Sent a 6-digit code to{' '}
                    <span className="font-semibold text-stone-800">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-stone-500 uppercase tracking-widest">
                      Sign-in code
                    </Label>
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
                          className="w-full h-12 text-center text-xl font-bold border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                          autoFocus={i === 0}
                        />
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
                    disabled={loading || otp.join('').length < 6}
                  >
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                      : 'Verify & Sign In'
                    }
                  </Button>
                </form>

                <p className="text-center text-sm text-stone-500">
                  Didn't receive it?{' '}
                  {resendCooldown > 0 ? (
                    <span>Resend in {resendCooldown}s</span>
                  ) : (
                    <button onClick={handleResend} className="text-emerald-600 font-semibold hover:underline">
                      Resend code
                    </button>
                  )}
                </p>
              </div>
            )}
          </div>
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
