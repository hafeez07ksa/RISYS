import { useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw, BookCheck, Cloud, Lock, ClipboardList, Inbox, CircleCheck, CalendarX,
  AlertTriangle, Scale, FileText, ArrowUpRight, Settings2, Gauge, ListChecks,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Ring, StackBar, Meter } from '@/components/ui/charts'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useReports } from '@/hooks/useReports'
import { tx, appLocale } from '@/lib/i18n'
import {
  PRIMARY_FRAMEWORK_ID, CCC_FRAMEWORK_ID, PDPL_FRAMEWORK_ID, getFramework,
  hasCccProfile, hasPdplProfile,
  useScopedRequirements, useComplianceStatuses, useFrameworkMappings,
  useRequirementAutomation, useRequirementFindings, useReviewSchedule,
  computeFrameworkScore, computeEffectiveStatus, isOverridingEvidence, hasAutomatedResult,
  isSubControl, compareRequirementIds,
} from '@/hooks/useCompliance'
import { Panel, STATUS_TONE } from '@/features/dashboard/panels'
import '@/features/dashboard/dashboard.css'

/* ── Compliance dashboard ─────────────────────────────────────────────────────
 *
 * One page for every framework the workspace has in scope (NCA ECC always;
 * NCA CCC and SDAIA PDPL once their scope is set in Settings → Organization).
 *
 * Every number is computed with the helpers the framework pages use
 * (computeFrameworkScore, computeEffectiveStatus), on the same scoped rows,
 * so the dashboard never disagrees with the page it links to. Findings never
 * change a status here either: they are shown beside it.
 * -------------------------------------------------------------------------- */

const FW_META = {
  [PRIMARY_FRAMEWORK_ID]: { short: 'ECC', icon: BookCheck, report: 'ecc_status', reportPage: 'ecc' },
  [CCC_FRAMEWORK_ID]:     { short: 'CCC', icon: Cloud,     report: 'ccc_status', reportPage: 'ccc' },
  [PDPL_FRAMEWORK_ID]:    { short: 'PDPL', icon: Lock,     report: 'pdpl_status', reportPage: 'pdpl' },
}

const fwHref = (id, req) =>
  `/app/compliance/${encodeURIComponent(id)}${req ? `/${encodeURIComponent(req)}` : ''}`

const scoreTone = s => (s >= 75 ? 'var(--db-ok)' : s >= 50 ? 'var(--db-partial)' : 'var(--db-gap)')

