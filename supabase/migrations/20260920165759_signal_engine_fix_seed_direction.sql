-- Two signals were seeded with the wrong direction: fewer standing Global
-- Administrators and fewer inactive accounts are better, and their thresholds
-- (2 / 4 admins; 2% / 10% inactive) only make sense read that way.
update compliance_signals set higher_is_better = false
 where signal_key in ('entra.standing_global_admins', 'entra.inactive_accounts');

-- Each signal records how it is measured, so the UI can say why a signal is
-- unknown instead of leaving a silent blank.
alter table compliance_signals
  add column if not exists source_note text;

update compliance_signals set source_note = 'Counted from the risk register: risks scored inherent and residual and passed through the tolerance gate.' where signal_key = 'risys.risk_methodology';
update compliance_signals set source_note = 'Counted from the NCA ECC compliance statuses recorded in RISYS and how recently they were reviewed.' where signal_key = 'risys.ecc_assessment_active';
update compliance_signals set source_note = 'Counted from incidents closed in the last 90 days and whether they met their SLA.' where signal_key = 'risys.incident_management';
update compliance_signals set source_note = 'Counted from the Entra ID directory sync: enabled member accounts with a registered MFA method.' where signal_key = 'entra.mfa_registration';
update compliance_signals set source_note = 'Counted from the Entra ID directory sync: enabled accounts holding a directory role.' where signal_key = 'entra.least_privilege';
update compliance_signals set source_note = 'Counted from the Entra ID directory sync: accounts holding the Global Administrator role permanently.' where signal_key = 'entra.standing_global_admins';
update compliance_signals set source_note = 'Counted from the Entra ID directory sync: enabled accounts with no sign-in for 90 days. Needs Entra ID P1 for sign-in activity.' where signal_key = 'entra.inactive_accounts';
update compliance_signals set source_note = 'Read from Microsoft Secure Score controls collected by the Defender connector.' where signal_key in ('entra.legacy_auth_blocked', 'entra.password_policy', 'entra.mfa_enforcement');
update compliance_signals set source_note = 'Needs Conditional Access policy collection from Microsoft Graph, which RISYS does not collect yet.' where signal_key in ('entra.ca_policies_enabled', 'entra.ca_policy_coverage', 'entra.ca_config_drift', 'm365.webmail_mfa');
update compliance_signals set source_note = 'Needs Privileged Identity Management data from Microsoft Graph (Entra ID P2), which RISYS does not collect yet.' where signal_key = 'entra.privileged_pim';
update compliance_signals set source_note = 'Needs access review campaign data from Microsoft Graph (Entra ID P2), which RISYS does not collect yet.' where signal_key = 'entra.access_review_completion';
update compliance_signals set source_note = 'Resolved over DNS for each of the tenant''s verified mail domains by the Microsoft 365 connector.' where connector_id = 'dns';;
