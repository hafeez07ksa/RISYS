import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Siren, Upload, Send, CheckCircle2, Save } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { FormPage, FormSection, RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useBreaches, useBreach } from '@/hooks/usePrivacy'
import { uploadLibraryFile, labelOf, CRITICALITY } from '@/lib/policies'
import { PDPL, NOTIFIABLE, breachHoursLeft, nowLocal, toInstant, isoToLocal, toList, fromList } from '@/lib/privacy'
import { fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, personName } from '@/features/audits/parts'
import { FileChip } from '@/features/policies/parts'
import { BreachClock, BreachStatusBadge, NotifiableBadge, LawNote } from './parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* ── Personal-data breaches (PDPL-IR Art. 24) ─────────────────────────────────
 *
 * A breach is an incident (so it keeps the incident SLA, comments and the
 * ECC 2-13 trail) plus this record, which carries the PDPL obligations:
 *
 *   aware_at → 72 hours to notify SDAIA (the clock is set by the database)
 *   assess whether it can harm personal data or rights (notifiable or not)
 *   record the notification with a copy or SDAIA's reference; a late one
 *     needs the justification for the delay
 *   notify affected data subjects, or record why not
 *   document the corrective measures, then close
 *
 * Reminders go out every 15 minutes from privacy_tick(): at 24, 48 and 66
 * hours and when the 72 hours pass.
 * -------------------------------------------------------------------------- */

