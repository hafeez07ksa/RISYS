import { withinMonths } from '../lib/manualCompliance.js'
import { ATTESTATION, file, text, date, checklist, people, nextReview } from './eccEvidenceRequirements.js'
import { PDPL_EVIDENCE_DATA } from './pdplEvidenceData.js'
import { pdplMainId } from './pdplAutomation.js'

// ============================================================
// SDAIA PDPL — WHAT EACH ARTICLE MUST PUT ON RECORD
//
// Same model as ECC and CCC. Evidence is recorded once per article; each
// numbered paragraph that puts an obligation on the Controller gets its own
// section listing what an assessor will ask to see. Paragraphs that bind
// only the regulator or the processor carry no section.
//
//   manual_evidence  documents and records; Comply sets the status
//   semi_automated   the measured part comes from a RISYS register or a
//                    connector; the reviewer confirms the rest
//   automated        RISYS measures it; until it has figures, the same
//                    record as manual, valid 90 days; once measured, a
//                    reviewer attestation while the measurement decides
// ============================================================

const shortText = (t, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

function paragraphSections(entry) {
  const fields = []
  for (const sub of entry.subs) {
    const items = sub.deliverables.length ? sub.deliverables : [`Evidence that ${sub.code} is met`]
    const single = entry.subs.length === 1
    fields.push(checklist(`on_record_${sub.code}`, 'On record', items, single ? null : shortText(sub.text, 220),
      { section: single ? 'Evidence' : `${sub.code} · ${shortText(sub.text)}` }))
    fields.push(file(`evidence_${sub.code}`, `Evidence for ${sub.code}`, 'The documents or records listed above.'))
  }
  return fields
}

function manual(entry) {
  return { title: entry.title, kind: 'manual', fields: [...people(), ...paragraphSections(entry), nextReview()] }
}

function semi(entry) {
  return {
    title: entry.title,
    kind: 'implementation',
    fields: [
      ...people(),
      date('measured_on', 'Date of this assessment', 'When you checked the RISYS figures and the records below.',
        { section: 'Measured part', notFuture: true }),
      text('measured_note', 'What the RISYS figures show', 'e.g. "38 of 40 requests answered on time; the two late ones are explained in REQ-0007 and REQ-0012".'),
      ...paragraphSections(entry),
      checklist('judgement', 'Reviewer confirms', [
        'The RISYS registers cover every processing activity, request and breach in scope',
        'Gaps found are tracked to closure',
      ], 'The part no system can decide.', { section: 'Judgement' }),
      nextReview(),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.measured_on, 3, now),
        message: 'The assessment is more than three months old — check the current figures.' },
    ],
  }
}

function interim(entry) {
  return {
    ...manual(entry),
    kind: 'interim',
    fields: [
      ...people(),
      ...paragraphSections(entry),
      nextReview({
        maxDaysAhead: 90,
        help: 'RISYS will measure this once the Privacy registers hold records: re-evidence within 90 days, or start using the register.',
      }),
    ],
  }
}

/** { mode, def } for a PDPL article's Comply form, or null. */
export function pdplEvidenceRequirementFor(id, { measured = false } = {}) {
  const main = pdplMainId(id)
  if (main !== id) return null
  const entry = PDPL_EVIDENCE_DATA[main]
  if (!entry) return null
  if (entry.cls === 'automated') {
    return measured ? { mode: 'attestation', def: ATTESTATION } : { mode: 'interim', def: interim(entry) }
  }
  if (entry.cls === 'semi_automated') return { mode: 'semi', def: semi(entry) }
  return { mode: 'manual', def: manual(entry) }
}
