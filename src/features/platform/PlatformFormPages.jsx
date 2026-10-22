import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Check, AlertTriangle, Trash2, Pause, Building2, UserRound, StickyNote, KeyRound, Mail, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { usePlatform, useCompany, activationLink } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { PlatformShell, Card, CopyBtn, ErrorNote, StatusChip, Avatar, bytes, fmtDate, plural } from './shared'

/* Console forms. Short: the console is operated by RISYS staff, and the rules
 * that matter are enforced in the database, which returns the reason when it
 * refuses. Ctrl/⌘+Enter submits everywhere. */

// ── Field primitives ─────────────────────────────────────────────────────────
function Field({ label, hint, required, children }) {
  return (
    <label className="pc-field">
      <span className="pc-label">{label}{required && <i> *</i>}</span>
      {children}
      {hint && <span className="pc-hint">{hint}</span>}
    </label>
  )
}

function Section({ title, desc, children }) {
  return (
    <div className="pc-section">
      {title && <p className="pc-section-title">{title}</p>}
      {desc && <p className="pc-section-desc">{desc}</p>}
      {children}
    </div>
  )
}

const inputStyle = { fontSize: 13, width: '100%', borderRadius: 9, padding: '9px 11px' }

function FormActions({ busy, onCancel, submitLabel, onSubmit, danger, disabled }) {
  return (
    <div className="pc-form-actions">
      <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onSubmit} disabled={busy || disabled}>
        {busy && <Spinner size="sm" />}{submitLabel}
      </button>
    </div>
  )
}

const Loading = () => <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="pc-kpi-icon pc-tone-blue" style={{ width: 32, height: 32, borderRadius: 10 }}><Mail size={15} /></span>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          For <strong style={{ color: 'var(--text)' }}>{email}</strong>
          <div className="pc-sub">Works once · expires {fmtDate(expires)}</div>
        </div>
      </div>
      <p className="pc-linkbox" style={{ margin: 0 }}>{link}</p>
      <div><CopyBtn text={link} label="Copy activation link" /></div>
    </div>
  )
}

/* What happens after a company is provisioned — the same three steps every time. */
function NextSteps() {
  return (
    <Card title="What happens next" icon={ShieldCheck} pad={false}>
      <div className="pc-steps">
        <div className="pc-step"><span className="pc-step-n">1</span><p><b>Send the activation link</b>Share it with the client's administrator. It works once and expires in 14 days.</p></div>
        <div className="pc-step"><span className="pc-step-n">2</span><p><b>They set their own password</b>Nobody at RISYS ever sees it. They confirm their email from a RISYS message.</p></div>
        <div className="pc-step"><span className="pc-step-n">3</span><p><b>They invite their team</b>People are managed inside the client's workspace, not from the console.</p></div>
      </div>
    </Card>
  )
}

