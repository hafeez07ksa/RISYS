// ============================================================
// NCA CCC-2:2024 — CONTROL AUTOMATION CLASS, ROLE AND LEVEL SCOPE
//
// Every one of the 55 CCC main controls (CSP 37, CST 18), sorted by what
// answers it, in the same three classes as ECC (src/data/eccAutomation.js):
//
//   automated        a connected platform returns the answer
//   semi_automated   a connector supplies part; a person supplies the rest
//   manual_evidence  no system holds the answer; RISYS keeps the evidence
//
// Source: RISYS Control Integration Reference v1.0 (27 Oct 2026), renumbered
// from CCC-1:2020 to CCC-2:2024. A main control takes the class of its
// subcontrols (all automated → automated, all document → manual, otherwise
// semi). "Documented and approved" controls are manual; "applied and reviewed
// periodically" controls are semi-automated, like ECC's -4 controls.
//
// Tenant (CST): 11 automated · 6 semi · 1 manual
// Provider (CSP): 16 automated · 17 semi · 4 manual
//
// Who CCC applies to and at what level is a workspace setting
// (organizations.ccc_role / ccc_level), set by a workspace admin.
// ============================================================

import { AUTOMATION_CLASSES, AUTOMATION_META } from './eccAutomation.js'

export { AUTOMATION_CLASSES, AUTOMATION_META }

export const CCC_FRAMEWORK_ID = 'NCA CCC'
export const CCC_VERSION = 'CCC-2:2024'

export const CCC_AUTOMATION = {
  // automated — 27
  '1-2-P-1': 'automated', '1-2-T-1': 'automated', '1-3-P-1': 'automated', '1-3-T-1': 'automated', '1-4-P-2': 'automated',
  '1-4-T-1': 'automated', '1-5-P-2': 'automated', '1-5-P-3': 'automated', '2-1-P-1': 'automated', '2-1-T-1': 'automated',
  '2-2-T-1': 'automated', '2-4-T-1': 'automated', '2-5-P-1': 'automated', '2-5-T-1': 'automated', '2-7-P-1': 'automated',
  '2-7-T-1': 'automated', '2-8-P-1': 'automated', '2-11-P-1': 'automated', '2-11-T-1': 'automated', '2-14-P-1': 'automated',
  '2-15-P-2': 'automated', '2-15-P-3': 'automated', '2-15-T-2': 'automated', '2-15-T-3': 'automated', '2-16-P-2': 'automated',
  '2-16-P-3': 'automated', '2-17-P-2': 'automated',
  // semi_automated — 23
  '1-1-P-1': 'semi_automated', '1-1-T-1': 'semi_automated', '1-4-P-1': 'semi_automated', '1-5-P-4': 'semi_automated', '2-2-P-1': 'semi_automated',
  '2-3-P-1': 'semi_automated', '2-3-T-1': 'semi_automated', '2-4-P-1': 'semi_automated', '2-6-P-1': 'semi_automated', '2-6-T-1': 'semi_automated',
  '2-9-P-1': 'semi_automated', '2-9-T-1': 'semi_automated', '2-10-P-1': 'semi_automated', '2-12-P-1': 'semi_automated', '2-13-P-1': 'semi_automated',
  '2-15-P-4': 'semi_automated', '2-15-T-4': 'semi_automated', '2-16-P-4': 'semi_automated', '2-17-P-3': 'semi_automated', '2-17-P-4': 'semi_automated',
  '3-1-P-1': 'semi_automated', '3-1-T-1': 'semi_automated', '4-1-P-1': 'semi_automated',
  // manual_evidence — 5
  '1-5-P-1': 'manual_evidence', '2-15-P-1': 'manual_evidence', '2-15-T-1': 'manual_evidence', '2-16-P-1': 'manual_evidence', '2-17-P-1': 'manual_evidence',
}

/** CCC main controls and the ECC control each extends (CCC text, ECC-2:2024 numbering). */
export const CCC_EXTENDS_ECC = { "1-1-P-1": [ "1-4-1" ], "1-1-T-1": [ "1-4-1" ], "1-2-P-1": [ "1-5-1" ], "1-2-T-1": [ "1-5-1" ], "1-3-P-1": [ "1-7-1" ], "1-3-T-1": [ "1-7-1" ], "1-4-P-1": [ "1-9-3", "1-9-4" ], "1-4-P-2": [ "1-9-5" ], "1-4-T-1": [ "1-9-3" ], "1-5-P-3": [ "1-6-2" ], "2-1-P-1": [ "2-1-2" ], "2-1-T-1": [ "2-1-2" ], "2-2-P-1": [ "2-2-3" ], "2-2-T-1": [ "2-2-3" ], "2-3-P-1": [ "2-3-3" ], "2-3-T-1": [ "2-3-3" ], "2-4-P-1": [ "2-5-3" ], "2-4-T-1": [ "2-5-3" ], "2-5-P-1": [ "2-6-3" ], "2-5-T-1": [ "2-6-3" ], "2-6-P-1": [ "2-7-2" ], "2-6-T-1": [ "2-7-2" ], "2-7-P-1": [ "2-8-3" ], "2-7-T-1": [ "2-8-3" ], "2-8-P-1": [ "2-9-3" ], "2-9-P-1": [ "2-10-3" ], "2-9-T-1": [ "2-10-3" ], "2-10-P-1": [ "2-11-3" ], "2-11-P-1": [ "2-12-3" ], "2-11-T-1": [ "2-12-3" ], "2-12-P-1": [ "2-13-3" ], "2-13-P-1": [ "2-14-3" ], "2-14-P-1": [ "2-15-3" ], "2-15-P-3": [ "2-8-3-2" ], "2-15-T-3": [ "2-8-3-2" ], "2-16-P-3": [ "1-6-3" ], "2-17-P-3": [ "2-3-3-2", "2-14-3-4" ], "3-1-P-1": [ "3-1-3" ], "3-1-T-1": [ "3-1-3" ], "4-1-P-1": [ "4-1-2", "4-1-3" ] }

