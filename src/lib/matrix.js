// ============================================================
// RISK MATRIX — the single source of truth for banding
//
// The arithmetic of L x I is trivial. What makes a score defensible is
// that the band is *looked up*, not derived, because multiplication is
// a convention rather than a calculation:
//
//   - It produces gaps. 25 cells yield only 15 distinct values; you can
//     never score 11, 13, 14, 17, 18, 19, 21, 22, 23 or 24.
//   - It treats the diagonal as equal. L=5 x I=1 and L=1 x I=5 both give
//     5, but "a minor thing happens monthly" and "a catastrophic thing
//     might happen once a decade" need completely different responses.
//   - The scales are ordinal. A likelihood of 4 is not twice a 2.
//
// So the band per cell lives in risk_matrix_config.cells, and a tenant
// can shift the upper-right cells into a higher band without touching
// the arithmetic. The score is still displayed for continuity, but the
// band is what the tolerance gate reads.
//
// Before this module the thresholds were hardcoded in three places that
// could drift apart: getRiskLevel() in risks.js, getCellColor() in
// RiskMatrix.jsx and scoreBand() in components/ui/StatusBadge.jsx. All
// three now delegate here.
// ============================================================

/** Ascending severity. Used for authority ceilings, never for display order. */
export const BAND_ORDER = ['low', 'medium', 'high', 'critical']

/**
 * Band presentation. These are the exact values the register used before
 * the matrix became configurable, so applying the migration re-bands
 * nothing on day one.
 */
export const BAND_META = {
  critical: { band: 'critical', label: 'Critical', color: '#8C1616', bg: '#FBEAEA', border: '#F0CECE' },
  high:     { band: 'high',     label: 'High',     color: '#B5491B', bg: '#FBEFE7', border: '#F0D4C2' },
  medium:   { band: 'medium',   label: 'Medium',   color: '#9C6F0F', bg: '#FAF3E2', border: '#EBDCB6' },
  low:      { band: 'low',      label: 'Low',      color: '#2F6B3C', bg: '#ECF4EE', border: '#C8DECD' },
}

const UNSCORED = { band: null, label: 'Not scored', color: 'var(--text-3)', bg: 'var(--surface)', border: 'var(--border)' }

/**
 * Written definitions for each scale point. The arithmetic is trivial;
 * these sentences are the actual work, because they are what makes a
 * "3" mean the same thing to everyone who scores.
 */
export const DEFAULT_LIKELIHOOD_SCALE = [
  { value: 1, label: 'Rare',           definition: 'Less than once in 5 years' },
  { value: 2, label: 'Unlikely',       definition: 'Once in 2 to 5 years' },
  { value: 3, label: 'Possible',       definition: 'Roughly annually' },
  { value: 4, label: 'Likely',         definition: 'Several times a year' },
  { value: 5, label: 'Almost Certain', definition: 'Monthly or continuous' },
]

/**
 * Impact is not one thing. Each point is defined across financial,
 * regulatory and operational axes, and the rating is the MAXIMUM of the
 * three — which is what stops money from quietly outranking compliance.
 * A risk with only 100K SAR exposure but a mandatory SDAIA notification
 * is still a 4, because the regulatory axis dominates.
 */
export const DEFAULT_IMPACT_SCALE = [
  { value: 1, label: 'Insignificant', definition: 'Under 50K SAR · internal observation only · under 1 hour degradation' },
  { value: 2, label: 'Minor',         definition: '50K – 500K SAR · internal finding, tracked · short degradation, one team' },
  { value: 3, label: 'Moderate',      definition: '500K – 2M SAR · reportable, corrective plan required · half-day outage, one service' },
  { value: 4, label: 'Major',         definition: '2M – 10M SAR · mandatory regulator notification · multi-service outage' },
  { value: 5, label: 'Catastrophic',  definition: 'Over 10M SAR · licence at risk, enforcement action · multi-day outage, public services' },
]

