import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Download, ShieldCheck, ShieldAlert, Presentation } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { openReport, reportSignedUrl, verifyReport } from '@/lib/reports/generate'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { REPORT_STATUSES } from '@/hooks/useReports'
import { ErrorText, Th, Td, Empty } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

const STATUS_TONE = { generated: 'neutral', presented: 'low', submitted: 'info' }

/** The archive table, shared by the Reports page and an engagement's Reports tab. */
export function ReportArchive({ runs, loading, canRecord, emptyText, showType = true, from }) {
  const navigate = useNavigate()
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
  if (!runs.length) return <Empty title={tx('No reports yet')}>{emptyText}</Empty>

  return (
    <>
      {error && <div style={{ padding: '8px 16px' }}><ErrorText>{error}</ErrorText></div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>{tx('Report')}</Th>{showType && <Th>{tx('Type')}</Th>}<Th>{tx('Generated')}</Th><Th>{tx('Status')}</Th><Th align="right">{tx('Actions')}</Th>
          </tr></thead>
          <tbody>
            {runs.map((r) => {
              const c = checks[r.id]
              return (
                <tr key={r.id}>
                  <Td>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{tx(r.title)}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                      {r.period_label ? `${r.period_label} · ` : ''}{tx('ID')} {r.id.slice(0, 8)} · {r.file_size ? `${Math.round(r.file_size / 1024)} KB` : '—'}
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
                      <button className="btn-ghost" title={tx('Open report')} onClick={act(() => openReport(r))}><ExternalLink size={14} /></button>
                      <button className="btn-ghost" title={tx('Download')} onClick={download(r)}><Download size={14} /></button>
                      <button className="btn-ghost" onClick={() => check(r)}
                        title={tx(
                          'Re-compute the file\'s SHA-256 and compare it with the fingerprint recorded when it was generated'
                        )}
                        style={{ color: c === 'ok' ? 'var(--low)' : c === 'bad' ? 'var(--critical)' : undefined }}>
                        {c === 'busy' ? <Spinner size="sm" /> : c === 'bad' ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                        {c === 'ok' ? tx('Unchanged') : c === 'bad' ? tx('Mismatch') : tx('Verify')}
                      </button>
                      {canRecord && (
                        <button className="btn-ghost" title={tx('Record presentation or submission')} onClick={() => navigate(`/app/reports/${r.id}/record${from ? `?from=${from}` : ''}`)}>
                          <Presentation size={14} /> {tx('Record')}</button>
                      )}
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
