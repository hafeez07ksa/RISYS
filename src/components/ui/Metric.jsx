import { Link } from 'react-router-dom'

/* KPI strip (§13, §40). Explicitly NOT dashboard cards: a joined strip of
 * compact readouts, one hairline apart. The brief is emphatic that metrics on
 * an operational page must not eat the space the table needs — the current
 * Tasks page spends a third of the viewport on five numbers, four of which are
 * zero.
 *
 * §40 — tone is reserved. A metric only takes colour when its value is itself
 * a problem (overdue > 0, critical > 0). Ten coloured numbers mean nothing. */
export function MetricStrip({ metrics }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${metrics.length}, minmax(0,1fr))`,
        gap: 1, background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      {metrics.map((m) => <Metric key={m.label} {...m} />)}
    </div>
  )
}

const TONE_COLOUR = {
  critical: 'var(--critical)',
  high:     'var(--high)',
  medium:   'var(--medium)',
  low:      'var(--low)',
  info:     'var(--info)',
  default:  'var(--text)',
}

export function Metric({ label, value, tone = 'default', hint, to, suffix }) {
  /* A zero is good news for 'Overdue' and neutral for 'Total'. Colouring a zero
     red would be actively misleading, so tone only applies above zero. */
  const live = tone !== 'default' && Number(value) > 0
  const colour = live ? TONE_COLOUR[tone] : TONE_COLOUR.default

  const body = (
    <>
      <div style={{
        fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-3)', fontWeight: 500, marginBottom: 5,
      }}>{label}</div>
      <div className="tnum" style={{
        fontSize: 'var(--t-metric)', fontWeight: 600, color: colour, lineHeight: 1,
        display: 'flex', alignItems: 'baseline', gap: 3,
      }}>
        {value}
        {suffix && <span style={{ fontSize: 'var(--t-sm)', fontWeight: 400, color: 'var(--text-3)' }}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 4 }}>{hint}</div>}
    </>
  )

  const style = { background: 'var(--bg-2)', padding: '11px 14px', display: 'block', textDecoration: 'none' }

  return to
    ? <Link to={to} style={style} className="row-hover">{body}</Link>
    : <div style={style}>{body}</div>
}
