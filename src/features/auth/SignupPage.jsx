import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { OAuthButtons } from './OAuthButtons'

export function SignupPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try { await signUp({ email: form.email, password: form.password, fullName: form.fullName }); navigate('/onboarding') }
    catch (err) { setError(err.message || 'Failed to create account') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f7f7' }}>
      <div className="w-full max-w-md rounded-xl p-8" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="mb-7"><RisysLogo size="lg" tagline /></div>
        <h1 className="text-lg font-medium mb-1" style={{ color: '#1a1314' }}>Create your account</h1>
        <p className="text-xs mb-6" style={{ color: '#8a7070' }}>Set up RISYS for your organization</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Full Name" placeholder="Jane Smith" value={form.fullName} onChange={set('fullName')} required />
          <Input label="Work Email" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
          <Input label="Password" type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} required />
          <Input label="Confirm Password" type="password" placeholder="••••••••" value={form.confirm} onChange={set('confirm')} required />
          {error && <p className="text-xs text-red-600 -mt-1">{error}</p>}
          <Button type="submit" loading={loading} className="w-full mt-1">Create Account →</Button>
        </form>
        <div className="mt-4">
          <OAuthButtons redirectTo={`${window.location.origin}/onboarding`} />
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs" style={{ color: '#8a7070' }}>
            Already have an account?{' '}
            <Link to="/login" className="hover:underline" style={{ color: '#5D0F0F' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
