import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Pencil, MessageCircleQuestion, CheckCircle2, XCircle, Undo2, AlertOctagon } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { FormPage, FormSection, RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useBusinessUnits } from '@/hooks/useBusinessUnits'
import { useRiskSubmissions, useRiskSubmission } from '@/hooks/useErm'
import { labelOf } from '@/lib/policies'
import { RISK_CATEGORIES } from '@/lib/risks'
import {
  SUBMISSION_SOURCES, SUBMISSION_STATUSES, SUBMISSION_TONE, ROUGH_LIKELIHOOD, ROUGH_IMPACT,
  submissionOpen, daysUntil,
} from '@/lib/erm'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, personName, assignable } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)
const CATEGORY_OPTIONS = RISK_CATEGORIES.map((c) => ({ value: c, label: tx(c) }))

export const SubmissionBadge = ({ v }) => <StatusBadge tone={SUBMISSION_TONE[v]} label={labelOf(SUBMISSION_STATUSES, v)} />
const UrgentChip = () => (
  <span className="badge" style={{ color: 'var(--critical)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)', gap: 4 }}>
    <AlertOctagon size={11} /> {tx('Urgent')}
  </span>
)

const Intro = ({ children }) => (
  <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 760, margin: '0 0 16px', lineHeight: 1.6 }}>{children}</p>
)

/* ── Raised risks — /app/risks/intake ─────────────────────────────────────────
 *
 * Anyone except a viewer can raise a risk in a few plain sentences; nobody has
 * to know the scoring matrix to do it. A risk manager triages each one: asks a
 * question, declines it with a reason, or accepts it into the register as a
 * draft for a named owner, who then writes it up properly. The person who
 * raised a risk never triages it. The database enforces all of this.
 *
 *   /app/risks/intake            the queue (risk managers) or my submissions
 *   /app/risks/intake/new        raise a risk
 *   /app/risks/intake/:id        one submission, its questions and decision
 *   /app/risks/intake/:id/edit   change it, or answer a question
 * -------------------------------------------------------------------------- */

