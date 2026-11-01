import { CADENCE_MONTHS, withinMonths, addMonthsISO } from '../lib/manualCompliance.js'
import { ATTESTATION, file, text, date, select, checklist, people, nextReview } from './eccEvidenceRequirements.js'
import { CCC_EVIDENCE_DATA } from './cccEvidenceData.js'
import { cccAutomationClassFor, cccMainId } from './cccAutomation.js'

// ============================================================
// NCA CCC-2:2024 — WHAT EACH MAIN CONTROL MUST PUT ON RECORD
//
// Same model as ECC (src/data/eccEvidenceRequirements.js). Evidence is
// recorded once per main control; each subcontrol gets its own section
// listing NCA's "expected deliverables" from the implementation guides
// (GCCC-CST-1:2023 for tenants, GCCC-CSP-2:2026 for providers), so the form
// asks for exactly what an assessor will ask to see.
//
//   manual_evidence  documents and records; Comply sets the status
//   semi_automated   a dated platform export plus the judgement around it
//   automated        interim export until a connector measures it, then a
//                    reviewer attestation while the connector decides
//
// The workspace's data classification level decides what is asked for:
// a subcontrol that is optional at that level is optional here, and one that
// is not applicable is left out (CCC Annex A).
// ============================================================

const shortText = (t, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** One section per subcontrol: what NCA expects on record, and the files that show it. */
function subcontrolSections(entry, level) {
  const fields = []
  for (const sub of entry.subs) {
    const applicability = sub.levels?.[String(level)] || 'mandatory'
    if (applicability === 'not_applicable') continue
    const optional = applicability === 'optional'
    const items = sub.deliverables.length ? sub.deliverables : [`Evidence that ${sub.code} is in place`]
    fields.push(checklist(`on_record_${sub.code}`, 'On record', items,
      optional ? 'Optional (recommended) at your data level.' : sub.text,
      { section: `${sub.code} · ${shortText(sub.text)}`, optional }))
    fields.push(file(`evidence_${sub.code}`, `Evidence for ${sub.code}`,
      'The documents, exports or records listed above.', { optional }))
  }
  return fields
}

function deliverablesChecklist(entry, label = 'The document covers') {
  return entry.deliverables.length
    ? [checklist('content', label, entry.deliverables, 'NCA expected deliverables for this control.', { section: 'Content' })]
    : []
}

// ── X-1: requirements identified, documented and approved ───────────────────
function documented(entry) {
  return {
    title: entry.title,
    kind: 'document',
    fields: [
      ...people(),
      file('document', 'Approved requirements document', 'The signed, approved version — not a draft.', { section: 'Approved document' }),
      text('version', 'Document version', 'e.g. v1.0'),
      text('approver', 'Approved by', 'Name and title of the Authorizing Official, or the documented delegate.'),
      date('approved_on', 'Approval date', null, { notFuture: true }),
      file('approval_record', 'Approval record', 'Committee minutes, a signature page or an approval memo.'),
      ...deliverablesChecklist(entry),
      nextReview(),
    ],
  }
}

// ── X-2: requirements applied ───────────────────────────────────────────────
function applied(entry) {
  return {
    title: entry.title,
    kind: 'implementation',
    fields: [
      ...people(),
      file('implementation', 'Evidence the requirements are applied', 'Records from the process itself — tickets, logs, sign-offs.', { section: 'Implementation' }),
      date('measured_on', 'Date of the evidence', null, { notFuture: true }),
      ...deliverablesChecklist(entry, 'On record'),
      checklist('judgement', 'Reviewer confirms', [
        'The approved requirements are followed in practice, not only on paper',
        'Exceptions are documented and managed',
      ], null, { section: 'Judgement' }),
      nextReview(),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.measured_on, 3, now),
        message: 'The evidence is more than three months old — record current evidence.' },
    ],
  }
}

