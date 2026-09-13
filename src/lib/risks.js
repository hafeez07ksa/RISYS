// ============================================================
// RISK REGISTER — CONSTANTS & HELPERS
// Archer GRC parity
// ============================================================

import { levelForScore } from './matrix'
import { daysInBreach } from './gate'

export const RISK_CATEGORIES = [
  'Cybersecurity',
  'Compliance & Regulatory',
  'Operational',
  'Third Party / Vendor',
  'Data Privacy',
  'Physical Security',
  'Business Continuity',
  'Financial',
  'Reputational',
  'Legal',
  'Strategic',
  'Technology / IT',
  'People & HR',
]

export const RISK_SUBCATEGORIES = {
  'Cybersecurity':           ['Access Control', 'Ransomware', 'Data Breach', 'Phishing', 'Insider Threat', 'Vulnerability Management', 'DDoS', 'Supply Chain Attack'],
  'Compliance & Regulatory': ['Regulatory Breach', 'Audit Finding', 'Policy Non-Compliance', 'Licensing', 'Data Residency'],
  'Operational':             ['Process Failure', 'Human Error', 'Fraud', 'System Outage', 'Capacity', 'Change Management'],
  'Third Party / Vendor':    ['Vendor Failure', 'Concentration Risk', 'Fourth Party', 'Contractual Breach', 'ESG Risk'],
  'Data Privacy':            ['Unauthorized Disclosure', 'Subject Rights', 'Consent Failure', 'Retention Breach'],
  'Physical Security':       ['Unauthorized Access', 'Environmental Hazard', 'Asset Theft', 'Natural Disaster'],
  'Business Continuity':     ['Disaster Recovery', 'BCP Failure', 'Single Point of Failure', 'Supply Disruption'],
  'Financial':               ['Fraud', 'Market Risk', 'Credit Risk', 'Liquidity Risk', 'Currency Risk'],
  'Reputational':            ['Media Incident', 'Social Media', 'Product Failure', 'Leadership Issue'],
  'Legal':                   ['Litigation', 'Contractual Liability', 'IP Infringement', 'Employment Law'],
  'Strategic':               ['Competitive Threat', 'M&A Risk', 'Market Change', 'Innovation Failure'],
  'Technology / IT':         ['Legacy Systems', 'Shadow IT', 'Integration Failure', 'Data Quality', 'AI/ML Risk'],
  'People & HR':             ['Key Person', 'Skills Gap', 'Workforce Reduction', 'Misconduct'],
}

export const RISK_TYPES = [
  'Operational', 'Strategic', 'Financial', 'Compliance', 'Reputational', 'Technology'
]

export const RISK_TREATMENTS = [
  { value: 'mitigate', label: 'Mitigate', desc: 'Reduce likelihood or impact', color: '#1e40af', bg: '#eff6ff' },
  { value: 'accept',   label: 'Accept',   desc: 'Accept risk within appetite', color: '#166534', bg: '#f0fdf4' },
  { value: 'transfer', label: 'Transfer', desc: 'Transfer via insurance/3rd party', color: '#6b21a8', bg: '#faf5ff' },
  { value: 'avoid',    label: 'Avoid',    desc: 'Eliminate the risk source',   color: '#92400e', bg: '#fffbeb' },
]

