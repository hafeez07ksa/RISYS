import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { usePermissions } from '@/hooks/usePermissions'
import { useReports, REPORT_STATUSES } from '@/hooks/useReports'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

/* /app/reports/:runId/record — who received a report, and when.
 * The report itself cannot be changed; only this presentation record can. */
export function RecordPresentationPage() {
  const { runId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const { runs, loading, recordPresentation } = useReports()
  const run = runs.find((r) => r.id === runId)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!run || f) return
    setF({
      status: run.status === 'generated' ? 'presented' : run.status,
      presented_at: run.presented_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      presented_to: run.presented_to ?? '', notes: run.notes ?? '',
    })
  }, [run, f])

  const from = params.get('from')
  const leave = () => navigate(from === 'engagement' && run?.engagement_id ? `/app/audits/${run.engagement_id}?tab=reports` : '/app/reports')

  if (loading) return <PageLoading />
  if (!run || !f) return <PageNotFound title={tx('Report not found')} back={{ label: tx('Reports'), onClick: () => navigate('/app/reports') }} />
  if (!perms.canGenerateReports) return <PageNotFound title={tx('Record presentation')} back={{ label: tx('Reports'), onClick: leave }}>{tx('Only people who generate reports can record their presentation.')}</PageNotFound>

  const save = async () => {
    setBusy(true); setError('')
    try { await recordPresentation(run.id, f); leave() } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <FormPage
      title={tx('Record presentation')}
      description={`${tx(run.title)} · ${REPORT_TYPES[run.report_type]?.short ?? run.report_type} · ${tx('generated')} ${fmtDateTime(run.generated_at)}`}
      back={{ label: tx('Reports'), onClick: leave }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={leave}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Save')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Presented or submitted')} description={tx(
        'Who received this report and when. The report file itself cannot be changed — this record is how the archive answers “what did the board see, and when?”.'
      )}>
        <div className="fp-grid-2">
          <Field label={tx('Status')}>
            <SelectField className="w-full" value={f.status} onChange={(ev) => setF({ ...f, status: ev.target.value })} options={REPORT_STATUSES} />
          </Field>
          <Field label={tx('Date')}><DateField value={f.presented_at} onChange={(ev) => setF({ ...f, presented_at: ev.target.value })} /></Field>
        </div>
        <Field label={tx('Presented or submitted to')}>
          <input className="risys-input" value={f.presented_to} onChange={(ev) => setF({ ...f, presented_to: ev.target.value })}
                 placeholder={tx('e.g. Board Risk Committee; NCA portal submission')} />
        </Field>
        <Field label={tx('Notes')}>
          <textarea className="risys-input" rows={4} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })}
                    placeholder={tx('Decisions taken, actions requested, submission reference…')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
