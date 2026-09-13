// Gate engine check — run with `npm run test:gate`.
//
// Walks the MFA worked example from the risk-lifecycle document through
// the real gate engine, stage by stage: the coverage gap that CTL-012
// hides, the breach at residual 16, the authority block on Accept, and
// the clearance at 6 after the control's scope is actually extended.
//
// lib/gate.js and lib/matrix.js are deliberately free of React and
// Supabase imports, which is what lets this run under plain Node with no
// test framework, no database and no build step.
import { evaluateGate, buildSignals, coverageGaps, residualDropWarning, daysInBreach, treatmentSLA } from '../src/lib/gate.js'
import { bandFor, bandForScore, DEFAULT_MATRIX, bandWithin } from '../src/lib/matrix.js'
import { requiredAuthority, acceptanceType, canApprove } from '../src/lib/authority.js'
import { treatmentReadiness } from '../src/lib/treatment.js'
import { findCandidates, toTriageState } from '../src/lib/triage.js'

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  ok ? pass++ : fail++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}  got ${JSON.stringify(actual)}`)
}

// Cyber tolerance for this tenant, as the doc states it.
const cyberTolerance = {
  category: 'Cybersecurity',
  appetite: 'Averse',
  appetite_statement: 'Low appetite for cyber risk on internet-facing assets.',
  rules: [
    { metric: 'residual_score', operator: '<=', value: 8, label: 'Residual score at or below 8' },
    { metric: 'uncovered_controls', operator: '==', value: 0, label: 'No linked control with a coverage gap' },
  ],
  max_accept_band: 'medium',
  treatment_sla_days: 10,
  escalate_to: 'Cybersecurity Steering Committee',
}

const risk = {
  id: 'r1', risk_id: 'RSK-0318', category: 'Cybersecurity',
  title: 'MFA not enforced on remote access',
  workflow_state: 'assessed',
  inherent_likelihood: 5, inherent_impact: 5, inherent_score: 25,
}

// CTL-012: effective, operating, and irrelevant here — its scope excludes the VPN.
const controls = [
  { id: 'c4',  control_id: 'CTL-004', name: 'Password policy',        testing_status: 'Pass', effectiveness: 4 },
  { id: 'c12', control_id: 'CTL-012', name: 'MFA via identity provider', testing_status: 'Pass', effectiveness: 5 },
  { id: 'c33', control_id: 'CTL-033', name: 'Account lockout',        testing_status: 'Pass', effectiveness: 4 },
  { id: 'c29', control_id: 'CTL-029', name: 'VPN session logging',    testing_status: 'Partial', effectiveness: 3 },
]
const mappings = [
  { control_id: 'c4',  coverage: 'full',    reduces: 'likelihood' },
  { control_id: 'c12', coverage: 'none',    reduces: 'likelihood', coverage_note: 'SaaS apps only — excludes VPN' },
  { control_id: 'c33', coverage: 'full',    reduces: 'likelihood' },
  { control_id: 'c29', coverage: 'partial', reduces: 'impact', coverage_note: 'no alert rule configured' },
]

console.log('\n── Matrix ────────────────────────────────────────────')
check('L5 x I5 bands critical',        bandFor(5, 5, DEFAULT_MATRIX), 'critical')
// NOTE: the shipped bands are the product's existing ones (>=20 critical,
// >=12 high, >=6 medium). The process doc's worked example uses a
// different table (15-25 critical, 10-14 high), which is why it calls 16
// "Critical" where the app says "High". Preserved deliberately so that
// applying the migration re-bands nothing; the tenant can change it below.
check('L4 x I4 = 16 bands high (shipped bands)', bandFor(4, 4, DEFAULT_MATRIX), 'high')
check('L2 x I3 = 6 bands medium',      bandFor(2, 3, DEFAULT_MATRIX), 'medium')
check('score 16 bands high',           bandForScore(16, DEFAULT_MATRIX), 'high')

// The point of a lookup table rather than arithmetic: a tenant can band
// the doc's way, or asymmetrically, without touching the scoring.
const docMatrix = {
  version: 2, dimensions: 5,
  cells: DEFAULT_MATRIX.cells.map(c => ({ ...c,
    band: c.score >= 15 ? 'critical' : c.score >= 10 ? 'high' : c.score >= 5 ? 'medium' : 'low' })),
}
check('same score re-bands under a tenant matrix', bandFor(4, 4, docMatrix), 'critical')

// Asymmetry: L=5 x I=1 and L=1 x I=5 both score 5 but need different answers.
const asym = { version: 3, dimensions: 5,
  cells: DEFAULT_MATRIX.cells.map(c => (c.l === 1 && c.i === 5) ? { ...c, band: 'high' } : c) }
check('L1 x I5 can be High while...', bandFor(1, 5, asym), 'high')
check('...L5 x I1 stays Low at the same score 5', bandFor(5, 1, asym), 'low')
check('critical is not within a medium ceiling', bandWithin('critical', 'medium'), false)
check('medium is within a medium ceiling',       bandWithin('medium', 'medium'), true)

console.log('\n── Stage 5: coverage gap detection ───────────────────')
const gaps = coverageGaps(mappings, controls)
check('two controls flagged as gaps', gaps.length, 2)
check('CTL-012 flagged as misleading (passing but covering nothing)',
  gaps.find(g => g.ref === 'CTL-012').misleading, true)

console.log('\n── Stage 6/7: residual 16, the gate fires ────────────')
const breached = { ...risk, residual_likelihood: 4, residual_impact: 4, residual_score: 16 }
const sigB = buildSignals({ risk: breached, mappings, controls })
check('uncovered_controls signal = 1', sigB.uncovered_controls, 1)
const vB = evaluateGate({ risk: breached, tolerance: cyberTolerance, signals: sigB, matrix: DEFAULT_MATRIX })
check('gate evaluated',           vB.evaluated, true)
check('gate FAILS',               vB.passed, false)
check('status breached',          vB.status, 'breached')
check('both rules fail',          vB.failedRules.length, 2)
check('breach delta is 16 vs 8',  vB.breachDelta, { actual: 16, limit: 8 })
check('required state',           vB.requiredState, 'treatment_required')
check('Accept is blocked',        vB.acceptBlocked, true)
check('escalation target named',  vB.escalateTo, 'Cybersecurity Steering Committee')
check('outside tolerance at High: an exception for the Steering Committee',
  [vB.requiredAuthority, vB.acceptanceType], ['committee', 'exception'])
console.log(`        reason: ${vB.acceptBlockedReason}`)

console.log('\n── Stage 11: re-scored to 6 after real remediation ───')
// CTL-012 coverage extended to remote access; CTL-029 alert rule added.
const fixedMappings = mappings.map(m =>
  m.control_id === 'c12' ? { ...m, coverage: 'full', coverage_note: null }
  : m.control_id === 'c29' ? { ...m, coverage: 'full' } : m)
const cleared = { ...risk, workflow_state: 'treatment_required', residual_likelihood: 2, residual_impact: 3, residual_score: 6 }
const sigC = buildSignals({ risk: cleared, mappings: fixedMappings, controls })
const vC = evaluateGate({ risk: cleared, tolerance: cyberTolerance, signals: sigC, matrix: DEFAULT_MATRIX })
check('gate PASSES',        vC.passed, true)
check('status within',      vC.status, 'within')
check('required state',     vC.requiredState, 'monitored')
check('within tolerance at Medium: an acceptance the CISO signs', [vC.requiredAuthority, vC.acceptanceType], ['ciso', 'acceptance'])
check('no coverage gaps left', coverageGaps(fixedMappings, controls).length, 0)

console.log('\n── The gate abstains rather than guessing ────────────')
const unscored = evaluateGate({ risk, tolerance: cyberTolerance, signals: buildSignals({ risk }), matrix: DEFAULT_MATRIX })
check('no residual score -> not evaluated', unscored.evaluated, false)
check('and does NOT default to pass',       unscored.passed, null)
const noRules = evaluateGate({ risk: breached, tolerance: null, signals: sigB, matrix: DEFAULT_MATRIX })
check('no tolerance -> not evaluated',      noRules.evaluated, false)
check('and does NOT default to pass',       noRules.passed, null)

// Found walking RSK-0008 through the live app: a fresh draft showed
// "Outside tolerance · 25 against 8" because the generated residual_score
// column falls back to the inherent score when residual was never scored.
const freshDraft = { ...risk, workflow_state: 'draft', residual_score: 25 }   // no residual L/I
check('generated residual fallback is not treated as a residual score',
  buildSignals({ risk: freshDraft }).residual_score, null)
check('a draft is not judged, even with a critical inherent score',
  evaluateGate({ risk: freshDraft, tolerance: cyberTolerance, signals: buildSignals({ risk: freshDraft }), matrix: DEFAULT_MATRIX }).evaluated, false)
const registered = { ...breached, workflow_state: 'registered' }
check('a registered risk is not judged either, even when scored',
  evaluateGate({ risk: registered, tolerance: cyberTolerance, signals: buildSignals({ risk: registered, mappings, controls }), matrix: DEFAULT_MATRIX }).evaluated, false)
check('and Accept is not blocked on an unjudged draft',
  evaluateGate({ risk: freshDraft, tolerance: cyberTolerance, signals: buildSignals({ risk: freshDraft }), matrix: DEFAULT_MATRIX }).acceptBlocked, false)

console.log('\n── Unmeasurable rules are skipped, not failed ────────')
const kriTol = { ...cyberTolerance, rules: [{ metric: 'kri_breaches', operator: '==', value: 0, label: 'No KRI in breach' },
                                            { metric: 'residual_score', operator: '<=', value: 8, label: 'Residual at or below 8' }] }
const vK = evaluateGate({ risk: cleared, tolerance: kriTol, signals: buildSignals({ risk: cleared, mappings: fixedMappings, controls, kris: [] }), matrix: DEFAULT_MATRIX })
check('zero KRIs measures as 0, rule passes', vK.passed, true)

console.log('\n── The 25 -> 6 drop challenge ────────────────────────')
check('big drop with no controls credited is challenged',
  typeof residualDropWarning({ inherentScore: 25, residualScore: 6, creditedControls: 0 }), 'string')
check('same drop with 3 controls credited is not',
  residualDropWarning({ inherentScore: 25, residualScore: 6, creditedControls: 3 }), null)
check('modest drop is not challenged',
  residualDropWarning({ inherentScore: 16, residualScore: 12, creditedControls: 0 }), null)

console.log('\n── Breach clock ─────────────────────────────────────')
const t0 = new Date('2026-09-01T00:00:00Z')
const now = new Date('2026-09-13T00:00:00Z')
check('12 days in breach', daysInBreach({ breach_since: t0.toISOString() }, now), 12)
const sla = treatmentSLA({ treatment_due_at: new Date('2026-09-11T00:00:00Z').toISOString() }, now)
check('SLA overdue', sla.overdue, true)
check('overdue by 2 days', sla.days, -2)

console.log('\n── Acceptance authority ladder ───────────────────────')
check('Low, within tolerance: the risk owner accepts', requiredAuthority({ band: 'low', withinTolerance: true }), 'risk_owner')
check('Medium, within tolerance: the CISO', requiredAuthority({ band: 'medium', withinTolerance: true }), 'ciso')
check('Critical: the board, in or out of tolerance',
  [requiredAuthority({ band: 'critical', withinTolerance: true }), requiredAuthority({ band: 'critical', withinTolerance: false })], ['board', 'board'])
// The document's acceptance variant: compensating controls bring residual to 9, still above 8.
check('MFA variant: 9 above tolerance is a committee exception, not a CISO acceptance',
  [requiredAuthority({ band: bandForScore(9, DEFAULT_MATRIX), withinTolerance: false }), acceptanceType(false)], ['committee', 'exception'])
const holders = [{ tier: 'ciso', user_id: 'u-ciso' }, { tier: 'committee', user_id: 'u-chair' }]
const owned = { owner_id: 'u-owner' }
check('the risk owner may approve their own Low acceptance',
  canApprove({ userId: 'u-owner', risk: owned, holders, required: 'risk_owner', requestedBy: 'u-owner' }).allowed, true)
check('the CISO cannot sign a committee-level exception',
  canApprove({ userId: 'u-ciso', risk: owned, holders, required: 'committee', requestedBy: 'u-owner' }).allowed, false)
check('the committee chair can',
  canApprove({ userId: 'u-chair', risk: owned, holders, required: 'committee', requestedBy: 'u-owner' }).allowed, true)
check('nobody approves an exception they raised themselves',
  canApprove({ userId: 'u-chair', risk: owned, holders, required: 'committee', requestedBy: 'u-chair' }).allowed, false)
check('a higher authority can sign a lower-tier acceptance',
  canApprove({ userId: 'u-chair', risk: owned, holders, required: 'ciso', requestedBy: 'u-owner' }).allowed, true)

console.log('\n── Step 9: treatment decision ────────────────────────')
const decidedOptions = [
  { option: 'avoid',    decision: 'selected', horizon: 'long_term' },
  { option: 'reduce',   decision: 'selected', horizon: 'immediate' },
  { option: 'transfer', decision: 'rejected', rejection_reason: 'Moves financial impact only; does not fix ECC non-compliance.' },
  { option: 'accept',   decision: 'not_available', rejection_reason: 'Blocked by the gate at Critical.' },
]
const mfaPlans = [
  { option: 'reduce', plan_ref: 'MIT-0521', status: 'planned', target_likelihood: 2, target_impact: 3 },
  { option: 'avoid',  plan_ref: 'MIT-0522', status: 'planned', target_likelihood: 1, target_impact: 1 },
]
check('all four decided, Reduce + Avoid both planned: ready', treatmentReadiness({ options: decidedOptions, plans: mfaPlans }).ready, true)
check('an undecided option blocks approval', treatmentReadiness({ options: decidedOptions.slice(0, 3), plans: mfaPlans }).ready, false)
check('a rejection without its reason blocks approval',
  treatmentReadiness({ options: decidedOptions.map(o => o.option === 'transfer' ? { ...o, rejection_reason: '' } : o), plans: mfaPlans }).ready, false)
check('a selected option without a targeted plan blocks approval',
  treatmentReadiness({ options: decidedOptions, plans: mfaPlans.slice(0, 1) }).ready, false)
check('Accept on its own is not a treatment plan', treatmentReadiness({
  options: [
    { option: 'avoid', decision: 'rejected', rejection_reason: 'x' }, { option: 'reduce', decision: 'rejected', rejection_reason: 'x' },
    { option: 'transfer', decision: 'rejected', rejection_reason: 'x' }, { option: 'accept', decision: 'selected' },
  ], plans: [] }).ready, false)

console.log('\n── Step 2: triage duplicate search ───────────────────')
const vpnFinding = { key: 'entra:vpn:mfa', title: 'No MFA registered', subject: { id: 'VPN-LEGACY-01', name: 'VPN-LEGACY-01' }, control: 'NCA ECC 2-1-2 · Privileged Access Management' }
const pool = [
  { id: 'r-match',  title: 'MFA not enforced on remote access', category: 'Cybersecurity', source_entity_id: 'VPN-LEGACY-01', framework_ref: 'NCA ECC 2-1-2', workflow_state: 'monitored' },
  { id: 'r-req',    title: 'Privileged accounts lack MFA', category: 'Cybersecurity', framework_ref: 'NCA-ECC 2-1-2', workflow_state: 'assessed' },
  { id: 'r-other',  title: 'No incident response plan documented', category: 'Cybersecurity', workflow_state: 'draft' },
  { id: 'r-closed', title: 'MFA not enforced on remote access', category: 'Cybersecurity', source_entity_id: 'VPN-LEGACY-01', workflow_state: 'closed' },
]
const cands = findCandidates({ finding: vpnFinding, risks: pool })
check('same asset + requirement ranks first', cands[0]?.risk.id, 'r-match')
check('same requirement alone is still offered', cands.some(c => c.risk.id === 'r-req'), true)
check('category alone is not a match', cands.some(c => c.risk.id === 'r-other'), false)
check('closed risks are never offered', cands.some(c => c.risk.id === 'r-closed'), false)
check('each candidate shows why it matched', cands[0]?.reasons.some(r => r.startsWith('Same asset')), true)
check('router state drops the icon component, which cannot be cloned', 'icon' in toTriageState({ ...vpnFinding, icon: () => null }), false)

console.log(`\n${fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