// ── Provision a company ──────────────────────────────────────────────────────
export function CreateCompanyPage() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const [f, setF] = useState({ name: '', adminEmail: '', industry: '', primaryContact: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const ready = f.name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.adminEmail.trim())

  const create = async () => {
    if (!ready) return
    setBusy(true); setError('')
    try { setResult(await platform.createCompany({ ...f, name: f.name.trim(), adminEmail: f.adminEmail.trim() })) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useSubmitShortcut(create, !result)

  if (result) {
    return (
      <PlatformShell back={{ to: '/platform/companies', label: 'All companies' }} width={1040}
        eyebrow="Company provisioned" title={result.org.name}
        description="The workspace is ready. It stays empty until the administrator below activates it.">
        <div className="pc-form-layout">
          <Card title="Administrator activation link" icon={KeyRound}
            footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Link to="/platform/companies" className="btn-secondary" style={{ textDecoration: 'none' }}>All companies</Link>
              <Link to={`/platform/companies/${result.org.id}`} className="btn-primary" style={{ textDecoration: 'none' }}>Open company <ArrowUpRight size={13} /></Link>
            </div>}>
            <div className="pc-banner pc-banner--green" style={{ marginBlockEnd: 16 }}>
              <Check size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span><strong>{result.org.name}</strong> was created and recorded in the console activity log.</span>
            </div>
            <LinkPanel email={result.admin_email} token={result.activation_token} expires={result.expires_at} />
          </Card>
          <NextSteps />
        </div>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell back={{ to: '/platform/companies', label: 'All companies' }} width={1040}
      title="Provision a new company"
      description="Creates the client's workspace and a 14-day activation link for its first administrator.">
      <ErrorNote>{error}</ErrorNote>
      <div className="pc-form-layout">
        <section className="pc-card">
          <Section title="Company" desc="How the client appears in their workspace and on their reports.">
            <div className="pc-fields">
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ marginBlockStart: 22 }}><Avatar name={f.name || '?'} size={40} /></span>
                <div style={{ flex: 1 }}>
                  <Field label="Company name" required hint="Must be unique across the platform.">
                    <input className="risys-input" style={inputStyle} value={f.name} onChange={set('name')} autoFocus placeholder="Al Rajhi Trading Co." />
                  </Field>
                </div>
              </div>
              <div className="pc-fields-2">
                <Field label="Industry"><input className="risys-input" style={inputStyle} value={f.industry} onChange={set('industry')} placeholder="Financial services" /></Field>
                <Field label="Primary contact" hint="Commercial contact at the client."><input className="risys-input" style={inputStyle} value={f.primaryContact} onChange={set('primaryContact')} placeholder="Name, phone or email" /></Field>
              </div>
            </div>
          </Section>
          <Section title="First administrator" desc="They receive the activation link, set their own password and invite the rest of their team.">
            <Field label="Administrator email" required>
              <input type="email" className="risys-input" style={inputStyle} value={f.adminEmail} onChange={set('adminEmail')} placeholder="it.manager@client.com" />
            </Field>
          </Section>
          <Section title="Internal notes" desc="Visible only in the console, never to the client.">
            <textarea className="risys-input" rows={3} style={inputStyle} value={f.notes} onChange={set('notes')}
              placeholder="Contract start, renewal date, who referred them…" />
          </Section>
          <FormActions busy={busy} onCancel={() => navigate('/platform/companies')} onSubmit={create}
            submitLabel={<><Building2 size={13} /> Provision company</>} disabled={!ready} />
        </section>
        <NextSteps />
      </div>
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
      name: detail.org.name, industry: detail.org.industry || '',
      primaryContact: detail.org.primary_contact || '', notes: detail.org.notes || '',
    })
  }, [detail, f])

  const save = async () => {
    setBusy(true); setError('')
    try { await platform.updateProfile(id, f); back() } catch (e) { setError(e.message); setBusy(false) }
  }
  useSubmitShortcut(save, !!f)

  if (loadError) return <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}><ErrorNote>{loadError}</ErrorNote></PlatformShell>
  if (loading || !f) return <Loading />

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <PlatformShell title="Edit profile" description={detail.org.name} back={{ to: `/platform/companies/${id}`, label: detail.org.name }} width={860}>
      <ErrorNote>{error}</ErrorNote>
      <section className="pc-card">
        <Section title="Company">
          <div className="pc-fields">
            <Field label="Company name" required hint="Renaming changes what the client sees in their workspace and on their reports.">
              <input className="risys-input" style={inputStyle} value={f.name} onChange={set('name')} autoFocus />
            </Field>
            <div className="pc-fields-2">
              <Field label="Industry"><input className="risys-input" style={inputStyle} value={f.industry} onChange={set('industry')} /></Field>
              <Field label="Primary contact"><input className="risys-input" style={inputStyle} value={f.primaryContact} onChange={set('primaryContact')} /></Field>
            </div>
          </div>
        </Section>
        <Section title="Internal notes" desc="Visible only in the console.">
          <textarea className="risys-input" rows={6} style={inputStyle} value={f.notes} onChange={set('notes')}
            placeholder="Renewal dates, escalation history, who to call…" />
        </Section>
        <FormActions busy={busy} onCancel={back} onSubmit={save} submitLabel="Save changes" />
      </section>
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
              <li>Everything the client has recorded in RISYS, with its full history</li>
              <li>Every stored file ({bytes(detail.storage_bytes)})</li>
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
