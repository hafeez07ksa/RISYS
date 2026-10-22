import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight, ShieldAlert, ShieldCheck, AlertTriangle, CheckSquare2, Clock,
  CalendarClock, CalendarX, FileWarning, Inbox, Sparkles, ClipboardList, Plug,
  Fingerprint, Crown, Users, UserPlus, Activity, BookCheck, ChevronRight, CircleCheck,
  FileText, Radar,
} from 'lucide-react'
import { tx, appLocale } from '@/lib/i18n'
import { BAND_ORDER, bandMeta, bandFor } from '@/lib/matrix'
import { AUDIT_TYPES, labelOf } from '@/hooks/useAudits'
import { StageBadge } from '@/features/audits/parts'
import { Donut, Ring, StackBar, Meter } from '@/components/ui/charts'
import { coordinates } from './useDashboardData'

/* ── Palette ──────────────────────────────────────────────────────────────────
 * Risk bands use BAND_META so a "High" here is the same colour as a "High" in
 * the register. Compliance and severity use the softer chart tones declared
 * in dashboard.css, which sit next to each other without shouting.
 * -------------------------------------------------------------------------- */
export const STATUS_TONE = {
  compliant:      { color: 'var(--db-ok)',       label: tx('Compliant') },
  partial:        { color: 'var(--db-partial)',  label: tx('Partial') },
  in_progress:    { color: 'var(--db-progress)', label: tx('In Progress') },
  not_compliant:  { color: 'var(--db-gap)',      label: tx('Non-Compliant') },
  not_started:    { color: 'var(--db-none)',     label: tx('Not Started') },
}

const FINDING_TONE = {
  critical: { color: 'var(--db-gap)',      label: tx('Critical') },
  warning:  { color: 'var(--db-partial)',  label: tx('Warning') },
  info:     { color: 'var(--db-progress)', label: tx('Info') },
}

const INCIDENT_TONE = {
  critical:      { color: '#8C1616',          label: tx('Critical') },
  high:          { color: '#B5491B',          label: tx('High') },
  medium:        { color: 'var(--db-partial)', label: tx('Medium') },
  low:           { color: 'var(--db-ok)',      label: tx('Low') },
  informational: { color: 'var(--db-progress)', label: tx('Informational') },
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)

function relTime(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: 'auto', style: 'narrow' })
  if (s < 60) return tx('just now')
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour')
  return rtf.format(-Math.floor(s / 86400), 'day')
}

/** "2d 4h", "3h 12m", "45m" — for SLA countdowns. */
function span(ms) {
  const m = Math.floor(Math.abs(ms) / 60000)
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  if (d > 0) return `${tx('{{n}}d', { n: d })} ${tx('{{n}}h', { n: h })}`
  if (h > 0) return `${tx('{{n}}h', { n: h })} ${tx('{{n}}m', { n: mm })}`
  return tx('{{n}}m', { n: mm })
}

const risksLabel = n => (n === 1 ? tx('1 risk') : tx('{{n}} risks', { n }))

const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) =>
  d ? new Date(d).toLocaleDateString(appLocale(), opts) : '—'

