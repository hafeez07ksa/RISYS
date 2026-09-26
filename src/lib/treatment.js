import { tx } from '@/lib/i18n'
// ============================================================
// TREATMENT DECISION — step 9 of the risk process
//
// All four options are evaluated and recorded, including the rejected
// ones, because an auditor always asks why you did not do the other
// thing. A platform that forces one treatment per risk models this badly:
// Reduce and Avoid can both be live, as linked plans on different
// horizons — a 21-day proxy now, a 180-day decommission later.
//
// Every task inside a plan states whether it moves likelihood, impact or
// both. A task that moves neither is allowed only as a supporting task
// (updating the control library, for example), and says so.
// ============================================================

export const TREATMENT_OPTIONS = [
  { value: 'avoid',    label: tx('Avoid'),    planned: true,
    desc: tx('Remove the cause entirely — retire the asset or stop the activity.') },
  { value: 'reduce',   label: tx('Reduce'),   planned: true,
    desc: tx('Mitigate: lower likelihood, impact or both through controls and tasks.') },
  { value: 'transfer', label: tx('Transfer'), planned: true,
    desc: tx(
      'Shift financial impact to a third party, such as insurance. Does not move likelihood or fix non-compliance.'
    ) },
  { value: 'accept',   label: tx('Accept'),   planned: false,
    desc: tx(
      'Retain the residual risk under a formal, time-bound approval at the right authority.'
    ) },
]

export const OPTION_DECISIONS = [
  { value: 'pending',       label: tx('Not decided') },
  { value: 'selected',      label: tx('Selected') },
  { value: 'rejected',      label: tx('Rejected') },
  { value: 'not_available', label: tx('Not available') },
]

export const HORIZONS = [
  { value: 'immediate', label: tx('Immediate') },
  { value: 'long_term', label: tx('Long-term') },
]

export const MOVES = [
  { value: 'likelihood', label: tx('Likelihood'), short: 'L' },
  { value: 'impact',     label: tx('Impact'),     short: 'I' },
  { value: 'both',       label: tx('Both'),       short: 'L + I' },
  { value: 'none',       label: tx('Supporting — moves neither'), short: '—' },
]

export const PLAN_STATUSES = [
  { value: 'planned',     label: tx('Planned'),     color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  { value: 'approved',    label: tx('Approved'),    color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'in_progress', label: tx('In progress'), color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'complete',    label: tx('Complete'),    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'cancelled',   label: tx('Cancelled'),   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

export function optionMeta(value) {
  return TREATMENT_OPTIONS.find(o => o.value === value) || { value, label: value, planned: false, desc: '' }
}

export function movesMeta(value) {
  return MOVES.find(m => m.value === value) || null
}

export function planStatusMeta(value) {
  return PLAN_STATUSES.find(s => s.value === value) || PLAN_STATUSES[0]
}

/**
 * Whether a treatment plan may be approved, and if not, exactly why.
 *
 * Approval moves a risk from Treatment Required to Under Treatment, so it
 * must not happen until the decision itself is on record:
 *   - every one of the four options has a decision,
 *   - every rejected or unavailable option carries its reason,
 *   - at least one of Avoid / Reduce / Transfer is selected, and
 *   - each selected option has a plan with a target residual score.
 */
export function treatmentReadiness({ options = [], plans = [] } = {}) {
  const byOption = new Map(options.map(o => [o.option, o]))
  const blockers = []

  const undecided = TREATMENT_OPTIONS.filter(t => {
    const o = byOption.get(t.value)
    return !o || !o.decision || o.decision === 'pending'
  })
  if (undecided.length) {
    blockers.push(`Record a decision for ${undecided.map(t => t.label).join(', ')}.`)
  }

  const unexplained = options.filter(o =>
    (o.decision === 'rejected' || o.decision === 'not_available') && !o.rejection_reason?.trim())
  if (unexplained.length) {
    blockers.push(`Give the reason for ${unexplained.map(o => optionMeta(o.option).label).join(', ')}.`)
  }

  const selectedPlanned = options.filter(o => o.decision === 'selected' && optionMeta(o.option).planned)
  if (!selectedPlanned.length) {
    blockers.push('Select at least one of Avoid, Reduce or Transfer. Accept is decided through an acceptance request, not a treatment plan.')
  }

  const withoutPlan = selectedPlanned.filter(o => !plans.some(p =>
    p.option === o.option && p.status !== 'cancelled' && p.target_likelihood && p.target_impact))
  if (withoutPlan.length) {
    blockers.push(`Add a plan with a target residual score for ${withoutPlan.map(o => optionMeta(o.option).label).join(', ')}.`)
  }

  return { ready: blockers.length === 0, blockers, selected: selectedPlanned.map(o => o.option) }
}
