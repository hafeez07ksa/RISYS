import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SentrixLogo } from '@/components/ui/SentrixLogo'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useOrg } from '@/hooks/useOrg'
import { ROLES, INDUSTRIES, COMPANY_SIZES } from '@/lib/constants'
import clsx from 'clsx'

const STEPS = ['Organization', 'Your Role', 'Review']

export function OnboardingPage() {
  const navigate = useNavigate()
  const { createOrganization } = useOrg()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', industry: '', size: '', role: '' })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setRole = (r) => setForm(f => ({ ...f, role: r }))

  const canNext = () => {
    if (step === 0) return form.name.trim() && form.industry && form.size
    if (step === 1) return form.role
    return true
  }

  const handleSubmit = async () => {
    setLoading(true); setError('')
    try {
      await createOrganization({ name: form.name.trim(), industry: form.industry, size: form.size, adminRole: form.role })
      navigate('/app/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to create organization')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f7f7' }}>
      <div className="w-full max-w-lg rounded-xl p-8" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="mb-6"><SentrixLogo /></div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors"
                style={{
                  background: i < step ? '#895353' : i === step ? '#5D0F0F' : '#f5f3f3',
                  color: i <= step ? '#fff' : '#8a7070',
                  border: i > step ? '1px solid #e5e0e0' : 'none',
                }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className="text-xs" style={{ color: i === step ? '#1a1314' : '#8a7070' }}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px mx-1" style={{ background: '#e5e0e0' }} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1" style={{ color: '#1a1314' }}>Set up your organization</h2>
              <p className="text-xs" style={{ color: '#8a7070' }}>We'll create your isolated, multi-tenant workspace on Sentrix.</p>
            </div>
            <Input label="Organization Name" placeholder="Acme Corp" value={form.name} onChange={set('name')} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Industry" value={form.industry} onChange={set('industry')}>
                <option value="" disabled>Select industry</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </Select>
              <Select label="Company Size" value={form.size} onChange={set('size')}>
                <option value="" disabled>Select size</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
              </Select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1" style={{ color: '#1a1314' }}>What is your role?</h2>
              <p className="text-xs" style={{ color: '#8a7070' }}>This tailors your Sentrix experience and default permissions.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setRole(r.value)}
                  className="text-left p-3.5 rounded-lg border transition-colors"
                  style={{
                    borderColor: form.role === r.value ? '#5D0F0F' : '#e5e0e0',
                    background: form.role === r.value ? '#fdf5f5' : '#fff',
                  }}>
                  <p className="text-xs font-medium mb-0.5" style={{ color: '#1a1314' }}>{r.label}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: '#8a7070' }}>{r.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1" style={{ color: '#1a1314' }}>Ready to launch</h2>
              <p className="text-xs" style={{ color: '#8a7070' }}>Your workspace will be provisioned with the following configuration.</p>
            </div>
            <div className="rounded-lg p-4 flex flex-col gap-2.5" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
              {[
                ['Organization', form.name],
                ['Industry', form.industry],
                ['Company size', form.size + ' employees'],
                ['Your role', ROLES.find(r => r.value === form.role)?.label || form.role],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span style={{ color: '#8a7070' }}>{label}</span>
                  <span className="font-medium" style={{ color: '#1a1314' }}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: '#8a7070' }}>You can invite team members and configure further from Settings after setup.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        <div className="flex gap-2.5 mt-6">
          {step > 0 && <Button variant="secondary" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>}
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="flex-1">Continue →</Button>
            : <Button onClick={handleSubmit} loading={loading} className="flex-1">Launch Sentrix →</Button>
          }
        </div>
      </div>
    </div>
  )
}
