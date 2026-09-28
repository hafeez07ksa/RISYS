-- ── Signal catalogue seed ──────────────────────────────────────────────────
insert into compliance_signals
  (signal_key, connector_id, name, description, method, finding_type, unit, pass_threshold, partial_threshold, requires_license)
values
  -- Group 1 — internal, no connector
  ('risys.risk_methodology',      'risys', 'Risk methodology in use',
   'Register population, scoring completeness, ownership coverage and treatment closure rate.',
   'internal', null, 'ratio', 0.90, 0.60, null),
  ('risys.ecc_assessment_active', 'risys', 'ECC assessment maintained in RISYS',
   'Running the ECC assessment in RISYS is itself the evidence of departmental review.',
   'internal', null, 'boolean', 1, null, null),
  ('risys.incident_management',   'risys', 'Incident management operating',
   'Incident volume, classification completeness, SLA adherence and closure rate.',
   'internal', null, 'ratio', 0.90, 0.70, null),

  -- Group 2 — Entra ID
  ('entra.ca_policy_coverage',    'entra', 'Conditional Access coverage',
   'Share of enabled users falling under at least one enabled Conditional Access policy.',
   'graph', null, 'ratio', 0.95, 0.75, 'entra_id_p1'),
  ('entra.ca_policies_enabled',   'entra', 'Conditional Access policies enforcing',
   'Policies in enabled state rather than report-only, with exclusion groups scoped.',
   'graph', null, 'ratio', 0.90, 0.60, 'entra_id_p1'),
  ('entra.legacy_auth_blocked',   'entra', 'Legacy authentication blocked',
   'A Conditional Access policy blocks legacy authentication protocols tenant-wide.',
   'graph', null, 'boolean', 1, null, 'entra_id_p1'),
  ('entra.password_policy',       'entra', 'Password policy configured',
   'Banned password list and lockout thresholds configured on the authentication methods policy.',
   'graph', null, 'boolean', 1, null, null),
  ('entra.mfa_registration',      'entra', 'MFA registration coverage',
   'Share of enabled users with at least one MFA method registered. Sourced from the userRegistrationDetails report.',
   'graph', 'no_mfa', 'ratio', 0.98, 0.80, 'entra_id_p1'),
  ('entra.mfa_enforcement',       'entra', 'MFA enforced by policy',
   'An enabled Conditional Access policy requires MFA, with exclusions justified. Registration without enforcement is a gap.',
   'graph', null, 'ratio', 0.95, 0.70, 'entra_id_p1'),
  ('entra.least_privilege',       'entra', 'Least privilege on directory roles',
   'Privileged role assignment density and users holding multiple privileged roles.',
   'graph', 'privileged', 'ratio', 0.95, 0.80, null),
  ('entra.privileged_pim',        'entra', 'Privileged access managed through PIM',
   'Share of privileged assignments that are PIM-eligible rather than permanent.',
   'graph', null, 'ratio', 0.90, 0.50, 'entra_id_p2'),
  ('entra.standing_global_admins','entra', 'Standing Global Administrators',
   'Permanent Global Administrator assignments beyond the break-glass pair.',
   'graph', null, 'count', 2, 4, null),
  ('entra.access_review_completion','entra','Access review campaigns completed',
   'Access Review campaign completion rate with decisions actually applied.',
   'graph', null, 'ratio', 0.95, 0.60, 'entra_id_p2'),
  ('entra.inactive_accounts',     'entra', 'Inactive enabled accounts',
   'Enabled accounts with no sign-in for 90 days or more. Depends on sign-in log ingestion.',
   'graph', 'inactive', 'ratio', 0.02, 0.10, 'entra_id_p1'),
  ('entra.ca_config_drift',       'entra', 'Conditional Access configuration reviewed',
   'Stale exclusions, orphaned privileged roles and unreviewed policy changes.',
   'graph', null, 'ratio', 0.90, 0.60, 'entra_id_p1'),

  -- Group 2 — email, reachable portion only
  ('m365.webmail_mfa',            'm365', 'MFA enforced on webmail access',
   'Conditional Access policy covering Exchange Online and Outlook Web Access.',
   'graph', null, 'boolean', 1, null, 'entra_id_p1'),
  ('dns.spf',                     'dns',  'SPF record published',
   'A valid SPF record exists on each verified email domain.',
   'dns', null, 'ratio', 1.0, 0.5, null),
  ('dns.dkim',                    'dns',  'DKIM selectors published',
   'DKIM signing selectors resolve for each verified email domain.',
   'dns', null, 'ratio', 1.0, 0.5, null),
  ('dns.dmarc',                   'dns',  'DMARC published and enforcing',
   'A DMARC record exists with a policy of quarantine or reject. A policy of none is a fail, not a pass.',
   'dns', null, 'ratio', 1.0, 0.5, null)
on conflict (signal_key) do nothing;

-- ── Signal → ECC requirement map (platform defaults, org_id null) ──────────
insert into signal_requirement_map (signal_key, framework, requirement_id, note)
values
  -- Group 1
  ('risys.risk_methodology',       'NCA ECC', '1-5-2',   'Risk methodology implemented'),
  ('risys.ecc_assessment_active',  'NCA ECC', '1-8-1',   'Security dept reviews control implementation'),
  ('risys.incident_management',    'NCA ECC', '2-13-2',  'Incident management implemented'),

  -- 2-2-2 IAM requirements implemented
  ('entra.ca_policy_coverage',     'NCA ECC', '2-2-2',   null),
  ('entra.ca_policies_enabled',    'NCA ECC', '2-2-2',   null),

  -- 2-2-3 five minimum IAM requirements, mapped at subcontrol level
  ('entra.password_policy',        'NCA ECC', '2-2-3-1', null),
  ('entra.legacy_auth_blocked',    'NCA ECC', '2-2-3-1', 'Legacy auth bypasses modern authentication'),
  ('entra.mfa_registration',       'NCA ECC', '2-2-3-2', null),
  ('entra.mfa_enforcement',        'NCA ECC', '2-2-3-2', null),
  ('entra.least_privilege',        'NCA ECC', '2-2-3-3', null),
  ('entra.privileged_pim',         'NCA ECC', '2-2-3-4', null),
  ('entra.standing_global_admins', 'NCA ECC', '2-2-3-4', null),
  ('entra.access_review_completion','NCA ECC','2-2-3-5', null),
  ('entra.inactive_accounts',      'NCA ECC', '2-2-3-5', 'Requires the last_sign_in fix (B1)'),

  -- 2-2-4 periodic review
  ('entra.access_review_completion','NCA ECC','2-2-4',   null),
  ('entra.ca_config_drift',        'NCA ECC', '2-2-4',   null),

  -- 2-4-3 email minimums, reachable subcontrols only
  ('m365.webmail_mfa',             'NCA ECC', '2-4-3-2', null),
  ('dns.spf',                      'NCA ECC', '2-4-3-5', null),
  ('dns.dkim',                     'NCA ECC', '2-4-3-5', null),
  ('dns.dmarc',                    'NCA ECC', '2-4-3-5', null)
on conflict do nothing;
;
