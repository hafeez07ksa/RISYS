import { tx } from '@/lib/i18n'

/* ── Enterprise Risk Management: shared vocabulary ────────────────────────────
 *
 *   Raise a risk     risk_submissions (SUB-): anyone but a viewer raises one;
 *                    a risk manager triages it (ask, decline, or accept into
 *                    the register as a draft for a named owner).
 *   Assessment SLA   risks.assessment_due_at: set by the database when a risk
 *                    is admitted, stopped by the first scored state.
 *   Acceptance       risk_exceptions: a purpose, a decision due date, an
 *                    optional management review and term limits, all
 *                    enforced by the request / review / decide RPCs.
 *
 * Dates are compared as Riyadh calendar days, like every other clock.
 * -------------------------------------------------------------------------- */

export const SUBMISSION_SOURCES = [
  { value: 'self_reported',       label: tx('Something I noticed') },
  { value: 'observation',         label: tx('Observation at work') },
  { value: 'incident',            label: tx('An incident or near miss') },
  { value: 'audit',               label: tx('An audit or review') },
  { value: 'customer_feedback',   label: tx('Customer or partner feedback') },
  { value: 'external_assessment', label: tx('External assessment') },
  { value: 'other',               label: tx('Other') },
]

export const SUBMISSION_STATUSES = [
  { value: 'submitted',           label: tx('Waiting for triage') },
  { value: 'needs_clarification', label: tx('Question asked') },
  { value: 'accepted',            label: tx('Accepted') },
  { value: 'declined',            label: tx('Declined') },
  { value: 'withdrawn',           label: tx('Withdrawn') },
]

export const SUBMISSION_TONE = {
  submitted: 'info', needs_clarification: 'medium', accepted: 'low', declined: 'neutral', withdrawn: 'neutral',
}

export const submissionOpen = (s) => s?.status === 'submitted' || s?.status === 'needs_clarification'

/** The plain-language 1–5 scale for people who do not score risks for a living. */
export const ROUGH_LIKELIHOOD = [
  { value: 1, label: tx('Very unlikely') },
  { value: 2, label: tx('Unlikely') },
  { value: 3, label: tx('Could happen') },
  { value: 4, label: tx('Likely') },
  { value: 5, label: tx('Almost certain') },
]
export const ROUGH_IMPACT = [
  { value: 1, label: tx('Negligible') },
  { value: 2, label: tx('Minor') },
  { value: 3, label: tx('Noticeable') },
  { value: 4, label: tx('Serious') },
  { value: 5, label: tx('Severe') },
]

/* ── Acceptance ───────────────────────────────────────────────────────────── */

export const ACCEPTANCE_PURPOSES = [
  { value: 'within_tolerance',            label: tx('Within tolerance'),                 desc: tx('The residual sits inside the line the board set.') },
  { value: 'low_impact_or_likelihood',    label: tx('Low impact or likelihood'),         desc: tx('Too small to justify more control.') },
  { value: 'cost_exceeds_benefit',        label: tx('Cost exceeds benefit'),             desc: tx('Further treatment costs more than the loss it prevents.') },
  { value: 'strategic_justification',     label: tx('Strategic justification'),          desc: tx('Retained deliberately to pursue an objective.') },
  { value: 'accepted_by_external_party',  label: tx('Carried by an external party'),     desc: tx('A contract or insurer carries most of the impact.') },
  { value: 'business_process_dependency', label: tx('Business process dependency'),      desc: tx('Removing it would stop a process the business needs.') },
  { value: 'mitigation_in_progress',      label: tx('Interim: mitigation in progress'),  desc: tx('Accepted only until a funded plan lands. At most 6 months.') },
  { value: 'residual_after_mitigation',   label: tx('Residual after mitigation'),        desc: tx('What is left once the agreed plan is complete.') },
  { value: 'temporary_pending_action',    label: tx('Temporary, pending action'),        desc: tx('A short pause while a decision is taken. At most 6 months.') },
]

export const INTERIM_PURPOSES = ['mitigation_in_progress', 'temporary_pending_action']

/** The longest term the database allows, in months, mirroring request_risk_acceptance(). */
export function maxTermMonths({ purpose, band, type }) {
  if (INTERIM_PURPOSES.includes(purpose) || band === 'critical') return 6
  if (type === 'exception') return 12
  return 24
}

export const ACCEPTANCE_STATUSES = [
  { value: 'pending',  label: tx('Awaiting decision') },
  { value: 'approved', label: tx('Approved') },
  { value: 'rejected', label: tx('Rejected') },
  { value: 'revoked',  label: tx('Revoked') },
  { value: 'expired',  label: tx('Expired') },
]

/* ── Calendar days in Riyadh ──────────────────────────────────────────────── */

const RIYADH = 'Asia/Riyadh'

/** YYYY-MM-DD for an instant (or now) in Riyadh. */
export function riyadhDay(v = new Date()) {
  const d = v instanceof Date ? v : new Date(v)
  return new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Whole days from today (Riyadh) to a date or instant; negative once past. */
export function daysUntil(v) {
  if (!v) return null
  const target = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : riyadhDay(v)
  const a = Date.parse(`${riyadhDay()}T00:00:00Z`)
  const b = Date.parse(`${target}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

/** A date `n` days from today in Riyadh, as YYYY-MM-DD. */
export function dayPlus(n) {
  const a = new Date(`${riyadhDay()}T00:00:00Z`)
  a.setUTCDate(a.getUTCDate() + n)
  return a.toISOString().slice(0, 10)
}

/** A date `m` months from today in Riyadh, as YYYY-MM-DD (the day before, so the term is inclusive). */
export function monthsPlus(m) {
  const a = new Date(`${riyadhDay()}T00:00:00Z`)
  a.setUTCMonth(a.getUTCMonth() + m)
  return a.toISOString().slice(0, 10)
}

/** Is a registered risk late for its assessment? */
export function assessmentLate(r) {
  return r?.workflow_state === 'registered' && r?.assessment_due_at && daysUntil(r.assessment_due_at) < 0
}

/** The ERM kinds of my_work(), for module-local "Waiting on you" lists. */
export const ERM_WORK_KINDS = ['risk_triage', 'risk_clarify', 'risk_assessment', 'acceptance_review', 'acceptance_decision']
