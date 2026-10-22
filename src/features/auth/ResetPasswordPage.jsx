import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Circle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { tx } from '@/lib/i18n'
import { AuthCard, Notice } from './AuthCard'

/* Step 2 of a password reset: the link from the email lands here.
 *
 * Supabase puts a one-time recovery session in the URL; the client library
 * reads it on load and fires PASSWORD_RECOVERY. With that session the user can
 * set a new password (auth.updateUser). Afterwards we sign out and send them
 * to the sign-in page, so the new password is proven once before they are in.
 *
 * An expired or already-used link comes back with an error in the URL; that
 * case offers a fresh link instead of a form that cannot work. */

const MIN = 8

function readLinkError() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const code = hash.get('error_code') || query.get('error_code')
  const desc = hash.get('error_description') || query.get('error_description')
  if (!code && !desc) return null
  return code === 'otp_expired' || /expired|invalid/i.test(desc || '')
    ? tx('This reset link has expired or has already been used.')
    : (desc || tx('This reset link could not be used.')).replace(/\+/g, ' ')
}

/* Read at load, before the auth client tidies the URL: an error in the link is
 * only in the address bar for a moment. */
const LINK_ERROR_AT_LOAD = typeof window !== 'undefined' && window.location.pathname.startsWith('/reset-password')
  ? readLinkError()
  : null

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const signOut = useAuthStore(s => s.signOut)
  const [state, setState] = useState('checking') // checking | ready | invalid | saving
  const [linkError, setLinkError] = useState(null)
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    const err = readLinkError() || LINK_ERROR_AT_LOAD
    if (err) { setLinkError(err); setState('invalid'); return }

    let settled = false
    const ready = () => { settled = true; setState(s => (s === 'checking' ? 'ready' : s)) }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) ready()
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) ready() })

    // No recovery session after a few seconds: the link was incomplete or the
    // page was opened directly.
    const t = setTimeout(() => {
      if (!settled) { setLinkError(tx('Open this page from the link in your reset email.')); setState('invalid') }
    }, 6000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const longEnough = form.password.length >= MIN
  const matches = form.password.length > 0 && form.password === form.confirm

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (!longEnough) { setError(tx('Password must be at least 8 characters')); return }
    if (!matches) { setError(tx('Passwords do not match')); return }
    setState('saving')
    const { error: err } = await supabase.auth.updateUser({ password: form.password })
    if (err) {
      setState('ready')
      setError(/different from the old/i.test(err.message || '')
        ? tx('Choose a password you have not used before.')
        : (err.message || tx('Could not update your password. Request a new link and try again.')))
      return
    }
    const email = (await supabase.auth.getUser()).data?.user?.email || ''
    await signOut()
    navigate('/login', { replace: true, state: { passwordReset: true, email } })
  }

  if (state === 'checking') {
    return (
      <AuthCard title={tx('Choose a new password')}>
        <div className="flex items-center gap-3 py-6 justify-center">
          <Spinner size="sm" /><span className="text-sm" style={{ color: '#8a7070' }}>{tx('Checking your reset link…')}</span>
        </div>
      </AuthCard>
    )
  }

  if (state === 'invalid') {
    return (
      <AuthCard title={tx('Link not valid')}
        footer={<Link to="/login" className="text-xs hover:underline" style={{ color: '#5D0F0F' }}>{tx('Back to sign in')}</Link>}>
        <div className="flex flex-col gap-4">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FBEAEA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} style={{ color: '#8C1616' }} />
          </div>
          <p className="text-sm" style={{ color: '#4d3e3e', lineHeight: 1.65 }}>{linkError}</p>
          <Button onClick={() => navigate('/forgot-password')} className="w-full">{tx('Request a new link')}</Button>
        </div>
      </AuthCard>
    )
  }

  const rule = (ok, label) => (
    <li className="flex items-center gap-2 text-xs" style={{ color: ok ? '#2F6B3C' : '#97817d' }}>
      {ok ? <Check size={13} /> : <Circle size={11} />} {label}
    </li>
  )

  return (
    <AuthCard title={tx('Choose a new password')} subtitle={tx('Pick something you have not used before. You will sign in with it next.')}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Input label={tx('New password')} type="password" value={form.password} autoFocus
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          autoComplete="new-password" placeholder={tx('At least 8 characters')} required />
        <Input label={tx('Confirm new password')} type="password" value={form.confirm}
          onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
          autoComplete="new-password" placeholder="••••••••" required />
        <ul className="flex flex-col gap-1 -mt-1">
          {rule(longEnough, tx('At least 8 characters'))}
          {rule(matches, tx('Both passwords match'))}
        </ul>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={state === 'saving'} disabled={!longEnough || !matches} className="w-full mt-1">
          {tx('Update password')}
        </Button>
      </form>
    </AuthCard>
  )
}
