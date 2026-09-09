import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TowerControl, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'

/*
 * The vendor door. Same Supabase auth underneath, but:
 *   - styled and labeled as the internal console, not the tenant product
 *   - after sign-in, platform_admins membership is verified; anyone else
 *     is signed back out with no hint about what lives here
 *   - no signup, no OAuth, no "forgot password" self-service — staff only
 */
export function PlatformLoginPage() {
  const navigate = useNavigate()
  const { signIn, signOut } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { user } = await signIn({ email: form.email, password: form.password })
      const { data } = await supabase
        .from('platform_admins').select('user_id').eq('user_id', user.id).limit(1)
      if (!data || !data.length) {
        await signOut()
        throw new Error('This console is restricted to Sentrix platform staff.')
      }
      navigate('/platform')
    } catch (err) {
      setError(err.message || 'Sign in failed')
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#292021', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#5D0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TowerControl size={17} style={{ color: '#F3E7E4' }} />
        </div>
        <div>
          <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: '#F3E7E4', lineHeight: 1 }}>Sentrix</p>
          <p style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#A98D8C', marginTop: 2 }}>Platform Console</p>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 400, background: '#fff', border: '1px solid #3a2f30', borderRadius: 16, padding: '30px 30px 26px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Internal sign in</h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Tenant management · restricted access</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Staff email</label>
            <input type="email" required value={form.email} autoFocus
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@sentrix.com" className="sentrix-input" />
          </div>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Password</label>
            <input type="password" required value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••" className="sentrix-input" />
          </div>

          {error && (
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>
              <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary" style={{ marginTop: 4 }}>
            {busy ? <Spinner size="sm" /> : <TowerControl size={13} />} Enter console
          </button>
        </form>
      </div>

      <p style={{ fontSize: 11, color: '#8a7373', marginTop: 18 }}>
        Looking for your company workspace? <a href="/login" style={{ color: '#D9A0A0' }}>Sign in here</a>
      </p>
    </div>
  )
}
