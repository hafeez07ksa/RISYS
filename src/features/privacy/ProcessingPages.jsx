import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Pencil, Scale, CircleStop, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { FormPage, FormSection, RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useActivities, useActivity, usePrivacySettings } from '@/hooks/usePrivacy'
import { labelOf } from '@/lib/policies'
import { LAWFUL_BASES, TRIGGERS, PDPL, REQUEST_TYPES, ropaGaps, toList, fromList, todayRiyadh } from '@/lib/privacy'
import { fmtDate } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, personName, assignable } from '@/features/audits/parts'
import { AssessmentStatusBadge, RatingBadge, RequestStatusBadge, LawNote } from './parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* ── Record of processing activities (PDPL-IR Art. 33) ────────────────────────
 *
 * One record per processing activity, with the Art. 33(5) contents. The
 * controller and DPO come from Privacy settings. A record is never deleted
 * while it is in force or within five years of the processing ending: end it
 * instead, and the database keeps it until the retention date.
 *
 * The four Art. 25(1) triggers are asked here; any one of them makes an impact
 * assessment mandatory, and the record shows whether an approved one exists.
 * -------------------------------------------------------------------------- */

export function ProcessingListPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useActivities()
  const { settings } = usePrivacySettings()
  const [assessed, setAssessed] = useState(new Set())
  const [status, setStatus] = useState('active')

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('privacy_assessments').select('activity_id').eq('org_id', organization.id).eq('status', 'approved')
      .then(({ data }) => setAssessed(new Set((data || []).map((x) => x.activity_id))))
  }, [organization?.id])

  const live = items.filter((a) => a.status === 'active')
  const stats = useMemo(() => ({
    live: live.length,
    gaps: live.filter((a) => ropaGaps(a, settings).length).length,
    transfers: live.filter((a) => a.transfers_outside_ksa).length,
    need: live.filter((a) => a.assessment_required && !assessed.has(a.id)).length,
  }), [items, settings, assessed])
  const list = items.filter((a) => status === 'all' || a.status === status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Record of processing')} subtitle={organization?.name}
        actions={perms.isComplianceWriter && <button className="btn-primary" onClick={() => navigate('/app/privacy/processing/new')}><Plus size={14} /> {tx('Record processing')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <LawNote>{tx('Each processing activity, with its purpose, the data and people it concerns, recipients, retention, transfers outside the Kingdom and the security measures. Records are kept for the processing period plus five years.')} ({PDPL.ropa})</LawNote>
        {(!settings?.controller_name || !(settings?.dpo_user_id || settings?.dpo_name)) && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--medium)', margin: '0 0 12px' }}>
            {tx('The controller and Data Protection Officer are not set yet.')} {perms.isComplianceWriter && <Link to="/app/privacy/settings">{tx('Set them')}</Link>}
          </p>
        )}
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Active records'), value: stats.live },
            { label: tx('With missing contents'), value: stats.gaps, tone: 'medium' },
            { label: tx('Transfers outside the Kingdom'), value: stats.transfers },
            { label: tx('Impact assessment outstanding'), value: stats.need, tone: 'critical' },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Records')}</h3>
            <div style={{ width: 180 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(val(e))}
                options={[{ value: 'active', label: tx('Active') }, { value: 'ended', label: tx('Ended') }, { value: 'all', label: tx('Everything') }]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No processing recorded yet')}>
              {items.length ? null : tx('Start with the processing every organisation has: payroll, recruitment, customer accounts, CCTV, marketing lists.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Processing')}</Th><Th>{tx('Owner')}</Th><Th>{tx('Contents')}</Th><Th>{tx('Impact assessment')}</Th></tr></thead>
                <tbody>{list.map((a) => {
                  const gaps = ropaGaps(a, settings)
                  return (
                    <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/processing/${a.id}`)}>
                      <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.ref}</Td>
                      <Td><span style={{ color: 'var(--text)', fontWeight: 500 }}>{a.name}</span>
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{a.lawful_basis ? labelOf(LAWFUL_BASES, a.lawful_basis) : tx('No lawful basis')}{a.transfers_outside_ksa ? ` · ${tx('transfers outside KSA')}` : ''}{a.status === 'ended' ? ` · ${tx('ended')} ${fmtDate(a.ended_on)}` : ''}</div></Td>
                      <Td>{personName(members, a.owner_id)}</Td>
                      <Td>{gaps.length ? <span style={{ color: 'var(--medium)' }}>{tx('{{n}} missing', { n: gaps.length })}</span> : <span style={{ color: 'var(--low)' }}>{tx('Complete')}</span>}</Td>
                      <Td>{!a.assessment_required ? <span style={{ color: 'var(--text-3)' }}>{tx('Not required')}</span>
                        : assessed.has(a.id) ? <span style={{ color: 'var(--low)' }}>{tx('Approved')}</span>
                        : <span style={{ color: 'var(--critical)' }}>{tx('Required')}</span>}</Td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ── Create / edit ────────────────────────────────────────────────────────── */

const EMPTY = {
  name: '', description: '', purpose: '', lawful_basis: null, owner_id: null, business_unit_id: null, systems: '',
  data_categories: '', data_subjects: '', recipients: '', retention: '', transfers_outside_ksa: false,
  transfer_countries: '', transfer_safeguard: '', security_measures: '', sensitive_data: false, links_sources: false,
  large_scale_monitoring: false, new_technology: false, next_review_on: '',
}

export function ProcessingFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { create } = useActivities()
  const existing = useActivity(id)
  const [units, setUnits] = useState([])
  const [f, setF] = useState({ ...EMPTY, owner_id: user?.id || null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))
  const check = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.checked }))

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('business_units').select('id, name').eq('org_id', organization.id).order('name').then(({ data }) => setUnits(data || []))
  }, [organization?.id])
  useEffect(() => {
    const a = existing.item
    if (!editing || !a) return
    setF({
      ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, a[k] ?? EMPTY[k]])),
      data_categories: fromList(a.data_categories), data_subjects: fromList(a.data_subjects), recipients: fromList(a.recipients),
      next_review_on: a.next_review_on || '',
    })
  }, [editing, existing.item])

  const back = () => navigate(editing ? `/app/privacy/processing/${id}` : '/app/privacy/processing')
  const save = async () => {
    if (f.name.trim().length < 3) { setError(tx('Name the processing activity.')); return }
    if (!f.owner_id) { setError(tx('Choose the owner.')); return }
    if (f.transfers_outside_ksa && !f.transfer_countries.trim()) { setError(tx('Name the countries data is transferred to.')); return }
    setBusy(true); setError('')
    const t = (s) => (String(s || '').trim() || null)
    const values = {
      name: f.name.trim(), description: t(f.description), purpose: t(f.purpose), lawful_basis: f.lawful_basis || null,
      owner_id: f.owner_id, business_unit_id: f.business_unit_id || null, systems: t(f.systems),
      data_categories: toList(f.data_categories), data_subjects: toList(f.data_subjects), recipients: toList(f.recipients),
      retention: t(f.retention), transfers_outside_ksa: f.transfers_outside_ksa,
      transfer_countries: f.transfers_outside_ksa ? t(f.transfer_countries) : null,
      transfer_safeguard: f.transfers_outside_ksa ? t(f.transfer_safeguard) : null,
      security_measures: t(f.security_measures), sensitive_data: f.sensitive_data, links_sources: f.links_sources,
      large_scale_monitoring: f.large_scale_monitoring, new_technology: f.new_technology, next_review_on: f.next_review_on || null,
    }
    try {
      if (editing) { await existing.update(values); navigate(`/app/privacy/processing/${id}`, { replace: true }) }
      else { const newId = await create(values); navigate(`/app/privacy/processing/${newId}`, { replace: true }) }
    } catch (e) { setError(e.message); setBusy(false) }
  }

  const canWrite = perms.isComplianceWriter || (editing && existing.item?.owner_id === user?.id)
  if (editing && existing.loading) return <PageLoading />
  if (!canWrite) return <PageNotFound title={tx('Not allowed')} back={{ label: tx('Record of processing'), onClick: back }}>{tx('Compliance writers record processing; the owner of a record can update it.')}</PageNotFound>
  const triggered = TRIGGERS.some((t) => f[t.key])

  return (
    <FormPage
      title={editing ? `${tx('Edit')} ${existing.item?.ref}` : tx('Record a processing activity')}
      description={tx('The contents PDPL-IR Art. 33(5) asks for. Fill in what you know; the record shows what is still missing.')}
      back={{ label: editing ? existing.item?.ref : tx('Record of processing'), onClick: back }}
      onSubmit={save} error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Save')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The activity')} description={tx('What is processed, why, on what basis and who is accountable.')}
        tips={[
          tx('One record per purpose: "Payroll" and "Recruitment" are separate even if HR runs both.'),
          tx('The lawful basis is the reason PDPL allows the processing; consent is only one of them.'),
        ]}>
        <Field label={tx('Name')} required><input className="risys-input" value={f.name} onChange={set('name')} placeholder={tx('e.g. Payroll')} /></Field>
        <Field label={tx('Purpose')}><textarea className="risys-input" rows={2} value={f.purpose} onChange={set('purpose')} /></Field>
        <div className="fp-grid-2">
          <Field label={tx('Lawful basis')}><SelectField className="w-full" value={f.lawful_basis || ''} placeholder={tx('Choose')} options={LAWFUL_BASES} onChange={set('lawful_basis')} /></Field>
          <Field label={tx('Systems')}><input className="risys-input" value={f.systems} onChange={set('systems')} placeholder={tx('e.g. SAP HR, SharePoint')} /></Field>
        </div>
        <div className="fp-grid-2">
          <Field label={tx('Owner')} required>
            <Combobox value={f.owner_id} options={assignable(members).map((m) => ({ value: m.user_id, label: m.full_name || m.email }))}
              onChange={(v) => setF((x) => ({ ...x, owner_id: v || null }))} />
          </Field>
          <Field label={tx('Business unit')}>
            <Combobox value={f.business_unit_id} clearable placeholder={tx('Optional')} options={units.map((u) => ({ value: u.id, label: u.name }))}
              onChange={(v) => setF((x) => ({ ...x, business_unit_id: v || null }))} />
          </Field>
        </div>
        <Field label={tx('Description')}><textarea className="risys-input" rows={2} value={f.description} onChange={set('description')} /></Field>
      </FormSection>

      <FormSection title={tx('Data, people and recipients')} description={tx('Separate the entries in each list with commas.')}
        tips={[tx('Categories of data: name, national ID, salary, bank account, health records…'), tx('Data subjects: employees, applicants, customers, visitors…'), tx('Recipients: internal teams, processors, government bodies.')]}>
        <Field label={tx('Categories of personal data')}><input className="risys-input" value={f.data_categories} onChange={set('data_categories')} /></Field>
        <Field label={tx('Categories of data subjects')}><input className="risys-input" value={f.data_subjects} onChange={set('data_subjects')} /></Field>
        <Field label={tx('Recipients')}><input className="risys-input" value={f.recipients} onChange={set('recipients')} /></Field>
        <Field label={tx('Retention period')}><input className="risys-input" value={f.retention} onChange={set('retention')} placeholder={tx('e.g. employment plus 10 years')} /></Field>
      </FormSection>

      <FormSection title={tx('Transfers and security')} description={tx('Transfers outside the Kingdom and the measures protecting the data.')}
        tips={[tx('A cloud service hosted outside Saudi Arabia is a transfer. Name the countries and the safeguard relied on.')]}>
        <label className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
          <input type="checkbox" checked={f.transfers_outside_ksa} onChange={check('transfers_outside_ksa')} /> {tx('Personal data is transferred outside the Kingdom')}
        </label>
        {f.transfers_outside_ksa && (
          <div className="fp-grid-2">
            <Field label={tx('Countries')} required><input className="risys-input" value={f.transfer_countries} onChange={set('transfer_countries')} /></Field>
            <Field label={tx('Safeguard')}><input className="risys-input" value={f.transfer_safeguard} onChange={set('transfer_safeguard')} placeholder={tx('e.g. SDAIA standard contractual clauses')} /></Field>
          </div>
        )}
        <Field label={tx('Security measures')}><textarea className="risys-input" rows={3} value={f.security_measures} onChange={set('security_measures')} placeholder={tx('Organisational, administrative and technical measures')} /></Field>
      </FormSection>

      <FormSection title={tx('Impact assessment screening')} description={tx('PDPL-IR Art. 25(1). Any one of these makes a written impact assessment mandatory.')}
        note={triggered ? tx('An impact assessment is required for this processing.') : null}>
        {TRIGGERS.map((t) => (
          <label key={t.key} className="flex" style={{ gap: 8, fontSize: 'var(--t-sm)', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={f[t.key]} onChange={check(t.key)} style={{ marginTop: 3 }} />
            <span><strong>{t.label}</strong><span style={{ display: 'block', color: 'var(--text-3)' }}>{t.help}</span></span>
          </label>
        ))}
        <Field label={tx('Next review')}><DateField value={f.next_review_on} onChange={set('next_review_on')} /></Field>
      </FormSection>
    </FormPage>
  )
}

/* ── One record ───────────────────────────────────────────────────────────── */

export function ProcessingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const act = useActivity(id)
  const { settings } = usePrivacySettings()
  const a = act.item
  const [ending, setEnding] = useState(null)
  const [error, setError] = useState('')
  const back = { label: tx('Record of processing'), onClick: () => navigate('/app/privacy/processing') }

  if (act.loading) return <PageLoading />
  if (!a) return <PageNotFound title={tx('Processing record not found')} back={back} />

  const canWrite = perms.isComplianceWriter || a.owner_id === user?.id
  const gaps = ropaGaps(a, settings)
  const approved = act.linked.assessments.find((x) => x.status === 'approved')
  const dpo = settings?.dpo_user_id ? personName(members, settings.dpo_user_id) : settings?.dpo_name
  const expired = a.retain_until && a.retain_until <= todayRiyadh()

  return (
    <RecordPage
      title={`${a.ref} — ${a.name}`}
      description={a.purpose}
      back={back}
      actions={canWrite && <>
        <button className="btn-secondary" onClick={() => navigate(`/app/privacy/processing/${id}/edit`)}><Pencil size={13} /> {tx('Edit')}</button>
        {a.assessment_required && !approved && <button className="btn-primary" onClick={() => navigate(`/app/privacy/assessments/new?activity=${id}`)}><Scale size={13} /> {tx('Start impact assessment')}</button>}
      </>}
      aside={
        <Section title={tx('Art. 33 contents')}>
          {gaps.length === 0 ? <p style={{ margin: 0, color: 'var(--low)', fontSize: 'var(--t-sm)' }}>{tx('Every required item is recorded.')}</p> : (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--t-sm)', color: 'var(--medium)' }}>{tx('Still missing:')}</p>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 'var(--t-sm)' }}>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <Facts rows={[
              [tx('Status'), a.status === 'ended' ? `${tx('Ended')} ${fmtDate(a.ended_on)}` : tx('Active')],
              [tx('Kept until'), a.retain_until ? fmtDate(a.retain_until) : tx('Five years after it ends')],
              [tx('Next review'), a.next_review_on ? fmtDate(a.next_review_on) : null],
            ]} />
          </div>
        </Section>
      }
    >
      <ErrorText>{error}</ErrorText>
      <Section title={tx('Record')}>
        <Facts rows={[
          [tx('Controller'), [settings?.controller_name, settings?.controller_contact].filter(Boolean).join(' · ')],
          [tx('Data Protection Officer'), [dpo, settings?.dpo_contact].filter(Boolean).join(' · ')],
          [tx('Owner'), personName(members, a.owner_id)],
          [tx('Business unit'), a.unit?.name],
          [tx('Lawful basis'), a.lawful_basis ? labelOf(LAWFUL_BASES, a.lawful_basis) : null],
          [tx('Systems'), a.systems],
          [tx('Categories of personal data'), fromList(a.data_categories)],
          [tx('Categories of data subjects'), fromList(a.data_subjects)],
          [tx('Recipients'), fromList(a.recipients)],
          [tx('Retention period'), a.retention],
          [tx('Transfers outside the Kingdom'), a.transfers_outside_ksa ? `${a.transfer_countries}${a.transfer_safeguard ? ` · ${a.transfer_safeguard}` : ''}` : tx('None')],
          [tx('Security measures'), a.security_measures],
          [tx('Description'), a.description],
        ]} />
      </Section>

      <Section title={tx('Impact assessment')} pad={false}>
        <div style={{ padding: '12px 16px', fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
          {a.assessment_required
            ? `${tx('Required because of:')} ${TRIGGERS.filter((t) => a[t.key]).map((t) => t.label).join(', ')}.`
            : tx('No Art. 25(1) trigger is ticked, so an assessment is not mandatory.')}
        </div>
        {act.linked.assessments.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>{tx('Assessment')}</Th><Th>{tx('Status')}</Th><Th>{tx('Residual risk')}</Th><Th>{tx('Reassess by')}</Th></tr></thead>
            <tbody>{act.linked.assessments.map((x) => (
              <tr key={x.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/assessments/${x.id}`)}>
                <Td style={{ color: 'var(--text)' }}>{x.ref} v{x.version_no} · {x.title}</Td>
                <Td><AssessmentStatusBadge v={x.status} /></Td>
                <Td><RatingBadge v={x.residual_rating} /></Td>
                <Td>{x.reassess_by ? fmtDate(x.reassess_by) : '—'}</Td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      {act.linked.requests.length > 0 && (
        <Section title={tx('Data subject requests about this processing')} pad={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {act.linked.requests.map((r) => (
              <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/requests/${r.id}`)}>
                <Td style={{ color: 'var(--text)' }}>{r.ref} · {labelOf(REQUEST_TYPES, r.request_type)}</Td>
                <Td align="right"><RequestStatusBadge v={r.status} /></Td>
              </tr>
            ))}
          </tbody></table>
        </Section>
      )}

      {canWrite && (
        <Section title={tx('End or delete')}>
          {a.status === 'active' ? (ending === null ? (
            <button className="btn-secondary" onClick={() => setEnding(todayRiyadh())}><CircleStop size={13} /> {tx('Processing has ended')}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label={tx('Ended on')} help={tx('The record is then kept for five more years (Art. 33(1)).')}><DateField value={ending} onChange={(e) => setEnding(val(e))} /></Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton onClick={async () => { try { await act.update({ status: 'ended', ended_on: ending }); setEnding(null) } catch (e) { setError(e.message) } }}>{tx('Record end')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setEnding(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )) : expired && perms.isAdmin ? (
            <InlineConfirm message={tx('Delete this processing record?')} detail={tx('Its five-year retention has passed.')}
              variant="panel" confirmLabel={tx('Delete')} triggerClassName="btn-secondary"
              onConfirm={async () => { try { await act.remove(); navigate('/app/privacy/processing') } catch (e) { setError(e.message) } }}>
              <Trash2 size={13} /> {tx('Delete record')}
            </InlineConfirm>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Kept until {{d}}; an administrator can delete it after that.', { d: fmtDate(a.retain_until) })}</p>
          )}
        </Section>
      )}
    </RecordPage>
  )
}
