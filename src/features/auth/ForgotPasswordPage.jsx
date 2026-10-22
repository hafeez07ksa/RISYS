import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { APP_URL } from '@/lib/env'
import { tx } from '@/lib/i18n'
import { AuthCard, Notice } from './AuthCard'

/* Step 1 of a password reset: ask for the email, send the link.
 *
 * The answer is the same whether or not the address has an account, so this
 * page cannot be used to find out who is registered. The link lands on
 * /reset-password, which is where the new password is set.
 *
 * The email itself is sent by Supabase Auth through the project's SMTP
 * settings (Resend, from no-reply@risysgrc.com) using the "Reset password"
 * template in supabase/templates/recovery.html. */

const COOLDOWN = 60 // seconds — Supabase refuses a second request sooner anyway

export function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async (e) => {
    e?.preventDefault()
    const addr = email.trim()
    if (!addr) return
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr, {
      redirectTo: `${APP_URL}/reset-password`,
    })
    setLoading(false)
    if (err) {
      // Rate limits and an unreachable server are worth showing. Anything else
      // is shown as success, so the page never reveals whether an address is
      // registered.
      if (err.status === 429 || /seconds|rate limit/i.test(err.message || '')) {
        setError(tx('Too many requests. Please wait a minute and try again.'))
        return
      }
      if (err.name === 'AuthRetryableFetchError' || !err.status || err.status >= 500) {
        setError(tx('Could not reach the server. Check your connection and try again.'))
        return
      }
    }
    setSentTo(addr)
    setWait(COOLDOWN)
  }

  const back = (
    <Link to="/login" state={{ email: email.trim() }} className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#5D0F0F' }}>
      <ArrowLeft size={12} className="rtl-flip" /> {tx('Back to sign in')}
    </Link>
  )

  if (sentTo) {
    return (
      <AuthCard title={tx('Check your email')} footer={back}>
        <div className="flex flex-col gap-4">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ECF4EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck size={20} style={{ color: '#2F6B3C' }} />
          </div>
          <p className="text-sm" style={{ color: '#4d3e3e', lineHeight: 1.65 }}>
            {tx('If an account exists for {{email}}, we have sent a link to reset your password. The link works once and expires in 1 hour.', { email: sentTo })}
          </p>
          <Notice>{tx('Nothing arrived? Check your spam or junk folder, and make sure you used the address your workspace invited.')}</Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <Button variant="secondary" onClick={send} disabled={wait > 0} loading={loading} className="w-full">
            {wait > 0 ? tx('Send again in {{n}}s', { n: wait }) : tx('Send the link again')}
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={tx('Reset your password')}
      subtitle={tx('Enter the email you sign in with. We will send you a link to choose a new password.')}
      footer={back}>
      <form onSubmit={send} className="flex flex-col gap-4">
        <Input label={tx('Work Email')} type="email" placeholder={tx('you@company.com')} value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={loading} className="w-full mt-1">{tx('Send reset link')}</Button>
      </form>
    </AuthCard>
  )
}