const fmtDate = d => (d ? new Date(d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

// ── Data: the same hooks the framework page uses, for one framework ─────────
function useFrameworkData(id, active) {
  const fwId = active ? id : null
  const reqs = useScopedRequirements(fwId)
  const statuses = useComplianceStatuses(fwId)
  const maps = useFrameworkMappings(fwId)
  const auto = useRequirementAutomation(fwId)
  const findings = useRequirementFindings(fwId)
  const fw = getFramework(id)

  const model = useMemo(() => {
    if (!active || !reqs.requirements.length) return null
    const all = reqs.requirements
    const args = [statuses.statuses, maps.mappings, maps.controls, fw, auto.automation]
    const overall = computeFrameworkScore(all, ...args)

    // The rows that are scored: main controls (unless the framework scores all) and in scope.
    const inScope = r => !r._applicability || r._applicability === 'mandatory'
    const scored = (fw?.scoreAllControls ? all : all.filter(r => !isSubControl(r))).filter(inScope)

    const rows = scored.map(r => {
      const reqId = r.control_id || r.clause_id
      const override = statuses.statuses[reqId]?.status
      const ctlIds = maps.mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id)
      const mapped = maps.controls.filter(c => ctlIds.includes(c.id))
      const a = auto.automation[reqId]
      const f = findings.findings[reqId]
      return {
        id: reqId,
        text: r.control_text || r.clause_text || r.requirement_text || r.article_title || '',
        domainId: r.domain_id || '—',
        domainName: r.domain_name || r.domain_id || '—',
        status: computeEffectiveStatus(override, mapped, a),
        reviewOverdue: !!statuses.statuses[reqId]?.review_overdue,
        disagrees: isOverridingEvidence(override, a),
        recorded: override,
        measured: hasAutomatedResult(a) ? a.automated_status : null,
        openFindings: f?.open_count || 0,
        critical: f?.open_critical || 0,
        findingWarning: !!f?.needs_attention,
      }
    })

    const groups = {}
    for (const r of all) {
      const gid = r.domain_id || '—'
      ;(groups[gid] || (groups[gid] = { id: gid, name: r.domain_name || gid, reqs: [] })).reqs.push(r)
    }
    const domains = Object.values(groups)
      .map(g => ({ id: g.id, name: g.name, ...computeFrameworkScore(g.reqs, ...args) }))
      .filter(d => d.total > 0)
      .sort((a, b) => compareRequirementIds(String(a.id), String(b.id)))

    return {
      id, fw, overall, domains, rows,
      openFindings: rows.reduce((n, r) => n + r.openFindings, 0),
      critical: rows.reduce((n, r) => n + r.critical, 0),
      reviewOverdue: rows.filter(r => r.reviewOverdue).length,
      disagreements: rows.filter(r => r.disagrees),
      compliantWithFindings: rows.filter(r => r.status === 'compliant' && r.findingWarning),
    }
  }, [active, reqs.requirements, statuses.statuses, maps.mappings, maps.controls, auto.automation, findings.findings, fw, id])

  const loading = active && (reqs.loading || statuses.loading || maps.loading)
  const refresh = useCallback(async () => {
    await Promise.all([
      auto.refresh?.(), statuses.refetch?.(), maps.refetch?.(), findings.refetch?.(),
    ])
  }, [auto, statuses, maps, findings])

  return { id, active, model, loading, refresh, needsProfile: reqs.needsProfile }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function ComplianceDashboardPage() {
  const { organization } = useAuth()
  const perms = usePermissions()
  const cccOn = hasCccProfile(organization)
  const pdplOn = hasPdplProfile(organization)

  const ecc = useFrameworkData(PRIMARY_FRAMEWORK_ID, true)
  const ccc = useFrameworkData(CCC_FRAMEWORK_ID, cccOn)
  const pdpl = useFrameworkData(PDPL_FRAMEWORK_ID, pdplOn)
  const frameworks = [ecc, ccc, pdpl]
  const live = frameworks.filter(f => f.model)

  const reviews = useReviewSchedule()
  const { runs } = useReports()

  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    try { await Promise.all([...frameworks.filter(f => f.active).map(f => f.refresh()), reviews.refetch?.()]) }
    finally { setRefreshing(false) }
  }

  const loading = ecc.loading && !ecc.model

  return (
    <div>
      <div className="page-content db">
        <div className="db-hero">
          <div>
            <h1 className="db-title">{tx('Compliance dashboard')}</h1>
            <p className="db-meta">
              <span>{organization?.name}</span>
              <span className="db-meta-dot" />
              <span>{tx('{{n}} frameworks in scope', { n: frameworks.filter(f => f.active).length })}</span>
            </p>
          </div>
          <div className="db-actions">
            <Link to="/app/compliance/reviews" className="db-btn"><CalendarX size={14} /> {tx('Review calendar')}</Link>
            {perms.canGenerateReports && (
              <Link to="/app/reports/new" className="db-btn db-btn--primary"><FileText size={14} /> {tx('Generate report')}</Link>
            )}
            <button onClick={refresh} className="db-btn db-btn--icon" title={tx('Re-measure and refresh')} aria-label={tx('Re-measure and refresh')}>
              <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            <div className="db-grid db-rise">
              {frameworks.map(f => <FrameworkCard key={f.id} data={f} runs={runs} />)}
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '60ms' }}>
              <PostureByFramework live={live} />
              <ComplianceAttention live={live} reviews={reviews.rows} />
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '120ms' }}>
              <DomainBreakdown live={live} />
              <MeasuredVsAssessed live={live} />
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '180ms' }}>
              <GapsToClose live={live} />
              <Disagreements live={live} />
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '240ms' }}>
              <StatusReports frameworks={frameworks} runs={runs} canGenerate={perms.canGenerateReports} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Framework card ───────────────────────────────────────────────────────────
