import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { usePlatform, activationLink } from '@/hooks/usePlatform'
import { isAdminRole } from '@/lib/roles'
import { Field, SubmitButton } from '@/features/audits/parts'
import { PLANS, CopyBtn, PlatformShell, useCompanyDetail } from './shared'

/* Platform console form pages. The console is for RISYS staff only and is not
 * translated, so these strings are English on purpose. */

const PLAN_OPTIONS = PLANS.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))

function LinkBlock({ email, token, expires }) {
  const link = activationLink(token)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>Send to <strong style={{ color: 'var(--text)' }}>{email}</strong></p>
      <p className="mono" style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)', wordBreak: 'break-all', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>{link}</p>
      <div><CopyBtn text={link} label="Copy activation link" /></div>
      <p className="field-help" style={{ margin: 0 }}>
        Single-use, locked to that email{expires ? `, expires ${new Date(expires).toLocaleDateString('en-GB')}` : ''}. Opening it lets them choose their own password — RISYS never knows or stores it.
      </p>
    </div>
  )
}

/* /platform/companies/new */
export function CreateCompanyPage() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const [form, setForm] = useState({ name: '', adminEmail: '', plan: 'standard', maxMembers: 25, storageGb: 5, industry: '', size: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const back = { label: 'All companies', onClick: () => navigate('/platform') }

  const create = async () => {
    if (!form.name.trim()) { setError('Enter the company name.'); return }
    if (!form.adminEmail.trim()) { setError('Enter the email of the company’s administrator.'); return }
    setBusy(true); setError('')
    try {
      setResult(await platform.createCompany({ ...form, maxMembers: parseInt(form.maxMembers) || 25, storageGb: parseInt(form.storageGb) || 5 }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <PlatformShell>
      {result ? (
        <FormPage title={`${result.org.name} is provisioned`}
          description={`${result.org.plan} plan · ${result.org.max_members} seats · ${result.org.storage_quota_gb} GB`}
          meta={<Check size={16} style={{ color: '#2F6B3C' }} />} back={back}
          footer={<>
            <button className="btn-secondary" onClick={() => navigate(`/platform/companies/${result.org.id}`)}>Open company</button>
            <button className="btn-primary" onClick={back.onClick}>Done</button>
          </>}>
          <FormSection title="Admin activation link" description="RISYS does not send email yet. Copy this link and send it to the company’s administrator yourself.">
            <LinkBlock email={result.admin_email} token={result.activation_token} expires={result.expires_at} />
          </FormSection>
        </FormPage>
      ) : (
        <FormPage title="Provision a new company"
          description="Creates the tenant and an activation link for their administrator, who then sets their own password and manages their own users."
          back={back} onSubmit={create} error={error}
          footer={<>
            <button className="btn-secondary" disabled={busy} onClick={back.onClick}>Cancel</button>
            <SubmitButton busy={busy} onClick={create}>Provision company</SubmitButton>
          </>}>
          <FormSection title="Company" description="The legal or trading name the client will recognise in their workspace.">
            <Field label="Company name" required>
              <input className="risys-input" value={form.name} onChange={set('name')} autoFocus placeholder="e.g. Al Rajhi Trading Co." />
            </Field>
          </FormSection>
          <FormSection title="First administrator" description="The person who activates the workspace. They receive a link valid for 14 days, choose their own password, and invite everyone else.">
            <Field label="Admin email" required>
              <input type="email" className="risys-input" value={form.adminEmail} onChange={set('adminEmail')} placeholder="it.manager@client.com" />
            </Field>
          </FormSection>
          <FormSection title="Plan and limits" description="Can be changed at any time from the company’s page.">
            <div className="fp-grid-3">
              <Field label="Plan"><SelectField className="w-full" value={form.plan} onChange={set('plan')} options={PLAN_OPTIONS} /></Field>
              <Field label="Max users"><input type="number" min="1" className="risys-input" value={form.maxMembers} onChange={set('maxMembers')} /></Field>
              <Field label="Storage (GB)"><input type="number" min="1" className="risys-input" value={form.storageGb} onChange={set('storageGb')} /></Field>
            </div>
          </FormSection>
        </FormPage>
      )}
    </PlatformShell>
  )
}

/* /platform/companies/:id/limits */
export function CompanyLimitsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, error: loadError } = useCompanyDetail(id)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = { label: 'Company', onClick: () => navigate(`/platform/companies/${id}`) }

  useEffect(() => {
    if (detail && !form) setForm({ plan: detail.org.plan, maxMembers: detail.org.max_members, storageGb: detail.org.storage_quota_gb })
  }, [detail, form])

  const save = async () => {
    const max = parseInt(form.maxMembers)
    if (!(max >= 1)) { setError('Max users must be at least 1.'); return }
    if (max < (detail.member_count || 0)) { setError(`${detail.member_count} people already use this workspace — the limit cannot be lower.`); return }
    setBusy(true); setError('')
    try {
      await platform.updateLimits(id, { plan: form.plan, maxMembers: max, storageGb: parseInt(form.storageGb) })
      back.onClick()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <PlatformShell>
      {loadError ? <PageNotFound title="Company not found" back={{ label: 'All companies', onClick: () => navigate('/platform') }}>{loadError}</PageNotFound>
        : !form ? <PageLoading /> : (
        <FormPage title={`${detail.org.name} — plan and limits`} back={back} onSubmit={save} error={error}
          footer={<>
            <button className="btn-secondary" disabled={busy} onClick={back.onClick}>Cancel</button>
            <SubmitButton busy={busy} onClick={save}>Save</SubmitButton>
          </>}>
          <FormSection title="Plan and limits" description={`${detail.member_count} of ${detail.org.max_members} seats in use. Lowering the storage quota does not delete files already stored.`}>
            <div className="fp-grid-3">
              <Field label="Plan"><SelectField className="w-full" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} options={PLAN_OPTIONS} /></Field>
              <Field label="Max users" help={`${detail.member_count} in use`}>
                <input type="number" min={detail.member_count || 1} className="risys-input" value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: e.target.value })} />
              </Field>
              <Field label="Storage (GB)"><input type="number" min="1" className="risys-input" value={form.storageGb} onChange={(e) => setForm({ ...form, storageGb: e.target.value })} /></Field>
            </div>
          </FormSection>
        </FormPage>
      )}
    </PlatformShell>
  )
}

