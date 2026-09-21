import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FINDING_RATINGS } from '@/hooks/useAudits'
import { fmtDateTime } from '@/lib/reports/models'
import { Dialog, Field, Grid, SubmitButton, ErrorText, Section, RatingBadge, FindingStatusBadge, DueText, Th, Td, Empty, Facts, personName } from './parts'

/* Findings, written the way audit standards expect: condition (what we
 * found), criteria (what is required), cause, effect, recommendation — then
 * management's response, owner and date. The audit team writes the finding;
 * the owner may only respond and move it through remediation; only the audit
 * team validates and closes it (audit_finding_guard). */

const DONE = ['closed', 'risk_accepted']

export function FindingsTab({ audit, members, canManage, locked, focusId }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(null) // {} for new
  const [openId, setOpenId] = useState(focusId ?? null)
  const open = audit.findings.find((f) => f.id === openId)
  const visible = audit.findings.filter((f) => canManage || f.status !== 'draft')

  return (
    <Section title={`Findings (${visible.length})`} pad={false}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => setEditing({})}><Plus size={13} /> New finding</button>}>
      {visible.length === 0 ? (
        <Empty title="No findings">{canManage ? 'Raise a finding when testing shows a control is not designed or operating as required. Findings stay in draft until you issue them to management.' : 'Findings issued by the audit team will appear here.'}</Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th width={120}>Ref</Th><Th>Finding</Th><Th>Rating</Th><Th>Owner</Th><Th>Due</Th><Th>Status</Th></tr></thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => setOpenId(f.id)}>
                <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{f.ref}</Td>
                <Td>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{f.title}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                    {[f.requirement_id && `${f.framework ?? ''} ${f.requirement_id}`, f.risk && `Risk ${f.risk.risk_id}`].filter(Boolean).join(' · ')}
                    {f.response_owner === user.id && !DONE.includes(f.status) && f.status !== 'draft' && <span style={{ color: 'var(--crimson)', fontWeight: 600 }}> Waiting on you</span>}
                  </div>
                </Td>
                <Td><RatingBadge v={f.rating} /></Td>
                <Td>{personName(members, f.response_owner) ?? '—'}</Td>
                <Td><DueText date={f.due_date} done={DONE.includes(f.status)} /></Td>
                <Td><FindingStatusBadge v={f.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <FindingForm audit={audit} members={members} initial={editing} onClose={() => setEditing(null)} />}
      {open && !editing && (
        <FindingDialog audit={audit} finding={open} members={members} canManage={canManage} locked={locked}
          onEdit={() => setEditing(open)} onClose={() => setOpenId(null)} />
      )}
    </Section>
  )
}

