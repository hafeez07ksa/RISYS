// ============================================================
// SDAIA PDPL — REQUIREMENTS, AUTOMATION CLASS AND WORKSPACE SCOPE
//
// The PDPL catalogue (sdaia_pdpl) holds the Law, the Implementing Regulation
// and the Transfer Regulation, one row per article and per numbered
// paragraph: L-12, IR-23, IR-23-1, TR-5. Of the 91 articles, 39 put an
// obligation on a Controller and are scored, in the same three classes as
// ECC and CCC:
//
//   automated        RISYS measures it from the Privacy registers
//   semi_automated   a register or connector supplies part; a person the rest
//   manual_evidence  no system holds the answer; RISYS keeps the evidence
//
// The rest — definitions, the regulator's duties, and the Law articles the
// Regulations implement — are reference text: shown, never scored.
//
// Which conditional articles apply (public entity, health data, marketing,
// transfers outside the Kingdom, ...) is a workspace setting
// (organizations.pdpl_profile), set by a workspace admin. Mirrors
// pdpl_applies() in the database.
// ============================================================

import { AUTOMATION_CLASSES, AUTOMATION_META } from './eccAutomation.js'
import {
  PDPL_AUTOMATION, PDPL_CONDITIONS, PDPL_LAW_REFS, PDPL_ALSO_SERVES_ECC, PDPL_FROM_ECC_EVIDENCE,
} from './pdplCatalogue.js'

export { AUTOMATION_CLASSES, AUTOMATION_META, PDPL_AUTOMATION, PDPL_LAW_REFS, PDPL_ALSO_SERVES_ECC, PDPL_FROM_ECC_EVIDENCE }

export const PDPL_FRAMEWORK_ID = 'SDAIA PDPL'
export const PDPL_VERSION = 'PDPL 2023 · IR · TR'

export const PDPL_PARTS = {
  L:  { label: 'Personal Data Protection Law', short: 'Law' },
  IR: { label: 'Implementing Regulation', short: 'IR' },
  TR: { label: 'Regulation on Personal Data Transfer outside the Kingdom', short: 'TR' },
}

/** The questions a workspace admin answers to set the PDPL scope. */
export const PDPL_PROFILE_QUESTIONS = [
  { key: 'public_entity', label: 'We are a Public Entity',
    help: 'A ministry, public institution or authority, or an entity affiliated with one (Law Art. 1). Public-interest controls (IR Art. 21) apply; legitimate interest is not available (IR Art. 16).' },
  { key: 'large_scale', label: 'We provide services that process personal data on a large scale',
    help: 'With "Public Entity", this requires a data protection officer (IR Art. 32(1)(a)).' },
  { key: 'large_scale_monitoring', label: 'Our core activities monitor individuals regularly and on a large scale',
    help: 'Requires a data protection officer (IR Art. 32(1)(b)).' },
  { key: 'sensitive_core', label: 'Our core activities process sensitive data',
    help: 'Health, genetic, biometric, belief or criminal data as a core activity. Requires a data protection officer (IR Art. 32(1)(c)).' },
  { key: 'health', label: 'We process health data', help: 'IR Art. 26 applies.' },
  { key: 'credit', label: 'We process credit data', help: 'IR Art. 27 applies, alongside the Credit Information Law.' },
  { key: 'advertising', label: 'We send advertising or awareness messages', help: 'IR Art. 28 applies.' },
  { key: 'marketing', label: 'We use personal data for direct marketing', help: 'IR Art. 29 applies.' },
  { key: 'research', label: 'We process personal data for research or statistics without consent', help: 'IR Art. 30 applies.' },
  { key: 'minors', label: 'We process data of people who lack legal capacity', help: 'Children or others acting through a legal guardian. IR Art. 13 applies.' },
  { key: 'transfers', label: 'Personal data is transferred or disclosed outside the Kingdom',
    help: 'Including cloud services or support teams abroad. The Transfer Regulation applies.' },
  { key: 'legitimate_interest', label: 'We rely on legitimate interest for some processing',
    help: 'Private Controllers only. IR Art. 16 applies.' },
]

