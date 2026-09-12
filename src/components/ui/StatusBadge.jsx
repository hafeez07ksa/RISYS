import clsx from 'clsx'

/* ── Status system (§28) ──────────────────────────────────────────────────────
 *
 * One vocabulary for every status the product shows. Before this, severity was
 * rendered a different way on nearly every page — Findings drew its own pills,
 * Risks drew another, Compliance a third — so the same word could appear in
 * three colours. A GRC product cannot do that: the colour IS the meaning.
 *
 * Mapping is by *meaning*, not by module. 'critical' looks the same whether it
 * is a risk score, a finding severity or an incident priority, because to the
 * reader it is the same claim about urgency.
 *
 * §42 — never colour alone. Every tone carries a dot glyph whose shape differs
 * (filled / hollow / half), and the label itself always reads in text, so the
 * badge survives greyscale printing and colour-blind readers. Auditors print.
 * -------------------------------------------------------------------------- */

const TONES = {
  critical: 'badge-critical',
  high:     'badge-high',
  medium:   'badge-medium',
  low:      'badge-low',
  info:     'badge-info',
  neutral:  'badge-neutral',
  brand:    'badge-brand',
}

/* Every status string the app produces, mapped to a tone. Keys are lowercased
 * and non-alphanumerics collapsed, so 'In Progress', 'in_progress' and
 * 'in-progress' all land in the same place — the three spellings genuinely
 * coexist in the current data. */
const STATUS_TONE = {
  // severity / score bands
  critical: 'critical', high: 'high', medium: 'medium', low: 'low',
  informational: 'info', info: 'info',

  // lifecycle
  open: 'critical', new: 'critical', detected: 'critical',
  inprogress: 'info', investigating: 'info', inreview: 'info', underreview: 'info',
  resolved: 'low', closed: 'low', done: 'low', complete: 'low', completed: 'low',
  draft: 'neutral', pending: 'neutral', notstarted: 'neutral', cancelled: 'neutral',
  archived: 'neutral', notassessed: 'neutral', notapplicable: 'neutral', unknown: 'neutral',

  // compliance
  compliant: 'low', partiallycompliant: 'medium', partial: 'medium',
  noncompliant: 'critical', notcompliant: 'critical', gap: 'critical',

  // control effectiveness
  effective: 'low', partiallyeffective: 'medium', ineffective: 'critical',
  nottested: 'neutral', active: 'low', inactive: 'neutral',

  // measurement (compliance automation)
  pass: 'low', fail: 'critical', notmeasured: 'neutral',

  // connectors
  connected: 'brand', disconnected: 'neutral', error: 'critical', syncing: 'info',

  // approval / workflow
  approved: 'low', rejected: 'critical', awaitingapproval: 'medium', submitted: 'info',

  // treatment
  mitigate: 'info', transfer: 'info', accept: 'medium', avoid: 'neutral',

  // review
  overdue: 'critical', duesoon: 'medium', ontrack: 'low',
}

const normalise = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function toneFor(status) {
  return STATUS_TONE[normalise(status)] || 'neutral'
}

/* Title-cases a raw status value for display: 'in_progress' → 'In Progress'.
 * Kept here so no page has to do it locally and get it subtly different. */
export function labelFor(status) {
  return String(status ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/* Shape carries the same information as colour, for greyscale and for readers
 * who cannot separate the hues. Severity reads as a filled dot; in-flight
 * states as a half dot; settled or dormant states as a hollow ring. */
function Glyph({ tone }) {
  const solid  = tone === 'critical' || tone === 'high'
  const hollow = tone === 'neutral'
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6, height: 6, borderRadius: 999, flexShrink: 0,
        background: solid ? 'currentColor' : hollow ? 'transparent' : 'currentColor',
        opacity: hollow ? 1 : solid ? 1 : 0.55,
        border: hollow ? '1.5px solid currentColor' : 'none',
      }}
    />
  )
}

/**
 * @param status  raw value from the data layer ('open', 'Partially Compliant')
 * @param tone    override the derived tone when the caller knows better
 * @param label   override the derived label
 * @param dot     set false for dense table cells where the glyph is noise
 */
export function StatusBadge({ status, tone, label, dot = true, className, ...rest }) {
  const t = tone || toneFor(status)
  const text = label ?? labelFor(status)
  return (
    <span className={clsx('badge', TONES[t] || TONES.neutral, className)} {...rest}>
      {dot && <Glyph tone={t} />}
      {text}
    </span>
  )
}

/* Risk and finding scores band identically across the product (§28). Kept
 * beside the badge so the thresholds and the colours cannot drift apart. */
export function scoreBand(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'neutral'
  if (n >= 20) return 'critical'
  if (n >= 12) return 'high'
  if (n >= 6)  return 'medium'
  return 'low'
}

/** Compact score chip: the number and its band together, e.g. `Critical · 25`. */
export function ScoreBadge({ score, showLabel = true, className }) {
  const tone = scoreBand(score)
  const name = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', neutral: '—' }[tone]
  return (
    <span className={clsx('badge tnum', TONES[tone], className)}>
      <Glyph tone={tone} />
      {showLabel ? `${name} · ${score}` : score}
    </span>
  )
}
