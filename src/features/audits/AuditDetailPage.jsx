import { useMemo, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { FileText, Pencil, ArrowRight, Lock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { BackLink } from '@/components/ui/BackLink'
import { Tabs } from '@/components/ui/Tabs'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { Stepper } from '@/components/ui/Stepper'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useAudit, AUDIT_TYPES, labelOf, ACTIVE_FINDING } from '@/hooks/useAudits'
import { useReports } from '@/hooks/useReports'
import { fmtDate } from '@/lib/reports/models'
import { OPINION } from '@/lib/reports/theme'
import { ScopeTab } from './ScopeTab'
import { RequestsTab } from './RequestsTab'
import { FindingsTab } from './FindingsTab'
import { ErrorText, Section, Facts, StageBadge, OpinionBadge, Empty, personName } from './parts'
import { ReportArchive } from '@/features/reports/ReportArchive'
import { tx } from '@/lib/i18n'

/* One audit engagement: plan → fieldwork → reporting → closed.
 *
 * Every change happens on a page of its own under /app/audits/:id — the plan
 * (/edit), the opinion (/opinion), scope items, requests and findings — so
 * this page is the engagement's home: where it stands, what is next, and the
 * tabs that list its parts.
 *
 * Closing needs an opinion (a CHECK constraint enforces it) and locks the
 * engagement in the UI; the final audit report is the one generated after
 * closing. Reopening is possible for the audit team, and is logged. */

const STAGES = [
  { value: 'planned', label: tx('Planning'),
    what: tx('Agree the objective, scope and period. Put in scope each requirement or control that will be tested, and write the test before doing it.') },
  { value: 'fieldwork', label: tx('Fieldwork'),
    what: tx('Request evidence from the business, perform each test on a sample and record the result with working papers. A second auditor reviews every test. Write findings where controls fail.') },
  { value: 'reporting', label: tx('Reporting'),
    what: tx('Issue findings to management and collect their responses and action plans. Record the overall opinion, generate the draft report, then close.') },
  { value: 'closed', label: tx('Closed'),
    what: tx('The engagement is read-only. Generate the final audit report and record when it was presented. Open findings keep being tracked until management fixes them.') },
]

const NEXT = {
  planned:   { to: 'fieldwork', label: tx('Start fieldwork') },
  fieldwork: { to: 'reporting', label: tx('Move to reporting') },
  reporting: { to: 'closed',    label: tx('Close engagement') },
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
    <div className="page-content"><BackLink to={() => navigate('/app/audits')} label={tx('Audits')} />
      <Empty title={tx('Engagement not found')}>{tx('It may have been deleted, or it belongs to another organisation.')}</Empty></div>
  )

  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const advance = async () => {
    const next = NEXT[e.status]
    if (!next) return
    if (next.to === 'closed') { navigate(`/app/audits/${id}/opinion?close=1`); return }
    setError('')
    try { await audit.updateEngagement({ status: next.to }) } catch (err) { setError(err.message) }
  }
  const reopen = () => audit.updateEngagement({ status: 'reporting' })
  const stageIndex = Math.max(0, STAGES.findIndex((x) => x.value === e.status))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title={`${e.ref} — ${e.title}`}
        subtitle={`${labelOf(AUDIT_TYPES, e.audit_type)}${e.framework ? ` · ${e.framework}` : ''}`}
        actions={<>
          {perms.canGenerateReports && (
            <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/report`)}><FileText size={14} /> {tx('Audit report')}</button>
          )}
          {canManage && NEXT[e.status] && (
            <button className="btn-primary" onClick={advance}>{NEXT[e.status].label} <ArrowRight size={14} className='rtl-flip' /></button>
          )}
          {canManage && e.status === 'closed' && (
            <InlineConfirm tone="neutral" triggerClassName="btn-secondary" confirmLabel={tx('Reopen')}
              message={tx('Reopen? It returns to Reporting; generated reports are kept.')} onConfirm={reopen}>
              {tx('Reopen')}
            </InlineConfirm>
          )}
        </>}
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
          <BackLink to={() => navigate('/app/audits')} label={tx('Audits')} />
          <StageBadge v={e.status} />
          {locked && <span className="flex items-center" style={{ gap: 4, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}><Lock size={11} /> {tx('Closed')} {fmtDate(e.closed_at)} {tx('— read only')}</span>}
        </div>
        {error && <div style={{ marginBottom: 10 }}><ErrorText>{error}</ErrorText></div>}

        <div style={{ marginBottom: 14 }}>
          <MetricStrip metrics={[
            { label: tx('Tested'), value: `${stats.tested}/${audit.scope.length}` },
            { label: tx('Reviewed'), value: stats.reviewed },
            { label: tx('Findings issued'), value: stats.issued },
            { label: tx('Open findings'), value: stats.open, tone: stats.high ? 'critical' : 'default', hint: stats.high ? `${stats.high} high` : undefined },
            { label: tx('Evidence outstanding'), value: stats.outstanding, tone: 'medium' },
          ]} />
        </div>

        <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
          { value: 'overview', label: tx('Overview') },
          { value: 'scope', label: tx('Scope & testing'), count: audit.scope.length },
          { value: 'requests', label: tx('Evidence requests'), count: audit.requests.length },
          { value: 'findings', label: tx('Findings'), count: audit.findings.filter((f) => canManage || f.status !== 'draft').length },
          { value: 'reports', label: tx('Reports'), count: reports.runs.length },
        ]} />
        <div style={{ height: 14 }} />

        {tab === 'overview' && (
          <>
            {e.status !== 'cancelled' && (
              <Section title={tx('Where this engagement stands')}>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}><Stepper steps={STAGES} current={stageIndex} /></div>
                <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.6, maxWidth: '75ch' }}>{STAGES[stageIndex].what}</p>
              </Section>
            )}
            <Section title={tx('Opinion')} actions={canManage && !locked && e.status !== 'planned' && (
              <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/opinion`)}><Pencil size={13} /> {e.opinion ? tx('Revise') : tx('Record opinion')}</button>
            )}>
              {e.opinion ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><OpinionBadge v={e.opinion} /></div>
                  <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text)' }}>{OPINION[e.opinion]?.text}</p>
                  {e.opinion_summary && <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{e.opinion_summary}</p>}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx(
                  'The overall conclusion on the objective. Recorded at the reporting stage; required to close the engagement.'
                )}</p>
              )}
            </Section>
            <Section title={tx('Plan')} actions={canManage && !locked && <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/edit`)}><Pencil size={13} /> {tx('Edit')}</button>}>
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
          <Section title={tx('Reports for this engagement')} pad={false}
            actions={perms.canGenerateReports && <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/report`)}><FileText size={13} /> {tx('Generate')}</button>}>
            <ReportArchive runs={reports.runs} loading={reports.loading} showType={false}
              canRecord={perms.canGenerateReports} from="engagement"
              emptyText={tx(
                'Generate the audit report once findings are issued. Until the engagement is closed the report is marked as a draft.'
              )} />
          </Section>
        )}
      </div>

    </div>
  )
}
