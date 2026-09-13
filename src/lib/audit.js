import { supabase } from '@/lib/supabase'

/*
 * Thin wrapper around the log_audit_event Supabase RPC.
 * Call this after any significant user action. Failures are swallowed
 * silently so a logging error never breaks the primary user action.
 *
 * Usage:
 *   await logAudit(orgId, 'risk.created',   'risk',     risk.id,   risk.title)
 *   await logAudit(orgId, 'incident.closed', 'incident', inc.id,    inc.title, { from: 'open', to: 'closed' })
 *   await logAudit(orgId, 'member.invited',  'member',   null,      email)
 */
export async function logAudit(orgId, action, entityType, entityId, entityTitle, meta = {}) {
  if (!orgId || !action) return
  try {
    await supabase.rpc('log_audit_event', {
      p_org_id:       orgId,
      p_action:       action,
      p_entity_type:  entityType  ?? null,
      p_entity_id:    entityId    ?? null,
      p_entity_title: entityTitle ?? null,
      p_meta:         meta,
    })
  } catch (_) {
    // Never let audit logging break the calling code
  }
}

// ── Action constants ───────────────────────────────────────────────────────────
// Use these everywhere so action strings stay consistent.
export const AUDIT = {
  // Risks
  RISK_CREATED:       'risk.created',
  RISK_UPDATED:       'risk.updated',
  RISK_DELETED:       'risk.deleted',
  RISK_STATUS:        'risk.status_changed',
  RISK_SUBMITTED:     'risk.submitted_for_review',
  RISK_APPROVED:      'risk.approved',
  RISK_REJECTED:      'risk.rejected',
  RISK_CLOSED:        'risk.closed',
  // Risk scoring & the tolerance gate.
  // Every score change is auditable on its own, separately from the
  // gate verdict it triggers — an auditor asks "who moved the number"
  // and "what did the system do about it" as two different questions.
  RISK_SCORED:          'risk.scored',
  RISK_GATE_BREACHED:   'risk.gate_breached',
  RISK_GATE_CLEARED:    'risk.gate_cleared',
  RISK_REOPENED_AUTO:   'risk.reopened_auto',
  RISK_ACCEPT_BLOCKED:  'risk.accept_blocked',
  RISK_TOLERANCE_SET:   'risk.tolerance_updated',
  RISK_TREATMENT_OPTION:  'risk.treatment_option_decided',
  RISK_PLAN_CREATED:      'risk.treatment_plan_created',
  RISK_EXCEPTION_DECIDED: 'risk.exception_decided',
  AUTHORITY_ASSIGNED:     'risk.authority_assigned',
  AUTHORITY_REMOVED:      'risk.authority_removed',
  FINDING_TRIAGED:        'finding.triaged',
  FINDING_TRIAGE_REOPENED:'finding.triage_reopened',
  // Incidents
  INC_CREATED:        'incident.created',
  INC_UPDATED:        'incident.updated',
  INC_STATUS:         'incident.status_changed',
  INC_RESOLVED:       'incident.resolved',
  // Tasks
  TASK_CREATED:       'task.created',
  TASK_STATUS:        'task.status_changed',
  TASK_COMPLETED:     'task.completed',
  // Members / People
  MEMBER_INVITED:     'member.invited',
  MEMBER_REMOVED:     'member.removed',
  MEMBER_ROLE:        'member.role_changed',
  // Connectors
  CONNECTOR_CONNECTED:    'connector.connected',
  CONNECTOR_DISCONNECTED: 'connector.disconnected',
  CONNECTOR_SYNCED:       'connector.synced',
  // Findings → actions
  FINDING_RISK:       'finding.escalated_to_risk',
  FINDING_INCIDENT:   'finding.escalated_to_incident',
}
