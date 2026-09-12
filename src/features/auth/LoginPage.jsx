import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await signIn({ email: form.email, password: form.password }); navigate('/app/dashboard') }
    catch (err) { setError(err.message || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f7f7' }}>
      <div className="w-full max-w-md rounded-xl p-8" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="mb-7"><RisysLogo size="lg" tagline /></div>
        <h1 className="text-lg font-medium mb-1" style={{ color: '#1a1314' }}>Sign in</h1>
        <p className="text-xs mb-6" style={{ color: '#8a7070' }}>Continue to your GRC workspace</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Work Email" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
          <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
          {error && <p className="text-xs text-red-600 -mt-1">{error}</p>}
          <Button type="submit" loading={loading} className="w-full mt-1">Sign in</Button>
        </form>
        <div className="mt-5 text-center">
          <p className="text-xs" style={{ color: '#97817d', lineHeight: 1.6 }}>
            Workspaces on RISYS are provisioned by our team.<br />
            No account? Contact your organization's administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