export function IntakeListPage() {
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useRiskSubmissions()
  const [status, setStatus] = useState('open')

  const stats = useMemo(() => {
    const waiting = items.filter((s) => s.status === 'submitted')
    const oldest = waiting.reduce((d, s) => Math.max(d, -daysUntil(s.submitted_at)), 0)
    return {
      waiting: waiting.length,
      asked: items.filter((s) => s.status === 'needs_clarification').length,
      urgent: waiting.filter((s) => s.urgent).length,
      accepted: items.filter((s) => s.status === 'accepted').length,
      declined: items.filter((s) => s.status === 'declined').length,
      oldest,
    }
  }, [items])

  const list = items
    .filter((s) => status === 'all' || (status === 'open' ? submissionOpen(s) : s.status === status))
    .sort((a, b) => (Number(b.urgent && submissionOpen(b)) - Number(a.urgent && submissionOpen(a)))
      || String(a.submitted_at).localeCompare(String(b.submitted_at)) * (status === 'open' ? 1 : -1))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Raised risks')} subtitle={organization?.name}
        actions={!perms.isViewer && <button className="btn-primary" onClick={() => navigate('/app/risks/intake/new')}><Plus size={14} /> {tx('Raise a risk')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <Intro>{perms.isManager
          ? tx('Risks raised by people across the organisation, waiting for triage. Ask a question, decline with a reason, or accept a risk into the register as a draft for its owner. You cannot triage a risk you raised yourself.')
          : tx('Risks you have raised. A risk manager reviews each one: they may ask you a question, accept it into the register, or explain why it was not added.')}</Intro>

        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={perms.isManager ? [
            { label: tx('Waiting for triage'), value: stats.waiting, tone: 'medium' },
            { label: tx('Marked urgent'), value: stats.urgent, tone: 'critical' },
            { label: tx('Question asked'), value: stats.asked },
            { label: tx('Oldest waiting'), value: stats.oldest, suffix: tx('days'), tone: stats.oldest > 5 ? 'critical' : 'default' },
            { label: tx('Accepted'), value: stats.accepted },
          ] : [
            { label: tx('Waiting for triage'), value: stats.waiting },
            { label: tx('Question for you'), value: stats.asked, tone: 'medium' },
            { label: tx('Accepted'), value: stats.accepted },
            { label: tx('Declined'), value: stats.declined },
          ]} />
        </div>

        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{perms.isManager ? tx('Triage queue') : tx('My submissions')}</h3>
            <div style={{ width: 210 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(val(e))}
                options={[{ value: 'open', label: tx('Open') }, { value: 'all', label: tx('Everything') }, ...SUBMISSION_STATUSES]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No risks raised yet')}
              action={!perms.isViewer && !items.length && <button className="btn-secondary" onClick={() => navigate('/app/risks/intake/new')}><Plus size={13} /> {tx('Raise a risk')}</button>}>
              {items.length ? null : tx('Seen something that could go wrong? Raise it here in a few sentences; a risk manager takes it from there.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Risk')}</Th><Th>{tx('Raised by')}</Th><Th>{tx('Raised')}</Th><Th>{tx('Status')}</Th><Th>{tx('In the register')}</Th></tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/intake/${s.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.ref}</Td>
                    <Td>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{s.title}</span>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                        {labelOf(SUBMISSION_SOURCES, s.source)}{s.business_unit ? ` · ${s.business_unit.name}` : ''}
                      </div>
                    </Td>
                    <Td>{s.submitted_by === user?.id ? tx('You') : personName(members, s.submitted_by)}</Td>
                    <Td>{fmtDate(s.submitted_at)}</Td>
                    <Td><span className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}><SubmissionBadge v={s.status} />{s.urgent && submissionOpen(s) && <UrgentChip />}</span></Td>
                    <Td>{s.risk ? <Link to={`/app/risks/${s.risk.id}`} onClick={(e) => e.stopPropagation()}>{s.risk.risk_id}</Link> : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ── Raise / edit / answer ────────────────────────────────────────────────── */

const BLANK = {
  title: '', description: '', business_unit_id: null, source: 'self_reported', category: null,
  root_cause: '', consequences: '', existing_controls: '', mitigation_ideas: '',
  likelihood: null, impact: null, urgent: false,
}

export function RaiseRiskPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { active: units } = useBusinessUnits()
  const { submit } = useRiskSubmissions()
  const existing = useRiskSubmission(id)
  const [f, setF] = useState(BLANK)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))
  const s = existing.item
  const answering = editing && s?.status === 'needs_clarification'

  useEffect(() => {
    if (!editing || !s) return
    setF({
      title: s.title, description: s.description, business_unit_id: s.business_unit_id, source: s.source, category: s.category,
      root_cause: s.root_cause || '', consequences: s.consequences || '', existing_controls: s.existing_controls || '',
      mitigation_ideas: s.mitigation_ideas || '', likelihood: s.likelihood, impact: s.impact, urgent: s.urgent,
    })
  }, [editing, s])

  const back = () => navigate(editing ? `/app/risks/intake/${id}` : '/app/risks/intake')
  const save = async () => {
    if (f.title.trim().length < 5) { setError(tx('Give the risk a short title (at least 5 characters).')); return }
    if (f.description.trim().length < 20) { setError(tx('Describe what could happen in at least 20 characters.')); return }
    if (answering && answer.trim().length < 5) { setError(tx('Answer the question the reviewer asked.')); return }
    setBusy(true); setError('')
    const values = {
      title: f.title.trim(), description: f.description.trim(), business_unit_id: f.business_unit_id || '',
      source: f.source, category: f.category || '', root_cause: f.root_cause, consequences: f.consequences,
      existing_controls: f.existing_controls, mitigation_ideas: f.mitigation_ideas,
      likelihood: f.likelihood ? Number(f.likelihood) : '', impact: f.impact ? Number(f.impact) : '', urgent: !!f.urgent,
    }
    try {
      if (editing) { await existing.update(values, answering ? answer.trim() : null); navigate(`/app/risks/intake/${id}`, { replace: true }) }
      else { const newId = await submit(values); navigate(`/app/risks/intake/${newId}`, { replace: true }) }
    } catch (e) { setError(e.message); setBusy(false) }
  }

  const listBack = { label: tx('Raised risks'), onClick: () => navigate('/app/risks/intake') }
  if (perms.isViewer) return <PageNotFound title={tx('Read-only role')} back={listBack}>{tx('Viewers cannot raise risks. Ask an administrator for a member role.')}</PageNotFound>
  if (editing && existing.loading) return <PageLoading />
  if (editing && !s) return <PageNotFound title={tx('Submission not found')} back={listBack} />
  if (editing && (s.submitted_by !== user?.id || !submissionOpen(s))) {
    return <PageNotFound title={tx('This submission cannot be changed')} back={{ label: s.ref, onClick: back }}>{tx('Only the person who raised a risk can change it, and only while it is waiting for triage.')}</PageNotFound>
  }

  return (
    <FormPage
      title={answering ? `${tx('Answer the question on')} ${s.ref}` : editing ? `${tx('Edit')} ${s.ref}` : tx('Raise a risk')}
      description={tx('Describe it in your own words. You do not need to score it: a risk manager reviews it and, if it belongs in the register, an owner writes it up properly.')}
      back={{ label: editing ? s.ref : tx('Raised risks'), onClick: back }}
      onSubmit={save} error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{answering ? tx('Send answer') : editing ? tx('Save') : tx('Raise risk')}</SubmitButton>
      </>}
    >
      {answering && (
        <FormSection title={tx('The question')} description={tx('The reviewer needs this before they can decide. Answering sends the risk back to the triage queue.')}>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)', fontSize: 'var(--t-sm)', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {s.clarification_request}
          </div>
          <Field label={tx('Your answer')} required>
            <textarea className="risys-input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </Field>
        </FormSection>
      )}

      <FormSection title={tx('What could happen')} description={tx('The event you are worried about, and where in the organisation.')}
        tips={[
          tx('Name the thing that could go wrong, not the control that is missing: "Payroll changed without trace", not "No audit log".'),
          tx('Say what you saw and when. A short example is worth more than a general worry.'),
          tx('Leave the category empty if you are not sure; the risk manager will set it.'),
        ]}>
        <Field label={tx('Short title')} required><input className="risys-input" value={f.title} onChange={set('title')} maxLength={200} placeholder={tx('e.g. Payroll changes cannot be traced to a person')} /></Field>
        <Field label={tx('What could happen, and why it matters')} required>
          <textarea className="risys-input" rows={4} value={f.description} onChange={set('description')} />
        </Field>
        <div className="fp-grid-2">
          <Field label={tx('Where (business unit)')}>
            <Combobox value={f.business_unit_id} clearable placeholder={tx('Not sure')}
              options={units.map((u) => ({ value: u.id, label: `${'— '.repeat(u.depth)}${u.name}` }))}
              onChange={(v) => setF((x) => ({ ...x, business_unit_id: v || null }))} />
          </Field>
          <Field label={tx('How you came across it')}><SelectField className="w-full" value={f.source} options={SUBMISSION_SOURCES} onChange={set('source')} /></Field>
        </div>
        <Field label={tx('Category')}>
          <Combobox value={f.category} clearable placeholder={tx('Not sure')} options={CATEGORY_OPTIONS}
            onChange={(v) => setF((x) => ({ ...x, category: v || null }))} />
        </Field>
      </FormSection>

      <FormSection title={tx('Cause and effect')} description={tx('Optional, but it saves the owner a conversation.')}
        tips={[
          tx('Cause: why it could happen (a shared account, a manual step, an unpatched system).'),
          tx('Consequences: what it would cost: money, a regulator notice, customers affected, downtime.'),
          tx('Mention anything already in place that reduces it, even partly.'),
        ]}>
        <Field label={tx('Cause')}><textarea className="risys-input" rows={2} value={f.root_cause} onChange={set('root_cause')} /></Field>
        <Field label={tx('Consequences')}><textarea className="risys-input" rows={2} value={f.consequences} onChange={set('consequences')} /></Field>
        <Field label={tx('What is already in place')}><textarea className="risys-input" rows={2} value={f.existing_controls} onChange={set('existing_controls')} /></Field>
        <Field label={tx('Ideas to reduce it')}><textarea className="risys-input" rows={2} value={f.mitigation_ideas} onChange={set('mitigation_ideas')} /></Field>
      </FormSection>

      <FormSection title={tx('Your rough view')} description={tx('A first impression only. The risk owner scores it properly against the risk matrix.')}
        tips={[tx('Mark it urgent only if it needs attention this week: risk managers see urgent submissions first.')]}>
        <div className="fp-grid-2">
          <Field label={tx('How likely')}>
            <SelectField className="w-full" value={f.likelihood ?? ''} onChange={set('likelihood')}
              options={[{ value: '', label: tx('No view') }, ...ROUGH_LIKELIHOOD]} />
          </Field>
          <Field label={tx('How bad if it happened')}>
            <SelectField className="w-full" value={f.impact ?? ''} onChange={set('impact')}
              options={[{ value: '', label: tx('No view') }, ...ROUGH_IMPACT]} />
          </Field>
        </div>
        <label className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
          <input type="checkbox" checked={!!f.urgent} onChange={(e) => setF((x) => ({ ...x, urgent: e.target.checked }))} />
          {tx('Urgent: this needs attention this week')}
        </label>
      </FormSection>
    </FormPage>
  )
}