export function BreachListPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { items, loading } = useBreaches()
  const [status, setStatus] = useState('open')

  const stats = useMemo(() => {
    const open = items.filter((b) => b.status === 'open')
    const notified = items.filter((b) => b.sdaia_notified_at)
    return {
      open: open.length,
      waiting: open.filter((b) => breachHoursLeft(b) !== null).length,
      late: open.filter((b) => (breachHoursLeft(b) ?? 0) < 0).length,
      onTime: notified.length ? `${Math.round((100 * notified.filter((b) => new Date(b.sdaia_notified_at) <= new Date(b.sdaia_due_at)).length) / notified.length)}%` : '—',
    }
  }, [items])
  const list = items.filter((b) => status === 'all' || b.status === status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Personal-data breaches')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <button className="btn-primary" onClick={() => navigate('/app/privacy/breaches/new')}><Siren size={14} /> {tx('Report a breach')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <LawNote>{tx('Notify SDAIA within 72 hours of becoming aware of an incident that may harm personal data or data subject rights, keep a copy of what was sent, document the corrective measures, and tell affected data subjects without undue delay.')} ({PDPL.breach})</LawNote>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Open'), value: stats.open },
            { label: tx('Awaiting SDAIA notification'), value: stats.waiting, tone: 'critical' },
            { label: tx('Past 72 hours'), value: stats.late, tone: 'critical' },
            { label: tx('Notified on time'), value: stats.onTime },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Register')}</h3>
            <div style={{ width: 180 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(val(e))}
                options={[{ value: 'open', label: tx('Open') }, { value: 'closed', label: tx('Closed') }, { value: 'all', label: tx('Everything') }]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No breaches recorded')}>
              {items.length ? null : tx('Report a breach as soon as someone becomes aware of it: the 72 hours run from that moment, not from when it is confirmed.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Breach')}</Th><Th>{tx('Aware at')}</Th><Th>{tx('Assessment')}</Th><Th>{tx('SDAIA')}</Th><Th>{tx('Status')}</Th></tr></thead>
                <tbody>{list.map((b) => (
                  <tr key={b.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/breaches/${b.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{b.ref}</Td>
                    <Td><span style={{ color: 'var(--text)', fontWeight: 500 }}>{b.incident?.title}</span>
                      {b.subjects_affected != null && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{tx('{{n}} data subjects', { n: b.subjects_affected })}{b.subjects_estimated ? ` (${tx('estimate')})` : ''}</div>}</Td>
                    <Td>{fmtDateTime(b.aware_at)}</Td>
                    <Td><NotifiableBadge v={b.notifiable} /></Td>
                    <Td><BreachClock b={b} /></Td>
                    <Td><BreachStatusBadge v={b.status} /></Td>
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

/* ── Report ───────────────────────────────────────────────────────────────── */

export function BreachFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { report } = useBreaches()
  const [incidents, setIncidents] = useState([])
  const [f, setF] = useState({ incidentId: params.get('incident') || null, title: '', awareAt: nowLocal(), description: '', severity: 'high' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('incidents').select('id, title, status, created_at').eq('org_id', organization.id)
      .in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setIncidents(data || []))
  }, [organization?.id])

  const back = () => navigate(params.get('incident') ? `/app/incidents/${params.get('incident')}` : '/app/privacy/breaches')
  const save = async () => {
    if (!f.incidentId && f.title.trim().length < 3) { setError(tx('Give the breach a short title, or choose the incident it belongs to.')); return }
    if (!f.awareAt) { setError(tx('Say when the organisation became aware of it.')); return }
    setBusy(true); setError('')
    try {
      const id = await report({ incidentId: f.incidentId, title: f.title.trim(), awareAt: toInstant(f.awareAt), description: f.description.trim(), severity: f.severity })
      navigate(`/app/privacy/breaches/${id}`, { replace: true })
    } catch (e) { setError(e.message); setBusy(false) }
  }

  if (perms.isReadOnly) return <PageNotFound title={tx('Read-only role')} back={{ label: tx('Breaches'), onClick: back }}>{tx('Viewers and auditors cannot report breaches.')}</PageNotFound>

  return (
    <FormPage
      title={tx('Report a personal-data breach')}
      description={tx('Report it now, with what you know. The 72-hour clock to notify SDAIA starts from the moment of awareness; the details can be completed afterwards.')}
      back={{ label: params.get('incident') ? tx('Incident') : tx('Breaches'), onClick: back }}
      onSubmit={save} error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}><Siren size={13} /> {tx('Report breach')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The incident')} description={tx('A breach is tracked as an incident too. Choose the incident already raised, or one is raised for it.')}
        tips={[tx('If the breach came from a Defender alert or a Jira ticket, choose that incident so the trail stays in one place.')]}>
        <Field label={tx('Existing incident')}>
          <Combobox value={f.incidentId} clearable placeholder={tx('Raise a new incident')}
            options={incidents.map((i) => ({ value: i.id, label: i.title }))}
            onChange={(v) => setF((x) => ({ ...x, incidentId: v || null }))} />
        </Field>
        {!f.incidentId && (
          <div className="fp-grid-2">
            <Field label={tx('Title')} required><input className="risys-input" value={f.title} onChange={set('title')} placeholder={tx('e.g. Payroll file emailed to the wrong recipient')} /></Field>
            <Field label={tx('Severity')}><SelectField className="w-full" value={f.severity} options={CRITICALITY} onChange={set('severity')} /></Field>
          </div>
        )}
      </FormSection>
      <FormSection title={tx('Awareness')} description={tx('When the organisation became aware of the incident.')}
        tips={[
          tx('Awareness is when someone in the organisation had reasonable certainty that personal data was affected, not when the investigation ended.'),
          tx('This time cannot be changed later: it fixes the SDAIA deadline.'),
        ]}>
        <Field label={tx('Aware at')} required><DateTimeField value={f.awareAt} onChange={set('awareAt')} aria-label={tx('Aware at')} /></Field>
        <Field label={tx('What happened')}><textarea className="risys-input" rows={4} value={f.description} onChange={set('description')} /></Field>
      </FormSection>
    </FormPage>
  )
}

/* ── One breach ───────────────────────────────────────────────────────────── */

export function BreachDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const br = useBreach(id)
  const b = br.item
  const [facts, setFacts] = useState(null)
  const [assess, setAssess] = useState(null)
  const [sdaia, setSdaia] = useState(null)
  const [subj, setSubj] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const back = { label: tx('Breaches'), onClick: () => navigate('/app/privacy/breaches') }
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  useEffect(() => {
    if (!b) return
    setFacts({
      occurred_at: isoToLocal(b.occurred_at), description: b.description || '', data_categories: fromList(b.data_categories),
      subjects_affected: b.subjects_affected ?? '', subjects_estimated: b.subjects_estimated, risks: b.risks || '', measures: b.measures || '',
      corrective_actions: b.corrective_actions || '',
    })
  }, [b?.id, b?.updated_at])

  if (br.loading) return <PageLoading />
  if (!b) return <PageNotFound title={tx('Breach not found')} back={back}>{tx('It belongs to another organisation, or your role cannot see it.')}</PageNotFound>

  const open = b.status === 'open'
  const writer = perms.isComplianceWriter
  const late = b.sdaia_notified_at ? new Date(b.sdaia_notified_at) > new Date(b.sdaia_due_at) : Date.now() > new Date(b.sdaia_due_at).getTime()

  const saveFacts = run('f', () => br.update({
    occurred_at: facts.occurred_at ? toInstant(facts.occurred_at) : null, description: facts.description.trim() || null,
    data_categories: toList(facts.data_categories), subjects_affected: facts.subjects_affected === '' ? null : Number(facts.subjects_affected),
    subjects_estimated: facts.subjects_estimated, risks: facts.risks.trim() || null, measures: facts.measures.trim() || null,
    corrective_actions: facts.corrective_actions.trim() || null,
  }))

  return (
    <RecordPage
      title={`${b.ref} — ${b.incident?.title || tx('Personal-data breach')}`}
      meta={<><BreachStatusBadge v={b.status} /><NotifiableBadge v={b.notifiable} /></>}
      back={back}
      actions={b.incident && <Link className="btn-secondary" to={`/app/incidents/${b.incident.id}`}>{tx('Open the incident')}</Link>}
      aside={
        <Section title={tx('72-hour clock')}>
          <Facts rows={[
            [tx('Aware at'), fmtDateTime(b.aware_at)],
            [tx('SDAIA deadline'), fmtDateTime(b.sdaia_due_at)],
            [tx('Now'), <BreachClock key="c" b={b} />],
            [tx('Reported by'), personName(members, b.created_by)],
          ]} />
        </Section>
      }
    >
      <ErrorText>{error}</ErrorText>

      {/* What Art. 24(1) asks the notification to contain. */}
      <Section title={tx('What is known')} actions={writer && open && <SubmitButton busy={busy === 'f'} onClick={saveFacts}><Save size={13} /> {tx('Save')}</SubmitButton>}>
        {!facts ? null : writer && open ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fp-grid-3">
              <Field label={tx('Occurred at')}><DateTimeField value={facts.occurred_at} onChange={(e) => setFacts((x) => ({ ...x, occurred_at: val(e) }))} placeholder={tx('If known')} aria-label={tx('Occurred at')} /></Field>
              <Field label={tx('Data subjects affected')}><input className="risys-input" type="number" min="0" value={facts.subjects_affected} onChange={(e) => setFacts((x) => ({ ...x, subjects_affected: e.target.value }))} /></Field>
              <label className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)', paddingTop: 22 }}>
                <input type="checkbox" checked={facts.subjects_estimated} onChange={(e) => setFacts((x) => ({ ...x, subjects_estimated: e.target.checked }))} /> {tx('Estimate')}
              </label>
            </div>
            <Field label={tx('Description: time, date and circumstances')}><textarea className="risys-input" rows={3} value={facts.description} onChange={(e) => setFacts((x) => ({ ...x, description: e.target.value }))} /></Field>
            <Field label={tx('Categories of personal data')} help={tx('Separate with commas, e.g. names, national ID numbers, salaries.')}><input className="risys-input" value={facts.data_categories} onChange={(e) => setFacts((x) => ({ ...x, data_categories: e.target.value }))} /></Field>
            <Field label={tx('Risks to data subjects')}><textarea className="risys-input" rows={2} value={facts.risks} onChange={(e) => setFacts((x) => ({ ...x, risks: e.target.value }))} /></Field>
            <Field label={tx('Measures taken or proposed')}><textarea className="risys-input" rows={2} value={facts.measures} onChange={(e) => setFacts((x) => ({ ...x, measures: e.target.value }))} /></Field>
            <Field label={tx('Corrective measures (needed to close)')}><textarea className="risys-input" rows={2} value={facts.corrective_actions} onChange={(e) => setFacts((x) => ({ ...x, corrective_actions: e.target.value }))} /></Field>
          </div>
        ) : (
          <Facts rows={[
            [tx('Occurred at'), b.occurred_at ? fmtDateTime(b.occurred_at) : null],
            [tx('Description'), b.description],
            [tx('Categories of personal data'), fromList(b.data_categories)],
            [tx('Data subjects affected'), b.subjects_affected != null ? `${b.subjects_affected}${b.subjects_estimated ? ` (${tx('estimate')})` : ''}` : null],
            [tx('Risks'), b.risks], [tx('Measures'), b.measures], [tx('Corrective measures'), b.corrective_actions],
          ]} />
        )}
      </Section>

      <Section title={tx('1. Is it notifiable?')}>
        {b.notifiable !== 'pending' && (
          <Facts rows={[
            [tx('Decision'), labelOf(NOTIFIABLE, b.notifiable)],
            [tx('Why not'), b.not_notifiable_reason],
            [tx('Decided by'), b.assessed_by ? `${personName(members, b.assessed_by)} · ${fmtDateTime(b.assessed_at)}` : null],
          ]} />
        )}
        {writer && open && !b.sdaia_notified_at && (assess === null ? (
          <div className="flex" style={{ gap: 6, marginTop: b.notifiable !== 'pending' ? 12 : 0 }}>
            <button className="btn-secondary" disabled={!!busy} onClick={run('n', () => br.assess(true))}>{tx('Notifiable: may harm personal data or rights')}</button>
            <button className="btn-secondary" onClick={() => setAssess('')}>{tx('Not notifiable')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Field label={tx('Why it cannot harm personal data or data subject rights')} required help={tx('For example: the laptop was encrypted with a key that was not lost. This reasoning is what an auditor or SDAIA will read.')}>
              <textarea className="risys-input" rows={3} value={assess} onChange={(e) => setAssess(e.target.value)} />
            </Field>
            <div className="flex" style={{ gap: 6 }}>
              <SubmitButton busy={busy === 'nn'} onClick={run('nn', async () => { await br.assess(false, assess.trim()); setAssess(null) })}>{tx('Record decision')}</SubmitButton>
              <button className="btn-secondary" onClick={() => setAssess(null)}>{tx('Cancel')}</button>
            </div>
          </div>
        ))}
        {b.notifiable === 'pending' && !writer && <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('A compliance writer decides whether SDAIA must be notified.')}</p>}
      </Section>

      {b.notifiable !== 'not_notifiable' && (
        <Section title={tx('2. Notify SDAIA')}>
          {b.sdaia_notified_at ? (
            <Facts rows={[
              [tx('Notified'), `${fmtDateTime(b.sdaia_notified_at)}${late ? ` · ${tx('after the 72 hours')}` : ''}`],
              [tx('Reference'), b.sdaia_reference],
              [tx('Copy kept'), b.sdaia_report ? <FileChip key="f" file={b.sdaia_report} onError={setError} /> : null],
              [tx('Reason for delay'), b.sdaia_late_reason],
              [tx('Recorded by'), personName(members, b.sdaia_notified_by)],
            ]} />
          ) : !writer || !open ? (
            <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('Not yet notified.')}</p>
          ) : sdaia === null ? (
            <button className="btn-primary" onClick={() => setSdaia({ at: nowLocal(), reference: '', report: null, late: '' })}><Send size={13} /> {tx('Record the notification to SDAIA')}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fp-grid-2">
                <Field label={tx('Notified at')} required><DateTimeField value={sdaia.at} onChange={(e) => setSdaia((x) => ({ ...x, at: val(e) }))} aria-label={tx('Notified at')} /></Field>
                <Field label={tx('SDAIA reference')}><input className="risys-input" value={sdaia.reference} onChange={(e) => setSdaia((x) => ({ ...x, reference: e.target.value }))} /></Field>
              </div>
              <Field label={tx('Copy of the report sent')} help={tx('Keep what was sent (Art. 24(3)). Either the file or SDAIA\'s reference is required.')}>
                {sdaia.report ? <FileChip file={sdaia.report} onError={setError} /> : (
                  <label className="btn-secondary" style={{ width: 'fit-content', cursor: 'pointer' }}>
                    <Upload size={13} /> {busy === 'up' ? tx('Uploading…') : tx('Attach file')}
                    <input type="file" hidden onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return
                      setBusy('up'); setError('')
                      try { const meta = await uploadLibraryFile(organization.id, 'evidence', file); setSdaia((x) => ({ ...x, report: meta })) }
                      catch (err) { setError(err.message) } finally { setBusy('') }
                    }} />
                  </label>
                )}
              </Field>
              {sdaia.at && new Date(sdaia.at) > new Date(b.sdaia_due_at) && (
                <Field label={tx('Justification for the delay')} required help={tx('The notification is after the 72 hours (Art. 24(2)).')}>
                  <textarea className="risys-input" rows={2} value={sdaia.late} onChange={(e) => setSdaia((x) => ({ ...x, late: e.target.value }))} />
                </Field>
              )}
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy === 's'} onClick={run('s', async () => {
                  await br.notifySdaia({ notifiedAt: toInstant(sdaia.at), reference: sdaia.reference.trim(), report: sdaia.report, lateReason: sdaia.late.trim() })
                  setSdaia(null)
                })}>{tx('Record notification')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setSdaia(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
        </Section>
      )}

      {b.notifiable !== 'not_notifiable' && (
        <Section title={tx('3. Tell the data subjects')}>
          {b.subjects_notified_at || b.subjects_not_required ? (
            <Facts rows={[
              [tx('Told'), b.subjects_notified_at ? fmtDateTime(b.subjects_notified_at) : tx('Not needed')],
              [tx('Notice sent'), b.subjects_notice],
              [tx('Why not needed'), b.subjects_not_required],
            ]} />
          ) : !writer || !open ? (
            <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('Not yet recorded.')}</p>
          ) : subj === null ? (
            <div className="flex" style={{ gap: 6 }}>
              <button className="btn-secondary" onClick={() => setSubj({ mode: 'told', at: nowLocal(), text: '' })}>{tx('Record the notice sent')}</button>
              <button className="btn-secondary" onClick={() => setSubj({ mode: 'not', at: null, text: '' })}>{tx('Not needed')}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subj.mode === 'told' && <Field label={tx('Told at')} required><DateTimeField value={subj.at} onChange={(e) => setSubj((x) => ({ ...x, at: val(e) }))} aria-label={tx('Told at')} /></Field>}
              <Field label={subj.mode === 'told' ? tx('The notice, as sent') : tx('Why data subjects need not be told')} required
                help={subj.mode === 'told' ? tx('In simple language: what happened, the risks, the measures taken, your contact details and what they can do (Art. 24(5)).') : null}>
                <textarea className="risys-input" rows={4} value={subj.text} onChange={(e) => setSubj((x) => ({ ...x, text: e.target.value }))} />
              </Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy === 'd'} onClick={run('d', async () => {
                  await br.noticeSubjects(subj.mode === 'told' ? { notifiedAt: toInstant(subj.at), notice: subj.text.trim() } : { notRequired: subj.text.trim() })
                  setSubj(null)
                })}>{tx('Record')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setSubj(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
        </Section>
      )}

      <Section title={tx('4. Close')}>
        {!open ? (
          <Facts rows={[[tx('Closed'), `${personName(members, b.closed_by)} · ${fmtDateTime(b.closed_at)}`]]} />
        ) : writer ? (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Closing needs the notifiable decision, the SDAIA notification and the notice to data subjects where they apply, and the corrective measures documented above.')}</p>
            <SubmitButton busy={busy === 'x'} onClick={run('x', () => br.close())}><CheckCircle2 size={13} /> {tx('Close breach')}</SubmitButton>
          </>
        ) : <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('A compliance writer closes the breach.')}</p>}
      </Section>

      <Section title={tx('Notification checklist')} pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {[
            [tx('Description of the breach: time, date, circumstances'), !!b.description],
            [tx('Categories of data and number of data subjects'), b.data_categories?.length > 0 && b.subjects_affected != null],
            [tx('Risks and the measures taken or proposed'), !!b.risks && !!b.measures],
            [tx('Whether the data subjects were told'), !!(b.subjects_notified_at || b.subjects_not_required)],
            [tx('Copy of the notification kept'), !!(b.sdaia_report || b.sdaia_reference)],
          ].map(([label, ok]) => (
            <tr key={label}><Td>{label}</Td><Td align="right"><span style={{ color: ok ? 'var(--low)' : 'var(--text-3)' }}>{ok ? tx('Recorded') : tx('Missing')}</span></Td></tr>
          ))}
        </tbody></table>
      </Section>
    </RecordPage>
  )
}