function FrameworkCard({ data, runs }) {
  const meta = FW_META[data.id]
  const fw = getFramework(data.id)
  const Icon = meta.icon

  if (!data.active) {
    return (
      <Panel title={fw?.name || data.id} icon={Icon} className="db-span-4" caption={tx('Not in scope yet')}>
        <div className="db-empty">
          <span className="db-empty-icon"><Settings2 size={18} strokeWidth={1.4} /></span>
          <p className="db-empty-title">{tx('Set the scope to start')}</p>
          <p className="db-empty-sub">
            {data.id === CCC_FRAMEWORK_ID
              ? tx('Choose your CCC role and data level in Settings → Organization.')
              : tx('Answer the PDPL scope questions in Settings → Organization.')}
          </p>
          <Link to="/app/settings?tab=organization" className="db-btn" style={{ marginBlockStart: 10 }}>{tx('Set scope')}</Link>
        </div>
      </Panel>
    )
  }

  const m = data.model
  if (!m) {
    return (
      <Panel title={fw?.name || data.id} icon={Icon} className="db-span-4">
        {data.loading ? <div className="db-skeleton" style={{ height: 160 }} />
          : <div className="db-empty"><p className="db-empty-title">{tx('Nothing in scope')}</p></div>}
      </Panel>
    )
  }

  const o = m.overall
  const applicable = o.total - o.na
  const gaps = o.notCompliant + o.notStarted
  const last = runs.find(r => r.report_type === meta.report && r.status !== 'failed')

  return (
    <Panel title={fw?.name || data.id} icon={Icon} caption={fw?.version || null}
      to={fwHref(data.id)} linkLabel={tx('Open')} className="db-span-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Ring value={o.score} size={84} thickness={4} color={scoreTone(o.score)}>
          <span className="chart-big tnum" style={{ fontSize: 20 }}>{applicable ? `${o.score}%` : 'N/A'}</span>
        </Ring>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="db-list-title">{tx('{{c}} of {{n}} compliant', { c: o.compliant, n: applicable })}</p>
          <p className="db-list-meta">
            {tx('{{p}} partial · {{i}} in progress', { p: o.partial, i: o.inProgress })}
          </p>
          <div style={{ marginBlockStart: 8 }}>
            <StackBar height={6} label={fw?.name} segments={segmentsFor(o)} />
          </div>
        </div>
      </div>
      <div className="db-tiles">
        <span className={gaps ? 'is-alert' : ''}><b className="tnum">{gaps}</b>{tx('gaps to close')}</span>
        <span className={m.critical ? 'is-alert' : ''}><b className="tnum">{m.openFindings}</b>{tx('open findings')}</span>
        <span className={m.reviewOverdue ? 'is-alert' : ''}><b className="tnum">{m.reviewOverdue}</b>{tx('reviews overdue')}</span>
      </div>
      <p className="db-footnote">
        {tx('{{n}} measured by connectors', { n: o.automatedWithResult })}
        {o.na > 0 && ` · ${tx('{{n}} not applicable', { n: o.na })}`}
        {' · '}
        {last
          ? <Link to={`/app/reports/${meta.reportPage}`} className="db-link" style={{ display: 'inline' }}>{tx('Last report {{d}}', { d: fmtDate(last.generated_at) })}</Link>
          : <Link to={`/app/reports/${meta.reportPage}`} className="db-link" style={{ display: 'inline' }}>{tx('No report yet')}</Link>}
      </p>
    </Panel>
  )
}

function segmentsFor(o) {
  return [
    { key: 'compliant', value: o.compliant },
    { key: 'partial', value: o.partial },
    { key: 'in_progress', value: o.inProgress },
    { key: 'not_compliant', value: o.notCompliant },
    { key: 'not_started', value: o.notStarted },
  ].map(s => ({ ...s, ...STATUS_TONE[s.key] }))
}

function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="db-empty">
      <span className="db-empty-icon"><Icon size={18} strokeWidth={1.4} /></span>
      <p className="db-empty-title">{title}</p>
      {children && <p className="db-empty-sub">{children}</p>}
    </div>
  )
}

