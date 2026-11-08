import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, BadgeCheck, CalendarPlus, CheckCircle2, Pencil } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { FormPage, FormSection, RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useRequests, useRequest, useActivities } from '@/hooks/usePrivacy'
import { labelOf } from '@/lib/policies'
import {
  REQUEST_TYPES, CHANNELS, REQUEST_STATUSES, REFUSAL_REASONS, PDPL,
  requestOpen, requestDaysLeft, nowLocal, toInstant,
} from '@/lib/privacy'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, personName, assignable } from '@/features/audits/parts'
import { RequestStatusBadge, RequestClock, LawNote } from './parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* ── Data subject requests (PDPL-IR Art. 3) ───────────────────────────────────
 *
 *   /app/privacy/requests          the register, soonest due first
 *   /app/privacy/requests/new      log a request (oral ones too)
 *   /app/privacy/requests/:id      verify identity → act → close; extend once
 *
 * The 30-day clock starts at receipt and is set by the database. It can be
 * extended once, by 30 days, with a reason and only after the requester was
 * told. Nothing can be completed before identity is verified, a refusal needs
 * one of the three reasons Art. 3(2) allows, and no request is ever deleted.
 * -------------------------------------------------------------------------- */

export function DsrListPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useRequests()
  const [status, setStatus] = useState('open')

  const stats = useMemo(() => {
    const open = items.filter(requestOpen)
    const closed = items.filter((r) => r.closed_at)
    const onTime = closed.filter((r) => String(r.closed_at).slice(0, 10) <= (r.extended_due_on || r.due_on)).length
    return {
      open: open.length,
      week: open.filter((r) => requestDaysLeft(r) >= 0 && requestDaysLeft(r) <= 7).length,
      overdue: open.filter((r) => requestDaysLeft(r) < 0).length,
      unverified: open.filter((r) => r.status === 'received').length,
      onTime: closed.length ? `${Math.round((100 * onTime) / closed.length)}%` : '—',
    }
  }, [items])

  const list = items
    .filter((r) => status === 'all' || (status === 'open' ? requestOpen(r) : r.status === status))
    .sort((a, b) => (requestOpen(a) && requestOpen(b) ? (requestDaysLeft(a) ?? 0) - (requestDaysLeft(b) ?? 0) : 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Data subject requests')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <button className="btn-primary" onClick={() => navigate('/app/privacy/requests/new')}><Plus size={14} /> {tx('Log a request')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <LawNote>{tx('Act on a request within 30 days of receiving it. It can be extended once, by up to 30 more days, if it needs disproportionate effort or several requests arrive, and the requester must be told in advance. Verify identity before acting, and keep a record of every request, oral ones included.')} ({PDPL.requests})</LawNote>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Open'), value: stats.open },
            { label: tx('Due within 7 days'), value: stats.week, tone: 'medium' },
            { label: tx('Overdue'), value: stats.overdue, tone: 'critical' },
            { label: tx('Identity not yet verified'), value: stats.unverified, tone: 'medium' },
            { label: tx('Closed on time'), value: stats.onTime },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Register')}</h3>
            <div style={{ width: 200 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(val(e))}
                options={[{ value: 'open', label: tx('Open') }, { value: 'all', label: tx('Everything') }, ...REQUEST_STATUSES]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No requests yet')}>
              {items.length ? null : tx('Log every request a data subject makes, however it arrives. The 30-day clock starts when it was received.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Request')}</Th><Th>{tx('Received')}</Th><Th>{tx('Assigned to')}</Th><Th>{tx('Status')}</Th><Th width={170}>{tx('Due')}</Th></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/requests/${r.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.ref}</Td>
                    <Td>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{labelOf(REQUEST_TYPES, r.request_type)}</span>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{r.requester_name} · {labelOf(CHANNELS, r.channel)}</div>
                    </Td>
                    <Td>{fmtDate(r.received_at)}</Td>
                    <Td>{personName(members, r.assigned_to) || <span style={{ color: 'var(--text-3)' }}>{tx('Not assigned')}</span>}</Td>
                    <Td><RequestStatusBadge v={r.status} /></Td>
                    <Td><RequestClock r={r} /></Td>
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

/* ── Log / edit ───────────────────────────────────────────────────────────── */

export function DsrFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const perms = usePermissions()
  const { members } = usePeople()
  const { create } = useRequests()
  const existing = useRequest(id)
  const acts = useActivities()
  const [f, setF] = useState({
    request_type: 'access', channel: 'email', requester_name: '', requester_contact: '', on_behalf: false,
    on_behalf_relationship: '', details: '', received_at: nowLocal(), activity_id: null, assigned_to: null,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))

  useEffect(() => {
    const r = existing.item
    if (!editing || !r) return
    setF({
      request_type: r.request_type, channel: r.channel, requester_name: r.requester_name, requester_contact: r.requester_contact || '',
      on_behalf: r.on_behalf, on_behalf_relationship: r.on_behalf_relationship || '', details: r.details,
      received_at: null, activity_id: r.activity_id, assigned_to: r.assigned_to,
    })
  }, [editing, existing.item])

  const back = () => navigate(editing ? `/app/privacy/requests/${id}` : '/app/privacy/requests')
  const save = async () => {
    if (f.requester_name.trim().length < 2) { setError(tx('Who made the request?')); return }
    if (f.details.trim().length < 10) { setError(tx('Describe the request in at least 10 characters.')); return }
    if (f.on_behalf && !f.on_behalf_relationship.trim()) { setError(tx('Say how the requester acts for the data subject.')); return }
    setBusy(true); setError('')
    const values = {
      request_type: f.request_type, channel: f.channel, requester_name: f.requester_name.trim(),
      requester_contact: f.requester_contact.trim() || null, on_behalf: f.on_behalf,
      on_behalf_relationship: f.on_behalf ? f.on_behalf_relationship.trim() : null, details: f.details.trim(),
      activity_id: f.activity_id || null, assigned_to: f.assigned_to || null,
    }
    try {
      if (editing) { await existing.update(values); navigate(`/app/privacy/requests/${id}`, { replace: true }) }
      else {
        const newId = await create({ ...values, received_at: toInstant(f.received_at) })
        navigate(`/app/privacy/requests/${newId}`, { replace: true })
      }
    } catch (e) { setError(e.message); setBusy(false) }
  }

  if (perms.isReadOnly) return <PageNotFound title={tx('Read-only role')} back={{ label: tx('Data subject requests'), onClick: () => navigate('/app/privacy/requests') }}>{tx('Viewers and auditors cannot log requests.')}</PageNotFound>
  if (editing && existing.loading) return <PageLoading />
  if (editing && !existing.item) return <PageNotFound title={tx('Request not found')} back={{ label: tx('Data subject requests'), onClick: back }} />

  return (
    <FormPage
      title={editing ? `${tx('Edit')} ${existing.item.ref}` : tx('Log a data subject request')}
      description={tx('Record it as soon as it arrives, by any channel. The database starts the 30-day clock from the time received.')}
      back={{ label: editing ? existing.item.ref : tx('Data subject requests'), onClick: back }}
      onSubmit={save} error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{editing ? tx('Save') : tx('Log request')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The request')} description={tx('What the data subject asked for and how it reached you.')}
        tips={[
          tx('An oral request (phone, in person) must be recorded too: write down what was asked, in their words if you can.'),
          tx('Pick the right the request exercises; "Other" is fine when it is unclear, and say what was asked in the details.'),
          tx('If they asked about one system or service, link the processing record so the request can be traced.'),
        ]}>
        <div className="fp-grid-2">
          <Field label={tx('Type')}><SelectField className="w-full" value={f.request_type} options={REQUEST_TYPES} onChange={set('request_type')} /></Field>
          <Field label={tx('Received by')}><SelectField className="w-full" value={f.channel} options={CHANNELS} onChange={set('channel')} /></Field>
        </div>
        {!editing && (
          <Field label={tx('Received at')} required help={tx('Starts the clock. It cannot be changed later.')}>
            <DateTimeField value={f.received_at} onChange={set('received_at')} aria-label={tx('Received at')} />
          </Field>
        )}
        <Field label={tx('Details')} required><textarea className="risys-input" rows={4} value={f.details} onChange={set('details')} /></Field>
        <Field label={tx('Processing record')}>
          <Combobox value={f.activity_id} clearable placeholder={tx('Optional')}
            options={acts.items.map((a) => ({ value: a.id, label: `${a.ref} ${a.name}` }))}
            onChange={(v) => setF((x) => ({ ...x, activity_id: v || null }))} />
        </Field>
      </FormSection>

      <FormSection title={tx('The requester')} description={tx('Who asked, and how to reach them.')}
        tips={[
          tx('Identity is verified on the request page before anything is done with it.'),
          tx('A legal guardian may act for someone who lacks legal capacity (Art. 3(3)); say so here.'),
        ]}>
        <div className="fp-grid-2">
          <Field label={tx('Name')} required><input className="risys-input" value={f.requester_name} onChange={set('requester_name')} /></Field>
          <Field label={tx('Contact')}><input className="risys-input" value={f.requester_contact} onChange={set('requester_contact')} placeholder={tx('Email or phone')} /></Field>
        </div>
        <label className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
          <input type="checkbox" checked={f.on_behalf} onChange={(e) => setF((x) => ({ ...x, on_behalf: e.target.checked }))} />
          {tx('Acting on behalf of the data subject')}
        </label>
        {f.on_behalf && <Field label={tx('Relationship')} required><input className="risys-input" value={f.on_behalf_relationship} onChange={set('on_behalf_relationship')} placeholder={tx('e.g. legal guardian')} /></Field>}
      </FormSection>

      <FormSection title={tx('Who handles it')} description={tx('The person who verifies identity, acts on the request and closes it.')}>
        <Field label={tx('Assigned to')}>
          <Combobox value={f.assigned_to} clearable placeholder={tx('Compliance team')}
            options={assignable(members).map((m) => ({ value: m.user_id, label: m.full_name || m.email }))}
            onChange={(v) => setF((x) => ({ ...x, assigned_to: v || null }))} />
        </Field>
      </FormSection>
    </FormPage>
  )
}

/* ── One request ──────────────────────────────────────────────────────────── */

export function DsrDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const req = useRequest(id)
  const r = req.item
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [method, setMethod] = useState('')
  const [ext, setExt] = useState(null)
  const [close, setClose] = useState(null)
  const back = { label: tx('Data subject requests'), onClick: () => navigate('/app/privacy/requests') }
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  if (req.loading) return <PageLoading />
  if (!r) return <PageNotFound title={tx('Request not found')} back={back}>{tx('It belongs to another organisation, or you are not the person handling it.')}</PageNotFound>

  const open = requestOpen(r)
  const canAct = open && (perms.isComplianceWriter || r.assigned_to === user?.id)
  const canExtend = canAct && !r.extended_due_on && requestDaysLeft({ due_on: r.due_on }) >= 0

  return (
    <RecordPage
      title={`${r.ref} — ${labelOf(REQUEST_TYPES, r.request_type)}`}
      description={`${r.requester_name}${r.on_behalf ? ` (${r.on_behalf_relationship})` : ''} · ${labelOf(CHANNELS, r.channel)}`}
      meta={<RequestStatusBadge v={r.status} />}
      back={back}
      actions={canAct && <button className="btn-secondary" onClick={() => navigate(`/app/privacy/requests/${id}/edit`)}><Pencil size={13} /> {tx('Edit')}</button>}
      aside={
        <Section title={tx('Clock')}>
          <Facts rows={[
            [tx('Received'), fmtDateTime(r.received_at)],
            [tx('Due'), <RequestClock key="c" r={r} />],
            [tx('Original due date'), fmtDate(r.due_on)],
            [tx('Extended to'), r.extended_due_on ? fmtDate(r.extended_due_on) : null],
            [tx('Assigned to'), personName(members, r.assigned_to)],
            [tx('Logged by'), personName(members, r.created_by)],
          ]} />
        </Section>
      }
    >
      <Section title={tx('Request')}>
        <Facts rows={[
          [tx('Details'), r.details],
          [tx('Contact'), r.requester_contact],
          [tx('Processing record'), r.activity ? <Link key="a" to={`/app/privacy/processing/${r.activity.id}`}>{r.activity.ref} {r.activity.name}</Link> : null],
        ]} />
      </Section>

      <ErrorText>{error}</ErrorText>

      <Section title={tx('1. Verify identity')}>
        {r.identity_verified_at ? (
          <Facts rows={[[tx('Verified'), `${personName(members, r.identity_verified_by)} · ${fmtDateTime(r.identity_verified_at)}`], [tx('How'), r.identity_method]]} />
        ) : canAct ? (
          <>
            <Field label={tx('How identity was verified')} required help={tx('For example: national ID checked against the HR record; call-back to the number on file.')}>
              <textarea className="risys-input" rows={2} value={method} onChange={(e) => setMethod(e.target.value)} />
            </Field>
            <div style={{ marginTop: 10 }}>
              <SubmitButton busy={busy === 'v'} onClick={run('v', async () => { await req.verify(method.trim()); setMethod('') })}><BadgeCheck size={13} /> {tx('Record verification')}</SubmitButton>
            </div>
          </>
        ) : <p style={{ margin: 0, color: 'var(--text-3)' }}>{open ? tx('Not verified yet.') : tx('Closed without verification.')}</p>}
      </Section>

      <Section title={tx('Extension')}>
        {r.extended_due_on ? (
          <Facts rows={[[tx('Extended to'), fmtDate(r.extended_due_on)], [tx('Reason'), r.extension_reason], [tx('Requester told'), fmtDateTime(r.extension_notified_at)]]} />
        ) : !canExtend ? (
          <p style={{ margin: 0, color: 'var(--text-3)' }}>{open ? tx('No extension. One extension of up to 30 days can be recorded before the original due date.') : tx('Not extended.')}</p>
        ) : ext === null ? (
          <button className="btn-secondary" onClick={() => setExt({ reason: '', at: nowLocal() })}><CalendarPlus size={13} /> {tx('Extend by 30 days')}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={tx('Reason')} required help={tx('Disproportionate effort, or several requests at once.')}>
              <textarea className="risys-input" rows={2} value={ext.reason} onChange={(e) => setExt((x) => ({ ...x, reason: e.target.value }))} />
            </Field>
            <Field label={tx('When the requester was told')} required>
              <DateTimeField value={ext.at} onChange={(e) => setExt((x) => ({ ...x, at: val(e) }))} aria-label={tx('When the requester was told')} />
            </Field>
            <div className="flex" style={{ gap: 6 }}>
              <SubmitButton busy={busy === 'e'} onClick={run('e', async () => { await req.extend(ext.reason.trim(), toInstant(ext.at)); setExt(null) })}>{tx('Record extension')}</SubmitButton>
              <button className="btn-secondary" onClick={() => setExt(null)}>{tx('Cancel')}</button>
            </div>
          </div>
        )}
      </Section>

      <Section title={tx('2. Close')}>
        {!open ? (
          <Facts rows={[
            [tx('Outcome'), labelOf(REQUEST_STATUSES, r.status)],
            [tx('Refusal reason'), r.refusal_reason ? labelOf(REFUSAL_REASONS, r.refusal_reason) : null],
            [tx('Summary'), r.outcome_summary],
            [tx('Requester told'), r.requester_informed_at ? fmtDateTime(r.requester_informed_at) : null],
            [tx('Closed'), `${personName(members, r.closed_by)} · ${fmtDateTime(r.closed_at)}`],
          ]} />
        ) : !canAct ? (
          <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('The person assigned, or a compliance writer, closes the request.')}</p>
        ) : close === null ? (
          <button className="btn-secondary" onClick={() => setClose({ outcome: r.identity_verified_at ? 'completed' : 'refused', summary: '', refusal: 'manifestly_unfounded', at: nowLocal() })}>
            <CheckCircle2 size={13} /> {tx('Close the request')}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fp-grid-2">
              <Field label={tx('Outcome')}>
                <SelectField className="w-full" value={close.outcome} onChange={(e) => setClose((x) => ({ ...x, outcome: val(e) }))}
                  options={REQUEST_STATUSES.filter((s) => ['completed', 'refused', 'withdrawn'].includes(s.value))} />
              </Field>
              {close.outcome === 'refused' && (
                <Field label={tx('Reason for refusal')}>
                  <SelectField className="w-full" value={close.refusal} options={REFUSAL_REASONS} onChange={(e) => setClose((x) => ({ ...x, refusal: val(e) }))} />
                </Field>
              )}
            </div>
            <Field label={close.outcome === 'refused' ? tx('Why it is refused') : tx('What was done')} required>
              <textarea className="risys-input" rows={3} value={close.summary} onChange={(e) => setClose((x) => ({ ...x, summary: e.target.value }))} />
            </Field>
            {close.outcome !== 'withdrawn' && (
              <Field label={tx('When the requester was told')} required>
                <DateTimeField value={close.at} onChange={(e) => setClose((x) => ({ ...x, at: val(e) }))} aria-label={tx('When the requester was told')} />
              </Field>
            )}
            <div className="flex" style={{ gap: 6 }}>
              <SubmitButton busy={busy === 'c'} onClick={run('c', async () => {
                await req.close(close.outcome, close.summary.trim(), close.outcome === 'refused' ? close.refusal : null,
                  close.outcome === 'withdrawn' ? null : toInstant(close.at))
                setClose(null)
              })}>{tx('Close request')}</SubmitButton>
              <button className="btn-secondary" onClick={() => setClose(null)}>{tx('Cancel')}</button>
            </div>
          </div>
        )}
      </Section>
    </RecordPage>
  )
}
