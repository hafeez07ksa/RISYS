import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Inbox, Plus, Megaphone, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { MetricStrip } from '@/components/ui/Metric'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useMyWork, WORK_KINDS } from '@/hooks/useMyWork'
import { useRiskMatrix } from '@/hooks/useRiskGate'
import { useErmOverview } from '@/hooks/useErm'
import { buildRiskModel, currentScore } from '@/features/dashboard/useDashboardData'
import { RiskHeatMap, RiskBands, RiskAreas } from '@/features/dashboard/panels'
import { bandForScore, bandMeta } from '@/lib/matrix'
import { getWorkflowState, normalizeWorkflowState, getToleranceStatus } from '@/lib/risks'
import { tierMeta } from '@/lib/authority'
import { labelOf } from '@/lib/policies'
import { ACCEPTANCE_PURPOSES, ERM_WORK_KINDS, daysUntil, submissionOpen } from '@/lib/erm'
import { fmtDate } from '@/lib/reports/models'
import { Section, Th, Td, Empty, personName } from '@/features/audits/parts'
import { SubmissionBadge } from './IntakePages'
import '@/features/dashboard/dashboard.css'
import { tx } from '@/lib/i18n'

/* ── Risk overview — /app/risks/overview ──────────────────────────────────────
 *
 * The role dashboards of the Risk Management module:
 *
 *   Oversight   the chief risk officer's page (risk managers and admins):
 *               posture, assessments past their deadline, acceptances to
 *               decide and ending soon, and the triage queue.
 *   My risks    the risk owner's page: what they own and the next thing each
 *               one needs.
 *   Waiting on you   the ERM part of my_work(), on both.
 *
 * Figures use the register's own helpers (buildRiskModel, bandForScore), so
 * this page agrees with the register and the GRC overview.
 * -------------------------------------------------------------------------- */

const HeaderLink = ({ to, children }) => (
  <Link to={to} className="btn-ghost" style={{ textDecoration: 'none', fontSize: 'var(--t-sm)', padding: '4px 8px', whiteSpace: 'nowrap', gap: 4 }}>
    {children}<ChevronRight size={12} className="rtl-flip" />
  </Link>
)

/** "14 Dec · 5 days left", red once past. */
function DueClock({ date, doneLabel }) {
  if (!date) return <span style={{ color: 'var(--text-3)' }}>{doneLabel || '—'}</span>
  const d = daysUntil(date)
  const late = d < 0
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <span className="tnum" style={{ color: late ? 'var(--critical)' : 'var(--text)', fontWeight: late ? 600 : 400 }}>{fmtDate(date)}</span>
      <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: late ? 'var(--critical)' : d <= 7 ? 'var(--medium)' : 'var(--text-3)' }}>
        {late ? tx('{{n}} days overdue', { n: -d }) : d === 0 ? tx('Due today') : tx('{{n}} days left', { n: d })}
      </span>
    </span>
  )
}

const BandPill = ({ risk, matrix }) => {
  const b = bandForScore(currentScore(risk), matrix)
  const m = bandMeta(b)
  return b ? <span className="badge" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>{m.label}</span>
    : <span style={{ color: 'var(--text-3)' }}>{tx('Not scored')}</span>
}

/** The next thing a risk needs, for its owner. */
function nextStep(r, acceptance) {
  const s = normalizeWorkflowState(r.workflow_state)
  if (s === 'draft') return { label: tx('Complete the record and send it for admission'), date: null }
  if (s === 'registered') return { label: tx('Assess the risk'), date: r.assessment_due_at }
  if (s === 'assessed') return { label: tx('Waiting for the tolerance gate'), date: null }
  if (s === 'treatment_required') return { label: tx('Agree a treatment plan'), date: r.treatment_due_at }
  if (s === 'under_treatment') return { label: tx('Deliver the treatment plan'), date: null }
  if (s === 'accepted') return { label: tx('Acceptance ends'), date: acceptance?.expires_at || null }
  if (s === 'monitored') return { label: tx('Next review'), date: r.review_date || null }
  return { label: '—', date: null }
}

