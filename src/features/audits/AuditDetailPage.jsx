import { useMemo, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { FileText, Pencil, ArrowRight, Lock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { BackLink } from '@/components/ui/BackLink'
import { Tabs } from '@/components/ui/Tabs'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { SelectField } from '@/components/ui/Combobox'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useAudit, AUDIT_TYPES, OPINIONS, labelOf, ACTIVE_FINDING } from '@/hooks/useAudits'
import { useReports } from '@/hooks/useReports'
import { fmtDate } from '@/lib/reports/models'
import { OPINION } from '@/lib/reports/theme'
import { EngagementForm } from './EngagementForm'
import { ScopeTab } from './ScopeTab'
import { RequestsTab } from './RequestsTab'
import { FindingsTab } from './FindingsTab'
import { Dialog, Field, SubmitButton, ErrorText, Section, Facts, StageBadge, OpinionBadge, Empty, personName } from './parts'
import { GenerateReportDialog } from '@/features/reports/GenerateReportDialog'
import { ReportArchive } from '@/features/reports/ReportArchive'

/* One audit engagement: plan → fieldwork → reporting → closed.
 *
 * Closing needs an opinion (a CHECK constraint enforces it) and locks the
 * engagement in the UI; the final audit report is the one generated after
 * closing. Reopening is possible for the audit team, and is logged. */

const NEXT = {
  planned:   { to: 'fieldwork', label: 'Start fieldwork' },
  fieldwork: { to: 'reporting', label: 'Move to reporting' },
  reporting: { to: 'closed',    label: 'Close engagement' },
}

export function AuditDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const perms = usePermissions()
  const { members } = usePeople()
  const audit = useAudit(id)
  const reports = useReports({ engagementId: id })
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const e = audit.engagement
  const canManage = perms.canManageAudits
  const locked = e?.status === 'closed' || e?.status === 'cancelled'

  const stats = useMemo(() => {
    const tested = audit.scope.filter((x) => x.result !== 'not_tested').length
    const reviewed = audit.scope.filter((x) => x.reviewed_by).length
    const issued = audit.findings.filter((f) => f.status !== 'draft')
    const open = issued.filter((f) => ACTIVE_FINDING.includes(f.status))
    const outstanding = audit.requests.filter((r) => ['open', 'rejected'].includes(r.status)).length
    return { tested, reviewed, issued: issued.length, open: open.length, high: open.filter((f) => f.rating === 'high').length, outstanding }
  }, [audit.scope, audit.findings, audit.requests])

  if (audit.loading) return <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  if (audit.notFound || !e) return (
    <div className="page-content"><BackLink to={() => navigate('/app/audits')} label="Audits" />
      <Empty title="Engagement not found">It may have been deleted, or it belongs to another organisation.</Empty></div>
  )

  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const advance = async () => {
    const next = NEXT[e.status]
    if (!next) return
    if (next.to === 'closed') { setClosing(true); return }
    setError('')
    try { await audit.updateEngagement({ status: next.to }) } catch (err) { setError(err.message) }
  }
  const reopen = async () => {
    if (!window.confirm('Reopen this engagement? It returns to Reporting and can be changed again; reports already generated are kept.')) return
    try { await audit.updateEngagement({ status: 'reporting' }) } catch (err) { setError(err.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title={`${e.ref} — ${e.title}`}
        subtitle={`${labelOf(AUDIT_TYPES, e.audit_type)}${e.framework ? ` · ${e.framework}` : ''}`}
        actions={<>
          {perms.canGenerateReports && (
            <button className="btn-secondary" onClick={() => setGenerating(true)}><FileText size={14} /> Audit report</button>
          )}
          {canManage && NEXT[e.status] && (
            <button className="btn-primary" onClick={advance}>{NEXT[e.status].label} <ArrowRight size={14} /></button>
          )}
          {canManage && e.status === 'closed' && <button className="btn-secondary" onClick={reopen}>Reopen</button>}
        </>}
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
          <BackLink to={() => navigate('/app/audits')} label="Audits" />
          <StageBadge v={e.status} />
          {locked && <span className="flex items-center" style={{ gap: 4, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}><Lock size={11} /> Closed {fmtDate(e.closed_at)} — read only</span>}
        </div>
        {error && <div style={{ marginBottom: 10 }}><ErrorText>{error}</ErrorText></div>}

        <div style={{ marginBottom: 14 }}>
          <MetricStrip metrics={[
            { label: 'Tested', value: `${stats.tested}/${audit.scope.length}` },
            { label: 'Reviewed', value: stats.reviewed },
            { label: 'Findings issued', value: stats.issued },
            { label: 'Open findings', value: stats.open, tone: stats.high ? 'critical' : 'default', hint: stats.high ? `${stats.high} high` : undefined },
            { label: 'Evidence outstanding', value: stats.outstanding, tone: 'medium' },
          ]} />
        </div>

        <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'scope', label: 'Scope & testing', count: audit.scope.length },
          { value: 'requests', label: 'Evidence requests', count: audit.requests.length },
          { value: 'findings', label: 'Findings', count: audit.findings.filter((f) => canManage || f.status !== 'draft').length },
          { value: 'reports', label: 'Reports', count: reports.runs.length },
        ]} />
        <div style={{ height: 14 }} />

        {tab === 'overview' && (
          <>
            <Section title="Opinion" actions={canManage && !locked && e.status !== 'planned' && (
              <button className="btn-secondary" onClick={() => setClosing('opinion')}><Pencil size={13} /> {e.opinion ? 'Revise' : 'Record opinion'}</button>
            )}>
              {e.opinion ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><OpinionBadge v={e.opinion} /></div>
                  <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text)' }}>{OPINION[e.opinion]?.text}</p>
                  {e.opinion_summary && <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{e.opinion_summary}</p>}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
                  The overall conclusion on the objective. Recorded at the reporting stage; required to close the engagement.
                </p>
              )}
            </Section>
            <Section title="Plan" actions={canManage && !locked && <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>}>
              <Facts rows={[
                ['Objective', e.objective],
                ['Scope', e.scope_summary],
                ['Approach', e.methodology],
                ['Period under audit', e.period_start || e.period_end ? `${fmtDate(e.period_start)} – ${fmtDate(e.period_end)}` : null],
                ['Fieldwork', e.planned_start || e.planned_end ? `${fmtDate(e.planned_start)} – ${fmtDate(e.planned_end)}` : null],
                ['Lead auditor', e.lead?.full_name || e.lead?.email],
                ['Created', `${fmtDate(e.created_at)}${e.created_by ? ` by ${personName(members, e.created_by)}` : ''}`],
              ]} />
            </Section>
          </>
        )}
        {tab === 'scope' && <ScopeTab audit={audit} members={members} canManage={canManage} locked={locked} />}
        {tab === 'requests' && <RequestsTab audit={audit} members={members} canManage={canManage} locked={locked} />}
        {tab === 'findings' && <FindingsTab audit={audit} members={members} canManage={canManage} locked={locked} />}
        {tab === 'reports' && (
          <Section title="Reports for this engagement" pad={false}
            actions={perms.canGenerateReports && <button className="btn-secondary" onClick={() => setGenerating(true)}><FileText size={13} /> Generate</button>}>
            <ReportArchive runs={reports.runs} loading={reports.loading} showType={false}
              canRecord={perms.canGenerateReports} onRecord={reports.recordPresentation}
              emptyText="Generate the audit report once findings are issued. Until the engagement is closed the report is marked as a draft." />
          </Section>
        )}
      </div>

      {editing && <EngagementForm open onClose={() => setEditing(false)} initial={e} members={members} onSave={audit.updateEngagement} />}
      {closing && <OpinionDialog engagement={e} closing={closing === true} stats={stats} onClose={() => setClosing(false)} onSave={audit.updateEngagement} />}
      {generating && <GenerateReportDialog open type="audit_report" engagementId={e.id} onClose={() => setGenerating(false)} onGenerated={reports.refetch} />}
    </div>
  )
}

