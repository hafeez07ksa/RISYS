// ============================================================
// FINDING TRIAGE — step 2 of the risk process
//
// A finding is a fact, not a risk. If scanners wrote straight into the
// register it would be a noise dump within a month, so a human triages
// every finding into one of three outcomes:
//
//   A. An existing risk already covers it  → attach it as evidence
//   B. No existing risk covers it           → create a new draft risk
//   C. It is not a risk                     → close it with a reason code
//
// The system's job is to put the likely duplicates in front of the
// analyst — matched on asset, requirement and wording — never to merge
// them itself. A human confirms.
// ============================================================

export const CLOSE_REASON_CODES = [
  { value: 'false_positive',       label: 'False positive',
    desc: 'The finding is factually wrong for this asset.' },
  { value: 'out_of_scope',         label: 'Out of scope',
    desc: 'The asset or system is outside the assessed scope.' },
  { value: 'compensating_control', label: 'Compensating control verified',
    desc: 'An existing control already mitigates it, and that control is evidenced.' },
]

export const TRIAGE_DISPOSITIONS = {
  created:  { label: 'New risk created' },
  attached: { label: 'Attached to an existing risk' },
  closed:   { label: 'Closed — not a risk' },
}

export function closeReasonMeta(value) {
  return CLOSE_REASON_CODES.find(r => r.value === value) || null
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'not', 'are', 'has', 'have', 'from', 'into', 'this', 'that',
  'without', 'user', 'users', 'account', 'accounts', 'risk', 'enabled', 'policy',
])

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
}

/** Clause-style identifiers such as 2-1-2 or 1-5-3-1. */
export function requirementIds(text) {
  return [...new Set(String(text || '').match(/\b\d+(?:-\d+){1,3}\b/g) || [])]
}

/**
 * Existing risks that might already cover a finding, best match first.
 * Each candidate carries the reasons it matched, because a bare score
 * gives the analyst nothing to confirm or dismiss.
 *
 * Category alone never qualifies — every connector finding is "cyber" —
 * so a candidate needs an asset, requirement or rule in common.
 */
export function findCandidates({ finding, risks = [], category = 'Cybersecurity', limit = 5 } = {}) {
  if (!finding) return []
  const subjectId = finding.subject?.id != null ? String(finding.subject.id) : null
  const subjectName = finding.subject?.name ? finding.subject.name.toLowerCase().trim() : null
  const findingReqs = requirementIds(finding.control)
  const findingWords = new Set(tokens(`${finding.title || ''} ${finding.label || ''}`))

  return risks
    .filter(r => r.workflow_state !== 'closed')
    .map(r => {
      let score = 0
      const reasons = []

      if (subjectId && r.source_entity_id != null && String(r.source_entity_id) === subjectId) {
        score += 50
        reasons.push(`Same asset: ${finding.subject.name || subjectId}`)
      } else if (subjectName && r.source_entity_name && r.source_entity_name.toLowerCase().trim() === subjectName) {
        score += 40
        reasons.push(`Same asset: ${finding.subject.name}`)
      }

      const sharedReq = findingReqs.find(q => requirementIds(`${r.framework_ref || ''} ${r.description || ''}`).includes(q))
      if (sharedReq) {
        score += 30
        reasons.push(`Same requirement: ${sharedReq}`)
      }

      if (finding.title && r.source_finding && r.source_finding === finding.title) {
        score += 25
        reasons.push('Raised from the same finding rule')
      }

      if (category && r.category === category) {
        score += 10
        reasons.push(`Same category: ${category}`)
      }

      const riskWords = new Set(tokens(`${r.title || ''} ${r.risk_statement || ''}`))
      const shared = [...findingWords].filter(w => riskWords.has(w))
      if (shared.length >= 2) {
        score += Math.min(20, shared.length * 7)
        reasons.push(`Similar wording: ${shared.slice(0, 4).join(', ')}`)
      }

      return { risk: r, score, reasons }
    })
    .filter(c => c.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * A normalised finding carries its icon as a React component, and the
 * router clones navigation state — a function in it throws. Keep only the
 * plain data triage needs.
 */
export function toTriageState(finding) {
  if (!finding) return null
  return {
    key: finding.key,
    connectorId: finding.connectorId,
    connectorName: finding.connectorName,
    severity: finding.severity,
    label: finding.label,
    title: finding.title,
    description: finding.description,
    control: finding.control,
    recommendation: finding.recommendation,
    subject: finding.subject ? {
      id: finding.subject.id != null ? String(finding.subject.id) : null,
      name: finding.subject.name || null,
      email: finding.subject.email || null,
      route: finding.subject.route || null,
    } : null,
  }
}

/** The draft risk a finding becomes when no existing risk covers it. */
export function draftRiskFromFinding(finding, { title, likelihood, impact, userId, orgId }) {
  const subject = finding.subject || {}
  return {
    org_id: orgId,
    title,
    description:
      `${finding.description || ''}\n\nSubject: ${subject.name || '—'}${subject.email ? ` (${subject.email})` : ''}` +
      `\nSource: ${finding.connectorName || finding.connectorId || '—'}\nFinding: ${finding.title}` +
      `\nControl reference: ${finding.control || '—'}`,
    category: 'Cybersecurity',
    risk_type: 'Operational',
    source: 'Incident',
    framework_ref: finding.control ? finding.control.split('·')[0].trim() : null,
    inherent_likelihood: likelihood,
    inherent_impact: impact,
    likelihood,
    impact,
    status: 'open',
    workflow_state: 'draft',
    source_connector: finding.connectorId || null,
    source_entity_id: subject.id || null,
    source_entity_name: subject.name || null,
    source_finding: finding.title || null,
    created_by: userId,
  }
}
