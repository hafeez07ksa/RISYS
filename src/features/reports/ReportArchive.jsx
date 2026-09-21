import { useState } from 'react'
import { ExternalLink, Download, ShieldCheck, ShieldAlert, Presentation } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { Spinner } from '@/components/ui/Spinner'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { openReport, reportSignedUrl, verifyReport } from '@/lib/reports/generate'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { REPORT_STATUSES } from '@/hooks/useReports'
import { Dialog, Field, Grid, SubmitButton, ErrorText, Th, Td, Empty } from '@/features/audits/parts'

const STATUS_TONE = { generated: 'neutral', presented: 'low', submitted: 'info' }

/** The archive table, shared by the Reports page and an engagement's Reports tab. */
export function ReportArchive({ runs, loading, canRecord, onRecord, emptyText, showType = true }) {
  const [editing, setEditing] = useState(null)
  const [checks, setChecks] = useState({})
  const [error, setError] = useState('')

  const check = async (r) => {
    setChecks((c) => ({ ...c, [r.id]: 'busy' }))
    try {
      const v = await verifyReport(r)
      setChecks((c) => ({ ...c, [r.id]: v.ok ? 'ok' : 'bad' }))
    } catch (e) { setChecks((c) => ({ ...c, [r.id]: 'bad' })); setError(e.message) }
  }
  const act = (fn) => async () => { setError(''); try { await fn() } catch (e) { setError(e.message) } }
  const download = (r) => act(async () => { window.location.assign(await reportSignedUrl(r, { download: true })) })

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  if (!runs.length) return <Empty title="No reports yet">{emptyText}</Empty>

  return (
    <>
      {error && <div style={{ padding: '8px 16px' }}><ErrorText>{error}</ErrorText></div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Report</Th>{showType && <Th>Type</Th>}<Th>Generated</Th><Th>Status</Th><Th align="right">Actions</Th>
          </tr></thead>
          <tbody>
            {runs.map((r) => {
              const c = checks[r.id]
              return (
                <tr key={r.id}>
                  <Td>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{r.title}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                      {r.period_label ? `${r.period_label} · ` : ''}ID {r.id.slice(0, 8)} · {r.file_size ? `${Math.round(r.file_size / 1024)} KB` : '—'}
                    </div>
                  </Td>
                  {showType && <Td>{REPORT_TYPES[r.report_type]?.short ?? r.report_type}</Td>}
                  <Td>
                    <div>{fmtDateTime(r.generated_at)}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{r.generator?.full_name || r.generator?.email || ''}</div>
                  </Td>
                  <Td>
                    <StatusBadge tone={STATUS_TONE[r.status]} label={REPORT_STATUSES.find((s) => s.value === r.status)?.label ?? r.status} />
                    {r.presented_to && (
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 3 }}>
                        {r.presented_to}{r.presented_at ? `, ${fmtDate(r.presented_at)}` : ''}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <button className="btn-ghost" title="Open" onClick={act(() => openReport(r))}><ExternalLink size={14} /></button>
                      <button className="btn-ghost" title="Download" onClick={download(r)}><Download size={14} /></button>
                      <button className="btn-ghost" onClick={() => check(r)}
                        title="Re-compute the file's SHA-256 and compare it with the fingerprint recorded when it was generated"
                        style={{ color: c === 'ok' ? 'var(--low)' : c === 'bad' ? 'var(--critical)' : undefined }}>
                        {c === 'busy' ? <Spinner size="sm" /> : c === 'bad' ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                        {c === 'ok' ? 'Unchanged' : c === 'bad' ? 'Mismatch' : 'Verify'}
                      </button>
                      {canRecord && (
                        <button className="btn-ghost" title="Record presentation or submission" onClick={() => setEditing(r)}>
                          <Presentation size={14} /> Record
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && <PresentationDialog run={editing} onClose={() => setEditing(null)} onSave={onRecord} />}
    </>
  )
}

function PresentationDialog({ run, onClose, onSave }) {
  const [f, setF] = useState({
    status: run.status === 'generated' ? 'presented' : run.status,
    presented_at: run.presented_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    presented_to: run.presented_to ?? '', notes: run.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { await onSave(run.id, f); onClose() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} width={520} title="Record presentation"
      subtitle="Who received this report and when. The report itself cannot be changed."
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><SubmitButton busy={busy} onClick={save}>Save</SubmitButton></>}>
      <Grid cols={2}>
        <Field label="Status">
          <SelectField className="w-full" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={REPORT_STATUSES} />
        </Field>
        <Field label="Date"><DateField value={f.presented_at} onChange={(e) => setF({ ...f, presented_at: e.target.value })} /></Field>
      </Grid>
      <Field label="Presented or submitted to">
        <input className="risys-input" value={f.presented_to} onChange={(e) => setF({ ...f, presented_to: e.target.value })}
               placeholder="e.g. Board Risk Committee; NCA portal submission" />
      </Field>
      <Field label="Notes">
        <textarea className="risys-input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
                  placeholder="Decisions taken, actions requested, submission reference…" />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}
