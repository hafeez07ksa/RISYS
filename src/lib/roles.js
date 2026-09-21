/* ── Roles (B10) ──────────────────────────────────────────────────────────────
 *
 * THE single definition of who may do what. Before this file the role set was
 * written down in three places that disagreed: the invite dropdown offered
 * roles the permission table had never heard of, so a Compliance Officer or an
 * Auditor resolved to rank −1 and could not do anything at all, not even
 * comment. Everything role-shaped now imports from here:
 *
 *   lib/constants.js   → re-exports ROLES for the onboarding/invite dropdowns
 *   hooks/usePeople.js → re-exports ROLES + roleLabel for the People page
 *   hooks/usePermissions.js → builds the permission object from CAPABILITIES
 *   layouts/RequireRole.jsx → route guards
 *
 * The database enforces the same model independently (see the roles_b10_*
 * migrations): a CHECK constraint on organization_members.role and
 * org_invitations.role accepts exactly the values below, is_contributor(),
 * is_compliance_writer() and is_org_readonly() classify them in RLS, and a
 * restrictive tenant_readonly_guard blocks every write by a read-only role on
 * 41 tenant tables. A hidden button is never the only thing stopping an action.
 *
 * Capability, not rank, decides. Rank exists only for ordering and for the few
 * "at least a manager" comparisons; it deliberately does NOT imply inheritance,
 * because an Auditor outranks a Member in seniority while writing less.
 * -------------------------------------------------------------------------- */

export const CAPABILITIES = [
  'risk.create',              // raise a new risk
  'risk.write.any',           // edit any risk in the org
  'risk.write.own',           // edit risks you own / were assigned / collaborate on
  'risk.delete',
  'risk.approve',             // submit, approve, reject, close, reopen
  'risk.test',                // log a control test (a second-line act)
  'risk.review',              // record a periodic review
  'risk.exception.request',
  'risk.exception.decide',    // accept a risk above tolerance
  'controls.write',           // the control library
  'compliance.write',         // compliance statuses, evidence, framework mappings
  'findings.triage',          // decide what a connector finding becomes
  'connectors.manage',        // connect/disconnect, credentials, scan schedules
  'people.manage',
  'org.settings',
  'audit.view',
  'audit.manage',             // plan and run audit engagements: scope, testing, findings, evidence requests
  'reports.generate',         // generate board / regulator / audit reports and record their presentation
  'comment',
]

const ALL = CAPABILITIES

/**
 * value        stored in organization_members.role and org_invitations.role
 * rank         ordering only — see the note above
 * assignable   false for `owner`: it is held by whoever created the org and is
 *              transferred, never picked from a dropdown
 * readOnly     the role writes nothing on the operational tables but comments
 *              (mirrors is_org_readonly()). The Auditor is read-only there but
 *              writes the audit tables — engagements, testing, findings — which
 *              is what independence means: it can report on the register, not
 *              edit it.
 */
export const ROLE_DEFS = [
  {
    value: 'owner', label: 'Owner', rank: 100, assignable: false, readOnly: false,
    desc: 'Created the organisation. Everything an Admin can do, and cannot be removed by one.',
    caps: ALL,
  },
  {
    value: 'admin', label: 'Admin', rank: 90, assignable: true, readOnly: false,
    desc: 'Full access — manages people, settings, connectors and every record.',
    caps: ALL,
  },
  {
    value: 'risk_manager', label: 'Risk Manager', rank: 60, assignable: true, readOnly: false,
    desc: 'Second line — owns the register, approves risks, tests controls, decides acceptances.',
    caps: [
      'risk.create', 'risk.write.any', 'risk.delete', 'risk.approve', 'risk.test',
      'risk.review', 'risk.exception.request', 'risk.exception.decide',
      'controls.write', 'compliance.write', 'findings.triage', 'audit.view',
      'audit.manage', 'reports.generate', 'comment',
    ],
  },
  {
    value: 'compliance_officer', label: 'Compliance Officer', rank: 50, assignable: true, readOnly: false,
    desc: 'Owns framework compliance and evidence. Works the risks assigned to them; does not approve the register.',
    caps: [
      'risk.create', 'risk.write.own', 'risk.review', 'risk.exception.request',
      'controls.write', 'compliance.write', 'findings.triage', 'audit.view',
      'audit.manage', 'reports.generate', 'comment',
    ],
  },
  {
    value: 'member', label: 'Member', rank: 30, assignable: true, readOnly: false,
    desc: 'First line — raises risks and works the ones they own, with their controls, evidence and actions.',
    caps: ['risk.create', 'risk.write.own', 'risk.exception.request', 'comment'],
  },
  {
    value: 'auditor', label: 'Auditor', rank: 20, assignable: true, readOnly: true,
    desc: 'Reads everything including evidence and the audit log. Runs audit engagements and issues audit reports; changes nothing else.',
    caps: ['audit.view', 'audit.manage', 'reports.generate', 'comment'],
  },
  {
    value: 'viewer', label: 'Viewer', rank: 10, assignable: true, readOnly: true,
    desc: 'Read-only across the workspace. No audit log, no changes.',
    caps: ['comment'],
  },
]

