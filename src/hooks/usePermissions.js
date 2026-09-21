import { useAuth } from './useAuth'
import {
  roleCan, roleRank, roleLabel, isReadOnlyRole, isKnownRole,
  isAdminRole, isRiskManagerOrAdmin, isComplianceWriter,
  ROLE_LABELS,
} from '@/lib/roles'

/*
 * What the signed-in user may do, derived from the capability matrix in
 * lib/roles.js — the one place roles are defined (B10). The UI uses this to
 * hide and disable actions; the database enforces the same model in RLS, so a
 * hidden button is never the only thing standing between a user and an action.
 */

// Can `me` WORK this risk? — owner, creator, assignee, or collaborator.
// Grants edit + child-record management for the contributor tier.
function canWorkRisk(risk, userId) {
  if (!risk) return false
  if (risk.owner_id === userId || risk.created_by === userId || risk.assigned_to === userId) return true
  const collabs = risk.collaborator_ids || []
  return collabs.includes(userId)
}

// Can `me` SUBMIT this risk for review? — only the primary owner/creator/
// assignee, NOT collaborators. Submission is the owner's act.
function canSubmitRisk(risk, userId) {
  return !!risk && (risk.owner_id === userId || risk.created_by === userId || risk.assigned_to === userId)
}

export function buildPermissions(role, userId) {
  const can = (cap) => roleCan(role, cap)
  // "any risk" beats "own risk"; a contributor falls back to ownership.
  const onOwn = (cap) => (risk) => can('risk.write.any') || (can(cap) && canWorkRisk(risk, userId))

  return {
    role,
    roleLabel: roleLabel(role),
    rank: roleRank(role),
    known: isKnownRole(role),
    can,                                    // raw capability check: can('compliance.write')

    isReadOnly: isReadOnlyRole(role),
    isViewer: role === 'viewer',
    isAuditor: role === 'auditor',
    isMember: isKnownRole(role),            // any recognised role is a member of the org
    isManager: isRiskManagerOrAdmin(role),
    isComplianceWriter: isComplianceWriter(role),
    isAdmin: isAdminRole(role),

    // ── Risk-level (some need the risk object to check ownership) ──
    canCreateRisk: can('risk.create'),
    canEditRisk: onOwn('risk.write.own'),
    canDeleteRisk: can('risk.delete'),
    canSubmitForReview: (risk) =>
      can('risk.write.any') || (can('risk.write.own') && canSubmitRisk(risk, userId)),
    canApproveReject: can('risk.approve'),  // approve / reject a submitted risk
    canCloseReopen: can('risk.approve'),

    // ── Child records (controls/evidence/KRIs/loss/treatment) ──
    // the contributor tier may manage these only on risks they own
    canManageRiskChildren: onOwn('risk.write.own'),
    canLogControlTest: can('risk.test'),    // testing is a 2nd-line act
    canRequestException: onOwn('risk.exception.request'),
    canDecideException: can('risk.exception.decide'),
    canAddReview: can('risk.review'),

    // ── Controls library & compliance ──
    canManageControls: can('controls.write'),
    canEditCompliance: can('compliance.write'),
    canUploadComplianceEvidence: can('compliance.write'),

    // ── Findings & connectors ──
    canTriageFindings: can('findings.triage'),
    canManageConnectors: can('connectors.manage'),
    canRunScan: can('connectors.manage'),

    // ── Everyone signed into the org, read-only roles included ──
    canComment: can('comment'),

    // ── Audit & administration ──
    canViewAudit: can('audit.view'),
    canManageAudits: can('audit.manage'),     // engagements, testing, findings, evidence requests
    canGenerateReports: can('reports.generate'),
    canManagePeople: can('people.manage'),
    canDeleteAccounts: can('people.manage'),
    canEditOrgSettings: can('org.settings'),
  }
}

export function usePermissions() {
  const { organization, user } = useAuth()
  return buildPermissions(organization?.memberRole, user?.id)
}

export { ROLE_LABELS }
