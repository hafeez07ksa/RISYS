import { useAuth } from './useAuth'

/*
 * Single source of truth for what each role can do, mirroring the RLS
 * policies in the database. The UI uses this to hide/disable actions;
 * the database enforces the same rules independently, so a blocked button
 * is never the only thing standing between a user and an action.
 *
 * Roles: viewer < member < risk_manager < admin (+ owner == admin)
 */

const RANK = { viewer: 0, member: 1, risk_manager: 2, admin: 3, owner: 3 }

// Can `me` WORK this risk? — owner, creator, assignee, or collaborator.
// Grants edit + child-record management.
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
  const rank = RANK[role] ?? -1
  const isManager = rank >= RANK.risk_manager   // risk_manager or admin/owner
  const isAdmin = rank >= RANK.admin
  const isMember = rank >= RANK.member

  return {
    role,
    rank,
    isViewer: role === 'viewer',
    isMember,
    isManager,
    isAdmin,

    // ── Risk-level (some need the risk object to check ownership) ──
    canCreateRisk: isMember,
    canEditRisk: (risk) => isManager || (role === 'member' && canWorkRisk(risk, userId)),
    canDeleteRisk: isManager,
    canSubmitForReview: (risk) => isManager || (role === 'member' && canSubmitRisk(risk, userId)),
    canApproveReject: isManager,        // approve / reject a submitted risk
    canCloseReopen: isManager,

    // ── Child records (controls/evidence/KRIs/loss/treatment) ──
    // members may manage these only on risks they own
    canManageRiskChildren: (risk) => isManager || (role === 'member' && canWorkRisk(risk, userId)),
    canLogControlTest: isManager,       // testing is a 2nd-line act
    canRequestException: (risk) => isManager || (role === 'member' && canWorkRisk(risk, userId)),
    canDecideException: isManager,      // accept/reject risk acceptance
    canAddReview: isManager,

    // ── Always-available to any member incl. viewer ──
    canComment: rank >= RANK.viewer,    // everyone signed into the org

    // ── People & org administration ──
    canManagePeople: isAdmin,
    canDeleteAccounts: isAdmin,
    canEditOrgSettings: isAdmin,
  }
}

export function usePermissions() {
  const { organization, user } = useAuth()
  return buildPermissions(organization?.memberRole, user?.id)
}

export const ROLE_LABELS = {
  viewer: 'Viewer', member: 'Member', risk_manager: 'Risk Manager', admin: 'Admin', owner: 'Owner',
}