const BY_VALUE = Object.fromEntries(ROLE_DEFS.map(r => [r.value, r]))
const CAPS = Object.fromEntries(ROLE_DEFS.map(r => [r.value, new Set(r.caps)]))

/** Roles an admin can hand out from a dropdown (everything except `owner`). */
export const ROLES = ROLE_DEFS.filter(r => r.assignable).map(({ value, label, desc }) => ({ value, label, desc }))

/** Every role, `owner` included — for displaying a role you did not assign. */
export const ALL_ROLES = ROLE_DEFS.map(({ value, label, desc }) => ({ value, label, desc }))

export const ROLE_VALUES = ROLE_DEFS.map(r => r.value)
export const ROLE_LABELS = Object.fromEntries(ROLE_DEFS.map(r => [r.value, r.label]))

export const roleLabel = (v) => ROLE_LABELS[v] || v
export const roleDef = (v) => BY_VALUE[v] || null
export const roleRank = (v) => BY_VALUE[v]?.rank ?? -1
export const isReadOnlyRole = (v) => !!BY_VALUE[v]?.readOnly
export const isKnownRole = (v) => !!BY_VALUE[v]

/** Does this role hold this capability? Unknown role ⇒ no. */
export function roleCan(role, capability) {
  return CAPS[role]?.has(capability) ?? false
}

/* Tier helpers — these mirror the database functions of the same names, so a
   change here and a change there stay legible as the same change. */
export const isAdminRole = (v) => v === 'admin' || v === 'owner'
export const isRiskManagerOrAdmin = (v) => isAdminRole(v) || v === 'risk_manager'
export const isComplianceWriter = (v) => isRiskManagerOrAdmin(v) || v === 'compliance_officer'
export const isContributor = (v) => v === 'member' || v === 'compliance_officer'

/** Role lists for <RequireRole roles={...}> route guards. */
export const ROLE_SETS = {
  admin: ROLE_DEFS.filter(r => isAdminRole(r.value)).map(r => r.value),
  riskManager: ROLE_DEFS.filter(r => isRiskManagerOrAdmin(r.value)).map(r => r.value),
  complianceWriter: ROLE_DEFS.filter(r => isComplianceWriter(r.value)).map(r => r.value),
  auditReader: ROLE_DEFS.filter(r => roleCan(r.value, 'audit.view')).map(r => r.value),
  // Mirrors is_audit_writer() and can_generate_reports() in the database.
  auditWriter: ROLE_DEFS.filter(r => roleCan(r.value, 'audit.manage')).map(r => r.value),
  reportWriter: ROLE_DEFS.filter(r => roleCan(r.value, 'reports.generate')).map(r => r.value),
  // Connector findings: everyone who can act on them, plus the auditor, who
  // reads everything and changes nothing.
  findingsReader: ROLE_DEFS
    .filter(r => roleCan(r.value, 'findings.triage') || r.value === 'auditor')
    .map(r => r.value),
}
