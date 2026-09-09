import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, LogOut, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { SentrixLogo } from '@/components/ui/SentrixLogo'
import { Spinner } from '@/components/ui/Spinner'
import { roleLabel } from '@/hooks/usePeople'

// Top-level component: defining this inside AcceptInvitePage caused a remount
// on every keystroke (focus jumped from password back to the autoFocus field).
function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ marginBottom: 26 }}><SentrixLogo size="md" /></div>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(41,32,33,0.07)' }}>
        {children}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 18 }}>Sentrix — Governance, Risk & Compliance</p>
    </div>
  )
}

export function AcceptInvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, signIn, signUp, signOut, fetchOrganization } = useAuthStore()

  const [invite, setInvite] = useState(null)      // result of get_invitation_by_token
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState('signup')      // signup | login
  const [form, setForm] = useState({ fullName: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(null)      // { org_name }

  // 1. Validate the token (works without being signed in)
  useEffect(() => {
    supabase.rpc('get_invitation_by_token', { p_token: token })
      .then(({ data, error }) => {
        if (error) setInvite({ valid: false, reason: 'not_found' })
        else setInvite(data)
        setChecking(false)
      })
  }, [token])

  const emailMatches = user && invite?.valid &&
    user.email?.toLowerCase() === invite.email?.toLowerCase()
  const emailMismatch = user && invite?.valid && !emailMatches

  // 2. If signed in with the right email, accept automatically (once)
  const acceptingRef = useRef(false)
  useEffect(() => {
    if (!emailMatches || joined || acceptingRef.current) return
    acceptNow()
  }, [emailMatches]) // eslint-disable-line react-hooks/exhaustive-deps

  const acceptNow = async () => {
    if (acceptingRef.current) return
    acceptingRef.current = true
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) throw error
      await fetchOrganization(useAuthStore.getState().user.id)
      setJoined(data)
      setTimeout(() => navigate('/app/dashboard'), 1200)
    } catch (err) {
      const msg = err.message || ''
      // If the invite was already consumed (double-fire or earlier attempt),
      // the user is in fact already a member — recover by loading the org
      // and proceeding instead of dead-ending on "Joining…".
      if (/already been used|already a member/i.test(msg)) {
        try {
          await fetchOrganization(useAuthStore.getState().user.id)
          const org = useAuthStore.getState().organization
          if (org) {
            setJoined({ org_name: org.name })
            setTimeout(() => navigate('/app/dashboard'), 1000)
            return
          }
        } catch { /* fall through */ }
      }
      acceptingRef.current = false // allow a manual retry
      setError(msg || 'Could not accept the invitation')
    } finally { setBusy(false) }
  }

  const submitAuth = async () => {
    setBusy(true); setError('')
    try {
      if (mode === 'signup') {
        if (!form.fullName.trim()) throw new Error('Please enter your full name')
        if (form.password.length < 8) throw new Error('Password must be at least 8 characters')
        // signUp returns the data object directly (not wrapped)
        const data = await signUp({
          email: invite.email,
          password: form.password,
          fullName: form.fullName.trim(),
          emailRedirectTo: window.location.href, // confirmation email brings them back here
        })
        // If email confirmation is enabled, there's no session yet
        if (!data?.session) {
          const { error: siErr } = await supabase.auth.signInWithPassword({ email: invite.email, password: form.password })
          if (siErr) {
            setError('Account created — check your inbox. We sent a confirmation link that will bring you straight back here to join automatically.')
            setBusy(false)
            return
          }
        }
      } else {
        await signIn({ email: invite.email, password: form.password })
      }
      // auth state change fires; the emailMatches effect will accept
    } catch (err) {
      setError(err.message || 'Authentication failed')
      setBusy(false)
    }
  }

  if (checking) return <Shell><div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div></Shell>

  // ── Invalid states ──────────────────────────────────────────────
  if (!invite?.valid) {
    const messages = {
      not_found: { title: 'Invitation not found', body: 'This link is not valid. Check that you copied the complete link, or ask your administrator for a new one.' },
      expired:   { title: 'Invitation expired', body: `Your invitation to ${invite?.org_name || 'this organization'} has expired. Ask your administrator to issue a fresh link.` },
      revoked:   { title: 'Invitation revoked', body: `This invitation to ${invite?.org_name || 'this organization'} was revoked by an administrator.` },
      accepted:  { title: 'Already used', body: 'This invitation has already been accepted. If that was you, just sign in.' },
    }
    const m = messages[invite?.reason] || messages.not_found
    return (
      <Shell>
        <div style={{ padding: '36px 32px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FBEAEA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <AlertTriangle size={20} style={{ color: '#8C1616' }} />
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{m.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>{m.body}</p>
          {invite?.reason === 'accepted' && (
            <button onClick={() => navigate('/login')} className="btn-primary" style={{ marginTop: 18, width: '100%' }}>Sign in</button>
          )}
        </div>
      </Shell>
    )
  }

  // ── Success ─────────────────────────────────────────────────────
  if (joined) {
    return (
      <Shell>
        <div style={{ padding: '36px 32px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ECF4EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Check size={20} style={{ color: '#2F6B3C' }} />
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Welcome to {joined.org_name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Taking you to your workspace…</p>
        </div>
      </Shell>
    )
  }

  // ── Wrong account signed in ─────────────────────────────────────
  if (emailMismatch) {
    return (
      <Shell>
        <InviteHeader invite={invite} />
        <div style={{ padding: '20px 28px 28px' }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FAF3E2', border: '1px solid #EBDCB6', marginBottom: 16 }}>
            <p style={{ fontSize: 12.5, color: '#9C6F0F', lineHeight: 1.6 }}>
              This invitation was issued to <strong>{invite.email}</strong>, but you are signed in as <strong>{user.email}</strong>.
              Sign out, then open the link again with the invited account.
            </p>
          </div>
          <button onClick={async () => { await signOut() }} className="btn-secondary" style={{ width: '100%' }}>
            <LogOut size={13} /> Sign out and switch account
          </button>
        </div>
      </Shell>
    )
  }

  // ── Signed in correctly: accepting ──────────────────────────────
  if (user && emailMatches) {
    return (
      <Shell>
        <InviteHeader invite={invite} />
        <div style={{ padding: '20px 28px 28px', textAlign: 'center' }}>
          {error ? (
            <>
              <p style={{ fontSize: 12.5, color: '#8C1616', background: '#FBEAEA', padding: '10px 12px', borderRadius: 8, marginBottom: 14 }}>{error}</p>
              <button onClick={acceptNow} disabled={busy} className="btn-primary" style={{ width: '100%' }}>Try again</button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 0' }}>
              <Spinner size="sm" /><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Joining {invite.org_name}…</span>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  // ── Not signed in: create account or sign in (email locked) ─────
  return (
    <Shell>
      <InviteHeader invite={invite} />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[['signup', 'Create account'], ['login', 'I have an account']].map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setError('') }}
            style={{ flex: 1, padding: '11px 0', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: mode === m ? '2px solid var(--crimson)' : '2px solid transparent',
              color: mode === m ? 'var(--crimson)' : 'var(--text-3)' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Email</label>
          <input value={invite.email} disabled className="sentrix-input" style={{ opacity: 0.65, cursor: 'not-allowed' }} />
          <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>Locked to the invited address</p>
        </div>
        {mode === 'signup' && (
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Full name</label>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Sara Al-Otaibi" className="sentrix-input" autoFocus />
          </div>
        )}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Password</label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submitAuth()}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} className="sentrix-input" autoFocus={mode === 'login'} />
        </div>

        {error && <p style={{ fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>{error}</p>}

        <button onClick={submitAuth} disabled={busy} className="btn-primary" style={{ marginTop: 4 }}>
          {busy ? <Spinner size="sm" /> : <ShieldCheck size={14} />}
          {mode === 'signup' ? `Create account & join ${invite.org_name}` : `Sign in & join ${invite.org_name}`}
        </button>

      </div>
    </Shell>
  )
}

function InviteHeader({ invite }) {
  return (
    <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>You're invited</p>
      <h1 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
        Join <span style={{ color: 'var(--crimson)' }}>{invite.org_name}</span> on Sentrix
      </h1>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 5 }}>
        {invite.inviter_name ? `Invited by ${invite.inviter_name} · ` : ''}Role: <strong style={{ color: 'var(--text-2)' }}>{roleLabel(invite.role)}</strong>
      </p>
    </div>
  )
}