// ── Workspace scope ──────────────────────────────────────────────────────────
// Tenant controls a finding on a cloud service (Microsoft 365, Entra ID,
// Defender, SharePoint) also evidences, by the ECC requirement it is keyed to.
// Mirrors framework_crosswalk (relation = 'evidence') in the database, which
// derives the same CCC references for stored findings in finding_control_refs.
export const CCC_FROM_ECC_EVIDENCE = {
  '2-2-3-2':  ['2-2-T-1-4'],
  '2-2-3-1':  ['2-2-T-1-5'],
  '2-2-2':    ['2-2-T-1-3'],
  '2-2-3-5':  ['2-2-T-1-1'],
  '2-2-3-4':  ['2-2-T-1-1'],
  '2-12-3-1': ['2-11-T-1-1'],
  '4-2-3-1':  ['1-3-T-1-1'],
}

export const CCC_ROLES = {
  cst:  { label: 'Cloud service tenant (CST)', short: 'Tenant', roles: ['CST'],
          help: 'The organisation uses cloud services (IaaS, PaaS or SaaS such as Microsoft 365). 18 main controls.' },
  csp:  { label: 'Cloud service provider (CSP)', short: 'Provider', roles: ['CSP'],
          help: 'The organisation provides cloud services to government or CNI entities. 37 main controls.' },
  both: { label: 'Both tenant and provider', short: 'Tenant and provider', roles: ['CST', 'CSP'],
          help: 'The organisation provides cloud services and also uses them. 55 main controls.' },
}

export const CCC_LEVELS = {
  1: { label: 'Level 1 — Top secret', short: 'Top secret' },
  2: { label: 'Level 2 — Secret', short: 'Secret' },
  3: { label: 'Level 3 — Confidential', short: 'Confidential' },
  4: { label: 'Level 4 — Public', short: 'Public' },
}

export const APPLICABILITY_META = {
  mandatory:      { label: 'Mandatory', tone: 'var(--text-2)' },
  optional:       { label: 'Optional at this level', short: 'Optional', tone: 'var(--medium)' },
  not_applicable: { label: 'Not applicable at this level', short: 'N/A at level', tone: 'var(--text-3)' },
}

/** True for a CCC requirement id: 2-2-T-1, 2-2-T-1-4, 1-5-P-3-1. */
export function isCccId(id) {
  return /^\d+-\d+-[PT]-\d+(-\d+)?$/.test(String(id ?? ''))
}

/** The main control a CCC id belongs to: 2-2-T-1-4 → 2-2-T-1. */
export function cccMainId(id) {
  const parts = String(id ?? '').split('-')
  return parts.length > 4 ? parts.slice(0, 4).join('-') : String(id ?? '')
}

/** 'CST' or 'CSP' from the id itself. */
export function cccRoleOf(id) {
  return String(id ?? '').split('-')[2] === 'P' ? 'CSP' : 'CST'
}

export function cccAutomationClassFor(id) {
  return CCC_AUTOMATION[cccMainId(id)] || null
}

/** The organisation's CCC profile, or null when CCC is not in scope. */
export function cccProfile(organization) {
  const role = organization?.ccc_role
  const level = Number(organization?.ccc_level)
  if (!role || !CCC_ROLES[role] || !(level >= 1 && level <= 4)) return null
  return { role, level, roles: CCC_ROLES[role].roles }
}

/** Applicability of one nca_ccc row for a profile: mandatory · optional · not_applicable · out_of_scope. */
export function cccApplicability(row, profile) {
  if (!row || !profile) return 'out_of_scope'
  const r = row.role || cccRoleOf(row.control_id)
  if (!profile.roles.includes(r)) return 'out_of_scope'
  return row[`level_${profile.level}`] || 'mandatory'
}

/**
 * The rows in scope for a workspace, each tagged with _applicability.
 * Rows for the other role are dropped; rows not applicable at the level are
 * kept (so the page can say so) but are never scored.
 */
export function scopeCccRequirements(rows, profile) {
  if (!profile) return []
  return rows
    .map(r => ({ ...r, _applicability: cccApplicability(r, profile) }))
    .filter(r => r._applicability !== 'out_of_scope')
}