/** The thresholds the product shipped with, kept as the fallback everywhere. */
function thresholdBand(score) {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6)  return 'medium'
  return 'low'
}

function buildCells(dimensions = 5) {
  const cells = []
  for (let l = 1; l <= dimensions; l++) {
    for (let i = 1; i <= dimensions; i++) {
      cells.push({ l, i, score: l * i, band: thresholdBand(l * i) })
    }
  }
  return cells
}

/**
 * Used until risk_matrix_config is readable — either because the
 * migration has not been applied yet or because the org has no active
 * row. Identical in behaviour to the old hardcoded thresholds.
 */
export const DEFAULT_MATRIX = {
  version: 1,
  dimensions: 5,
  cells: buildCells(5),
  likelihood_scale: DEFAULT_LIKELIHOOD_SCALE,
  impact_scale: DEFAULT_IMPACT_SCALE,
}

export function scoreFor(l, i) {
  const a = Number(l), b = Number(i)
  if (!a || !b) return null
  return a * b
}

/** Band for a cell. The lookup is authoritative; the product is the fallback. */
export function bandFor(l, i, config = DEFAULT_MATRIX) {
  const a = Number(l), b = Number(i)
  if (!a || !b) return null
  const cell = (config?.cells || []).find(c => Number(c.l) === a && Number(c.i) === b)
  return cell?.band || thresholdBand(a * b)
}

/**
 * Band from a score alone, for rows where only the generated score column
 * is available. Derived from the config by taking the lowest score that
 * carries each band, so a customised matrix still reports consistently.
 * Prefer bandFor(l, i) whenever both coordinates are to hand.
 */
export function bandForScore(score, config = DEFAULT_MATRIX) {
  const n = Number(score)
  if (!Number.isFinite(n) || n <= 0) return null
  const cells = config?.cells || []
  if (!cells.length) return thresholdBand(n)

  const floors = {}
  for (const c of cells) {
    const s = Number(c.score)
    if (floors[c.band] === undefined || s < floors[c.band]) floors[c.band] = s
  }
  // Most severe band whose floor this score reaches.
  for (let k = BAND_ORDER.length - 1; k >= 0; k--) {
    const band = BAND_ORDER[k]
    if (floors[band] !== undefined && n >= floors[band]) return band
  }
  return thresholdBand(n)
}

/** Presentation for a band name. Returns a neutral "not scored" shape for null. */
export function bandMeta(band) {
  return BAND_META[band] || UNSCORED
}

/** Convenience: everything the UI needs about one cell in a single call. */
export function levelFor(l, i, config = DEFAULT_MATRIX) {
  const score = scoreFor(l, i)
  if (score === null) return { ...UNSCORED, score: null }
  return { ...bandMeta(bandFor(l, i, config)), score }
}

/** Same, from a score alone. This is what getRiskLevel() now delegates to. */
export function levelForScore(score, config = DEFAULT_MATRIX) {
  const band = bandForScore(score, config)
  if (!band) return { ...UNSCORED, score: null }
  return { ...bandMeta(band), score: Number(score) }
}

/** Negative when a is less severe than b. Used for authority ceilings. */
export function compareBand(a, b) {
  return BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b)
}

/** True when `band` sits at or below `ceiling` — i.e. acceptance is permitted. */
export function bandWithin(band, ceiling) {
  if (!band) return true
  if (!ceiling) return false
  return compareBand(band, ceiling) <= 0
}

/** The written definition for a scale point, for the inline scoring hints. */
export function scalePoint(scale, value) {
  return (scale || []).find(s => Number(s.value) === Number(value)) || null
}

/** Grid axes for rendering: likelihood descends, impact ascends. */
export function matrixAxes(config = DEFAULT_MATRIX) {
  const n = config?.dimensions || 5
  const rows = [], cols = []
  for (let v = n; v >= 1; v--) rows.push(v)
  for (let v = 1; v <= n; v++) cols.push(v)
  return { rows, cols }
}