// ── Posture by framework ─────────────────────────────────────────────────────
function PostureByFramework({ live }) {
  const keys = ['compliant', 'partial', 'in_progress', 'not_compliant', 'not_started']
  return (
    <Panel title={tx('Posture by framework')} icon={Gauge} className="db-span-8"
      caption={tx('scored requirements in scope')}>
      {live.length === 0 ? <Empty title={tx('No compliance data yet')} /> : (
        <>
          <ul className="db-domains">
            {live.map(f => {
              const o = f.model.overall
              const applicable = o.total - o.na
              return (
                <li key={f.id}>
                  <div className="db-domain-row">
                    <span className="db-domain-id">{FW_META[f.id].short}</span>
                    <Link to={fwHref(f.id)} className="db-domain-name">{f.model.fw?.name}</Link>
                    <span className="db-muted tnum" style={{ fontSize: 'var(--t-meta)' }}>
                      {tx('{{n}} in scope', { n: applicable })}
                    </span>
                    <span className="db-domain-score tnum" style={{ color: scoreTone(o.score), minWidth: 44, textAlign: 'end' }}>
                      {applicable ? `${o.score}%` : 'N/A'}
                    </span>
                  </div>
                  <StackBar height={10} label={f.model.fw?.name} segments={segmentsFor(o)} />
                </li>
              )
            })}
          </ul>
          <ul className="db-legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px 18px', marginBlockStart: 18 }}>
            {keys.map(k => (
              <li key={k} style={{ display: 'flex', gap: 7 }}>
                <span className="db-swatch" style={{ background: STATUS_TONE[k].color }} />
                <span className="db-legend-label">{STATUS_TONE[k].label}</span>
              </li>
            ))}
          </ul>
          <p className="db-footnote">{tx('Score = compliant + half of partial, over the applicable requirements — the same score as each framework page.')}</p>
        </>
      )}
    </Panel>
  )
}