export const PDPL_PROFILE_KEYS = PDPL_PROFILE_QUESTIONS.map(q => q.key)

export const PDPL_CONDITION_LABELS = {
  public_entity:       'Applies to Public Entities',
  legitimate_interest: 'Applies when a private Controller relies on legitimate interest',
  dpo_required:        'Applies when a data protection officer is required',
  health:              'Applies when health data is processed',
  credit:              'Applies when credit data is processed',
  advertising:         'Applies when advertising or awareness messages are sent',
  marketing:           'Applies when personal data is used for direct marketing',
  research:            'Applies to research or statistics without consent',
  minors:              'Applies to data of people who lack legal capacity',
  transfers:           'Applies when personal data leaves the Kingdom',
}

export const APPLICABILITY_META = {
  mandatory:      { label: 'Applies', tone: 'var(--text-2)' },
  not_applicable: { label: 'Not applicable to your PDPL scope', short: 'N/A to scope', tone: 'var(--text-3)' },
}

/** True for a PDPL id: L-12, IR-23, IR-23-1, TR-5. */
export function isPdplId(id) {
  return /^(L|IR|TR)-\d+(-\d+)?$/.test(String(id ?? ''))
}

/** The article a PDPL id belongs to: IR-23-1 → IR-23. */
export function pdplMainId(id) {
  const parts = String(id ?? '').split('-')
  return parts.length > 2 ? parts.slice(0, 2).join('-') : String(id ?? '')
}

/** "IR Art. 23" for IR-23 or IR-23-1; "Law Art. 12" for L-12. */
export function pdplLabel(id) {
  const [part, art, para] = String(id ?? '').split('-')
  if (!PDPL_PARTS[part]) return String(id ?? '')
  return `${PDPL_PARTS[part].short} Art. ${art}${para ? `(${para})` : ''}`
}

/** True when the id is a scored requirement or one of its paragraphs. */
export function isPdplRequirementId(id) {
  return !!PDPL_AUTOMATION[pdplMainId(id)]
}

export function pdplAutomationClassFor(id) {
  return PDPL_AUTOMATION[pdplMainId(id)] || null
}

export function pdplConditionFor(id) {
  return PDPL_CONDITIONS[pdplMainId(id)] || null
}

/** The workspace's PDPL profile, or null when PDPL is not in scope. */
export function pdplProfile(organization) {
  const p = organization?.pdpl_profile
  return p && typeof p === 'object' ? p : null
}

/** Mirrors pdpl_applies() in the database. */
export function pdplApplies(profile, when) {
  if (!when) return true
  if (!profile) return false
  if (when === 'dpo_required') {
    return (!!profile.public_entity && !!profile.large_scale) || !!profile.large_scale_monitoring || !!profile.sensitive_core
  }
  if (when === 'legitimate_interest') return !!profile.legitimate_interest && !profile.public_entity
  return !!profile[when]
}

/**
 * The scored PDPL rows for a workspace, each tagged with _applicability
 * (mandatory · not_applicable). Reference rows are dropped: they stay in the
 * Frameworks library. Not-applicable rows are kept so the page can say so,
 * but are never scored.
 */
export function scopePdplRequirements(rows, profile) {
  if (!profile) return []
  return rows
    .filter(r => r.is_requirement ?? isPdplRequirementId(r.control_id))
    .map(r => ({ ...r, _applicability: pdplApplies(profile, r.applies_when ?? pdplConditionFor(r.control_id)) ? 'mandatory' : 'not_applicable' }))
}

/** How a paragraph id is printed: IR-23-1 → IR-23(1). Article ids print as they are. */
export function pdplDisplayId(id) {
  const parts = String(id ?? '').split('-')
  return parts.length > 2 ? `${parts[0]}-${parts[1]}(${parts.slice(2).join('-')})` : String(id ?? '')
}

/** Sub-requirement id as printed in its source document: ECC/CCC 2.2.3.1, PDPL IR-23(1). */
export function printedSubId(id) {
  return isPdplId(id) ? pdplDisplayId(id) : String(id ?? '').replace(/-/g, '.')
}