// ── X-4: applied and reviewed periodically ──────────────────────────────────
function reviewed(entry) {
  return {
    title: entry.title,
    kind: 'review',
    fields: [
      ...people(),
      select('frequency', 'Review frequency', Object.keys(CADENCE_MONTHS), 'NCA expects at least an annual review.', { section: 'Review' }),
      date('reviewed_on', 'Date of this review', null, { notFuture: true }),
      file('review_record', 'Review record', 'Minutes or a signed review note, with the change log.'),
      ...(entry.deliverables.length ? [checklist('covered', 'On record', entry.deliverables)] : []),
      text('changes', 'Changes made as a result', 'Write "None" if the review changed nothing.'),
      nextReview(),
    ],
    rules: [
      { test: a => !a.reviewed_on || !a.frequency || !a.next_review
          || a.next_review <= addMonthsISO(a.reviewed_on, CADENCE_MONTHS[a.frequency]),
        message: 'The next review must fall within the chosen review frequency.' },
    ],
  }
}

// ── Main controls with subcontrols ──────────────────────────────────────────
function controlSet(entry, cls, level) {
  const subs = subcontrolSections(entry, level)
  if (cls === 'manual_evidence') {
    return { title: entry.title, kind: 'manual', fields: [...people(), ...subs, nextReview()] }
  }
  if (cls === 'semi_automated') {
    return {
      title: entry.title,
      kind: 'implementation',
      fields: [
        ...people(),
        file('platform_export', 'Measured part — dated platform export',
          entry.platforms ? `From the platform that measures it, e.g. ${entry.platforms}` : 'A dated export or report.', { section: 'Measured part' }),
        date('measured_on', 'Date of the export', null, { notFuture: true }),
        ...subs,
        checklist('judgement', 'Reviewer confirms', [
          'The evidence covers every cloud service in scope',
          'Gaps found are tracked to closure',
        ], 'The part no system can decide.', { section: 'Judgement' }),
        nextReview(),
      ],
      rules: [
        { test: (a, { now }) => withinMonths(a.measured_on, 3, now),
          message: 'The platform export is more than three months old — export current figures.' },
      ],
    }
  }
  // automated, no measured result yet: interim evidence
  return {
    title: entry.title,
    kind: 'interim',
    fields: [
      ...people(),
      text('source_platform', 'Platform the figures come from',
        entry.platforms ? `e.g. ${entry.platforms}` : null, { section: 'Interim evidence' }),
      file('platform_export', 'Dated export from the platform', 'Screenshots only where the platform has no export.'),
      date('measured_on', 'Date of the export', null, { notFuture: true }),
      ...subs,
      checklist('confirm', 'Reviewer confirms', [
        'The export covers every cloud service and account in scope',
      ], null, { section: 'Scope' }),
      nextReview({
        maxDaysAhead: 90,
        help: 'Interim evidence is a point-in-time export: re-evidence within 90 days, or connect the platform.',
      }),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.measured_on, 1, now),
        message: 'Interim evidence must come from an export taken within the last month.' },
    ],
  }
}

/**
 * How a main CCC control is evidenced at the workspace's level, and its checklist.
 * Same contract as evidenceRequirementFor() for ECC: { mode, def } or null.
 */
export function cccEvidenceRequirementFor(id, { measured = false, level = 3 } = {}) {
  const main = cccMainId(id)
  if (main !== id) return null
  const entry = CCC_EVIDENCE_DATA[main]
  const cls = cccAutomationClassFor(main)
  if (!entry || !cls) return null

  if (entry.kind === 'document') return { mode: 'manual', def: documented(entry) }
  if (entry.kind === 'review')   return { mode: 'semi',   def: reviewed(entry) }
  if (entry.kind === 'apply')    return { mode: cls === 'automated' && measured ? 'attestation' : 'semi', def: cls === 'automated' && measured ? ATTESTATION : applied(entry) }

  if (cls === 'automated' && measured) return { mode: 'attestation', def: ATTESTATION }
  const def = controlSet(entry, cls, level)
  const mode = cls === 'manual_evidence' ? 'manual' : cls === 'semi_automated' ? 'semi' : 'interim'
  return { mode, def }
}
