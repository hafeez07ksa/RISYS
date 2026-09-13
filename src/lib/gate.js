// ============================================================
// THE TOLERANCE GATE
//
// A risk process is a loop with one decision gate. Everything before it
// is measurement; everything after it is work. This module is the gate.
//
//   1. Identify & register        measurement
//   2. Score inherent             measurement
//   3. Map controls               measurement
//   4. Score residual             measurement
//   5. GATE  <-- here             the only step that creates work
//   6. Accept (within) / Treat (outside)
//   7. Monitor / Execute          work
//
// Without step 5 a risk register is a spreadsheet. With it, the register
// generates work and escalations on its own.
//
// Everything here is pure: no React, no Supabase, no clock reads except
// the one `now` passed in. That keeps it testable and lets the same
// evaluation move into Postgres later (003_risk_gate_triggers.sql)
// without the rules themselves changing.
// ============================================================

import { bandForScore, bandMeta, DEFAULT_MATRIX } from './matrix.js'
import { requiredAuthority, acceptanceType, tierMeta, tierRank } from './authority.js'

/**
 * The metrics a tolerance rule can read. Anything not on this list is
 * not evaluable, and a tolerance that is not evaluable is just prose —
 * which is the thing the gate exists to replace.
 */
export const GATE_METRICS = [
  { value: 'residual_score',        label: 'Residual score',              unit: 'score', hint: 'The score after crediting control effectiveness' },
  { value: 'inherent_score',        label: 'Inherent score',              unit: 'score', hint: 'The score before any controls are credited' },
  { value: 'residual_likelihood',   label: 'Residual likelihood',         unit: '1–5',   hint: 'Useful when likelihood alone must be held down' },
  { value: 'residual_impact',       label: 'Residual impact',             unit: '1–5',   hint: 'Useful when impact alone must be held down' },
  { value: 'failed_control_tests',  label: 'Failing control tests',       unit: 'count', hint: 'Linked controls whose last test result was Fail' },
  { value: 'uncovered_controls',    label: 'Controls with no coverage',   unit: 'count', hint: 'Linked controls whose coverage excludes this risk’s scope' },
  { value: 'partial_coverage',      label: 'Controls partially covering', unit: 'count', hint: 'Linked controls that cover only part of the scope' },
  { value: 'untested_controls',     label: 'Untested controls',           unit: 'count', hint: 'Linked controls that have never been tested' },
  { value: 'expired_evidence',      label: 'Expired evidence items',      unit: 'count', hint: 'Evidence past its validity date — the control is now unverified' },
  { value: 'kri_breaches',          label: 'KRIs in breach',              unit: 'count', hint: 'Key risk indicators currently rated Red' },
  { value: 'open_treatment_actions',label: 'Overdue treatment actions',   unit: 'count', hint: 'Mitigation tasks past their target date' },
  { value: 'days_since_review',     label: 'Days since last review',      unit: 'days',  hint: 'Forces recertification cadence into the gate' },
]

export const GATE_OPERATORS = [
  { value: '<=', label: 'at or below' },
  { value: '<',  label: 'below' },
  { value: '==', label: 'equals' },
  { value: '!=', label: 'does not equal' },
  { value: '>=', label: 'at or above' },
  { value: '>',  label: 'above' },
]

export function metricMeta(metric) {
  return GATE_METRICS.find(m => m.value === metric) || { value: metric, label: metric, unit: '' }
}

export function operatorLabel(op) {
  return (GATE_OPERATORS.find(o => o.value === op) || { label: op }).label
}