// ── Needs attention (compliance only) ───────────────────────────────────────
function ComplianceAttention({ live, reviews }) {
  const items = []
  for (const f of live) {
    const short = FW_META[f.id].short
    const m = f.model
    const overdueReviews = reviews.filter(r => r.framework === f.id && r.state === 'overdue').length
    items.push(
      { key: `${f.id}-rev`, icon: CalendarX, tone: 'high', n: Math.max(overdueReviews, m.reviewOverdue), to: '/app/compliance/reviews',
        label: tx('{{fw}} reviews overdue', { fw: short }), hint: tx('compliant controls count as Partial') },
      { key: `${f.id}-cf`, icon: AlertTriangle, tone: 'critical', n: m.compliantWithFindings.length, to: fwHref(f.id),
        label: tx('{{fw}} compliant with open findings', { fw: short }), hint: tx('critical or warning findings are open') },
      { key: `${f.id}-dis`, icon: Scale, tone: 'medium', n: m.disagreements.length, to: fwHref(f.id),
        label: tx('{{fw}} recorded ≠ measured', { fw: short }), hint: tx('a recorded status contradicts the connectors') },
      { key: `${f.id}-nc`, icon: ClipboardList, tone: 'info', n: m.overall.notStarted, to: fwHref(f.id),
        label: tx('{{fw}} not started', { fw: short }), hint: tx('no status, control or measurement yet') },
    )
  }
  const active = items.filter(i => i.n > 0)
  const total = active.reduce((n, i) => n + i.n, 0)

  return (
    <Panel title={tx('Needs attention')} icon={Inbox} className="db-span-4"
      caption={total ? tx('{{n}} items', { n: total }) : null}>
      {active.length === 0 ? (
        <Empty icon={CircleCheck} title={tx('All clear')}>{tx('No overdue reviews, contradictions or unstarted requirements.')}</Empty>
      ) : (
        <ul className="db-attn">
          {active.map(i => {
            const Icon = i.icon
            return (
              <li key={i.key}>
                <Link to={i.to} className={`db-attn-row db-attn-${i.tone}`}>
                  <span className="db-attn-icon"><Icon size={14} strokeWidth={1.9} /></span>
                  <span className="db-attn-text">
                    <span className="db-attn-label">{i.label}</span>
                    <span className="db-attn-hint">{i.hint}</span>
                  </span>
                  <span className="db-attn-n tnum">{i.n}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ── Domain breakdown with framework tabs ────────────────────────────────────
function DomainBreakdown({ live }) {
  const [tab, setTab] = useState(null)
  const current = live.find(f => f.id === tab) || live[0]
  return (
    <Panel title={tx('By domain')} icon={ListChecks} className="db-span-8"
      to={current ? fwHref(current.id) : null}>
      {!current ? <Empty title={tx('No compliance data yet')} /> : (
        <>
          {live.length > 1 && (
            <div className="db-seg" role="tablist">
              {live.map(f => (
                <button key={f.id} role="tab" aria-selected={f.id === current.id}
                  className={f.id === current.id ? 'is-on' : ''} onClick={() => setTab(f.id)}>
                  {FW_META[f.id].short}
                </button>
              ))}
            </div>
          )}
          <ul className="db-domains">
            {current.model.domains.map(d => {
              const applicable = d.total - d.na
              return (
                <li key={d.id} title={tx('{{c}} compliant · {{p}} partial · {{g}} gaps', {
                  c: d.compliant, p: d.partial, g: d.notCompliant + d.notStarted,
                })}>
                  <div className="db-domain-row">
                    <span className="db-domain-id tnum">{d.id}</span>
                    <span className="db-domain-name">{d.name}</span>
                    <span className="db-muted tnum" style={{ fontSize: 'var(--t-meta)' }}>{d.compliant}/{applicable}</span>
                    <span className="db-domain-score tnum" style={{ color: scoreTone(d.score), minWidth: 44, textAlign: 'end' }}>
                      {applicable ? `${d.score}%` : 'N/A'}
                    </span>
                  </div>
                  <StackBar height={6} label={d.name} segments={segmentsFor(d)} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}

// ── Measured vs assessed ─────────────────────────────────────────────────────
function MeasuredVsAssessed({ live }) {
  return (
    <Panel title={tx('Measured vs assessed')} icon={Gauge} className="db-span-4"
      caption={tx('how much RISYS measures itself')}>
      {live.length === 0 ? <Empty title={tx('No compliance data yet')} /> : (
        <ul className="db-domains">
          {live.map(f => {
            const o = f.model.overall
            const applicable = Math.max(o.total - o.na, 0)
            const measured = o.automatedWithResult
            const pctMeasured = applicable ? Math.round((measured / applicable) * 100) : 0
            return (
              <li key={f.id}>
                <div className="db-domain-row">
                  <span className="db-domain-id">{FW_META[f.id].short}</span>
                  <span className="db-domain-name">
                    {tx('{{m}} measured · {{a}} assessed by people', { m: measured, a: Math.max(applicable - measured, 0) })}
                  </span>
                  <span className="db-domain-score tnum">{pctMeasured}%</span>
                </div>
                <Meter value={pctMeasured} color="var(--db-progress)" height={6} />
              </li>
            )
          })}
        </ul>
      )}
      <p className="db-footnote">{tx('Measured = a connector signal produced a result. Everything else rests on recorded statuses, mapped controls and evidence.')}</p>
    </Panel>
  )
}

// ── Gaps to close ────────────────────────────────────────────────────────────
const GAP_RANK = { not_compliant: 0, partial: 1, not_started: 2, in_progress: 3 }

function GapsToClose({ live }) {
  const rows = useMemo(() => {
    const out = []
    for (const f of live) {
      for (const r of f.model.rows) {
        if (r.status === 'compliant' || r.status === 'not_applicable') continue
        out.push({ ...r, fwId: f.id })
      }
    }
    return out.sort((a, b) =>
      (b.critical - a.critical)
      || ((GAP_RANK[a.status] ?? 9) - (GAP_RANK[b.status] ?? 9))
      || (b.openFindings - a.openFindings)
      || compareRequirementIds(a.id, b.id))
  }, [live])
  const shown = rows.slice(0, 12)

  return (
    <Panel title={tx('Gaps to close')} icon={AlertTriangle} className="db-span-8"
      caption={rows.length ? tx('{{n}} across frameworks', { n: rows.length }) : null}>
      {shown.length === 0 ? (
        <Empty icon={CircleCheck} title={tx('No gaps')}>{tx('Every scored requirement in scope is compliant.')}</Empty>
      ) : (
        <ul className="db-list">
          {shown.map(r => {
            const tone = STATUS_TONE[r.status] || STATUS_TONE.not_started
            return (
              <li key={`${r.fwId}-${r.id}`}>
                <Link to={fwHref(r.fwId, r.id)} className="db-list-row">
                  <span className="db-sev" style={{ background: tone.color }} />
                  <span className="db-list-main">
                    <span className="db-list-title">
                      <span className="tnum" style={{ whiteSpace: 'nowrap' }}>{FW_META[r.fwId].short} {r.id}</span>
                      {' · '}{r.text}
                    </span>
                    <span className="db-list-meta">
                      {tone.label}
                      {r.openFindings > 0 && ` · ${tx('{{n}} open findings', { n: r.openFindings })}`}
                      {r.critical > 0 && ` · ${tx('{{n}} critical', { n: r.critical })}`}
                      {` · ${r.domainName}`}
                    </span>
                  </span>
                  <ArrowUpRight size={13} className="rtl-flip db-muted" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > shown.length && (
        <p className="db-footnote">{tx('Showing the first {{n}}. Open a framework to see every gap.', { n: shown.length })}</p>
      )}
    </Panel>
  )
}

// ── Recorded vs measured ────────────────────────────────────────────────────
function Disagreements({ live }) {
  const rows = live.flatMap(f => f.model.disagreements.map(r => ({ ...r, fwId: f.id })))
  return (
    <Panel title={tx('Recorded vs measured')} icon={Scale} className="db-span-4"
      caption={rows.length ? tx('{{n}} items', { n: rows.length }) : null}>
      {rows.length === 0 ? (
        <Empty icon={CircleCheck} title={tx('No contradictions')}>{tx('Where connectors measure a requirement, the recorded status agrees.')}</Empty>
      ) : (
        <ul className="db-list">
          {rows.slice(0, 8).map(r => (
            <li key={`${r.fwId}-${r.id}`}>
              <Link to={fwHref(r.fwId, r.id)} className="db-list-row">
                <span className="db-list-main">
                  <span className="db-list-title tnum">{FW_META[r.fwId].short} {r.id}</span>
                  <span className="db-list-meta">
                    {tx('Recorded {{r}} · measured {{m}}', {
                      r: STATUS_TONE[r.recorded]?.label || r.recorded,
                      m: STATUS_TONE[r.measured]?.label || r.measured,
                    })}
                  </span>
                </span>
                <ArrowUpRight size={13} className="rtl-flip db-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="db-footnote">{tx('An auditor will ask about each of these. Record the justification on the requirement.')}</p>
    </Panel>
  )
}

// ── Status reports ──────────────────────────────────────────────────────────
function StatusReports({ frameworks, runs, canGenerate }) {
  return (
    <Panel title={tx('Status reports')} icon={FileText} to="/app/reports" className="db-span-12"
      caption={tx('archived with SHA-256')}>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              <th>{tx('Framework')}</th>
              <th>{tx('Last generated')}</th>
              <th>{tx('By')}</th>
              <th className="db-num">{tx('Reports')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {frameworks.map(f => {
              const meta = FW_META[f.id]
              const mine = runs.filter(r => r.report_type === meta.report && r.status !== 'failed')
              const last = mine[0]
              return (
                <tr key={f.id}>
                  <td>
                    <Link to={`/app/reports/${meta.reportPage}`} className="db-eng">
                      <span>{getFramework(f.id)?.name || f.id}</span>
                    </Link>
                  </td>
                  <td className="db-muted">{last ? fmtDate(last.generated_at) : tx('Never')}</td>
                  <td className="db-muted">{last?.generator?.full_name || (last ? '—' : '')}</td>
                  <td className="db-num tnum">{mine.length}</td>
                  <td className="db-num">
                    {!f.active ? (
                      <span className="db-muted">{tx('Set the scope first')}</span>
                    ) : canGenerate ? (
                      <Link to={`/app/reports/new?type=${meta.report}`} className="db-btn" style={{ display: 'inline-flex' }}>
                        {tx('Generate')}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
