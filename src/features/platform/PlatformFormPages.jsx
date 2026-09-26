import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Check, AlertTriangle, Trash2, Pause } from 'lucide-react'
import { usePlatform, useCompany, activationLink } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { PlatformShell, Card, CopyBtn, ErrorNote, PLANS, StatusChip, bytes, fmtDate } from './shared'

/* Console forms. No guidance panels: the console is operated by RISYS staff,
 * and the rules that matter are enforced in the database, which returns the
 * reason when it refuses. Layout is a single column of labelled fields, the
 * way internal tools are used — fast, dense, keyboard-first. */

// ── Field primitives ─────────────────────────────────────────────────────────
function Field({ label, hint, required, children, span }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--crimson)' }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
    </label>
  )
}

const Grid = ({ cols = 2, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 }}>{children}</div>
)

const inputStyle = { fontSize: 12.5, width: '100%' }

function FormActions({ busy, onCancel, submitLabel, onSubmit, danger, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onSubmit} disabled={busy || disabled}>
        {busy && <Spinner size="sm" />}{submitLabel}
      </button>
    </div>
  )
}

/* Ctrl/⌘+Enter submits, as everywhere else in RISYS. */
function useSubmitShortcut(fn, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fn() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fn, enabled])
}

function LinkPanel({ email, token, expires }) {
  const link = activationLink(token)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
        Send to <strong style={{ color: 'var(--text)' }}>{email}</strong> — single use, expires {fmtDate(expires)}.
      </p>
      <p className="mono" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-2)', wordBreak: 'break-all', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>{link}</p>
      <div><CopyBtn text={link} label="Copy activation link" /></div>
    </div>
  )
}

