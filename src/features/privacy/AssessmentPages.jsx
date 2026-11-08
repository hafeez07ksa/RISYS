import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Plus, Pencil, Send, Stamp, Undo2, RefreshCcw, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { FormPage, FormSection, RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useAssessments, useAssessment, useActivities } from '@/hooks/usePrivacy'
import { labelOf } from '@/lib/policies'
import { TRIGGERS, ASSESSMENT_SECTIONS, ASSESSMENT_STATUSES, RATINGS, PDPL, daysUntil } from '@/lib/privacy'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, personName } from '@/features/audits/parts'
import { AssessmentStatusBadge, RatingBadge, LawNote } from './parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* ── Impact assessments (PDPL-IR Art. 25) ─────────────────────────────────────
 *
 * Draft → submit (all eight Art. 25(2) contents and both ratings) → approve or
 * return, by a compliance writer who neither wrote nor submitted it.
 *
 * Approving with a high or critical residual risk means the processing may
 * harm data subjects: the approver records what the approval depends on, a
 * draft risk goes into the register, and the assessment must be repeated
 * within six months (otherwise twelve). Reassessing starts a new version; the
 * approved one stays on record and is superseded when the new one is approved.
 * -------------------------------------------------------------------------- */

export function PiaListPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useAssessments()
  const [status, setStatus] = useState('current')

  // Show the latest version of each assessment by default.
  const latest = useMemo(() => {
    const by = new Map()
    for (const a of items) if (!by.has(a.ref) || by.get(a.ref).version_no < a.version_no) by.set(a.ref, a)
    return [...by.values()]
  }, [items])
  const stats = useMemo(() => ({
    approved: latest.filter((a) => a.status === 'approved').length,
    review: latest.filter((a) => a.status === 'in_review').length,
    drafts: latest.filter((a) => ['draft', 'returned'].includes(a.status)).length,
    high: latest.filter((a) => a.status === 'approved' && ['high', 'critical'].includes(a.residual_rating)).length,
    due: latest.filter((a) => a.status === 'approved' && daysUntil(a.reassess_by) < 0).length,
  }), [latest])
  const list = (status === 'current' ? latest : items).filter((a) => ['current', 'all'].includes(status) || a.status === status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Impact assessments')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <button className="btn-primary" onClick={() => navigate('/app/privacy/assessments/new')}><Plus size={14} /> {tx('New assessment')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <LawNote>{tx('A written impact assessment is required for sensitive data, linking data sets from different sources, continuous large-scale processing of people lacking legal capacity or continuous monitoring, and new technology. If it shows the processing will harm data subjects, the causes must be addressed and the assessment repeated.')} ({PDPL.assessment})</LawNote>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Approved'), value: stats.approved, tone: 'low' },
            { label: tx('Awaiting approval'), value: stats.review, tone: 'medium' },
            { label: tx('Drafts'), value: stats.drafts },
            { label: tx('High residual risk'), value: stats.high, tone: 'critical' },
            { label: tx('Reassessment overdue'), value: stats.due, tone: 'critical' },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Assessments')}</h3>
            <div style={{ width: 210 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(val(e))}
                options={[{ value: 'current', label: tx('Latest version of each') }, { value: 'all', label: tx('Every version') }, ...ASSESSMENT_STATUSES]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No impact assessments yet')}>
              {items.length ? null : tx('Start one from a processing record that meets an Art. 25 trigger, or here.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={120}>{tx('Ref')}</Th><Th>{tx('Assessment')}</Th><Th>{tx('Assessor')}</Th><Th>{tx('Residual risk')}</Th><Th>{tx('Status')}</Th><Th>{tx('Reassess by')}</Th></tr></thead>
                <tbody>{list.map((a) => (
                  <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/assessments/${a.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.ref} v{a.version_no}</Td>
                    <Td><span style={{ color: 'var(--text)', fontWeight: 500 }}>{a.title}</span>
                      {a.activity && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{a.activity.ref} {a.activity.name}</div>}</Td>
                    <Td>{personName(members, a.assessor_id)}</Td>
                    <Td><RatingBadge v={a.residual_rating} /></Td>
                    <Td><AssessmentStatusBadge v={a.status} /></Td>
                    <Td>{a.reassess_by ? <span style={{ color: daysUntil(a.reassess_by) < 0 && a.status === 'approved' ? 'var(--critical)' : 'var(--text-2)' }}>{fmtDate(a.reassess_by)}</span> : '—'}</Td>
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

/* ── Create / edit a draft ────────────────────────────────────────────────── */

const EMPTY = {
  title: '', activity_id: null, sensitive_data: false, links_sources: false, large_scale_monitoring: false, new_technology: false,
  ...Object.fromEntries(ASSESSMENT_SECTIONS.map((s) => [s.key, ''])),
  processors_informed: false, inherent_rating: null, residual_rating: null,
}

export function PiaFormPage() {
  const { id } = useParams()
  const editing = !!id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { create } = useAssessments()
  const existing = useAssessment(id)
  const acts = useActivities()
  const [f, setF] = useState({ ...EMPTY, activity_id: params.get('activity') || null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))
  const check = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.checked }))

  // A new assessment started from a processing record takes its name and triggers.
  useEffect(() => {
    if (editing || !f.activity_id || f.title) return
    const a = acts.items.find((x) => x.id === f.activity_id)
    if (a) setF((x) => ({ ...x, title: `${a.name} — ${tx('impact assessment')}`, ...Object.fromEntries(TRIGGERS.map((t) => [t.key, a[t.key]])) }))
  }, [editing, f.activity_id, acts.items])
  useEffect(() => {
    const a = existing.item
    if (!editing || !a) return
    setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, a[k] ?? EMPTY[k]])))
  }, [editing, existing.item])

  const back = () => navigate(editing ? `/app/privacy/assessments/${id}` : '/app/privacy/assessments')
  const save = async () => {
    if (f.title.trim().length < 3) { setError(tx('Give the assessment a title.')); return }
    setBusy(true); setError('')
    const values = { ...f, title: f.title.trim(), activity_id: f.activity_id || null,
      ...Object.fromEntries(ASSESSMENT_SECTIONS.map((s) => [s.key, f[s.key]?.trim() || null])) }
    try {
      if (editing) { await existing.update(values); navigate(`/app/privacy/assessments/${id}`, { replace: true }) }
      else { const newId = await create(values); navigate(`/app/privacy/assessments/${newId}`, { replace: true }) }
    } catch (e) { setError(e.message); setBusy(false) }
  }

  if (editing && existing.loading) return <PageLoading />
  const a = existing.item
  const canEdit = editing ? a && ['draft', 'returned'].includes(a.status) && (a.assessor_id === user?.id || perms.isComplianceWriter) : !perms.isReadOnly
  if (!canEdit) return <PageNotFound title={tx('Not editable')} back={{ label: tx('Impact assessments'), onClick: back }}>{tx('Only a draft or returned assessment can be edited, by its assessor or a compliance writer.')}</PageNotFound>

  return (
    <FormPage
      title={editing ? `${tx('Edit')} ${a.ref} v${a.version_no}` : tx('New impact assessment')}
      description={tx('Save as you go. Submitting needs every section below and both risk ratings.')}
      back={{ label: editing ? `${a.ref} v${a.version_no}` : tx('Impact assessments'), onClick: back }}
      onSubmit={save} error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Save draft')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('What is assessed')} description={tx('The processing, and why an assessment is needed.')}
        tips={[tx('Link the processing record so the record shows the assessment and its outcome.')]}>
        <Field label={tx('Title')} required><input className="risys-input" value={f.title} onChange={set('title')} /></Field>
        <Field label={tx('Processing record')}>
          <Combobox value={f.activity_id} clearable placeholder={tx('Optional')}
            options={acts.items.map((x) => ({ value: x.id, label: `${x.ref} ${x.name}` }))}
            onChange={(v) => setF((x) => ({ ...x, activity_id: v || null }))} />
        </Field>
        {TRIGGERS.map((t) => (
          <label key={t.key} className="flex" style={{ gap: 8, fontSize: 'var(--t-sm)', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={!!f[t.key]} onChange={check(t.key)} style={{ marginTop: 3 }} />
            <span><strong>{t.label}</strong><span style={{ display: 'block', color: 'var(--text-3)' }}>{t.help}</span></span>
          </label>
        ))}
      </FormSection>

      <FormSection title={tx('Contents')} description={tx('The minimum contents of PDPL-IR Art. 25(2), at least a few sentences each.')}
        tips={[
          tx('Write for an auditor who does not know the system: what happens to the data, step by step.'),
          tx('The impact covers material harm (money, discrimination) and moral harm (distress, reputation).'),
          tx('Measures should answer the impacts one by one; say which are in place and which are planned.'),
        ]}>
        {ASSESSMENT_SECTIONS.map((s) => (
          <Field key={s.key} label={s.label} help={s.help}>
            <textarea className="risys-input" rows={3} value={f[s.key] || ''} onChange={set(s.key)} />
          </Field>
        ))}
        <label className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
          <input type="checkbox" checked={!!f.processors_informed} onChange={check('processors_informed')} /> {tx('A copy has been given to every processor acting for us (Art. 25(3))')}
        </label>
      </FormSection>

      <FormSection title={tx('Risk')} description={tx('The risk to data subjects before and after the measures.')}
        note={['high', 'critical'].includes(f.residual_rating) ? tx('A high or critical residual risk means the processing may harm data subjects: approval adds a draft risk to the register and the assessment must be repeated within six months.') : null}>
        <div className="fp-grid-2">
          <Field label={tx('Before the measures')}><SelectField className="w-full" value={f.inherent_rating || ''} placeholder={tx('Choose')} options={RATINGS} onChange={set('inherent_rating')} /></Field>
          <Field label={tx('After the measures')}><SelectField className="w-full" value={f.residual_rating || ''} placeholder={tx('Choose')} options={RATINGS} onChange={set('residual_rating')} /></Field>
        </div>
      </FormSection>
    </FormPage>
  )
}

/* ── One assessment ───────────────────────────────────────────────────────── */

export function PiaDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const pia = useAssessment(id)
  const a = pia.item
  const [note, setNote] = useState('')
  const [ret, setRet] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const back = { label: tx('Impact assessments'), onClick: () => navigate('/app/privacy/assessments') }
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  if (pia.loading) return <PageLoading />
  if (!a) return <PageNotFound title={tx('Assessment not found')} back={back} />

  const editable = ['draft', 'returned'].includes(a.status) && (a.assessor_id === user?.id || perms.isComplianceWriter)
  const canDecide = a.status === 'in_review' && perms.isComplianceWriter && user?.id !== a.assessor_id && user?.id !== a.submitted_by
  const harm = ['high', 'critical'].includes(a.residual_rating)
  const isLatest = !pia.versions.length || pia.versions[0].id === a.id

  return (
    <RecordPage
      title={`${a.ref} v${a.version_no} — ${a.title}`}
      meta={<><AssessmentStatusBadge v={a.status} /><RatingBadge v={a.residual_rating} /></>}
      back={back}
      actions={<>
        {editable && <button className="btn-secondary" onClick={() => navigate(`/app/privacy/assessments/${id}/edit`)}><Pencil size={13} /> {tx('Edit')}</button>}
        {editable && <SubmitButton busy={busy === 's'} onClick={run('s', () => pia.submit())}><Send size={13} /> {tx('Submit for approval')}</SubmitButton>}
        {a.status === 'approved' && isLatest && (perms.isComplianceWriter || a.assessor_id === user?.id) && (
          <button className="btn-secondary" disabled={!!busy} onClick={run('r', async () => { const nid = await pia.reassess(); navigate(`/app/privacy/assessments/${nid}/edit`) })}>
            <RefreshCcw size={13} /> {tx('Reassess')}</button>
        )}
      </>}
      aside={
        <Section title={tx('Approval')}>
          <Facts rows={[
            [tx('Assessor'), personName(members, a.assessor_id)],
            [tx('Submitted'), a.submitted_at ? `${personName(members, a.submitted_by)} · ${fmtDateTime(a.submitted_at)}` : null],
            [tx('Returned'), a.returned_at ? `${personName(members, a.returned_by)} — ${a.return_reason}` : null],
            [tx('Approved'), a.approved_at ? `${personName(members, a.approved_by)} · ${fmtDateTime(a.approved_at)}` : null],
            [tx('Depends on'), a.approval_note],
            [tx('Reassess by'), a.reassess_by ? fmtDate(a.reassess_by) : null],
            [tx('Risk raised'), a.risk_id ? <Link key="r" to={`/app/risks/${a.risk_id}`}>{tx('Open the risk')}</Link> : null],
          ]} />
          {pia.versions.length > 1 && (
            <div style={{ marginTop: 12, fontSize: 'var(--t-sm)' }}>
              <p style={{ margin: '0 0 4px', color: 'var(--text-3)' }}>{tx('Versions')}</p>
              {pia.versions.map((v) => (
                <div key={v.id}><Link to={`/app/privacy/assessments/${v.id}`} style={{ fontWeight: v.id === a.id ? 600 : 400 }}>v{v.version_no}</Link> · {labelOf(ASSESSMENT_STATUSES, v.status)}</div>
              ))}
            </div>
          )}
        </Section>
      }
    >
      <ErrorText>{error}</ErrorText>
      {a.status === 'returned' && a.return_reason && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)', margin: '0 0 12px' }}>{tx('Returned')}: {a.return_reason}</p>
      )}

      <Section title={tx('Screening')}>
        <Facts rows={[
          [tx('Processing record'), a.activity ? <Link key="p" to={`/app/privacy/processing/${a.activity.id}`}>{a.activity.ref} {a.activity.name}</Link> : null],
          [tx('Triggers'), TRIGGERS.filter((t) => a[t.key]).map((t) => t.label).join(', ') || tx('None ticked')],
          [tx('Copy given to processors'), a.processors_informed ? tx('Yes') : tx('No')],
          [tx('Risk before measures'), <RatingBadge key="i" v={a.inherent_rating} />],
          [tx('Risk after measures'), <RatingBadge key="r" v={a.residual_rating} />],
        ]} />
      </Section>

      <Section title={tx('Contents (Art. 25(2))')}>
        <Facts rows={ASSESSMENT_SECTIONS.map((s) => [s.label, a[s.key]])} />
      </Section>

      {canDecide && (
        <Section title={tx('Decide')}>
          {harm && <p style={{ margin: '0 0 10px', fontSize: 'var(--t-sm)', color: 'var(--critical)' }}>{tx('The residual risk is high or critical. Approving adds a draft risk to the register and sets a reassessment within six months.')}</p>}
          {ret === null ? (
            <>
              <Field label={tx('What the approval depends on')} required={harm} help={harm ? tx('At least 20 characters: conditions, deadlines, the measures that must be in place.') : tx('Optional')}>
                <textarea className="risys-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex" style={{ gap: 6, marginTop: 10 }}>
                <SubmitButton busy={busy === 'a'} onClick={run('a', () => pia.approve(note.trim()))}><Stamp size={13} /> {tx('Approve')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setRet('')}><Undo2 size={13} /> {tx('Return')}</button>
              </div>
            </>
          ) : (
            <>
              <Field label={tx('What needs to change')} required><textarea className="risys-input" rows={2} value={ret} onChange={(e) => setRet(e.target.value)} /></Field>
              <div className="flex" style={{ gap: 6, marginTop: 10 }}>
                <SubmitButton busy={busy === 'x'} onClick={run('x', async () => { await pia.returnIt(ret.trim()); setRet(null) })}>{tx('Return to assessor')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setRet(null)}>{tx('Cancel')}</button>
              </div>
            </>
          )}
        </Section>
      )}
      {a.status === 'in_review' && !canDecide && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
          {user?.id === a.assessor_id || user?.id === a.submitted_by ? tx('Waiting for approval by another compliance writer. You cannot approve an assessment you wrote or submitted.') : tx('Waiting for approval by a compliance writer.')}</p>
      )}

      {a.status === 'draft' && a.version_no === 1 && (a.assessor_id === user?.id || perms.isAdmin) && (
        <Section title={tx('Delete')}>
          <InlineConfirm message={tx('Delete this draft assessment?')} variant="panel" confirmLabel={tx('Delete')} triggerClassName="btn-secondary"
            onConfirm={async () => { try { await pia.remove(); navigate('/app/privacy/assessments') } catch (e) { setError(e.message) } }}>
            <Trash2 size={13} /> {tx('Delete draft')}
          </InlineConfirm>
        </Section>
      )}
    </RecordPage>
  )
}
