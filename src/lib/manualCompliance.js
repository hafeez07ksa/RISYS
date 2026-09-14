// ============================================================
// EVIDENCED COMPLIANCE — manual-evidence controls
//
// A manual control is met when the artefacts an assessor expects are on
// record and nothing on record contradicts it. This module decides both,
// from a control's checklist definition (src/data/eccManualRequirements.js)
// and the answers and files captured against it.
//
// Pure: no React, no Supabase, the clock only through `now`, so it runs
// under plain Node for verification.
// ============================================================

export const CADENCE_MONTHS = { Monthly: 1, Quarterly: 3, 'Semi-annual': 6, Annual: 12 }

/** Local calendar date as yyyy-mm-dd — ISO strings then compare correctly as text. */
export function localISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** True when `iso` falls within the last `months` months. Missing input is not a failure. */
export function withinMonths(iso, months, now = new Date()) {
  if (!iso || !months) return true
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
  return iso >= localISO(cutoff)
}

export function isVisible(field, answers = {}) {
  return !field.showIf || !!field.showIf(answers)
}

export function isFilled(field, answers = {}, files = {}) {
  const v = answers[field.key]
  switch (field.type) {
    case 'file':        return (files[field.key] || []).length > 0
    case 'check':       return v === true
    case 'checklist':   return field.items.every(i => v?.[i.key] === true)
    case 'multiselect': return Array.isArray(v) && v.length > 0
    case 'yesno':       return v === 'yes' || v === 'no'
    case 'number':      return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
    default:            return String(v ?? '').trim() !== ''
  }
}

// The date a next-review must follow — whichever event the evidence records.
const ANCHOR_KEYS = ['approved_on', 'reviewed_on', 'review_date', 'test_date', 'last_meeting', 'assessed_on']

/**
 * Checklist progress and blocking problems for one submission.
 * `ready` is the single condition that enables Comply.
 */
export function evaluateSubmission(def, answers = {}, files = {}, now = new Date()) {
  if (!def) return { items: [], blockers: [], done: 0, total: 0, ready: false }
  const today = localISO(now)
  const fields = def.fields.filter(f => isVisible(f, answers))

  const items = fields
    .filter(f => !f.optional)
    .map(f => ({ key: f.key, label: f.label, done: isFilled(f, answers, files) }))

  const blockers = []
  for (const f of fields) {
    const v = answers[f.key]
    if (f.type === 'date' && v) {
      if (f.notFuture && v > today) blockers.push(`${f.label} cannot be in the future.`)
      if (f.future && v <= today) blockers.push(`${f.label} must be a future date.`)
    }
    if (f.type === 'number' && isFilled(f, answers)) {
      const n = Number(v)
      if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) {
        blockers.push(`${f.label} must be between ${f.min} and ${f.max}.`)
      }
    }
  }

  const anchor = ANCHOR_KEYS.map(k => answers[k]).filter(Boolean).sort().pop()
  if (answers.next_review && anchor && answers.next_review <= anchor) {
    blockers.push('Next review date must fall after the date the evidence records.')
  }

  for (const rule of def.rules || []) {
    if (!rule.test(answers, { now })) blockers.push(rule.message)
  }

  const done = items.filter(i => i.done).length
  return {
    items, blockers, done, total: items.length,
    ready: items.length > 0 && done === items.length && blockers.length === 0,
  }
}

/** Drop answers and files belonging to fields the answers have hidden. */
export function pruneSubmission(def, answers = {}, files = {}) {
  const keep = new Set(def.fields.filter(f => isVisible(f, answers)).map(f => f.key))
  return {
    answers: Object.fromEntries(Object.entries(answers).filter(([k]) => keep.has(k))),
    files: Object.fromEntries(Object.entries(files).filter(([k]) => keep.has(k))),
  }
}