export const RISK_STATUSES = [
  { value: 'open',        label: 'Open',        color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'mitigating',  label: 'Mitigating',  color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'accepted',    label: 'Accepted',    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'transferred', label: 'Transferred', color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
  { value: 'closed',      label: 'Closed',      color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

// ============================================================
// LIFECYCLE
//
// The states a risk moves through, per the risk process:
//
//   draft -> registered -> assessed -> [GATE] -> monitored
//                                             \-> treatment_required
//                                                   -> under_treatment
//                                                   -> accepted
//   monitored -> closed
//
// Three things reopen a risk automatically: a KRI breach, a failed
// control test, and expired evidence. A fourth is an accepted exception
// reaching its expiry. Those arrows are the difference between a living
// register and a spreadsheet with a nicer UI.
//
// Note what is NOT here: nothing goes directly from treatment to closed.
// A risk closes when the cause can no longer occur, not when the score
// drops. Low risk is monitored, not closed.
// ============================================================

export const WORKFLOW_STATES = [
  { value: 'draft',              label: 'Draft',              color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb',
    desc: 'Being written. Not yet admitted to the register.' },
  { value: 'registered',         label: 'Registered',         color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe',
    desc: 'Admitted by a reviewer. The ID is now permanent.' },
  { value: 'assessed',           label: 'Assessed',           color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff',
    desc: 'Inherent and residual scored. Awaiting the gate.' },
  { value: 'treatment_required', label: 'Treatment Required', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca',
    desc: 'Outside tolerance. Treatment is mandatory, not optional.' },
  { value: 'under_treatment',    label: 'Under Treatment',    color: '#c2410c', bg: '#fff7ed', border: '#fed7aa',
    desc: 'A treatment plan is approved and running.' },
  { value: 'accepted',           label: 'Accepted',           color: '#92400e', bg: '#fffbeb', border: '#fde68a',
    desc: 'Time-bound acceptance on record. Reopens on expiry.' },
  { value: 'monitored',          label: 'Monitored',          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
    desc: 'Within tolerance. KRIs, control tests and reviews running.' },
  { value: 'closed',             label: 'Closed',             color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb',
    desc: 'The cause can no longer occur. History retained forever.' },
]

/** Whether the gate governs this state. Draft and registered are pre-measurement. */
export const GATED_STATES = ['assessed', 'treatment_required', 'under_treatment', 'accepted', 'monitored']

export const TOLERANCE_STATUSES = [
  { value: 'within',        label: 'Within tolerance',  color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'breached',      label: 'Outside tolerance', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'not_evaluated', label: 'Not evaluated',     color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

export function getToleranceStatus(v) {
  return TOLERANCE_STATUSES.find(s => s.value === v) || TOLERANCE_STATUSES[2]
}

// ============================================================
// Risk-to-control link attributes
//
// Coverage belongs on the LINK, not on the control. A control can be
// well designed and operating effectively and still be irrelevant to a
// given risk because its scope excludes the asset. Without this, a
// dashboard shows "MFA control: Effective" while 47 people log in with
// a password.
// ============================================================

export const COVERAGE_OPTIONS = [
  { value: 'full',    label: 'Full coverage',    desc: 'Applies to every asset and process in this risk’s scope',
    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'partial', label: 'Partial coverage', desc: 'Covers part of the scope — record what it excludes',
    color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'none',    label: 'No coverage',      desc: 'Scope excludes this risk entirely — the gap IS the risk',
    color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
]

export const REDUCES_OPTIONS = [
  { value: 'likelihood', label: 'Likelihood', desc: 'Makes the event less likely to happen' },
  { value: 'impact',     label: 'Impact',     desc: 'Makes the event less damaging when it does' },
  { value: 'both',       label: 'Both',       desc: 'Reduces likelihood and impact' },
]

export function getCoverage(v) {
  return COVERAGE_OPTIONS.find(c => c.value === v) || COVERAGE_OPTIONS[0]
}

export const RISK_APPETITES = [
  { value: 'Averse',   label: 'Averse',   desc: 'Zero tolerance',       color: '#b91c1c' },
  { value: 'Minimal',  label: 'Minimal',  desc: 'Very limited exposure', color: '#c2410c' },
  { value: 'Cautious', label: 'Cautious', desc: 'Some exposure OK',      color: '#92400e' },
  { value: 'Open',     label: 'Open',     desc: 'Balance risk/reward',   color: '#1e40af' },
  { value: 'Hungry',   label: 'Hungry',   desc: 'Significant exposure',  color: '#166534' },
]

export const RISK_DIRECTIONS = [
  { value: 'Increasing',  label: '↑ Increasing',  color: '#b91c1c' },
  { value: 'Stable',      label: '→ Stable',       color: '#92400e' },
  { value: 'Decreasing',  label: '↓ Decreasing',  color: '#166534' },
]

export const REVIEW_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']

export const CONTROL_TYPES = ['Preventive', 'Detective', 'Corrective', 'Compensating']
export const CONTROL_FREQUENCIES = ['Continuous', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Ad-hoc']
export const CONTROL_TESTING_STATUSES = [
  { value: 'Not Tested', label: 'Not Tested', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  { value: 'Pass',       label: 'Pass',       color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'Fail',       label: 'Fail',       color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'Partial',    label: 'Partial',    color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
]

export const EVIDENCE_TYPES = [
  'Document', 'Screenshot', 'Log', 'Attestation', 'Test Result', 'Policy', 'Certificate', 'Report'
]

export const LOSS_ROOT_CAUSE_CATEGORIES = ['People', 'Process', 'System', 'External']

export const RAG_STATUSES = [
  { value: 'Green', label: 'Green', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'Amber', label: 'Amber', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'Red',   label: 'Red',   color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
]

export const LIKELIHOOD_LABELS = {
  1: 'Rare — <5% chance',
  2: 'Unlikely — 5-20% chance',
  3: 'Possible — 20-50% chance',
  4: 'Likely — 50-80% chance',
  5: 'Almost Certain — >80% chance',
}

export const IMPACT_LABELS = {
  1: 'Insignificant — Negligible effect',
  2: 'Minor — Limited impact, manageable',
  3: 'Moderate — Noticeable, recoverable',
  4: 'Major — Significant damage',
  5: 'Catastrophic — Existential threat',
}

export const EFFECTIVENESS_LABELS = {
  1: 'Ineffective — Control is not working',
  2: 'Mostly Ineffective — Significant gaps',
  3: 'Partially Effective — Some gaps remain',
  4: 'Mostly Effective — Minor gaps',
  5: 'Fully Effective — Control is robust',
}

/**
 * Band for a score. Delegates to the matrix so a tenant's configured
 * band lookup wins over the arithmetic — see lib/matrix.js for why the
 * product alone is not a safe answer. Pass the org's matrix config when
 * it is to hand; without it the shipped 5x5 defaults apply.
 */
export function getRiskLevel(score, config) {
  return levelForScore(score, config)
}

export function getRiskStatus(value) {
  return RISK_STATUSES.find(s => s.value === value) || RISK_STATUSES[0]
}

/**
 * Map the pre-gate vocabulary onto the lifecycle. 002_risk_gate.sql does
 * this in the database; until it has been applied, rows still carry the
 * old values, and without this they would silently read as Draft and
 * drop out of the lifecycle pipeline.
 */
const LEGACY_WORKFLOW_STATES = { under_review: 'registered', approved: 'assessed' }

export function normalizeWorkflowState(value) {
  const v = LEGACY_WORKFLOW_STATES[value] || value
  // Anything the lifecycle does not know is treated as a draft — the
  // same answer getWorkflowState() gives — so a stray value can never
  // show one state in a row and be missing from the pipeline count.
  return WORKFLOW_STATES.some(s => s.value === v) ? v : 'draft'
}

export function getWorkflowState(value) {
  const v = normalizeWorkflowState(value)
  return WORKFLOW_STATES.find(s => s.value === v) || WORKFLOW_STATES[0]
}

export function getControlTestingStatus(value) {
  return CONTROL_TESTING_STATUSES.find(s => s.value === value) || CONTROL_TESTING_STATUSES[0]
}

export function getRAGStatus(value) {
  return RAG_STATUSES.find(s => s.value === value) || RAG_STATUSES[0]
}

// Calculate residual score reduction from control effectiveness
export function calculateResidualScore(inherentScore, controlEffectiveness) {
  if (!controlEffectiveness) return inherentScore
  const reduction = (controlEffectiveness - 1) * 0.15
  return Math.max(1, Math.round(inherentScore * (1 - reduction)))
}

// ============================================================
// ARCHER PARITY — workflow, treatment actions, exceptions,
// reviews, sources
// ============================================================

export const RISK_SOURCES = [
  'Manual', 'RCSA / Self-Assessment', 'Internal Audit', 'External Audit',
  'Incident', 'Regulatory Finding', 'Penetration Test', 'Vendor Assessment', 'Threat Intelligence'
]

// Workflow state machine — the MANUAL transitions only.
//
// The interesting transitions are not in this table. Moving out of
// `assessed` is the gate's decision, not a button, and four separate
// events reopen a monitored risk on their own. Those live in
// AUTO_TRANSITIONS below. Only the gate's own two transitions are applied
// today, by runGate() in useRiskGate.js when a score is saved. The reopen
// paths (KRI breach, test failure, evidence and acceptance expiry) are
// documented here but not yet automated.
export const WORKFLOW_ACTIONS = {
  draft: [
    { action: 'admitted', to: 'registered', label: 'Admit to Register', style: 'primary',
      hint: 'The reviewer validates the record and admits it. The risk ID becomes permanent.' },
  ],
  registered: [
    { action: 'returned', to: 'draft', label: 'Return to Draft', style: 'danger', requireComment: true,
      hint: 'Send back for rework before scoring' },
  ],
  assessed: [
    { action: 'returned', to: 'draft', label: 'Return to Draft', style: 'neutral', requireComment: true,
      hint: 'Withdraw the assessment and rework the record' },
  ],
  treatment_required: [
    { action: 'treatment_approved', to: 'under_treatment', label: 'Approve Treatment Plan', style: 'primary',
      hint: 'A plan is agreed and owned. Starts execution against the target residual score.' },
  ],
  under_treatment: [
    { action: 'treatment_complete', to: 'assessed', label: 'Plan Complete — Re-score', style: 'success',
      hint: 'Re-scores and re-runs the gate. Passing moves to Monitored; failing returns here.' },
  ],
  accepted: [
    { action: 'acceptance_revoked', to: 'assessed', label: 'Revoke Acceptance', style: 'danger', requireComment: true,
      hint: 'Withdraws the acceptance and puts the risk back in front of the gate' },
  ],
  monitored: [
    { action: 'closed', to: 'closed', label: 'Close Risk', style: 'neutral', requireComment: true,
      hint: 'Only when the cause can no longer occur — not because the score dropped' },
    { action: 'reopened', to: 'assessed', label: 'Reopen for Re-assessment', style: 'neutral',
      hint: 'Re-open scoring and put the risk back through the gate' },
  ],
  closed: [
    { action: 'reopened', to: 'assessed', label: 'Reopen Risk', style: 'neutral',
      hint: 'Re-activate this risk in the register' },
  ],
}

/**
 * The transitions no human performs. Each is a timer or a measurement
 * turning into a state change, which is what keeps the register alive
 * between audits.
 */
export const AUTO_TRANSITIONS = [
  { from: 'assessed',           to: 'monitored',          trigger: 'Gate: within tolerance' },
  { from: 'assessed',           to: 'treatment_required', trigger: 'Gate: outside tolerance' },
  { from: 'under_treatment',    to: 'monitored',          trigger: 'Re-scored, gate passes' },
  { from: 'under_treatment',    to: 'treatment_required', trigger: 'Plan complete, gate still fails' },
  { from: 'monitored',          to: 'assessed',           trigger: 'KRI breach' },
  { from: 'monitored',          to: 'assessed',           trigger: 'Control test failure' },
  { from: 'monitored',          to: 'assessed',           trigger: 'Evidence expiry' },
  { from: 'accepted',           to: 'assessed',           trigger: 'Acceptance expired' },
]

/** States from which the gate may move a risk on its own. */
export const GATE_MOVABLE_STATES = ['assessed', 'treatment_required', 'under_treatment', 'monitored']

export const TREATMENT_ACTION_TYPES = ['Remediation', 'Mitigation', 'Corrective', 'Improvement']

export const TREATMENT_ACTION_STATUSES = [
  { value: 'planned',      label: 'Planned',      color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  { value: 'in_progress',  label: 'In Progress',  color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'under_review', label: 'Under Review', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'completed',    label: 'Completed',    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'cancelled',    label: 'Cancelled',    color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

export const ACTION_PRIORITIES = [
  { value: 'low',      label: 'Low',      color: '#6b7280' },
  { value: 'medium',   label: 'Medium',   color: '#92400e' },
  { value: 'high',     label: 'High',     color: '#c2410c' },
  { value: 'critical', label: 'Critical', color: '#b91c1c' },
]

export const EXCEPTION_STATUSES = [
  { value: 'pending',  label: 'Pending Approval', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'approved', label: 'Approved',         color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'rejected', label: 'Rejected',         color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'expired',  label: 'Expired',          color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  { value: 'revoked',  label: 'Revoked',          color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

export const REVIEW_OUTCOMES = [
  { value: 'no_change',             label: 'No Change — Risk Re-affirmed', color: '#166534' },
  { value: 'updated',               label: 'Assessment Updated',           color: '#1e40af' },
  { value: 'escalated',             label: 'Escalated',                    color: '#b91c1c' },
  { value: 'closure_recommended',   label: 'Closure Recommended',          color: '#6b7280' },
]

export function getTreatmentActionStatus(v) {
  return TREATMENT_ACTION_STATUSES.find(s => s.value === v) || TREATMENT_ACTION_STATUSES[0]
}
export function getExceptionStatus(v) {
  return EXCEPTION_STATUSES.find(s => s.value === v) || EXCEPTION_STATUSES[0]
}
export function getReviewOutcome(v) {
  return REVIEW_OUTCOMES.find(s => s.value === v) || REVIEW_OUTCOMES[0]
}

// Next review date from frequency
export function nextReviewDate(frequency, from = new Date()) {
  const d = new Date(from)
  const months = { 'Monthly': 1, 'Quarterly': 3, 'Semi-Annual': 6, 'Annual': 12 }[frequency] || 3
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

export function isReviewOverdue(risk) {
  if (!risk?.review_date) return false
  if (risk.workflow_state === 'closed') return false
  return new Date(risk.review_date) < new Date()
}

// CSV export of the register
export function risksToCSV(risks, memberName = () => '') {
  const cols = [
    ['Risk ID', r => r.risk_id], ['Title', r => r.title], ['Category', r => r.category],
    ['Subcategory', r => r.subcategory], ['Type', r => r.risk_type], ['Business Unit', r => r.business_unit],
    ['Source', r => r.source], ['Status', r => r.status], ['Workflow', r => r.workflow_state],
    ['Treatment', r => r.treatment],
    ['Inherent Likelihood', r => r.inherent_likelihood], ['Inherent Impact', r => r.inherent_impact],
    ['Inherent Score', r => r.inherent_score],
    ['Residual Likelihood', r => r.residual_likelihood], ['Residual Impact', r => r.residual_impact],
    ['Residual Score', r => r.residual_score],
    ['Tolerance', r => getToleranceStatus(r.tolerance_status).label],
    ['Days In Breach', r => daysInBreach(r) ?? ''],
    ['Treatment Due', r => r.treatment_due_at?.split?.('T')[0] || ''],
    ['Failed Tolerance Rules', r => (r.gate_failed_rules || []).map(f => f.label).join(' | ')],
    ['Appetite', r => r.risk_appetite], ['Direction', r => r.risk_direction],
    ['Owner', r => memberName(r.owner_id)], ['Reviewer', r => memberName(r.reviewer_id)],
    ['Approver', r => memberName(r.approver_id)],
    ['Identified', r => r.identified_date], ['Next Review', r => r.review_date?.split?.('T')[0] || r.review_date],
    ['Review Frequency', r => r.review_frequency], ['Created', r => r.created_at?.split?.('T')[0]],
  ]
  const esc = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => c[0]).join(',')
  const rows = risks.map(r => cols.map(c => esc(c[1](r))).join(','))
  return [header, ...rows].join('\n')
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
