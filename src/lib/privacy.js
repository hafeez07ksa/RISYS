import { tx } from '@/lib/i18n'
import { todayRiyadh, daysUntil } from '@/lib/policies'

/* ── Privacy (PDPL): shared vocabulary ────────────────────────────────────────
 *
 * The rules live in the database (migration 20261108220913_privacy_pdpl):
 * the clocks, who may act, what a step needs before it is accepted. This file
 * holds labels, badge tones, the PDPL references the pages quote and the few
 * read-only calculations the pages share.
 * -------------------------------------------------------------------------- */

export const PDPL = {
  requests: 'PDPL-IR Art. 3',
  breach: 'PDPL-IR Art. 24',
  assessment: 'PDPL-IR Art. 25',
  ropa: 'PDPL-IR Art. 33',
}

export const LAWFUL_BASES = [
  { value: 'consent', label: tx('Consent of the data subject') },
  { value: 'contract', label: tx('Performance of a contract') },
  { value: 'legal_obligation', label: tx('Legal obligation') },
  { value: 'vital_interest', label: tx('Vital interest of the data subject') },
  { value: 'public_interest', label: tx('Public interest or official authority') },
  { value: 'legitimate_interest', label: tx('Legitimate interest of the controller') },
]

export const REQUEST_TYPES = [
  { value: 'information', label: tx('To be informed') },
  { value: 'access', label: tx('Access to their data') },
  { value: 'copy', label: tx('A copy of their data') },
  { value: 'correction', label: tx('Correction') },
  { value: 'destruction', label: tx('Destruction') },
  { value: 'withdraw_consent', label: tx('Withdraw consent') },
  { value: 'other', label: tx('Other') },
]

export const CHANNELS = [
  { value: 'email', label: tx('Email') },
  { value: 'web', label: tx('Web form') },
  { value: 'phone', label: tx('Phone (oral)') },
  { value: 'in_person', label: tx('In person (oral)') },
  { value: 'letter', label: tx('Letter') },
  { value: 'other', label: tx('Other') },
]

export const REQUEST_STATUSES = [
  { value: 'received', label: tx('Received') },
  { value: 'in_progress', label: tx('In progress') },
  { value: 'completed', label: tx('Completed') },
  { value: 'refused', label: tx('Refused') },
  { value: 'withdrawn', label: tx('Withdrawn') },
]

export const REFUSAL_REASONS = [
  { value: 'repetitive', label: tx('Repetitive') },
  { value: 'manifestly_unfounded', label: tx('Manifestly unfounded') },
  { value: 'disproportionate', label: tx('Requires disproportionate effort') },
]

export const NOTIFIABLE = [
  { value: 'pending', label: tx('Not yet assessed') },
  { value: 'notifiable', label: tx('Notifiable') },
  { value: 'not_notifiable', label: tx('Not notifiable') },
]

export const ASSESSMENT_STATUSES = [
  { value: 'draft', label: tx('Draft') },
  { value: 'in_review', label: tx('In review') },
  { value: 'returned', label: tx('Returned') },
  { value: 'approved', label: tx('Approved') },
  { value: 'superseded', label: tx('Superseded') },
]

export const RATINGS = [
  { value: 'low', label: tx('Low') },
  { value: 'medium', label: tx('Medium') },
  { value: 'high', label: tx('High') },
  { value: 'critical', label: tx('Critical') },
]

/* The four Art. 25(1) triggers. Any one makes an impact assessment mandatory. */
export const TRIGGERS = [
  { key: 'sensitive_data', label: tx('Sensitive data'), help: tx('Health, genetic, credit, religious, ethnic, criminal or security data, among others.') },
  { key: 'links_sources', label: tx('Linking data sets'), help: tx('Collecting, comparing or linking two or more sets of personal data from different sources.') },
  { key: 'large_scale_monitoring', label: tx('Large scale or monitoring'), help: tx('Continuous large-scale processing of people who lack legal capacity, or processing that needs continuous monitoring.') },
  { key: 'new_technology', label: tx('New technology'), help: tx('A product or service that uses emerging technology to process personal data.') },
]