export function ErmOverviewPage() {
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const work = useMyWork()
  const { matrix } = useRiskMatrix()
  const { risks, acceptances, submissions, loading } = useErmOverview()
  const [view, setView] = useState(perms.isManager ? 'oversight' : 'mine')
  const showOversight = perms.isManager && view === 'oversight'

  const m = useMemo(() => {
    const model = buildRiskModel(risks, matrix)
    const registered = model.open.filter((r) => normalizeWorkflowState(r.workflow_state) === 'registered' && r.assessment_due_at)
      .sort((a, b) => String(a.assessment_due_at).localeCompare(String(b.assessment_due_at)))
    const pending = acceptances.filter((a) => a.status === 'pending')
      .sort((a, b) => String(a.decision_due_on || '').localeCompare(String(b.decision_due_on || '')))
    const approved = acceptances.filter((a) => a.status === 'approved')
    const ending = approved.filter((a) => a.expires_at && daysUntil(a.expires_at) <= 90)
      .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))
    const activeAcceptance = Object.fromEntries(approved.map((a) => [a.risk_id, a]))
    const mine = model.open.filter((r) => r.owner_id === user?.id)
    return {
      model,
      registered,
      assessOverdue: registered.filter((r) => daysUntil(r.assessment_due_at) < 0),
      pending,
      decisionsLate: pending.filter((a) => a.decision_due_on && daysUntil(a.decision_due_on) < 0),
      ending,
      activeAcceptance,
      triage: submissions.filter((s) => s.status === 'submitted'),
      mine,
      mineEnding: ending.filter((a) => a.risk?.owner_id === user?.id),
      myRaised: submissions.filter((s) => s.submitted_by === user?.id && submissionOpen(s)),
    }
  }, [risks, acceptances, submissions, matrix, user?.id])

  const ermWork = work.items.filter((i) => ERM_WORK_KINDS.includes(i.kind))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Risk overview')} subtitle={organization?.name}
        actions={<>
          {!perms.isViewer && <button className="btn-secondary" onClick={() => navigate('/app/risks/intake/new')}><Megaphone size={14} /> {tx('Raise a risk')}</button>}
          {perms.canCreateRisk && <button className="btn-primary" onClick={() => navigate('/app/risks/new')}><Plus size={14} /> {tx('New risk')}</button>}
        </>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        {perms.isManager && (
          <div className="flex" role="tablist" style={{ gap: 6, marginBottom: 14 }}>
            {[['oversight', tx('Oversight')], ['mine', tx('My risks')]].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 'var(--t-sm)' }} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
        )}

        {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : (
          <>
            <div style={{ marginBottom: 16 }}>
              <MetricStrip metrics={showOversight ? [
                { label: tx('Open risks'), value: m.model.open.length, to: '/app/risks' },
                { label: tx('Outside tolerance'), value: m.model.outside, tone: 'critical', to: '/app/risks' },
                { label: tx('Assessments overdue'), value: m.assessOverdue.length, tone: 'critical' },
                { label: tx('Waiting for triage'), value: m.triage.length, tone: 'medium', to: '/app/risks/intake' },
                { label: tx('Acceptances to decide'), value: m.pending.length, tone: 'medium' },
                { label: tx('Decisions past due'), value: m.decisionsLate.length, tone: 'critical' },
                { label: tx('Acceptances ending in 90 days'), value: m.ending.length, tone: 'medium' },
              ] : [
                { label: tx('Risks I own'), value: m.mine.length },
                { label: tx('To assess'), value: m.mine.filter((r) => normalizeWorkflowState(r.workflow_state) === 'registered').length, tone: 'medium' },
                { label: tx('Outside tolerance'), value: m.mine.filter((r) => r.tolerance_status === 'breached').length, tone: 'critical' },
                { label: tx('Acceptances ending in 90 days'), value: m.mineEnding.length, tone: 'medium' },
                { label: tx('Risks I raised, open'), value: m.myRaised.length, to: '/app/risks/intake' },
              ]} />
            </div>

            {ermWork.length > 0 && (
              <section className="section" style={{ marginBottom: 16, borderColor: 'var(--crimson-wash)' }}>
                <div className="flex items-center" style={{ gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                  <Inbox size={14} style={{ color: 'var(--crimson)' }} />
                  <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Waiting on you')}</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                  {ermWork.map((i) => (
                    <tr key={`${i.kind}:${i.item_id}`} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(i.href)}>
                      <Td style={{ width: 220, color: 'var(--text-3)' }}>{tx(WORK_KINDS[i.kind]?.label)}</Td>
                      <Td style={{ color: 'var(--text)' }}>{i.ref} · {i.title}{i.detail ? <span style={{ color: 'var(--text-3)' }}> · {tx(i.detail)}</span> : null}</Td>
                      <Td align="right">{i.due_on ? <DueClock date={i.due_on} /> : ''}</Td>
                    </tr>
                  ))}
                </tbody></table>
              </section>
            )}

            {showOversight ? (
              <>
                <div className="db" style={{ padding: 0, background: 'none', marginBottom: 16 }}>
                  <div className="db-grid">
                    <RiskHeatMap risks={m.model} matrix={matrix} />
                    <RiskBands risks={m.model} />
                    <RiskAreas risks={m.model} />
                  </div>
                </div>

                <Section title={tx('Assessments due')} pad={false}
                  actions={<span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{tx('Admitted risks waiting to be scored')}</span>}>
                  {m.registered.length === 0 ? <Empty title={tx('Nothing waiting to be assessed')} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Risk')}</Th><Th>{tx('Owner')}</Th><Th width={170}>{tx('Assess by')}</Th></tr></thead>
                      <tbody>{m.registered.slice(0, 10).map((r) => (
                        <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/${r.id}`)}>
                          <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.risk_id}</Td>
                          <Td>{r.title}</Td>
                          <Td>{personName(members, r.owner_id) || <span style={{ color: 'var(--critical)' }}>{tx('No owner')}</span>}</Td>
                          <Td><DueClock date={r.assessment_due_at} /></Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </Section>

                <Section title={tx('Acceptances awaiting decision')} pad={false}>
                  {m.pending.length === 0 ? <Empty title={tx('No acceptance is waiting for a decision')} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Risk')}</Th><Th>{tx('Purpose')}</Th><Th>{tx('Signed by')}</Th><Th>{tx('Stage')}</Th><Th width={170}>{tx('Decision due')}</Th></tr></thead>
                      <tbody>{m.pending.map((a) => (
                        <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/${a.risk_id}?tab=treatment`)}>
                          <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.risk?.risk_id || a.exception_ref}</Td>
                          <Td>
                            {labelOf(ACCEPTANCE_PURPOSES, a.purpose)}
                            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{a.exception_type === 'exception' ? tx('Exception · outside tolerance') : tx('Acceptance')}</div>
                          </Td>
                          <Td>{tierMeta(a.required_authority).label}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{personName(members, a.approver_id)}</div></Td>
                          <Td>{a.management_review_required && !a.management_reviewed_at
                            ? <StatusBadge tone="medium" label={tx('Management review')} />
                            : <StatusBadge tone="info" label={tx('Decision')} />}</Td>
                          <Td><DueClock date={a.decision_due_on} /></Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </Section>

                <Section title={tx('Acceptances ending in the next 90 days')} pad={false}>
                  {m.ending.length === 0 ? <Empty title={tx('None ending soon')} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Risk')}</Th><Th>{tx('Purpose')}</Th><Th>{tx('Signed as')}</Th><Th width={170}>{tx('Ends')}</Th></tr></thead>
                      <tbody>{m.ending.map((a) => (
                        <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/${a.risk_id}?tab=treatment`)}>
                          <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.risk?.risk_id || a.exception_ref}</Td>
                          <Td>{labelOf(ACCEPTANCE_PURPOSES, a.purpose)}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{a.risk?.title}</div></Td>
                          <Td>{tierMeta(a.decided_authority || a.required_authority).label}</Td>
                          <Td><DueClock date={a.expires_at} /></Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </Section>

                <Section title={tx('Triage queue')} pad={false} actions={<HeaderLink to="/app/risks/intake">{tx('All raised risks')}</HeaderLink>}>
                  {m.triage.length === 0 ? <Empty title={tx('Nothing waiting for triage')} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Risk')}</Th><Th>{tx('Raised by')}</Th><Th>{tx('Waiting')}</Th></tr></thead>
                      <tbody>{m.triage.slice(0, 6).map((s) => (
                        <tr key={s.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/intake/${s.id}`)}>
                          <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.ref}</Td>
                          <Td>{s.title}{s.urgent && <span style={{ color: 'var(--critical)', fontWeight: 600 }}> · {tx('Urgent')}</span>}</Td>
                          <Td>{personName(members, s.submitted_by)}</Td>
                          <Td className="tnum">{tx('{{n}} days', { n: Math.max(0, -daysUntil(s.submitted_at)) })}</Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </Section>
              </>
            ) : (
              <>
                <Section title={tx('Risks I own')} pad={false} actions={<HeaderLink to="/app/risks">{tx('Risk Register')}</HeaderLink>}>
                  {m.mine.length === 0 ? (
                    <Empty title={tx('You do not own any open risks')}>{tx('Risks are assigned to their owner when they are created or accepted at triage.')}</Empty>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Risk')}</Th><Th>{tx('Band')}</Th><Th>{tx('Tolerance')}</Th><Th>{tx('Next step')}</Th><Th width={170}>{tx('By')}</Th></tr></thead>
                      <tbody>{m.mine.map((r) => {
                        const step = nextStep(r, m.activeAcceptance[r.id])
                        const wf = getWorkflowState(normalizeWorkflowState(r.workflow_state))
                        const tol = getToleranceStatus(r.tolerance_status)
                        return (
                          <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/${r.id}`)}>
                            <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.risk_id}</Td>
                            <Td>{r.title}<div style={{ fontSize: 'var(--t-meta)', color: wf.color }}>{wf.label}</div></Td>
                            <Td><BandPill risk={r} matrix={matrix} /></Td>
                            <Td><span style={{ color: tol.color, fontSize: 'var(--t-sm)' }}>{tol.label}</span></Td>
                            <Td>{step.label}</Td>
                            <Td>{step.date ? <DueClock date={step.date} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                          </tr>
                        )
                      })}</tbody>
                    </table>
                  )}
                </Section>

                <Section title={tx('Risks I raised')} pad={false}
                  actions={!perms.isViewer && <HeaderLink to="/app/risks/intake/new"><Plus size={12} /> {tx('Raise a risk')}</HeaderLink>}>
                  {m.myRaised.length === 0 ? (
                    <Empty title={tx('Nothing open')}>{tx('Risks you raise appear here until a risk manager has decided on them.')}</Empty>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Risk')}</Th><Th>{tx('Raised')}</Th><Th>{tx('Status')}</Th></tr></thead>
                      <tbody>{m.myRaised.map((s) => (
                        <tr key={s.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/risks/intake/${s.id}`)}>
                          <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.ref}</Td>
                          <Td>{s.title}</Td>
                          <Td>{fmtDate(s.submitted_at)}</Td>
                          <Td><SubmissionBadge v={s.status} /></Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
