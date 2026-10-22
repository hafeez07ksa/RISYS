import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { tx } from '@/lib/i18n'
import { AuthCard, Notice } from './AuthCard'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const justReset = !!location.state?.passwordReset

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await signIn({ email: form.email.trim(), password: form.password }); navigate('/app/dashboard') }
    catch (err) { setError(err.message || tx('Invalid credentials')) }
    finally { setLoading(false) }
  }

  return (
    <AuthCard
      title={tx('Sign in')}
      subtitle={tx('Continue to your GRC workspace')}
      footer={
        <p className="text-xs" style={{ color: '#97817d', lineHeight: 1.6 }}>{tx('Workspaces on RISYS are provisioned by our team.')}<br />{tx('No account? Contact your organization\'s administrator.')}</p>
      }>
      {justReset && (
        <div className="mb-4">
          <Notice tone="success">{tx('Your password has been changed. Sign in with your new password.')}</Notice>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label={tx('Work Email')} type="email" placeholder={tx('you@company.com')} value={form.email}
          onChange={set('email')} autoComplete="username" required />
        <div className="flex flex-col">
          <Input label={tx('Password')} type="password" placeholder="••••••••" value={form.password}
            onChange={set('password')} autoComplete="current-password" required />
          <Link to="/forgot-password" state={{ email: form.email.trim() }}
            className="text-xs mt-2 self-end hover:underline" style={{ color: '#5D0F0F' }}>
            {tx('Forgot password?')}
          </Link>
        </div>
        {error && <p className="text-xs text-red-600 -mt-1">{error}</p>}
        <Button type="submit" loading={loading} className="w-full mt-1">{tx('Sign in')}</Button>
      </form>
    </AuthCard>
  )
}