function OpinionDialog({ engagement: e, closing, stats, onClose, onSave }) {
  const [opinion, setOpinion] = useState(e.opinion ?? '')
  const [summary, setSummary] = useState(e.opinion_summary ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (!opinion) { setError('Choose an opinion.'); return }
    setBusy(true); setError('')
    try {
      await onSave({ opinion, opinion_summary: summary.trim() || null, ...(closing ? { status: 'closed' } : {}) })
      onClose()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const warnings = [
    closing && stats.outstanding ? `${stats.outstanding} evidence request${stats.outstanding > 1 ? 's are' : ' is'} still outstanding.` : null,
    closing && stats.tested > stats.reviewed ? `${stats.tested - stats.reviewed} tested item${stats.tested - stats.reviewed > 1 ? 's have' : ' has'} not been reviewed.` : null,
  ].filter(Boolean)
  return (
    <Dialog open onClose={onClose} width={600}
      title={closing ? `Close ${e.ref}` : 'Overall opinion'}
      subtitle={closing ? 'Closing records the opinion and makes the engagement read-only. Generate the final report afterwards.' : 'The conclusion on the engagement objective.'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <SubmitButton busy={busy} onClick={save}>{closing ? 'Close engagement' : 'Save opinion'}</SubmitButton></>}>
      <Field label="Opinion" required>
        <SelectField className="w-full" value={opinion} onChange={(ev) => setOpinion(ev.target.value)}
          options={[{ value: '', label: 'Choose' }, ...OPINIONS]} />
      </Field>
      {opinion && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{OPINION[opinion]?.text}</p>}
      <Field label="Basis for the opinion" help="Two or three sentences: what works, what does not, and what must change before the controls can be relied on.">
        <textarea className="risys-input" rows={4} value={summary} onChange={(ev) => setSummary(ev.target.value)} />
      </Field>
      {warnings.length > 0 && (
        <div style={{ fontSize: 'var(--t-sm)', color: 'var(--medium)', background: 'var(--surface)', padding: 10, borderRadius: 'var(--r)' }}>
          {warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}
