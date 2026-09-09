import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/*
 * Google + Microsoft sign-in via Supabase Auth.
 * Full-page redirect to the provider, then back to `redirectTo`;
 * supabase-js picks up the session from the URL automatically.
 *
 * Providers must be enabled in Supabase Dashboard → Authentication → Providers
 * (Google and Azure), each with a client ID/secret from Google Cloud Console
 * and Microsoft Entra app registrations respectively.
 */

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 23 23">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
      <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
    </svg>
  )
}

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Icon: GoogleIcon, options: {} },
  { id: 'azure', label: 'Continue with Microsoft', Icon: MicrosoftIcon, options: { scopes: 'email' } },
]

export function OAuthButtons({ redirectTo, dividerLabel = 'or' }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const go = async (p) => {
    setBusy(p.id); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p.id,
      options: {
        redirectTo: redirectTo || `${window.location.origin}/app/dashboard`,
        ...p.options,
      },
    })
    if (error) {
      setError(
        error.message?.includes('not enabled')
          ? `${p.id === 'azure' ? 'Microsoft' : 'Google'} sign-in is not enabled yet — an administrator must configure it in the auth settings.`
          : error.message
      )
      setBusy(null)
    }
    // On success the browser navigates away — no cleanup needed
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)' }}>{dividerLabel}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      {PROVIDERS.map(p => (
        <button key={p.id} type="button" onClick={() => go(p)} disabled={busy !== null}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            width: '100%', padding: '9px 0', borderRadius: 8, cursor: 'pointer',
            fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
            background: '#fff', border: '1px solid var(--border-2)',
            opacity: busy && busy !== p.id ? 0.5 : 1,
          }}>
          <p.Icon />
          {busy === p.id ? 'Redirecting…' : p.label}
        </button>
      ))}
      {error && <p style={{ fontSize: 11.5, color: '#8C1616', background: '#FBEAEA', padding: '8px 11px', borderRadius: 8 }}>{error}</p>}
    </div>
  )
}