function FindingForm({ audit, members, initial, onClose }) {
  const e = audit.engagement
  const [f, setF] = useState({
    title: '', rating: 'medium', condition: '', criteria: '', cause: '', effect: '', recommendation: '',
    requirement_id: '', scope_item_id: '', response_owner: '', due_date: '',
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])),
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  const pickScope = (id) => {
    const s = audit.scope.find((x) => x.id === id)
    setF((v) => ({ ...v, scope_item_id: id, requirement_id: v.requirement_id || s?.requirement_id || '' }))
  }
  const payload = () => ({
    title: f.title.trim(), rating: f.rating,
    condition: f.condition.trim() || null, criteria: f.criteria.trim() || null, cause: f.cause.trim() || null,
    effect: f.effect.trim() || null, recommendation: f.recommendation.trim() || null,
    framework: f.requirement_id ? e.framework : null, requirement_id: f.requirement_id.trim() || null,
    scope_item_id: f.scope_item_id || null, response_owner: f.response_owner || null, due_date: f.due_date || null,
  })
  const save = (issue) => async () => {
    if (!f.title.trim()) { setError('Give the finding a title.'); return }
    if (issue && (!f.condition.trim() || !f.recommendation.trim())) { setError('A finding needs at least a condition and a recommendation before it is issued.'); return }
    if (issue && !f.response_owner) { setError('Choose who in management will respond.'); return }
    setBusy(issue ? 'issue' : 'save'); setError('')
    try {
      const p = payload()
      if (issue && (!initial.id || initial.status === 'draft')) p.status = 'open'
      if (initial.id) await audit.updateFinding(initial.id, p)
      else await audit.addFinding(p)
      onClose()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const isDraft = !initial.id || initial.status === 'draft'

  return (
    <Dialog open onClose={onClose} width={720}
      title={initial.id ? `Edit ${initial.ref}` : 'New finding'}
      subtitle={isDraft ? 'Saved as a draft until issued. Drafts are visible only to the audit team and never appear in reports.' : 'Changes are visible to the finding owner.'}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        {isDraft && <button className="btn-secondary" disabled={!!busy} onClick={save(false)}>Save draft</button>}
        <SubmitButton busy={busy === 'issue' || (!isDraft && busy === 'save')} onClick={save(isDraft)}>{isDraft ? 'Issue to management' : 'Save changes'}</SubmitButton>
      </>}>
      <Grid cols={3}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Title" required><input className="risys-input" value={f.title} onChange={set('title')} autoFocus placeholder="e.g. MFA is not enforced by policy" /></Field>
        </div>
        <Field label="Rating"><SelectField className="w-full" value={f.rating} onChange={set('rating')} options={FINDING_RATINGS} /></Field>
      </Grid>
      <Field label="Condition — what we found" required>
        <textarea className="risys-input" rows={3} value={f.condition} onChange={set('condition')} placeholder="The facts, with the sample and the numbers: 7 of 25 sampled accounts…" />
      </Field>
      <Field label="Criteria — what is required">
        <textarea className="risys-input" rows={2} value={f.criteria} onChange={set('criteria')} placeholder="The requirement or policy the condition falls short of." />
      </Field>
      <Grid cols={2}>
        <Field label="Cause"><textarea className="risys-input" rows={2} value={f.cause} onChange={set('cause')} /></Field>
        <Field label="Effect — why it matters"><textarea className="risys-input" rows={2} value={f.effect} onChange={set('effect')} /></Field>
      </Grid>
      <Field label="Recommendation" required>
        <textarea className="risys-input" rows={2} value={f.recommendation} onChange={set('recommendation')} />
      </Field>
      <Grid cols={2}>
        <Field label="Scope item">
          <SelectField className="w-full" value={f.scope_item_id} onChange={(ev) => pickScope(ev.target.value)}
            options={[{ value: '', label: 'None' }, ...audit.scope.map((x) => ({ value: x.id, label: x.title }))]} />
        </Field>
        <Field label={`${e.framework ?? 'Framework'} requirement`}>
          <input className="risys-input" value={f.requirement_id} onChange={set('requirement_id')} placeholder="e.g. 2-2-3-2" />
        </Field>
        <Field label="Management owner">
          <SelectField className="w-full" value={f.response_owner} onChange={set('response_owner')}
            options={[{ value: '', label: 'Choose a person' }, ...members.filter((m) => m.role !== 'viewer').map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]} />
        </Field>
        <Field label="Remediation due"><DateField value={f.due_date} onChange={set('due_date')} /></Field>
      </Grid>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}

function FindingDialog({ audit, finding: f, members, canManage, locked, onEdit, onClose }) {
  const { user } = useAuth()
  const perms = usePermissions()
  const isOwner = f.response_owner === user.id
  const canRespond = !locked && (isOwner || canManage) && ['open', 'in_remediation', 'ready_for_validation'].includes(f.status)
  const [resp, setResp] = useState({ management_response: f.management_response ?? '', action_plan: f.action_plan ?? '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = (key, fn, close = true) => async () => {
    setBusy(key); setError('')
    try { await fn(); if (close) onClose() } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const saveResponse = (extra = {}) => audit.updateFinding(f.id, {
    management_response: resp.management_response.trim() || null, action_plan: resp.action_plan.trim() || null, ...extra,
  })

  const Block = ({ label, children }) => children ? (
    <div>
      <div style={{ fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'var(--t-body)', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{children}</div>
    </div>
  ) : null

  return (
    <Dialog open onClose={onClose} width={720} title={`${f.ref} — ${f.title}`}
      subtitle={<span className="flex items-center" style={{ gap: 6 }}><RatingBadge v={f.rating} /><FindingStatusBadge v={f.status} /></span>}
      footer={<>
        {canManage && !locked && f.status === 'draft' && (
          <button className="btn-ghost" style={{ marginRight: 'auto' }} onClick={run('del', async () => {
            if (window.confirm('Delete this draft finding?')) await audit.deleteFinding(f.id)
          })}>Delete draft</button>
        )}
        {canManage && !locked && perms.canCreateRisk && !f.risk_id && f.status !== 'draft' && (
          <button className="btn-ghost" style={{ marginRight: f.status === 'draft' ? 0 : 'auto' }} onClick={run('risk', () => audit.raiseRisk(f), false)}>
            <ShieldAlert size={13} /> Raise as risk
          </button>
        )}
        <button className="btn-secondary" onClick={onClose}>Close</button>
        {canManage && !locked && !['closed', 'risk_accepted'].includes(f.status) && <button className="btn-secondary" onClick={onEdit}>Edit finding</button>}
        {canManage && !locked && f.status === 'draft' && (
          <SubmitButton busy={busy === 'issue'} onClick={run('issue', () => audit.updateFinding(f.id, { status: 'open' }))}>Issue to management</SubmitButton>
        )}
        {canManage && !locked && ['open', 'in_remediation'].includes(f.status) && (
          <button className="btn-secondary" disabled={!!busy} title="Management has formally accepted the risk instead of remediating it"
            onClick={run('acc', () => { if (window.confirm('Record that management accepts this risk rather than remediating it?')) return audit.updateFinding(f.id, { status: 'risk_accepted' }) })}>
            Risk accepted
          </button>
        )}
        {canManage && !locked && f.status === 'ready_for_validation' && <>
          <button className="btn-secondary" disabled={!!busy} onClick={run('back', () => audit.updateFinding(f.id, { status: 'in_remediation' }))}>Not yet resolved</button>
          <SubmitButton busy={busy === 'close'} onClick={run('close', () => audit.updateFinding(f.id, { status: 'closed' }))}>Validate & close</SubmitButton>
        </>}
      </>}>
      <Block label="Condition — what we found">{f.condition}</Block>
      <Block label="Criteria — what is required">{f.criteria}</Block>
      <Block label="Cause">{f.cause}</Block>
      <Block label="Effect — why it matters">{f.effect}</Block>
      <Block label="Recommendation">{f.recommendation}</Block>
      <Facts rows={[
        f.requirement_id && ['Requirement', `${f.framework ?? ''} ${f.requirement_id}`],
        ['Owner', personName(members, f.response_owner)],
        ['Remediation due', <DueText key="d" date={f.due_date} done={DONE.includes(f.status)} />],
        f.risk && ['Linked risk', <Link key="r" to={`/app/risks/${f.risk.id}`} style={{ color: 'var(--crimson)' }}>{f.risk.risk_id} {f.risk.title}</Link>],
        f.validated_at && ['Validated', `${fmtDateTime(f.validated_at)} by ${personName(members, f.validated_by)}`],
      ]} />

      <div className="section" style={{ padding: 14, background: 'var(--surface)' }}>
        <div style={{ fontSize: 'var(--t-section)', fontWeight: 600, marginBottom: 8 }}>Management response</div>
        {canRespond ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Response" help="Agree or disagree with the finding, and why.">
              <textarea className="risys-input" rows={3} value={resp.management_response} onChange={(e) => setResp({ ...resp, management_response: e.target.value })} />
            </Field>
            <Field label="Action plan">
              <textarea className="risys-input" rows={2} value={resp.action_plan} onChange={(e) => setResp({ ...resp, action_plan: e.target.value })} />
            </Field>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary" disabled={!!busy} onClick={run('resp', () => saveResponse(), false)}>Save response</button>
              {f.status === 'open' && (
                <SubmitButton busy={busy === 'start'} disabled={!resp.management_response.trim()}
                  onClick={run('start', () => saveResponse({ status: 'in_remediation' }))}>Start remediation</SubmitButton>
              )}
              {f.status === 'in_remediation' && (
                <SubmitButton busy={busy === 'ready'} onClick={run('ready', () => saveResponse({ status: 'ready_for_validation' }))}>Ready for validation</SubmitButton>
              )}
            </div>
          </div>
        ) : (
          <Facts rows={[['Response', f.management_response ?? 'No response yet.'], f.action_plan && ['Action plan', f.action_plan]]} />
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}