// ── Shell ─────────────────────────────────────────────────────────────────────
export function Panel({ title, icon: Icon, to, linkLabel, caption, className = '', children, bodyClass = '' }) {
  return (
    <section className={`db-panel ${className}`}>
      <header className="db-panel-head">
        <div className="db-panel-title">
          {Icon && <span className="db-panel-icon"><Icon size={14} strokeWidth={1.8} /></span>}
          <h3>{title}</h3>
          {caption && <span className="db-panel-caption">{caption}</span>}
        </div>
        {to && (
          <Link to={to} className="db-link">
            {linkLabel || tx('View all')} <ArrowUpRight size={12} className="rtl-flip" />
          </Link>
        )}
      </header>
      <div className={`db-panel-body ${bodyClass}`}>{children}</div>
    </section>
  )
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

function Legend({ rows, total }) {
  return (
    <ul className="db-legend">
      {rows.map(r => (
        <li key={r.key}>
          <span className="db-swatch" style={{ background: r.color }} />
          <span className="db-legend-label">{r.label}</span>
          <span className="db-legend-value tnum">{r.value}</span>
          {total !== undefined && <span className="db-legend-pct tnum">{pct(r.value, total)}%</span>}
        </li>
      ))}
    </ul>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────────
function Kpi({ to, icon: Icon, tone = 'wine', label, value, unit, sub, subTone, chip, alert, children }) {
  return (
    <Link to={to} className={`db-kpi${alert ? ' db-kpi--alert' : ''}`}>
      <div className="db-kpi-top">
        <span className={`db-kpi-icon db-tone-${tone}`}><Icon size={17} strokeWidth={1.8} /></span>
        <span className="db-kpi-label">{label}</span>
        {chip && <span className="db-chip tnum">{chip}</span>}
      </div>
      <div className="db-kpi-value tnum">
        {value}{unit && <span className="db-kpi-unit">{unit}</span>}
      </div>
      <p className={`db-kpi-sub${subTone ? ` db-text-${subTone}` : ''}`}>{sub}</p>
      <div className="db-kpi-foot">{children}</div>
    </Link>
  )
}

export function KpiRow({ ecc, model }) {
  const { risks, incidents, findings } = model
  const o = ecc?.overall
  const applicable = o ? o.total - o.na : 0
  const score = o?.score ?? null
  const scoreTone = score === null ? 'var(--db-none)' : score >= 75 ? 'var(--db-ok)' : score >= 50 ? 'var(--db-partial)' : 'var(--db-gap)'

  const bandSegs = BAND_ORDER.slice().reverse().map(b => ({
    key: b, value: risks.bands[b], color: bandMeta(b).color, label: bandMeta(b).label,
  }))
  const findingSegs = ['critical', 'warning', 'info'].map(k => ({
    key: k, value: findings[k], color: FINDING_TONE[k].color, label: FINDING_TONE[k].label,
  }))
  const incSegs = Object.keys(INCIDENT_TONE).map(k => ({
    key: k, value: incidents.severity[k] || 0, color: INCIDENT_TONE[k].color, label: INCIDENT_TONE[k].label,
  }))

  const findingsVisible = findings.readable && findings.connected

  return (
    <div className="db-kpis">
      <Kpi to="/app/compliance/NCA%20ECC" icon={BookCheck} tone="green"
        label={tx('ECC compliance')}
        value={score === null ? '—' : score} unit={score === null ? null : '%'}
        sub={o ? tx('{{c}} of {{n}} main controls compliant', { c: o.compliant, n: applicable }) : tx('Loading framework…')}
        chip={o && o.automatedWithResult > 0 ? tx('{{n}} measured', { n: o.automatedWithResult }) : null}>
        <Meter value={score || 0} color={scoreTone} />
      </Kpi>

      <Kpi to="/app/risks" icon={ShieldAlert} tone="wine"
        label={tx('Open risks')} value={risks.open.length}
        alert={risks.outside > 0}
        sub={risks.outside > 0 ? tx('{{n}} outside tolerance', { n: risks.outside }) : tx('None outside tolerance')}
        subTone={risks.outside > 0 ? 'critical' : 'ok'}
        chip={risks.newRisks30 > 0 ? tx('+{{n}} in 30 days', { n: risks.newRisks30 }) : null}>
        <StackBar segments={bandSegs} label={tx('Open risks by band')} />
      </Kpi>

      <Kpi to="/app/findings" icon={Radar} tone="amber"
        label={tx('Open findings')}
        value={findingsVisible ? findings.total : '—'}
        alert={findingsVisible && findings.critical > 0}
        sub={!findings.readable ? tx('Not visible to your role')
          : !findings.loaded ? tx('Reading connected platforms…')
          : !findings.connected ? tx('No platform connected yet')
          : tx('{{c}} critical · {{w}} warning', { c: findings.critical, w: findings.warning })}
        subTone={findingsVisible && findings.critical > 0 ? 'critical' : null}>
        {findingsVisible ? <StackBar segments={findingSegs} label={tx('Open findings by severity')} /> : <div className="chart-stack" />}
      </Kpi>

      <Kpi to="/app/incidents" icon={AlertTriangle} tone="blue"
        label={tx('Open incidents')} value={incidents.open.length}
        alert={incidents.breached.length > 0}
        sub={incidents.breached.length > 0 ? tx('{{n}} past SLA', { n: incidents.breached.length })
          : incidents.open.length ? tx('All within SLA') : tx('Nothing open')}
        subTone={incidents.breached.length > 0 ? 'critical' : 'ok'}>
        <StackBar segments={incSegs} label={tx('Open incidents by severity')} />
      </Kpi>
    </div>
  )
}

// ── Compliance posture (ECC) ─────────────────────────────────────────────────
export function CompliancePosture({ ecc, loading }) {
  const o = ecc?.overall
  if (!o) {
    return (
      <Panel title={tx('Compliance posture')} icon={BookCheck} className="db-span-4">
        {loading ? <div className="db-skeleton" style={{ height: 160 }} /> : <Empty title={tx('No compliance data yet')} />}
      </Panel>
    )
  }
  const applicable = o.total - o.na
  const rows = [
    { key: 'compliant', value: o.compliant },
    { key: 'partial', value: o.partial },
    { key: 'in_progress', value: o.inProgress },
    { key: 'not_compliant', value: o.notCompliant },
    { key: 'not_started', value: o.notStarted },
  ].map(r => ({ ...r, ...STATUS_TONE[r.key] }))

  return (
    <Panel title={tx('Compliance posture')} icon={BookCheck} caption="NCA ECC-2:2024"
      to="/app/compliance/NCA%20ECC" linkLabel={tx('View details')} className="db-span-4">
      <div className="db-posture">
        <Donut segments={rows} label={tx('ECC status of main controls')}>
          <span className="chart-big tnum">{o.score}%</span>
          <span className="chart-small">{tx('overall posture')}</span>
        </Donut>
        <Legend rows={rows} total={applicable} />
      </div>
      <div className="db-tiles">
        <span><b className="tnum">{o.automatedWithResult}</b>{tx('measured by connectors')}</span>
        <span><b className="tnum">{Math.max(applicable - o.automatedWithResult, 0)}</b>{tx('assessed manually')}</span>
        <span className={o.notCompliant + o.notStarted ? 'is-alert' : ''}><b className="tnum">{o.notCompliant + o.notStarted}</b>{tx('gaps to close')}</span>
      </div>
      <p className="db-footnote">
        {tx('{{n}} applicable main controls', { n: applicable })}
        {o.na > 0 && ` · ${tx('{{n}} not applicable', { n: o.na })}`}
      </p>
    </Panel>
  )
}

// ── ECC by domain ────────────────────────────────────────────────────────────
export function EccDomains({ ecc, reviews }) {
  const domains = ecc?.domains || []
  return (
    <Panel title={tx('ECC by domain')} icon={ClipboardList} to="/app/compliance/NCA%20ECC" className="db-span-4">
      {domains.length === 0 ? <div className="db-skeleton" style={{ height: 160 }} /> : (
        <ul className="db-domains">
          {domains.map(d => {
            const tone = d.score >= 75 ? 'var(--db-ok)' : d.score >= 50 ? 'var(--db-partial)' : 'var(--db-gap)'
            const applicable = d.total - d.na
            return (
              <li key={d.id} title={tx('{{c}} compliant · {{p}} partial · {{g}} gaps', {
                c: d.compliant, p: d.partial, g: d.notCompliant + d.notStarted,
              })}>
                <div className="db-domain-row">
                  <span className="db-domain-id tnum">{d.id}</span>
                  <span className="db-domain-name">{d.name}</span>
                  <span className="db-domain-score tnum" style={{ color: tone }}>{applicable ? `${d.score}%` : 'N/A'}</span>
                </div>
                <StackBar height={6} label={d.name} segments={[
                  { key: 'c', value: d.compliant, color: 'var(--db-ok)', label: tx('Compliant') },
                  { key: 'p', value: d.partial, color: 'var(--db-partial)', label: tx('Partial') },
                  { key: 'i', value: d.inProgress, color: 'var(--db-progress)', label: tx('In Progress') },
                  { key: 'n', value: d.notCompliant, color: 'var(--db-gap)', label: tx('Non-Compliant') },
                  { key: 's', value: d.notStarted, color: 'var(--db-none)', label: tx('Not Started') },
                ]} />
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/app/compliance/reviews" className={`db-review-line${reviews.overdue ? ' is-alert' : ''}`}>
        <CalendarClock size={14} />
        <span className="db-review-title">{tx('Review calendar')}</span>
        <span className="db-review-text tnum">
          {reviews.overdue > 0 || reviews.dueSoon > 0
            ? [reviews.overdue > 0 && tx('{{n}} overdue', { n: reviews.overdue }),
               reviews.dueSoon > 0 && tx('{{n}} due in 30 days', { n: reviews.dueSoon })].filter(Boolean).join(' · ')
            : reviews.total > 0 ? tx('All reviews on schedule') : tx('No reviews scheduled')}
        </span>
        <ChevronRight size={13} className="rtl-flip" />
      </Link>
    </Panel>
  )
}

// ── Needs attention ──────────────────────────────────────────────────────────
export function NeedsAttention({ model, reviews }) {
  const { risks, incidents, tasks, audits, suggestions, findings } = model
  const items = [
    { key: 'outside', icon: ShieldAlert, tone: 'critical', n: risks.outside, to: '/app/risks',
      label: tx('Risks outside tolerance'), hint: tx('treatment is mandatory') },
    { key: 'sla', icon: AlertTriangle, tone: 'critical', n: incidents.breached.length, to: '/app/incidents',
      label: tx('Incidents past SLA'), hint: tx('response time exceeded') },
    { key: 'treat', icon: Clock, tone: 'critical', n: risks.treatmentOverdue, to: '/app/risks',
      label: tx('Treatment plans overdue'), hint: tx('past the SLA the gate started') },
    { key: 'tasks', icon: CheckSquare2, tone: 'high', n: tasks.overdue.length, to: '/app/tasks',
      label: tx('Overdue tasks'), hint: tx('past their due date') },
    { key: 'reviews', icon: CalendarX, tone: 'high', n: reviews.overdue, to: '/app/compliance/reviews',
      label: tx('Control reviews overdue'), hint: tx('ECC periodic reviews') },
    { key: 'riskrev', icon: CalendarClock, tone: 'medium', n: risks.reviewOverdue, to: '/app/risks',
      label: tx('Risk reviews overdue'), hint: tx('needs recertification') },
    { key: 'audit', icon: FileText, tone: 'medium', n: audits.overdueFindings, to: '/app/audits',
      label: tx('Audit findings overdue'), hint: tx('remediation past due date') },
    findings.readable && { key: 'sugg', icon: Sparkles, tone: 'info', n: suggestions.length, to: '/app/risks/suggestions',
      label: tx('Suggested risks to decide'), hint: tx('drafted from connector evidence') },
  ].filter(Boolean)
  const active = items.filter(i => i.n > 0)
  const total = active.reduce((n, i) => n + i.n, 0)

  return (
    <Panel title={tx('Needs attention')} icon={Inbox} className="db-span-4"
      caption={total ? tx('{{n}} items', { n: total }) : null}>
      {active.length === 0 ? (
        <Empty icon={CircleCheck} title={tx('All clear')}>{tx('Nothing is overdue or outside tolerance.')}</Empty>
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

// ── Risk heat map ────────────────────────────────────────────────────────────
export function RiskHeatMap({ risks, matrix }) {
  const [basis, setBasis] = useState('current')
  const dims = matrix?.dimensions || 5
  const grid = {}
  let placed = 0
  for (const r of risks.open) {
    const c = coordinates(r, basis)
    if (!c) continue
    const k = `${c.l}:${c.i}`
    grid[k] = (grid[k] || 0) + 1
    placed++
  }
  const max = Math.max(1, ...Object.values(grid))
  const L = matrix?.likelihood_scale || []
  const I = matrix?.impact_scale || []
  const rows = Array.from({ length: dims }, (_, k) => dims - k)
  const cols = Array.from({ length: dims }, (_, k) => k + 1)

  return (
    <Panel title={tx('Risk heat map')} icon={Activity} to="/app/risks" className="db-span-5"
      caption={tx('{{n}} placed', { n: placed })}>
      <div className="db-seg" role="tablist" aria-label={tx('Score basis')}>
        {[['inherent', tx('Before controls')], ['current', tx('Current')]].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={basis === v} className={basis === v ? 'is-on' : ''}
            onClick={() => setBasis(v)}>{l}</button>
        ))}
      </div>
      <div className="db-heat">
        <span className="db-heat-y">{tx('Likelihood')}</span>
        <div className="db-heat-grid" style={{ gridTemplateColumns: `20px repeat(${dims}, 1fr)` }}>
          {rows.map(l => (
            <Row key={l} l={l} cols={cols} grid={grid} max={max} matrix={matrix}
              lLabel={L.find(s => s.value === l)?.label} iLabels={I} />
          ))}
          <span />
          {cols.map(i => (
            <span key={i} className="db-heat-axis tnum" title={I.find(s => s.value === i)?.label}>{i}</span>
          ))}
        </div>
        <span className="db-heat-x">{tx('Impact')}</span>
      </div>
      <div className="db-heat-key">
        {BAND_ORDER.map(b => (
          <span key={b}><i style={{ background: bandMeta(b).color }} />{bandMeta(b).label}</span>
        ))}
      </div>
    </Panel>
  )
}

function Row({ l, cols, grid, max, matrix, lLabel, iLabels }) {
  return (
    <>
      <span className="db-heat-axis tnum" title={lLabel}>{l}</span>
      {cols.map(i => {
        const n = grid[`${l}:${i}`] || 0
        const meta = bandMeta(bandFor(l, i, matrix))
        const strength = n ? Math.round(55 + 45 * (n / max)) : 0
        return (
          <Link to="/app/risks" key={i}
            className={`db-heat-cell${n ? ' has' : ''}`}
            style={n
              ? { background: `color-mix(in srgb, ${meta.color} ${strength}%, #ffffff)`, color: '#fff' }
              : { background: meta.bg, color: meta.color }}
            title={`${tx('Likelihood')} ${l}${lLabel ? ` (${lLabel})` : ''} × ${tx('Impact')} ${i}${
              iLabels.find(s => s.value === i)?.label ? ` (${iLabels.find(s => s.value === i).label})` : ''} · ${meta.label} · ${risksLabel(n)}`}>
            {n > 0 && <span className="tnum">{n}</span>}
          </Link>
        )
      })}
    </>
  )
}

// ── Risks by band, before and after controls ─────────────────────────────────
export function RiskBands({ risks }) {
  const order = BAND_ORDER.slice().reverse()
  const segs = order.map(b => ({ key: b, value: risks.bands[b], color: bandMeta(b).color, label: bandMeta(b).label }))
  const total = risks.open.length
  const maxBand = Math.max(1, ...order.map(b => Math.max(risks.bands[b], risks.inherentBands[b])))

  return (
    <Panel title={tx('Risks by band')} icon={ShieldCheck} to="/app/risks" className="db-span-3">
      {total === 0 ? <Empty icon={ShieldCheck} title={tx('No open risks')} /> : (
        <>
          <div className="db-bands-top">
            <Donut segments={segs} size={118} thickness={4.2} label={tx('Open risks by band')}>
              <span className="chart-big tnum">{total}</span>
              <span className="chart-small">{tx('open risks')}</span>
            </Donut>
          </div>
          <div className="db-compare" title={tx('Now = residual where scored, otherwise inherent')}>
            <div className="db-compare-head">
              <span />
              <span>{tx('Before controls')}</span>
              <span>{tx('Now')}</span>
            </div>
            {order.map(b => {
              const meta = bandMeta(b)
              const before = risks.inherentBands[b], now = risks.bands[b]
              return (
                <div key={b} className="db-compare-row">
                  <span className="db-compare-band"><i style={{ background: meta.color }} />{meta.label}</span>
                  <span className="db-compare-bar is-before" title={`${tx('Before controls')}: ${before}`}>
                    <b style={{ width: `${(before / maxBand) * 100}%`, background: meta.color }} />
                    <em className="tnum">{before}</em>
                  </span>
                  <span className="db-compare-bar" title={`${tx('Now')}: ${now}`}>
                    <b style={{ width: `${(now / maxBand) * 100}%`, background: meta.color }} />
                    <em className="tnum">{now}</em>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="db-footnote">{tx('Now = residual where scored, otherwise inherent')}</p>
        </>
      )}
    </Panel>
  )
}

// ── Top risk areas ───────────────────────────────────────────────────────────
export function RiskAreas({ risks }) {
  const areas = risks.areas.slice(0, 6)
  const max = Math.max(1, ...areas.map(a => a.count))
  return (
    <Panel title={tx('Top risk areas')} icon={ShieldAlert} to="/app/risks" className="db-span-4">
      {areas.length === 0 ? <Empty icon={ShieldCheck} title={tx('No open risks')} /> : (
        <ol className="db-areas">
          {areas.map((a, idx) => {
            const meta = bandMeta(a.worst)
            return (
              <li key={a.category}>
                <span className="db-area-rank tnum">{idx + 1}</span>
                <div className="db-area-main">
                  <div className="db-area-line">
                    <span className="db-area-name">{tx(a.category)}</span>
                    <span className="db-pill" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>{meta.label}</span>
                  </div>
                  <div className="db-area-bar">
                    <span style={{ width: `${(a.count / max) * 100}%`, background: meta.color }} />
                  </div>
                  {a.top && (
                    <Link to={`/app/risks/${a.top.id}`} className="db-area-top">{a.top.risk_id ? `${a.top.risk_id} · ` : ''}{a.top.title}</Link>
                  )}
                </div>
                <span className="db-area-count tnum">{risksLabel(a.count)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

// ── Incidents & SLA ──────────────────────────────────────────────────────────
export function IncidentsPanel({ incidents }) {
  const list = incidents.open.slice().sort((a, b) => a.sla.diff - b.sla.diff).slice(0, 5)
  return (
    <Panel title={tx('Incidents & SLA')} icon={AlertTriangle} to="/app/incidents" className="db-span-4">
      {list.length === 0 ? (
        <Empty icon={CircleCheck} title={tx('No open incidents')}>{incidents.total ? tx('Everything raised so far is resolved.') : null}</Empty>
      ) : (
        <ul className="db-list">
          {list.map(i => {
            const tone = INCIDENT_TONE[i.severity] || INCIDENT_TONE.medium
            const late = i.sla.status === 'breached'
            const tight = i.sla.status === 'critical' || i.sla.status === 'warning'
            return (
              <li key={i.id}>
                <Link to={`/app/incidents/${i.id}`} className="db-list-row">
                  <span className="db-sev" style={{ background: tone.color }} title={tone.label} />
                  <span className="db-list-main">
                    <span className="db-list-title">{i.title}</span>
                    <span className="db-list-meta">{tone.label}{i.external_id ? ` · ${i.external_id}` : ''} · {relTime(i.created_at)}</span>
                  </span>
                  <span className={`db-sla tnum${late ? ' is-late' : tight ? ' is-tight' : ''}`}>
                    {late ? tx('{{t}} over', { t: span(i.sla.diff) }) : tx('{{t}} left', { t: span(i.sla.diff) })}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ── Tasks ────────────────────────────────────────────────────────────────────
export function TasksPanel({ tasks }) {
  const now = Date.now()
  const list = tasks.open.slice().sort((a, b) => {
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity
    const dbb = b.due_at ? new Date(b.due_at).getTime() : Infinity
    return da - dbb
  }).slice(0, 5)

  return (
    <Panel title={tx('Upcoming work')} icon={CheckSquare2} to="/app/tasks" className="db-span-4">
      <div className="db-taskstats">
        <span className={tasks.overdue.length ? 'is-alert' : ''}><b className="tnum">{tasks.overdue.length}</b>{tx('overdue')}</span>
        <span><b className="tnum">{tasks.dueSoon.length}</b>{tx('due in 7 days')}</span>
        <span><b className="tnum">{tasks.mine.length}</b>{tx('assigned to you')}</span>
      </div>
      {list.length === 0 ? <Empty icon={CircleCheck} title={tx('No open tasks')} /> : (
        <ul className="db-list">
          {list.map(t => {
            const due = t.due_at ? new Date(t.due_at).getTime() : null
            const late = due !== null && due < now
            return (
              <li key={t.id}>
                <Link to={`/app/tasks/${t.id}`} className="db-list-row">
                  <span className={`db-check${t.status === 'in_progress' ? ' is-doing' : ''}`} />
                  <span className="db-list-main">
                    <span className="db-list-title">{t.title}</span>
                    <span className="db-list-meta">{t.status === 'in_progress' ? tx('In Progress') : tx('To Do')}</span>
                  </span>
                  <span className={`db-due tnum${late ? ' is-late' : ''}`}>
                    {due === null ? tx('No due date') : late ? tx('Overdue · {{d}}', { d: fmtDate(t.due_at) }) : fmtDate(t.due_at)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ── Recent activity ──────────────────────────────────────────────────────────
const ACTIVITY = {
  risk:      { icon: ShieldAlert,  tone: 'wine' },
  incident:  { icon: AlertTriangle, tone: 'blue' },
  task:      { icon: CheckSquare2, tone: 'green' },
  finding:   { icon: FileWarning,  tone: 'amber' },
  connector: { icon: Plug,         tone: 'blue' },
  member:    { icon: UserPlus,     tone: 'wine' },
}

const ACTION_LABELS = {
  'risk.created': tx('Risk created'),
  'risk.submitted_for_review': tx('Risk submitted for review'),
  'risk.approved': tx('Risk approved'),
  'risk.rejected': tx('Risk rejected'),
  'incident.created': tx('Incident raised'),
  'incident.resolved': tx('Incident resolved'),
  'incident.status_changed': tx('Incident updated'),
  'task.created': tx('Task created'),
  'task.completed': tx('Task completed'),
  'task.status_changed': tx('Task status changed'),
  'finding.escalated_to_risk': tx('Finding → Risk'),
  'finding.escalated_to_incident': tx('Finding → Incident'),
  'connector.connected': tx('Connector connected'),
  'connector.synced': tx('Sync completed'),
  'member.invited': tx('Member invited'),
}

export function ActivityPanel({ log }) {
  return (
    <Panel title={tx('Recent activity')} icon={Activity} to="/app/audit" className="db-span-4">
      {log.length === 0 ? <Empty title={tx('No activity yet')} /> : (
        <ul className="db-timeline">
          {log.map(item => {
            const kind = String(item.action || '').split('.')[0]
            const a = ACTIVITY[kind] || { icon: Activity, tone: 'neutral' }
            const Icon = a.icon
            return (
              <li key={item.id}>
                <span className={`db-tl-icon db-tone-${a.tone}`}><Icon size={13} strokeWidth={1.9} /></span>
                <span className="db-tl-main">
                  <span className="db-tl-title">{ACTION_LABELS[item.action] || item.action}</span>
                  <span className="db-tl-sub">{item.entity_title || '—'}</span>
                  <span className="db-tl-meta">{item.actor_name || tx('System')} · {relTime(item.created_at)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ── Audit engagements ────────────────────────────────────────────────────────
export function AuditsPanel({ audits, canManage, wide = false }) {
  const rows = audits.engagements.slice(0, 5)
  return (
    <Panel title={tx('Audit engagements')} icon={ClipboardList} to="/app/audits" className={wide ? 'db-span-12' : 'db-span-8'}
      caption={audits.active ? tx('{{n}} active', { n: audits.active }) : null}>
      {rows.length === 0 ? (
        <Empty icon={ClipboardList} title={tx('No audit engagements yet')}>
          {canManage ? <Link to="/app/audits/new" className="db-link">{tx('Plan an engagement')}</Link> : null}
        </Empty>
      ) : (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                <th>{tx('Engagement')}</th>
                <th>{tx('Type')}</th>
                <th>{tx('Framework')}</th>
                <th>{tx('Stage')}</th>
                <th className="db-num">{tx('Open findings')}</th>
                <th>{tx('Planned end')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/app/audits/${e.id}`} className="db-eng">
                      {e.ref && <span className="db-ref">{e.ref}</span>}
                      <span>{e.title}</span>
                    </Link>
                  </td>
                  <td className="db-muted">{labelOf(AUDIT_TYPES, e.audit_type)}</td>
                  <td className="db-muted">{e.framework || '—'}</td>
                  <td><StageBadge v={e.status} /></td>
                  <td className="db-num tnum">
                    <span className={e.activeFindings ? 'db-count is-on' : 'db-count'}>{e.activeFindings}</span>
                  </td>
                  <td className="db-muted tnum">{e.status === 'closed' ? fmtDate(e.closed_at) : fmtDate(e.planned_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ── Platforms & identity ─────────────────────────────────────────────────────
export function PlatformsPanel({ findings, identity, canManage }) {
  const mfa = pct(identity.withMfa, identity.total)
  const mfaTone = mfa >= 90 ? 'var(--db-ok)' : mfa >= 60 ? 'var(--db-partial)' : 'var(--db-gap)'

  return (
    <Panel title={tx('Connected platforms')} icon={Plug} to={findings.readable ? '/app/findings' : null} className="db-span-4">
      {identity.connected ? (() => {
        const body = (
          <>
            <Ring value={mfa} size={64} color={mfaTone}>
            <span className="chart-ring-text tnum">{mfa}%</span>
          </Ring>
          <div className="db-identity-main">
            <span className="db-identity-title"><Fingerprint size={13} /> {tx('MFA coverage')}</span>
            <span className="db-identity-sub tnum">{tx('{{a}} of {{b}} enabled users', { a: identity.withMfa, b: identity.total })}</span>
            <span className="db-identity-facts">
              <span title={tx('Global Admin or directory role assigned')}><Crown size={12} /> <b className="tnum">{identity.privileged}</b> {tx('privileged')}</span>
              <span title={tx('External / third-party access')}><Users size={12} /> <b className="tnum">{identity.guests}</b> {tx('guests')}</span>
            </span>
          </div>
          </>
        )
        return findings.readable
          ? <Link to="/app/findings/entra" className="db-identity">{body}</Link>
          : <div className="db-identity">{body}</div>
      })() : (
        <div className="db-identity is-off">
          <Fingerprint size={18} strokeWidth={1.4} />
          <span>{tx('Entra ID not connected')}</span>
          {canManage && <Link to="/app/settings" className="db-link">{tx('Connect')}</Link>}
        </div>
      )}

      {findings.readable && findings.providers.length > 0 && (
        <ul className="db-providers">
          {findings.providers.map(p => (
            <li key={p.id}>
              <Link to={`/app/findings/${p.id}`} className="db-provider">
                <span className="db-provider-dot" style={{ background: p.accent }}>{p.name.slice(0, 1)}</span>
                <span className="db-provider-name">{p.name}</span>
                <span className="db-provider-bar">
                  {p.total > 0 ? (
                    <StackBar height={6} label={p.name} segments={['critical', 'warning', 'info'].map(k => ({
                      key: k, value: p[k], color: FINDING_TONE[k].color, label: FINDING_TONE[k].label,
                    }))} />
                  ) : <span className="db-clean">{tx('No findings')}</span>}
                </span>
                <span className="db-provider-n tnum">{p.total}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ── Highlight card ───────────────────────────────────────────────────────────
export function Highlight({ suggestions, canReadFindings, canReports }) {
  if (canReadFindings && suggestions.length > 0) {
    const critical = suggestions.filter(s => s.critical_findings > 0).length
    return (
      <div className="db-highlight">
        <span className="db-highlight-icon"><Sparkles size={18} /></span>
        <p className="db-highlight-eyebrow">{tx('Risk identification')}</p>
        <p className="db-highlight-title">
          {tx('RISYS drafted {{n}} risks from your connected systems', { n: suggestions.length })}
        </p>
        <p className="db-highlight-sub">
          {critical > 0
            ? tx('{{n}} rest on critical findings. Approve, edit or dismiss each one.', { n: critical })
            : tx('Each is written and scored from evidence. Approve, edit or dismiss each one.')}
        </p>
        <Link to="/app/risks/suggestions" className="db-highlight-btn">{tx('Review suggestions')} <ArrowUpRight size={13} className="rtl-flip" /></Link>
      </div>
    )
  }
  return (
    <div className="db-highlight">
      <span className="db-highlight-icon"><FileText size={18} /></span>
      <p className="db-highlight-eyebrow">{tx('Board & regulator reporting')}</p>
      <p className="db-highlight-title">{tx('Turn this posture into a board-ready report')}</p>
      <p className="db-highlight-sub">{tx('Generated from the live record, archived with a SHA-256 fingerprint.')}</p>
      <Link to="/app/reports" className="db-highlight-btn">
        {canReports ? tx('Generate a report') : tx('View reports')} <ArrowUpRight size={13} className="rtl-flip" />
      </Link>
    </div>
  )
}