/* The eight minimum contents of an assessment, Art. 25(2). */
export const ASSESSMENT_SECTIONS = [
  { key: 'purpose_legal_basis', label: tx('Purpose and legal basis'), help: tx('Why the data is processed, and which lawful basis applies.') },
  { key: 'data_description', label: tx('Nature, types and sources of the data'), help: tx('What personal data, about whom, and where it comes from.') },
  { key: 'scope', label: tx('Scope of the processing'), help: tx('How much data, how many people, how long, which systems.') },
  { key: 'context', label: tx('Context of the processing'), help: tx('The relationship with the data subjects and what they would reasonably expect.') },
  { key: 'necessity', label: tx('Necessity and proportionality'), help: tx('Why this processing is needed and why less data would not do.') },
  { key: 'impact', label: tx('Impact on data subjects'), help: tx('The material and moral harm the processing could cause them.') },
  { key: 'measures', label: tx('Measures to limit the risks'), help: tx('The technical, administrative and organisational measures in place or planned.') },
  { key: 'suitability', label: tx('Suitability of the measures'), help: tx('Why those measures are enough for the risks described.') },
]

export const PRIVACY_TONES = {
  request: { received: 'medium', in_progress: 'info', completed: 'low', refused: 'neutral', withdrawn: 'neutral' },
  notifiable: { pending: 'medium', notifiable: 'critical', not_notifiable: 'neutral' },
  breach: { open: 'critical', closed: 'low' },
  assessment: { draft: 'neutral', in_review: 'medium', returned: 'critical', approved: 'low', superseded: 'neutral' },
  rating: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' },
}

/* ── Clocks ───────────────────────────────────────────────────────────────── */

export const requestDue = (r) => r?.extended_due_on || r?.due_on || null
export const requestOpen = (r) => r && ['received', 'in_progress'].includes(r.status)
export const requestDaysLeft = (r) => daysUntil(requestDue(r))

/** Hours until SDAIA must be told (negative once overdue). Null once notified or not notifiable. */
export function breachHoursLeft(b, now = Date.now()) {
  if (!b || b.sdaia_notified_at || b.notifiable === 'not_notifiable' || b.status !== 'open') return null
  return Math.floor((new Date(b.sdaia_due_at).getTime() - now) / 3600e3)
}

export const nowLocal = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** An ISO instant as the local "yyyy-mm-ddThh:mm" DateTimeField expects. */
export const isoToLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** A local "yyyy-mm-ddThh:mm" from DateTimeField as an ISO instant. */
export const toInstant = (v) => (v ? new Date(v).toISOString() : null)

/* ── Record of processing completeness, Art. 33(5) ───────────────────────── */

export function ropaGaps(a, settings) {
  const gaps = []
  if (!settings?.controller_name) gaps.push(tx('Controller name and contact (Privacy settings)'))
  if (!settings?.dpo_user_id && !settings?.dpo_name) gaps.push(tx('Data Protection Officer (Privacy settings)'))
  if (!a.purpose) gaps.push(tx('Purpose'))
  if (!a.lawful_basis) gaps.push(tx('Lawful basis'))
  if (!a.data_categories?.length) gaps.push(tx('Categories of personal data'))
  if (!a.data_subjects?.length) gaps.push(tx('Categories of data subjects'))
  if (!a.retention) gaps.push(tx('Retention period'))
  if (!a.recipients?.length) gaps.push(tx('Recipients'))
  if (a.transfers_outside_ksa && !a.transfer_safeguard) gaps.push(tx('Safeguard for transfers outside the Kingdom'))
  if (!a.security_measures) gaps.push(tx('Security measures'))
  return gaps
}

/** Comma-separated text ↔ array, for the list fields of a processing record. */
export const toList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
export const fromList = (a) => (a || []).join(', ')

export { todayRiyadh, daysUntil }
