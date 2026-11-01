import { tx } from '@/lib/i18n'

/* ── Starter policy set ───────────────────────────────────────────────────────
 *
 * One policy per ECC main control that asks for documented, approved
 * requirements (is_documented_requirement() in the database). Picking a
 * template fills the title, purpose, scope and the ECC mapping; the text is
 * still written by the organisation — RISYS does not ship policy wording.
 *
 * `reviews` adds the subdomain's periodic-review control (X-Y-4 where it
 * exists) as "covers its periodic review".
 * -------------------------------------------------------------------------- */

const t = (key, title, requirement, criticality = 'high', reviews = null, extra = []) => ({
  key, title, requirement, criticality, reviews, extra,
})

export const POLICY_TEMPLATES = [
  t('cyber_strategy', tx('Cybersecurity Strategy'), '1-1-1', 'critical', '1-1-3'),
  t('cyber_policy', tx('Cybersecurity Policy'), '1-3-1', 'critical', '1-3-4'),
  t('roles_responsibilities', tx('Cybersecurity Roles and Responsibilities'), '1-4-1', 'high', '1-4-2'),
  t('risk_methodology', tx('Cybersecurity Risk Management Methodology'), '1-5-1', 'critical', '1-5-4'),
  t('hr_cyber', tx('Cybersecurity in Human Resources'), '1-9-1', 'high', '1-9-6'),
  t('asset_management', tx('Asset Management'), '2-1-1', 'high', '2-1-6'),
  t('iam', tx('Identity and Access Management'), '2-2-1', 'critical', '2-2-4'),
  t('system_protection', tx('Information System and Processing Facilities Protection'), '2-3-1', 'high', '2-3-4'),
  t('email_protection', tx('Email Protection'), '2-4-1', 'high', '2-4-4'),
  t('network_security', tx('Network Security Management'), '2-5-1', 'high', '2-5-4'),
  t('mobile_devices', tx('Mobile Devices Security (BYOD)'), '2-6-1', 'medium', '2-6-4'),
  t('data_protection', tx('Data and Information Protection'), '2-7-1', 'critical', '2-7-3'),
  t('cryptography', tx('Cryptography'), '2-8-1', 'high', '2-8-4'),
  t('backup_recovery', tx('Backup and Recovery Management'), '2-9-1', 'high', '2-9-4'),
  t('vulnerability_management', tx('Vulnerability Management'), '2-10-1', 'high', '2-10-4'),
  t('penetration_testing', tx('Penetration Testing'), '2-11-1', 'medium', '2-11-4'),
  t('logging_monitoring', tx('Cybersecurity Event Logs and Monitoring Management'), '2-12-1', 'high', '2-12-4'),
  t('incident_management', tx('Cybersecurity Incident and Threat Management'), '2-13-1', 'critical', '2-13-4'),
  t('physical_security', tx('Physical Security'), '2-14-1', 'medium', '2-14-4'),
  t('web_application', tx('Web Application Security'), '2-15-1', 'medium', '2-15-4'),
  t('bcm_cyber', tx('Cybersecurity Resilience in Business Continuity Management'), '3-1-1', 'high', '3-1-4'),
  t('third_party', tx('Third-Party Cybersecurity'), '4-1-1', 'high', '4-1-4'),
  t('cloud', tx('Cloud Computing and Hosting Cybersecurity'), '4-2-1', 'high', '4-2-4'),
]

export const templateByKey = (key) => POLICY_TEMPLATES.find((x) => x.key === key)

/* The mapping a template proposes, checked against the loaded framework so a
 * review control that does not exist (not every subdomain has an X-Y-4) is
 * dropped rather than refused by the database. */
export function templateMapping(tpl, known) {
  const rows = [{ framework: 'NCA ECC', requirement_id: tpl.requirement, relation: 'documents' }]
  if (tpl.reviews) rows.push({ framework: 'NCA ECC', requirement_id: tpl.reviews, relation: 'reviews' })
  if (tpl.requirement === '1-3-1') rows.push({ framework: 'NCA ECC', requirement_id: '1-3-3', relation: 'supports' })
  return known ? rows.filter((r) => known.has(`${r.framework}|${r.requirement_id}`)) : rows
}