/* ── One submission ───────────────────────────────────────────────────────── */

export function SubmissionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const sub = useRiskSubmission(id)
  const s = sub.item
  const [mode, setMode] = useState(null)          // 'clarify' | 'decline' | 'accept' | 'withdraw'
  const [note, setNote] = useState('')
  const [accept, setAccept] = useState({ owner: null, title: '', category: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = { label: tx('Raised risks'), onClick: () => navigate('/app/risks/intake') }

  if (sub.loading) return <PageLoading />
  if (!s) return <PageNotFound title={tx('Submission not found')} back={back}>{tx('It belongs to another organisation, or it was raised by someone else and you do not triage risks.')}</PageNotFound>

  const mine = s.submitted_by === user?.id
  const open = submissionOpen(s)
  const canTriage = perms.isManager && !mine && open
  const owners = assignable(members)

  const start = (m) => {
    setMode(m); setNote(''); setError('')
    if (m === 'accept') setAccept({ owner: null, title: s.title, category: s.category })
  }
  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn(); setMode(null) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const rating = (s.likelihood || s.impact)
    ? `${labelOf(ROUGH_LIKELIHOOD, s.likelihood) || '—'} · ${labelOf(ROUGH_IMPACT, s.impact) || '—'}`
    : null

  return (
    <RecordPage
      title={`${s.ref} — ${s.title}`}
      description={labelOf(SUBMISSION_SOURCES, s.source)}
      meta={<span className="flex items-center" style={{ gap: 6 }}><SubmissionBadge v={s.status} />{s.urgent && open && <UrgentChip />}</span>}
      back={back}
      actions={mine && open && <>
        <button className="btn-secondary" onClick={() => navigate(`/app/risks/intake/${id}/edit`)}>
          {s.status === 'needs_clarification' ? <><MessageCircleQuestion size={13} /> {tx('Answer the question')}</> : <><Pencil size={13} /> {tx('Edit')}</>}
        </button>
        <button className="btn-secondary" onClick={() => start('withdraw')}><Undo2 size={13} /> {tx('Withdraw')}</button>
      </>}
      aside={
        <Section title={tx('Details')}>
          <Facts rows={[
            [tx('Raised by'), mine ? tx('You') : personName(members, s.submitted_by)],
            [tx('Raised'), fmtDateTime(s.submitted_at)],
            [tx('Business unit'), s.business_unit?.name],
            [tx('Category'), s.category ? tx(s.category) : null],
            [tx('Rough view'), rating],
            [tx('Reviewer'), personName(members, s.reviewer_id)],
            [tx('Decided'), s.reviewed_at && !open ? fmtDateTime(s.reviewed_at) : null],
            [tx('In the register'), s.risk ? <Link key="r" to={`/app/risks/${s.risk.id}`}>{s.risk.risk_id} · {s.risk.title}</Link> : null],
          ]} />
        </Section>
      }
    >
      <Section title={tx('What was raised')}>
        <Facts rows={[
          [tx('What could happen'), s.description],
          [tx('Cause'), s.root_cause],
          [tx('Consequences'), s.consequences],
          [tx('Already in place'), s.existing_controls],
          [tx('Ideas to reduce it'), s.mitigation_ideas],
        ]} />
      </Section>

      {s.clarification_request && (
        <Section title={tx('Question and answer')}>
          <Facts rows={[
            [tx('Question'), `${s.clarification_request}${s.clarification_requested_at ? ` (${fmtDate(s.clarification_requested_at)})` : ''}`],
            [tx('Answer'), s.clarification_response || (s.status === 'needs_clarification' ? tx('Waiting for an answer') : null)],
          ]} />
        </Section>
      )}

      {!open && s.status !== 'accepted' && (
        <Section title={tx('Outcome')}>
          <Facts rows={[[tx('Decision'), labelOf(SUBMISSION_STATUSES, s.status)], [tx('Reason'), s.decision_note]]} />
        </Section>
      )}
      {s.status === 'accepted' && (
        <Section title={tx('Outcome')}>
          <Facts rows={[
            [tx('Decision'), tx('Accepted into the register as a draft')],
            [tx('Risk'), s.risk ? <Link key="r" to={`/app/risks/${s.risk.id}`}>{s.risk.risk_id}</Link> : tx('Not visible to you')],
            [tx('Note'), s.decision_note],
          ]} />
        </Section>
      )}

      <ErrorText>{error}</ErrorText>

      {mode === 'withdraw' && (
        <Section title={tx('Withdraw this risk')}>
          <Field label={tx('Why (optional)')}><textarea className="risys-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex" style={{ gap: 6, marginTop: 10 }}>
            <SubmitButton busy={busy} onClick={() => run(() => sub.withdraw(note.trim()))}>{tx('Withdraw')}</SubmitButton>
            <button className="btn-secondary" onClick={() => setMode(null)}>{tx('Cancel')}</button>
          </div>
        </Section>
      )}

      {canTriage && (
        <Section title={tx('Triage')}>
          {!mode && (
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => start('accept')}><CheckCircle2 size={13} /> {tx('Accept into the register')}</button>
              {s.status === 'submitted' && <button className="btn-secondary" onClick={() => start('clarify')}><MessageCircleQuestion size={13} /> {tx('Ask a question')}</button>}
              <button className="btn-secondary" onClick={() => start('decline')}><XCircle size={13} /> {tx('Decline')}</button>
            </div>
          )}
          {mode === 'clarify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={tx('Your question')} required help={tx('The person who raised it is notified and answers on the submission.')}>
                <textarea className="risys-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              </Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy} onClick={() => run(() => sub.triage('clarify', { note: note.trim() }))}>{tx('Send question')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setMode(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
          {mode === 'decline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={tx('Why it is not added')} required help={tx('Be specific: already covered by RSK-0004, not a risk to this organisation, a task rather than a risk.')}>
                <textarea className="risys-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              </Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy} onClick={() => run(() => sub.triage('decline', { note: note.trim() }))}>{tx('Decline')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setMode(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
          {mode === 'accept' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Creates a draft risk in the register. The owner writes the cause, event and impact, then it is admitted and the assessment deadline starts.')}</p>
              <Field label={tx('Risk owner')} required>
                <Combobox value={accept.owner} placeholder={tx('Choose the owner')} options={owners}
                  onChange={(v) => setAccept((x) => ({ ...x, owner: v || null }))} />
              </Field>
              <div className="fp-grid-2">
                <Field label={tx('Title in the register')}><input className="risys-input" value={accept.title} onChange={(e) => setAccept((x) => ({ ...x, title: e.target.value }))} /></Field>
                <Field label={tx('Category')}>
                  <Combobox value={accept.category} clearable placeholder={tx('Set later')} options={CATEGORY_OPTIONS}
                    onChange={(v) => setAccept((x) => ({ ...x, category: v || null }))} />
                </Field>
              </div>
              <Field label={tx('Note to the person who raised it (optional)')}><textarea className="risys-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy} disabled={!accept.owner} onClick={() => run(async () => {
                  const riskId = await sub.triage('accept', { note: note.trim() || null, owner: accept.owner, title: accept.title.trim() || null, category: accept.category })
                  if (riskId) navigate(`/app/risks/${riskId}`)
                })}>{tx('Create draft risk')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setMode(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
        </Section>
      )}
      {perms.isManager && mine && open && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('You raised this risk, so another risk manager has to triage it.')}</p>
      )}
    </RecordPage>
  )
}