/* /platform/companies/:id/activation */
export function CompanyActivationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, error: loadError } = useCompanyDetail(id)
  const [email, setEmail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const back = { label: 'Company', onClick: () => navigate(`/platform/companies/${id}`) }

  useEffect(() => {
    if (detail && email === null) setEmail((detail.members || []).find((m) => isAdminRole(m.role))?.email || '')
  }, [detail, email])

  const issue = async () => {
    if (!email.trim()) { setError('Enter the administrator’s email.'); return }
    setBusy(true); setError('')
    try { setResult(await platform.reissueAdminInvite(id, email.trim())) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <PlatformShell>
      {loadError ? <PageNotFound title="Company not found" back={{ label: 'All companies', onClick: () => navigate('/platform') }}>{loadError}</PageNotFound>
        : email === null ? <PageLoading /> : result ? (
        <FormPage title={`${detail.org.name} — activation link issued`} back={back}
          footer={<button className="btn-primary" onClick={back.onClick}>Done</button>}>
          <FormSection title="Activation link" description="RISYS does not send email yet — send this link yourself. Any earlier link for this email no longer works.">
            <LinkBlock email={result.admin_email} token={result.activation_token} expires={result.expires_at} />
          </FormSection>
        </FormPage>
      ) : (
        <FormPage title={`${detail.org.name} — admin activation link`} back={back} onSubmit={issue} error={error}
          footer={<>
            <button className="btn-secondary" disabled={busy} onClick={back.onClick}>Cancel</button>
            <SubmitButton busy={busy} onClick={issue}>Issue link</SubmitButton>
          </>}>
          <FormSection title="Administrator" description="Issues a fresh 14-day link with the Admin role. It replaces any previous link for this email.">
            <Field label="Admin email" required>
              <input type="email" className="risys-input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="admin@client.com" />
            </Field>
          </FormSection>
        </FormPage>
      )}
    </PlatformShell>
  )
}
