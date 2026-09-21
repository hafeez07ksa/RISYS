import { useMemo, useState, useEffect } from 'react'
import { FileText, Download, ExternalLink, CheckCircle2 } from 'lucide-react'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { useAuth } from '@/hooks/useAuth'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { generateReport, recentQuarters } from '@/lib/reports/generate'
import { fmtDate } from '@/lib/reports/models'
import { Dialog, Field, Grid, SubmitButton, ErrorText } from '@/features/audits/parts'

const DESCRIPTIONS = {
  board_pack: 'Summary for the board or its risk committee: matters for attention, risk heat maps before and after controls, tolerance and accepted risks, NCA ECC position, incidents, findings from connected systems and audit.',
  ecc_status: 'The organisation’s position against every NCA ECC-2:2024 requirement — recorded status, what connected systems measure, mapped controls, evidence and open issues. For a regulator, an external assessor or management.',
  audit_report: 'The report of one audit engagement: opinion, findings with condition, criteria, cause, effect and management response, and the testing behind them.',
}

/**
 * Generate a report. `type` and `engagementId` may be fixed by the caller
 * (the audit page generates its own report); otherwise the user picks.
 */
export function GenerateReportDialog({ open, onClose, type: fixedType, engagementId: fixedEngagement, engagements = [], onGenerated }) {
  const { organization, user } = useAuth()
  const quarters = useMemo(() => recentQuarters(6), [])
  const [type, setType] = useState(fixedType ?? 'board_pack')
  const [periodKey, setPeriodKey] = useState(quarters[0].value)
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [engagementId, setEngagementId] = useState(fixedEngagement ?? '')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url) }, [result])

  const period = periodKey === 'custom'
    ? (custom.start && custom.end ? { start: custom.start, end: custom.end, label: `${fmtDate(custom.start)} – ${fmtDate(custom.end)}` } : null)
    : (() => { const q = quarters.find((x) => x.value === periodKey); return q && { start: q.start, end: q.end, label: q.long } })()

  const ready = type === 'board_pack' ? !!period && period.end >= period.start
    : type === 'audit_report' ? !!engagementId : true

  const run = async () => {
    setError(''); setStage('Starting')
    try {
      const name = user?.user_metadata?.full_name || user?.email
      const { run: r, blob } = await generateReport({
        type, organization, user: { id: user.id, name },
        period, engagement: engagementId ? { id: engagementId } : null, onStage: setStage,
      })
      setResult({ run: r, url: URL.createObjectURL(blob) })
      onGenerated?.(r)
    } catch (e) {
      setError(e.message || 'The report could not be generated.')
    } finally { setStage('') }
  }

  const fileName = result ? `${result.run.title.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-')}.pdf` : ''

  return (
    <Dialog open={open} onClose={onClose} width={600}
      title={result ? 'Report ready' : fixedType ? `Generate ${REPORT_TYPES[fixedType].label.toLowerCase()}` : 'Generate a report'}
      subtitle={result ? 'Filed in the report archive with its SHA-256 fingerprint.' : 'Built from the records in RISYS as they are right now, then filed in the archive.'}
      footer={result ? <>
        <a className="btn-secondary" href={result.url} download={fileName}><Download size={14} /> Download</a>
        <a className="btn-primary" href={result.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
      </> : <>
        <button className="btn-secondary" onClick={onClose} disabled={!!stage}>Cancel</button>
        <SubmitButton busy={!!stage} disabled={!ready} onClick={run}>{stage ? `${stage}…` : 'Generate PDF'}</SubmitButton>
      </>}>
      {result ? (
        <div className="flex" style={{ gap: 12, alignItems: 'flex-start' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{result.run.title}</div>
            {result.run.period_label && <div>{result.run.period_label}</div>}
            <div>{(result.run.file_size / 1024).toFixed(0)} KB · Report ID {result.run.id.slice(0, 8)}</div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--t-meta)', color: 'var(--text-3)', wordBreak: 'break-all' }}>
              SHA-256 {result.run.sha256}
            </div>
          </div>
        </div>
      ) : (
        <>
          {!fixedType && (
            <Field label="Report">
              <SelectField className="w-full" value={type} onChange={(e) => setType(e.target.value)}
                options={Object.entries(REPORT_TYPES).map(([value, d]) => ({ value, label: d.label }))} />
            </Field>
          )}
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>
            <FileText size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />{DESCRIPTIONS[type]}
          </p>

          {type === 'board_pack' && (
            <>
              <Field label="Reporting period" help="Incidents, risks raised and closed, and audit activity are counted for this period. Everything else is as at today.">
                <SelectField className="w-full" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}
                  options={[...quarters.map((q) => ({ value: q.value, label: q.long })), { value: 'custom', label: 'Custom dates…' }]} />
              </Field>
              {periodKey === 'custom' && (
                <Grid cols={2}>
                  <Field label="From"><DateField value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} /></Field>
                  <Field label="To"><DateField value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} /></Field>
                </Grid>
              )}
            </>
          )}

          {type === 'audit_report' && !fixedEngagement && (
            <Field label="Engagement">
              <SelectField className="w-full" value={engagementId} onChange={(e) => setEngagementId(e.target.value)}
                options={[{ value: '', label: 'Choose an engagement' },
                          ...engagements.map((e) => ({ value: e.id, label: `${e.ref} — ${e.title}` }))]} />
            </Field>
          )}
          {type === 'audit_report' && (
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: 0 }}>
              Draft findings are left out. An engagement that is not closed is marked “Draft” on every page.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Dialog>
  )
}