// ── Provision a company ──────────────────────────────────────────────────────
export function CreateCompanyPage() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const [f, setF] = useState({ name: '', adminEmail: '', plan: 'standard', maxMembers: 25, storageGb: 5, industry: '', size: '', primaryContact: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const create = async () => {
    setBusy(true); setError('')
    try {
      setResult(await platform.createCompany({ ...f, maxMembers: parseInt(f.maxMembers) || 25, storageGb: parseInt(f.storageGb) || 5 }))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useSubmitShortcut(create, !result)

  if (result) {
    return (
      <PlatformShell title={`${result.org.name} provisioned`} back={{ to: '/platform/companies', label: 'All companies' }} width={860}>
        <Card title="Admin activation link">
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12 }}>
            <Check size={16} style={{ color: '#2F6B3C' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              {result.org.plan} plan · {result.org.max_members} seats · {result.org.storage_quota_gb} GB
            </span>
          </div>
          <LinkPanel email={result.admin_email} token={result.activation_token} expires={result.expires_at} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Link to="/platform/companies" className="btn-secondary" style={{ textDecoration: 'none' }}>All companies</Link>
            <Link to={`/platform/companies/${result.org.id}`} className="btn-primary" style={{ textDecoration: 'none' }}>Open company</Link>
          </div>
        </Card>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell title="Provision a new company" back={{ to: '/platform/companies', label: 'All companies' }} width={860}
      description="Creates the tenant and a 14-day activation link for its first administrator.">
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Company name" required hint="Must be unique across the platform.">
            <input className="risys-input" style={inputStyle} value={f.name} onChange={set('name')} autoFocus placeholder="Al Rajhi Trading Co." />
          </Field>
          <Field label="Admin email" required hint="They receive the activation link and set their own password.">
            <input type="email" className="risys-input" style={inputStyle} value={f.adminEmail} onChange={set('adminEmail')} placeholder="it.manager@client.com" />
          </Field>
          <Grid cols={3}>
            <Field label="Plan">
              <select className="risys-input" style={inputStyle} value={f.plan} onChange={set('plan')}>
                {PLANS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Max users"><input type="number" min="1" className="risys-input" style={inputStyle} value={f.maxMembers} onChange={set('maxMembers')} /></Field>
            <Field label="Storage (GB)"><input type="number" min="1" className="risys-input" style={inputStyle} value={f.storageGb} onChange={set('storageGb')} /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Industry"><input className="risys-input" style={inputStyle} value={f.industry} onChange={set('industry')} placeholder="Logistics" /></Field>
            <Field label="Size"><input className="risys-input" style={inputStyle} value={f.size} onChange={set('size')} placeholder="200–500" /></Field>
            <Field label="Primary contact"><input className="risys-input" style={inputStyle} value={f.primaryContact} onChange={set('primaryContact')} placeholder="Commercial contact" /></Field>
          </Grid>
          <Field label="Internal notes" hint="Visible only in the console, never to the client.">
            <textarea className="risys-input" rows={3} style={inputStyle} value={f.notes} onChange={set('notes')} />
          </Field>
        </div>
        <FormActions busy={busy} onCancel={() => navigate('/platform/companies')} onSubmit={create} submitLabel="Provision company" />
      </Card>
    </PlatformShell>
  )
}

// ── Company profile and notes ────────────────────────────────────────────────
export function CompanyProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, loading, error: loadError } = useCompany(id)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = () => navigate(`/platform/companies/${id}`)

  useEffect(() => {
    if (detail && !f) setF({
      name: detail.org.name, industry: detail.org.industry || '', size: detail.org.size || '',
      primaryContact: detail.org.primary_contact || '', notes: detail.org.notes || '',
    })
  }, [detail, f])

  const save = async () => {
    setBusy(true); setError('')
    try { await platform.updateProfile(id, f); back() } catch (e) { setError(e.message); setBusy(false) }
  }
  useSubmitShortcut(save, !!f)

  if (loading || !f) return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  if (loadError) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <PlatformShell title={`${detail.org.name} — profile`} back={{ to: `/platform/companies/${id}`, label: detail.org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Company name" required hint="Renaming changes what the client sees in their workspace and on their reports.">
            <input className="risys-input" style={inputStyle} value={f.name} onChange={set('name')} autoFocus />
          </Field>
          <Grid cols={3}>
            <Field label="Industry"><input className="risys-input" style={inputStyle} value={f.industry} onChange={set('industry')} /></Field>
            <Field label="Size"><input className="risys-input" style={inputStyle} value={f.size} onChange={set('size')} /></Field>
            <Field label="Primary contact"><input className="risys-input" style={inputStyle} value={f.primaryContact} onChange={set('primaryContact')} /></Field>
          </Grid>
          <Field label="Internal notes" hint="Visible only in the console.">
            <textarea className="risys-input" rows={6} style={inputStyle} value={f.notes} onChange={set('notes')}
              placeholder="Renewal dates, escalation history, who to call…" />
          </Field>
        </div>
        <FormActions busy={busy} onCancel={back} onSubmit={save} submitLabel="Save" />
      </Card>
    </PlatformShell>
  )
}

// ── Plan and limits ──────────────────────────────────────────────────────────
export function CompanyLimitsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, loading, error: loadError } = useCompany(id)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = () => navigate(`/platform/companies/${id}`)

  useEffect(() => {
    if (detail && !f) setF({ plan: detail.org.plan, maxMembers: detail.org.max_members, storageGb: detail.org.storage_quota_gb })
  }, [detail, f])

  const save = async () => {
    setBusy(true); setError('')
    try {
      await platform.updateLimits(id, { plan: f.plan, maxMembers: parseInt(f.maxMembers), storageGb: parseInt(f.storageGb) })
      back()
    } catch (e) { setError(e.message); setBusy(false) }
  }
  useSubmitShortcut(save, !!f)

  if (loading || !f) return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  if (loadError) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>

  const used = detail.member_count
  return (
    <PlatformShell title={`${detail.org.name} — plan and limits`} back={{ to: `/platform/companies/${id}`, label: detail.org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <Grid cols={3}>
          <Field label="Plan">
            <select className="risys-input" style={inputStyle} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
              {PLANS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Max users" hint={`${used} in use — the limit cannot go below this.`}>
            <input type="number" min={used || 1} className="risys-input" style={inputStyle} value={f.maxMembers}
              onChange={(e) => setF({ ...f, maxMembers: e.target.value })} />
          </Field>
          <Field label="Storage (GB)" hint={`${bytes(detail.storage_bytes)} stored today.`}>
            <input type="number" min="1" className="risys-input" style={inputStyle} value={f.storageGb}
              onChange={(e) => setF({ ...f, storageGb: e.target.value })} />
          </Field>
        </Grid>
        <FormActions busy={busy} onCancel={back} onSubmit={save} submitLabel="Save" />
      </Card>
    </PlatformShell>
  )
}

// ── Activation link ──────────────────────────────────────────────────────────
export function CompanyActivationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, loading, error: loadError } = useCompany(id)
  const [email, setEmail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const back = () => navigate(`/platform/companies/${id}`)

  useEffect(() => {
    if (detail && email === null) {
      const admin = (detail.members || []).find((m) => ['owner', 'admin'].includes(m.role))
      const invite = (detail.invitations || []).find((i) => i.role === 'admin')
      setEmail(admin?.email || invite?.email || '')
    }
  }, [detail, email])

  const issue = async () => {
    setBusy(true); setError('')
    try { setResult(await platform.reissueAdminInvite(id, email.trim())) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useSubmitShortcut(issue, !result && email !== null)

  if (loading || email === null) return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  if (loadError) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>

  return (
    <PlatformShell title={`${detail.org.name} — admin activation link`} back={{ to: `/platform/companies/${id}`, label: detail.org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <Card title={result ? 'Link issued' : 'Issue an activation link'}>
        {result ? <>
          <LinkPanel email={result.admin_email} token={result.activation_token} expires={result.expires_at} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button className="btn-primary" onClick={back}>Done</button>
          </div>
        </> : <>
          <Field label="Admin email" required hint="Issues a fresh 14-day link with the Admin role and invalidates any earlier link for this address.">
            <input type="email" className="risys-input" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <FormActions busy={busy} onCancel={back} onSubmit={issue} submitLabel="Issue link" disabled={!email.trim()} />
        </>}
      </Card>
    </PlatformShell>
  )
}

// ── Suspend ──────────────────────────────────────────────────────────────────
export function CompanySuspendPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, loading, error: loadError } = useCompany(id)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = () => navigate(`/platform/companies/${id}`)

  const suspend = async () => {
    setBusy(true); setError('')
    try { await platform.setStatus(id, 'suspended', reason.trim()); back() }
    catch (e) { setError(e.message); setBusy(false) }
  }
  useSubmitShortcut(suspend, !!detail)

  if (loading || !detail) return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  if (loadError) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>

  const org = detail.org
  if (org.status === 'suspended') {
    return (
      <PlatformShell title={`${org.name} is already suspended`} back={{ to: `/platform/companies/${id}`, label: org.name }} width={860}>
        <Card><p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>Reactivate it from the company page.</p></Card>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell title={`Suspend ${org.name}`} back={{ to: `/platform/companies/${id}`, label: org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <div style={{ padding: '11px 13px', marginBottom: 16, background: '#FDF4E7', border: '1px solid #F0DCB8', borderRadius: 'var(--r)', display: 'flex', gap: 9 }}>
          <AlertTriangle size={15} style={{ color: '#8A5A12', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: '#8A5A12', lineHeight: 1.6 }}>
            All <strong>{detail.member_count}</strong> member{detail.member_count === 1 ? '' : 's'} lose access within a minute.
            Nothing is deleted and reactivating restores everything. Suspension is also the required first step before deletion.
          </div>
        </div>
        <Field label="Reason" required hint="At least 10 characters. Recorded permanently in the console activity log.">
          <textarea className="risys-input" rows={4} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            placeholder="Non-payment: invoice INV-2043 overdue 60 days; account manager notified 12 Sep." />
        </Field>
        <FormActions busy={busy} onCancel={back} onSubmit={suspend} submitLabel={<><Pause size={13} /> Suspend company</>}
          disabled={reason.trim().length < 10} danger />
      </Card>
    </PlatformShell>
  )
}

// ── Delete ───────────────────────────────────────────────────────────────────
export function CompanyDeletePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const { detail, loading, error: loadError } = useCompany(id)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const back = () => navigate(`/platform/companies/${id}`)

  const destroy = async () => {
    setBusy(true); setError('')
    try { setDone(await platform.deleteCompany(id, typed.trim(), reason.trim())) }
    catch (e) { setError(e.message); setBusy(false) }
  }

  if (loading || !detail) return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  if (loadError && !done) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>

  if (done) {
    return (
      <PlatformShell title={`${done.deleted_org} deleted`} width={860}>
        <Card>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
            The workspace and everything in it has been erased.
            {done.deleted_user_accounts > 0 && <> {done.deleted_user_accounts} user account{done.deleted_user_accounts === 1 ? '' : 's'} existed only here and were destroyed.</>}
            {' '}The deletion is recorded permanently in the console activity log.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Link to="/platform/companies" className="btn-primary" style={{ textDecoration: 'none' }}>All companies</Link>
          </div>
        </Card>
      </PlatformShell>
    )
  }

  const org = detail.org
  const nameMatches = typed.trim().toLowerCase() === org.name.trim().toLowerCase()
  const cooling = org.suspended_at && (Date.now() - new Date(org.suspended_at).getTime()) < 15 * 60 * 1000

  return (
    <PlatformShell title={`Delete ${org.name}`} back={{ to: `/platform/companies/${id}`, label: org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        {org.status !== 'suspended' ? (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} style={{ color: '#8C1616', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              This company is <StatusChip status={org.status} /> and cannot be deleted. Suspend it first —
              the database refuses deletion of a live workspace, so that a client is never destroyed without warning.
              <div style={{ marginTop: 12 }}>
                <Link to={`/platform/companies/${id}/suspend`} className="btn-secondary" style={{ textDecoration: 'none' }}>Suspend instead</Link>
              </div>
            </div>
          </div>
        ) : <>
          <div style={{ padding: '12px 14px', marginBottom: 16, background: '#FBEAEA', border: '1px solid #F0CECE', borderRadius: 'var(--r)' }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#8C1616' }}>This erases everything, permanently. There is no undo and no backup restore.</p>
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12.5, color: '#8C1616', lineHeight: 1.75 }}>
              <li>{detail.risk_count} risks with their controls, evidence, assessments and history</li>
              <li>{detail.incident_count} incidents, {detail.task_count} tasks, {detail.evidence_count} evidence files ({bytes(detail.storage_bytes)})</li>
              <li>{detail.member_count} membership{detail.member_count === 1 ? '' : 's'}; accounts that exist only here are destroyed and signed out everywhere</li>
              <li>All invitations, connectors and settings</li>
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Reason" required hint="At least 10 characters. Kept in the activity log after the company is gone.">
              <textarea className="risys-input" rows={3} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Contract ended 31 Aug 2026; client confirmed data export delivered and requested deletion." />
            </Field>
            <Field label={`Type the company name to confirm`} required hint={`Exactly: ${org.name}`}>
              <input className="risys-input" style={inputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </Field>
            {cooling && (
              <p style={{ margin: 0, fontSize: 12, color: '#8A5A12' }}>
                Suspended less than 15 minutes ago. Deletion becomes available after that cooling-off period.
              </p>
            )}
          </div>
          <FormActions busy={busy} onCancel={back} onSubmit={destroy} danger
            submitLabel={<><Trash2 size={13} /> Delete permanently</>}
            disabled={!nameMatches || reason.trim().length < 10 || cooling} />
        </>}
      </Card>
    </PlatformShell>
  )
}
