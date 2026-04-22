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
    <div className="min-h-screen bg-stone-50 flex flex-col">

      {/* Top bar */}
      <header className="flex items-center gap-2.5 px-8 py-5">
        <span className="text-xl select-none">🥦</span>
        <span className="text-sm font-semibold text-stone-800 tracking-tight">Yi Nutrition League</span>
        <span className="ml-1 text-xs text-stone-400 font-medium uppercase tracking-widest">Admin</span>
      </header>

      {/* Center content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">

          {step === 'email' ? (
            <div className="space-y-7">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Sign in</h1>
                <p className="text-sm text-stone-500">Enter your admin email to continue</p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-stone-600 uppercase tracking-wider">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="h-11 bg-white border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
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
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code...</>
                    : 'Continue with email'
                  }
                </Button>
              </form>

              <p className="text-xs text-center text-stone-400">Admin access only</p>
            </div>
          ) : (
            <div className="space-y-7">
              <button
                onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError('') }}
                className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>

              <div className="space-y-1.5">
                <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Check your email</h1>
                <p className="text-sm text-stone-500">
                  We sent a 6-digit code to{' '}
                  <span className="font-medium text-stone-700">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-stone-600 uppercase tracking-wider">
                    Verification code
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
                        className="w-full h-12 text-center text-xl font-semibold bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
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
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                  disabled={loading || otp.join('').length < 6}
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                    : 'Verify & sign in'
                  }
                </Button>
              </form>

              <p className="text-center text-sm text-stone-500">
                Didn't receive it?{' '}
                {resendCooldown > 0 ? (
                  <span>Resend in {resendCooldown}s</span>
                ) : (
                  <button onClick={handleResend} className="text-emerald-600 font-medium hover:underline">
                    Resend code
                  </button>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-stone-400">The Nutrition League · Admin Portal · 2026</p>
      </footer>
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
