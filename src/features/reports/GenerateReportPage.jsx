import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, ExternalLink, CheckCircle2, Landmark, ShieldCheck, ClipboardCheck } from 'lucide-react'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useAudits } from '@/hooks/useAudits'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { generateReport, recentQuarters } from '@/lib/reports/generate'
import { fmtDate } from '@/lib/reports/models'
import { Field, SubmitButton, StageBadge } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

const ICONS = { board_pack: Landmark, ecc_status: ShieldCheck, audit_report: ClipboardCheck }
const DESCRIPTIONS = {
  board_pack: tx(
    'Summary for the board or its risk committee: matters for attention, risk heat maps before and after controls, tolerance and accepted risks, NCA ECC position, incidents, findings from connected systems and audit.'
  ),
  ecc_status: tx(
    'The organisation’s position against every NCA ECC-2:2024 requirement — recorded status, what connected systems measure, mapped controls, evidence and open issues. For a regulator, an external assessor or management.'
  ),
  audit_report: tx(
    'The report of one audit engagement: opinion, findings with condition, criteria, cause, effect and management response, and the testing behind them.'
  ),
}

/* /app/reports/new[?type=…]  and  /app/audits/:id/report
 *
 * Generate a report from the records as they are now. The PDF is built in the
 * browser, fingerprinted (SHA-256) and filed in the archive before it is shown,
 * so what is downloaded here is exactly what the archive holds. */