/** Human-readable form of a rule, used when a tolerance has no explicit label. */
export function ruleLabel(rule) {
  if (rule?.label) return rule.label
  return `${metricMeta(rule?.metric).label} ${operatorLabel(rule?.operator)} ${rule?.value}`
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Collect everything a rule might read into one flat object.
 *
 * Passing the children in explicitly rather than fetching them here is
 * deliberate — it keeps the gate pure, and it means the same function
 * serves the detail page (which already has them loaded) and a bulk
 * re-evaluation across the register.
 */
export function buildSignals({
  risk = {},
  mappings = [],
  controls = [],
  kris = [],
  evidence = [],
  actions = [],
  now = new Date(),
} = {}) {
  const byId = new Map(controls.map(c => [c.id, c]))
  const linked = mappings
    .map(m => ({ mapping: m, control: byId.get(m.control_id) }))
    .filter(x => x.control)

  const lastReview = risk.last_reviewed_at || risk.created_at

  return {
    // Residual counts as scored only when both coordinates exist. The
    // generated residual_score column falls back to the inherent score
    // when residual was never assessed, and trusting it would make every
    // unassessed risk look "scored" at its inherent value.
    residual_score:      scoreOf(risk.residual_likelihood, risk.residual_impact),
    inherent_score:      num(risk.inherent_score) ?? scoreOf(risk.inherent_likelihood, risk.inherent_impact),
    residual_likelihood: num(risk.residual_likelihood),
    residual_impact:     num(risk.residual_impact),

    failed_control_tests: linked.filter(x => x.control.testing_status === 'Fail').length,
    untested_controls:    linked.filter(x => !x.control.testing_status || x.control.testing_status === 'Not Tested').length,

    // Coverage lives on the LINK, not the control. A control can be
    // effective and still irrelevant to this risk because its scope
    // excludes the asset — that gap is the risk.
    uncovered_controls: linked.filter(x => x.mapping.coverage === 'none').length,
    partial_coverage:   linked.filter(x => x.mapping.coverage === 'partial').length,

    expired_evidence: evidence.filter(e => e.expires_at && new Date(e.expires_at) < now).length,
    kri_breaches:     kris.filter(k => k.rag_status === 'Red').length,

    open_treatment_actions: actions.filter(a =>
      a.status !== 'completed' && a.status !== 'cancelled' &&
      a.target_date && new Date(a.target_date) < now
    ).length,

    days_since_review: lastReview ? Math.floor((now - new Date(lastReview)) / DAY) : null,
  }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function scoreOf(l, i) {
  const a = num(l), b = num(i)
  return a && b ? a * b : null
}

function compare(actual, operator, expected) {
  const a = Number(actual), b = Number(expected)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null   // cannot be judged
  switch (operator) {
    case '<=': return a <= b
    case '<':  return a < b
    case '>=': return a >= b
    case '>':  return a > b
    case '==': return a === b
    case '!=': return a !== b
    default:   return null
  }
}

/**
 * Evaluate one risk against its category tolerance.
 *
 * Returns the verdict AND the reasoning, because a gate that only says
 * "blocked" is not defensible to a reviewer. Every rule comes back with
 * its expected and actual value so the UI can show the breach delta.
 *
 * A rule whose metric cannot be measured yet (no residual score, no
 * linked controls) is reported as `skipped` rather than failed — the
 * gate does not manufacture breaches out of missing data.
 */
export function evaluateGate({ risk, tolerance, signals, matrix = DEFAULT_MATRIX, now = new Date() } = {}) {
  const score = signals?.residual_score ?? null
  const band = score != null
    ? bandForScore(score, matrix)
    : bandForScore(signals?.inherent_score, matrix)

  const base = {
    band,
    score,
    meta: bandMeta(band),
    rules: [],
    failedRules: [],
    skippedRules: [],
    escalateTo: tolerance?.escalate_to || null,
    slaDays: tolerance?.treatment_sla_days ?? 10,
    appetite: tolerance?.appetite || null,
    appetiteStatement: tolerance?.appetite_statement || null,
  }

  // No tolerance configured for this category, or nothing scored yet.
  // Either way the gate has nothing to judge and must say so plainly
  // rather than defaulting to "pass".
  if (!tolerance || !Array.isArray(tolerance.rules) || tolerance.rules.length === 0) {
    return { ...base, evaluated: false, passed: null, status: 'not_evaluated',
             reason: 'No tolerance rules are defined for this category.',
             acceptBlocked: false, acceptBlockedReason: null, requiredAuthority: null, acceptanceType: null, requiredState: null, breachDelta: null }
  }
  // Draft and registered risks have not been measured yet. The gate is
  // step 5 of the process; judging a record before steps 2-4 would
  // escalate drafts nobody has assessed. runGate() abstains for the same
  // states, so the panel and the persisted verdict always agree.
  const state = risk?.workflow_state || 'draft'
  if (state === 'draft' || state === 'registered') {
    return { ...base, evaluated: false, passed: null, status: 'not_evaluated',
             reason: state === 'draft'
               ? 'Not yet admitted to the register. The gate runs once the risk is admitted and scored.'
               : 'Admitted but not yet assessed. The gate runs once residual risk is scored.',
             acceptBlocked: false, acceptBlockedReason: null, requiredAuthority: null, acceptanceType: null, requiredState: null, breachDelta: null }
  }
  if (score == null) {
    return { ...base, evaluated: false, passed: null, status: 'not_evaluated',
             reason: 'Residual risk has not been scored yet.',
             acceptBlocked: false, acceptBlockedReason: null, requiredAuthority: null, acceptanceType: null, requiredState: null, breachDelta: null }
  }

  const rules = tolerance.rules.map(rule => {
    const actual = signals?.[rule.metric]
    const result = compare(actual, rule.operator, rule.value)
    return {
      ...rule,
      label: ruleLabel(rule),
      actual: actual ?? null,
      passed: result,
      skipped: result === null,
    }
  })

  const failedRules = rules.filter(r => r.passed === false)
  const skippedRules = rules.filter(r => r.skipped)
  const passed = failedRules.length === 0

  // The delta the committee actually reads: "16 vs 8".
  const scoreRule = failedRules.find(r => r.metric === 'residual_score')
  const breachDelta = scoreRule ? { actual: scoreRule.actual, limit: scoreRule.value } : null

  // Who may accept. Authority follows the band (risk owner → CISO →
  // committee → board), and outside tolerance an acceptance becomes an
  // exception that needs at least the Steering Committee. Accept is never
  // hidden: `acceptBlocked` only means the risk owner cannot sign it alone,
  // and the reason names who can.
  const required = requiredAuthority({ band, withinTolerance: passed })
  const acceptBlocked = tierRank(required) > tierRank('risk_owner')
  const acceptBlockedReason = acceptBlocked
    ? (passed
        ? `${bandMeta(band).label} risk is beyond the risk owner's authority to accept. It needs ${tierMeta(required).label} approval.`
        : `Residual risk is outside tolerance, so acceptance would be an exception. It needs ${tierMeta(required).label} approval, compensating controls and a hard expiry.`)
    : null

  return {
    ...base,
    evaluated: true,
    passed,
    status: passed ? 'within' : 'breached',
    reason: passed
      ? 'Residual risk is within tolerance.'
      : `${failedRules.length} of ${rules.length} tolerance rules fail.`,
    rules,
    failedRules,
    skippedRules,
    breachDelta,
    acceptBlocked,
    acceptBlockedReason,
    requiredAuthority: required,
    acceptanceType: acceptanceType(passed),
    // Within tolerance the risk is monitored; outside it, treatment is
    // mandatory. This is the state the gate imposes, not a suggestion.
    requiredState: passed ? 'monitored' : 'treatment_required',
    treatmentDueAt: passed ? null : new Date(now.getTime() + (base.slaDays * DAY)).toISOString(),
  }
}

/** Whole numbers of days a risk has sat outside tolerance. */
export function daysInBreach(risk, now = new Date()) {
  if (!risk?.breach_since) return null
  return Math.max(0, Math.floor((now - new Date(risk.breach_since)) / DAY))
}

/**
 * Days left on the treatment SLA. Negative once the clock has run out —
 * the register sorts on this to surface what is actually late.
 */
export function treatmentSLA(risk, now = new Date()) {
  if (!risk?.treatment_due_at) return null
  const due = new Date(risk.treatment_due_at)
  const days = Math.ceil((due - now) / DAY)
  return { due, days, overdue: days < 0 }
}

/**
 * A large drop from inherent to residual with little control evidence
 * behind it is the most common way a register is quietly falsified. An
 * assessor who moves 25 to 6 with nothing mapped should be challenged by
 * the system, not caught in a review three months later.
 */
export function residualDropWarning({ inherentScore, residualScore, creditedControls = 0 }) {
  const from = Number(inherentScore), to = Number(residualScore)
  if (!from || !to || to >= from) return null
  const dropRatio = (from - to) / from
  if (dropRatio < 0.5) return null
  if (creditedControls >= 2) return null
  return creditedControls === 0
    ? `This drops the score by ${Math.round(dropRatio * 100)}% with no controls credited. Residual risk should reflect controls that demonstrably operate.`
    : `This drops the score by ${Math.round(dropRatio * 100)}% on the strength of a single control. Expect a reviewer to ask what else is carrying the reduction.`
}

/**
 * Coverage gaps found among the linked controls. This is the check that
 * catches the case the process doc singles out: a control that is well
 * designed, operating effectively, and completely irrelevant to the risk
 * because its scope excludes the asset.
 */
export function coverageGaps(mappings = [], controls = []) {
  const byId = new Map(controls.map(c => [c.id, c]))
  return mappings
    .map(m => ({ mapping: m, control: byId.get(m.control_id) }))
    .filter(x => x.control && (x.mapping.coverage === 'none' || x.mapping.coverage === 'partial'))
    .map(x => ({
      controlId: x.control.id,
      name: x.control.name,
      ref: x.control.control_id,
      coverage: x.mapping.coverage,
      note: x.mapping.coverage_note,
      effectiveness: x.control.effectiveness,
      testingStatus: x.control.testing_status,
      // The dangerous combination: reads as healthy, covers nothing.
      misleading: x.mapping.coverage === 'none' && x.control.testing_status === 'Pass',
    }))
}