export function GenerateReportPage() {
  const { id: fixedEngagement } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const { organization, user } = useAuth()
  const { engagements } = useAudits()
  const quarters = useMemo(() => recentQuarters(6), [])
  const fixedType = fixedEngagement ? 'audit_report' : null
  const [type, setType] = useState(fixedType ?? (REPORT_TYPES[params.get('type')] ? params.get('type') : 'board_pack'))
  const [periodKey, setPeriodKey] = useState(quarters[0].value)
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [engagementId, setEngagementId] = useState(fixedEngagement ?? params.get('engagement') ?? '')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url) }, [result])

  const back = fixedEngagement
    ? { label: tx('Engagement'), onClick: () => navigate(`/app/audits/${fixedEngagement}?tab=reports`) }
    : { label: tx('Reports'), onClick: () => navigate('/app/reports') }

  if (!perms.canGenerateReports) {
    return <PageNotFound title={tx('Reports')} back={back}>{tx('Generating reports needs the risk, compliance, audit or administrator role.')}</PageNotFound>
  }

  const period = periodKey === 'custom'
    ? (custom.start && custom.end ? { start: custom.start, end: custom.end, label: `${fmtDate(custom.start)} – ${fmtDate(custom.end)}` } : null)
    : (() => { const q = quarters.find((x) => x.value === periodKey); return q && { start: q.start, end: q.end, label: q.long } })()
  const engagement = engagements.find((x) => x.id === engagementId)
  const ready = type === 'board_pack' ? !!period && period.end >= period.start
    : type === 'audit_report' ? !!engagementId : true

  const run = async () => {
    if (!ready) { setError(type === 'audit_report' ? tx('Choose an engagement.') : tx('Choose a reporting period that ends after it starts.')); return }
    setError(''); setStage(tx('Starting'))
    try {
      const name = user?.user_metadata?.full_name || user?.email
      const { run: r, blob } = await generateReport({
        type, organization, user: { id: user.id, name },
        period, engagement: engagementId ? { id: engagementId } : null, onStage: setStage,
      })
      setResult({ run: r, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(err.message || tx('The report could not be generated.'))
    } finally { setStage('') }
  }

  if (result) {
    const fileName = `${result.run.title.replace(/[^\p{L}\p{N}\s.-]/gu, '').trim().replace(/\s+/g, '-')}.pdf`
    return (
      <FormPage title={tx('Report ready')} description={tx('Filed in the report archive with its SHA-256 fingerprint.')} back={back}
        footer={<>
          <button className="btn-secondary" onClick={() => setResult(null)}>{tx('Generate another')}</button>
          <a className="btn-secondary" href={result.url} download={fileName}><Download size={14} /> {tx('Download')}</a>
          <a className="btn-primary" href={result.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {tx('Open report')}</a>
        </>}>
        <FormSection title={tx('Filed')} description={tx(
          'The archive keeps this file, the data it was built from and its fingerprint. It cannot be edited or deleted. Use Verify in the archive at any time to prove the file is unchanged.'
        )}>
          <div className="flex" style={{ gap: 12, alignItems: 'flex-start' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.7, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{result.run.title}</div>
              {result.run.period_label && <div>{result.run.period_label}</div>}
              <div>{(result.run.file_size / 1024).toFixed(0)} {tx('KB · Report ID')} {result.run.id.slice(0, 8)}</div>
              <div className="mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', wordBreak: 'break-all' }}>{tx('SHA-256')} {result.run.sha256}</div>
            </div>
          </div>
        </FormSection>
      </FormPage>
    )
  }

  return (
    <FormPage
      title={fixedType ? `${tx('Generate')}: ${REPORT_TYPES[fixedType].label}` : tx('Generate a report')}
      description={tx('Built from the records in RISYS as they are right now, then filed in the archive.')}
      back={back}
      onSubmit={stage ? undefined : run}
      error={error}
      note={stage ? `${stage}…` : undefined}
      footer={<>
        <button className="btn-secondary" onClick={back.onClick} disabled={!!stage}>{tx('Cancel')}</button>
        <SubmitButton busy={!!stage} onClick={run}>{tx('Generate PDF')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Report')} description={tx('Each report is written for a different reader. Pick the one for the audience you are preparing for.')}>
        {fixedType ? (
          <p className="rp-text">{DESCRIPTIONS[fixedType]}</p>
        ) : (
          <div role="radiogroup" aria-label={tx('Report')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(REPORT_TYPES).map(([value, d]) => {
              const Icon = ICONS[value] ?? Landmark
              const on = type === value
              return (
                <label key={value} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', cursor: 'pointer',
                  borderRadius: 'var(--r-md)', border: `1px solid ${on ? 'var(--rose)' : 'var(--border)'}`,
                  background: on ? 'var(--crimson-wash)' : 'var(--bg-2)',
                }}>
                  <input type="radio" name="report-type" value={value} checked={on} onChange={() => setType(value)} style={{ marginTop: 3 }} />
                  <Icon size={15} style={{ color: 'var(--crimson)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>{d.label}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.5, marginTop: 2 }}>{DESCRIPTIONS[value]}</span>
                    {d.audience && <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 4 }}>{tx('For:')} {d.audience}</span>}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </FormSection>

      {type === 'board_pack' && (
        <FormSection title={tx('Reporting period')} description={tx(
          'Incidents, risks raised and closed, and audit activity are counted for this period. Everything else — the register, compliance position, open findings — is as at today.'
        )}>
          <Field label={tx('Period')}>
            <SelectField className="w-full" value={periodKey} onChange={(ev) => setPeriodKey(ev.target.value)}
              options={[...quarters.map((q) => ({ value: q.value, label: q.long })), { value: 'custom', label: tx('Custom dates…') }]} />
          </Field>
          {periodKey === 'custom' && (
            <div className="fp-grid-2">
              <Field label={tx('From')}><DateField value={custom.start} onChange={(ev) => setCustom((c) => ({ ...c, start: ev.target.value }))} /></Field>
              <Field label={tx('To')}><DateField value={custom.end} onChange={(ev) => setCustom((c) => ({ ...c, end: ev.target.value }))} /></Field>
            </div>
          )}
        </FormSection>
      )}

      {type === 'audit_report' && (
        <FormSection title={tx('Engagement')} description={tx(
          'Draft findings are left out. An engagement that is not closed is marked “Draft” on every page — the final report is the one generated after closing.'
        )}>
          {!fixedEngagement && (
            <Field label={tx('Engagement')}>
              <SelectField className="w-full" value={engagementId} onChange={(ev) => setEngagementId(ev.target.value)}
                options={[{ value: '', label: tx('Choose an engagement') },
                          ...engagements.filter((x) => x.status !== 'cancelled').map((x) => ({ value: x.id, label: `${x.ref} — ${x.title}` }))]} />
            </Field>
          )}
          {engagement && (
            <div className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{engagement.ref}</span> {engagement.title} <StageBadge v={engagement.status} />
            </div>
          )}
          {engagement && engagement.status !== 'closed' && (
            <p className="field-help" style={{ margin: 0 }}>{tx('Not closed yet, so this will be a draft report.')}</p>
          )}
        </FormSection>
      )}
    </FormPage>
  )
}
