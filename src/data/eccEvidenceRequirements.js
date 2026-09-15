import { CADENCE_MONTHS, withinMonths, addMonthsISO } from '../lib/manualCompliance.js'
import { automationClassFor } from './eccAutomation.js'
import { MANUAL_REQUIREMENTS } from './eccManualRequirements.js'

// ============================================================
// NCA ECC — EVIDENCE FOR AUTOMATED AND SEMI-AUTOMATED CONTROLS
//
// Taken from the RISYS NCA ECC-2:2024 Implementation & Integration Guide
// ("Evidence to keep", "Platforms", "In RISYS") for the 76 controls a
// connector answers wholly or in part.
//
//   semi_automated, "-4"   the review cycle: owner, reviewer, frequency,
//                          review record with the metrics attached, next due
//   semi_automated, other  the measured part (a dated platform export) plus
//                          the policy and judgement a person supplies
//   automated, unmeasured  interim evidence — the platform's own export,
//                          valid for at most 90 days or until connected
//   automated, measured    the connector decides; a reviewer attests scope
// ============================================================

const file = (key, label, help, extra = {}) => ({ key, type: 'file', label, help, ...extra })
const text = (key, label, help, extra = {}) => ({ key, type: 'text', label, help, ...extra })
const date = (key, label, help, extra = {}) => ({ key, type: 'date', label, help, ...extra })
const select = (key, label, options, help, extra = {}) => ({ key, type: 'select', label, options, help, ...extra })
const number = (key, label, help, extra = {}) => ({ key, type: 'number', label, help, ...extra })
const member = (key, label, help, extra = {}) => ({ key, type: 'member', label, help, ...extra })
const checklist = (key, label, items, help, extra = {}) => ({
  key, type: 'checklist', label, help, ...extra,
  items: items.map((l, i) => ({ key: `i${i}`, label: l })),
})

const pct = (key, label, help) => number(key, label, help, { min: 0, max: 100 })
const count = (key, label, help) => number(key, label, help, { min: 0, max: 1000000 })

const people = () => [
  member('owner', 'Accountable owner', 'Answers for this control day to day.', { section: 'Accountability' }),
  member('reviewer', 'Reviewer', 'Checked the evidence below before it was put on record.'),
]

const nextReview = (extra = {}) => date('next_review', 'Next review date',
  'Compliance lapses to Partial after this date until evidence is re-submitted.',
  { section: 'Review cycle', future: true, ...extra })

const supporting = (labels) => labels.map((l, i) => file(`evidence_${i + 1}`, l, null, i === 0 ? { section: 'Supporting evidence' } : {}))

// ── Semi-automated: the "-4" periodic review ──────────────────────────────────
function reviewCycle({ title, metrics, covered = [] }) {
  return {
    title,
    kind: 'review',
    fields: [
      ...people(),
      select('frequency', 'Review frequency', Object.keys(CADENCE_MONTHS), null, { section: 'Review' }),
      date('reviewed_on', 'Date of this review', null, { notFuture: true }),
      file('review_record', 'Review record', 'Minutes or a signed review note.'),
      file('metrics', metrics, 'The dated figures the review looked at — an export or a report.'),
      ...(covered.length ? [checklist('covered', 'The review covered', covered)] : []),
      text('changes', 'Changes made as a result', 'Write "None" if the review changed nothing.'),
      nextReview(),
    ],
    rules: [
      { test: a => !a.reviewed_on || !a.frequency || !a.next_review
          || a.next_review <= addMonthsISO(a.reviewed_on, CADENCE_MONTHS[a.frequency]),
        message: 'The next review must fall within the chosen review frequency.' },
    ],
  }
}

// ── Semi-automated: implementation — measured part plus judgement ─────────────
function implementation({ title, measured, metrics = [], evidence = [], judgement }) {
  return {
    title,
    kind: 'implementation',
    fields: [
      ...people(),
      file('platform_export', measured, 'A dated export or report from the platform that measures this.', { section: 'Measured part' }),
      date('measured_on', 'Date of the export', null, { notFuture: true }),
      ...metrics,
      ...supporting(evidence),
      checklist('judgement', 'Reviewer confirms', judgement, 'The part no system can decide.', { section: 'Judgement' }),
      nextReview(),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.measured_on, 3, now),
        message: 'The platform export is more than three months old — export current figures.' },
    ],
  }
}

// ── Automated with no connector yet: interim evidence ─────────────────────────
function interim({ title, platforms, exportLabel, metrics = [], evidence = [], confirm, extra = [], rules = [] }) {
  return {
    title,
    kind: 'interim',
    fields: [
      ...people(),
      text('source_platform', 'Platform the figures come from', `e.g. ${platforms}`, { section: 'Interim evidence' }),
      file('platform_export', exportLabel, 'A dated export from the platform itself. Screenshots only where it has no export.'),
      date('measured_on', 'Date of the export', null, { notFuture: true }),
      ...metrics,
      ...extra,
      ...supporting(evidence),
      checklist('confirm', 'Reviewer confirms', confirm, null, { section: 'Scope' }),
      nextReview({
        maxDaysAhead: 90,
        help: 'Interim evidence is a point-in-time export: re-evidence within 90 days, or connect the platform.',
      }),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.measured_on, 1, now),
        message: 'Interim evidence must come from an export taken within the last month.' },
      ...rules,
    ],
  }
}

// ── Automated with a measured result: reviewer attestation ────────────────────
export const ATTESTATION = {
  title: 'Reviewer attestation',
  kind: 'attestation',
  fields: [
    ...people(),
    date('reviewed_on', 'Date of this review', null, { section: 'Attestation', notFuture: true }),
    text('scope_note', 'Scope the connector covers', 'e.g. Entra tenant contoso.onmicrosoft.com — all enabled accounts'),
    checklist('confirm', 'Reviewer confirms', [
      'The connector covers the full scope of this control — every tenant, domain and asset in scope',
      'The measured result matches what the platform console shows',
      'Any exception to the measured result is recorded and justified',
    ]),
    file('supporting', 'Supporting evidence', null, { optional: true }),
    nextReview(),
  ],
}

// ============================================================
// Automated — interim evidence (26)
// ============================================================
export const AUTOMATED_INTERIM = {
  '1-5-2': interim({
    title: 'Risk management methodology implemented', platforms: 'RISYS',
    exportLabel: 'Risk register export from RISYS',
    metrics: [pct('ownership_coverage', 'Risks with an assigned owner (%)'), pct('scoring_completeness', 'Risks fully scored (%)')],
    confirm: ['Risks are scored consistently with the approved methodology', 'Treatment is progressing on risks outside tolerance'],
  }),
  '1-6-2': interim({
    title: 'Vulnerability assessment and secure configuration before launch',
    platforms: 'Tenable, Qualys, Rapid7, Defender Vulnerability Management',
    exportLabel: 'Pre-launch vulnerability scan reports',
    metrics: [pct('releases_scanned', 'Releases scanned before launch (%)')],
    evidence: ['Remediation records', 'Configuration review sign-offs'],
    confirm: ['Releases with open findings were blocked or accepted by a recorded exception'],
  }),
  '1-8-1': interim({
    title: 'Cybersecurity department reviews control implementation', platforms: 'RISYS',
    exportLabel: 'Self-assessment results (RISYS compliance export)',
    evidence: ['Review schedule', 'Gap register with remediation plans'],
    confirm: ['The cybersecurity department reviewed the implementation of the controls'],
  }),
  '1-9-4': interim({
    title: 'Awareness and compliance during employment', platforms: 'KnowBe4, Proofpoint, Viva Learning, Cornerstone',
    exportLabel: 'Training completion report with dates',
    metrics: [pct('completion', 'Completion against active headcount (%)')],
    confirm: ['Non-completion is followed up'],
  }),
  '1-9-5': interim({
    title: 'Powers revoked immediately on termination', platforms: 'HRMS with Entra ID or Active Directory',
    exportLabel: 'Termination records paired with account disablement timestamps',
    metrics: [
      count('enabled_after_termination', 'Accounts still enabled after their holder left'),
      count('median_lag_hours', 'Median time from termination to disablement (hours)'),
    ],
    confirm: ['Leave dates come from the HRMS, account state from the directory'],
    rules: [{ test: a => a.enabled_after_termination === undefined || a.enabled_after_termination === '' || Number(a.enabled_after_termination) === 0,
      message: 'ECC requires powers to be revoked immediately — disable every account still enabled after termination first.' }],
  }),
  '1-10-2': interim({
    title: 'Awareness programme implemented', platforms: 'the awareness platform, reconciled against HRMS headcount',
    exportLabel: 'Programme delivery and campaign report',
    metrics: [pct('participation', 'Participation rate (%)')],
    confirm: ['Participation is measured against current headcount'],
  }),
  '2-1-2': interim({
    title: 'Asset management requirements implemented', platforms: 'Intune, Defender for Endpoint, ServiceNow CMDB, Lansweeper',
    exportLabel: 'Asset inventory export',
    metrics: [pct('inventory_coverage', 'Inventory coverage against discovery sources (%)'), count('unmanaged_devices', 'Unmanaged devices found')],
    evidence: ['Reconciliation exceptions'],
    confirm: ['The inventory is reconciled against every discovery source'],
  }),
  '2-2-2': interim({
    title: 'IAM requirements implemented', platforms: 'Microsoft Entra ID, Active Directory, Okta',
    exportLabel: 'Conditional access policy configuration export',
    metrics: [pct('ca_coverage', 'User population covered by conditional access (%)')],
    evidence: ['Provisioning records'],
    confirm: ['Conditional access applies across the whole user population, with exclusions justified'],
  }),
  '2-2-3': interim({
    title: 'Five minimum IAM requirements', platforms: 'Entra ID with PIM and Access Reviews, CyberArk, Okta',
    exportLabel: 'MFA registration and enforcement report',
    metrics: [pct('mfa_coverage', 'MFA coverage (%)')],
    evidence: [
      'Conditional access policy set with exclusions justified', 'Privileged account inventory',
      'PIM activation logs', 'Completed access review campaigns with revocations',
    ],
    confirm: ['All five subcontrols are covered by the evidence above'],
  }),
  '2-2-4': interim({
    title: 'IAM implementation periodically reviewed', platforms: 'Entra ID Access Reviews, SailPoint, Saviynt',
    exportLabel: 'Access review campaign records with completion and revocations',
    metrics: [pct('campaign_completion', 'Access review completion rate (%)')],
    evidence: ['Configuration review records'],
    confirm: ['Revocations decided in the reviews were carried out'],
  }),
  '2-3-2': interim({
    title: 'System protection requirements implemented', platforms: 'Defender for Endpoint, CrowdStrike, SentinelOne',
    exportLabel: 'EDR agent coverage and health report',
    metrics: [pct('agent_coverage', 'Agent coverage against total assets (%)')],
    evidence: ['Exception records for devices that cannot carry an agent'],
    confirm: ['Coverage is reconciled against the asset inventory'],
  }),
  '2-3-3': interim({
    title: 'Four minimum protection requirements', platforms: 'Defender for Endpoint, Intune, WSUS, SCCM',
    exportLabel: 'EDR coverage and detection configuration',
    metrics: [pct('patch_compliance', 'Patch compliance rate (%)')],
    evidence: ['Removable media policy configuration and exception list', 'NTP configuration with drift monitoring'],
    confirm: ['Patch compliance is measured against severity SLAs'],
  }),
  '2-4-2': interim({
    title: 'Email protection requirements implemented', platforms: 'Defender for Office 365, Proofpoint, Mimecast',
    exportLabel: 'Email security configuration export',
    evidence: ['Filtering and threat detection statistics'],
    confirm: ['Protection applies to every mail domain in use'],
  }),
  '2-4-3': interim({
    title: 'Five minimum email requirements', platforms: 'Defender for Office 365, Exchange Online Protection, Proofpoint',
    exportLabel: 'Filtering policy configuration and detection statistics',
    extra: [select('dmarc_policy', 'Published DMARC policy', ['reject', 'quarantine', 'none'], 'The p= value in the DMARC record.')],
    evidence: [
      'Conditional access covering webmail', 'Archive configuration and retention settings',
      'ATP policy state', 'DNS records showing SPF, DKIM and DMARC',
    ],
    confirm: ['Every sending domain publishes SPF, DKIM and DMARC'],
    rules: [{ test: a => a.dmarc_policy !== 'none',
      message: 'A DMARC policy of p=none only monitors — publish quarantine or reject before complying.' }],
  }),
  '2-6-2': interim({
    title: 'Mobile device requirements implemented', platforms: 'Intune, Workspace ONE, Jamf',
    exportLabel: 'Enrolment and compliance state export',
    metrics: [pct('enrolment', 'Enrolment coverage (%)'), count('noncompliant_devices', 'Non-compliant devices')],
    confirm: ['Non-compliant devices are being remediated'],
  }),
  '2-6-3': interim({
    title: 'Four minimum mobile requirements', platforms: 'Intune app protection, Workspace ONE, Jamf',
    exportLabel: 'Encryption compliance per device',
    metrics: [pct('encryption', 'Encryption compliance (%)'), pct('app_protection', 'App protection policy coverage (%)')],
    evidence: ['Wipe capability configuration and executed wipe records', 'Awareness completion covering mobile topics'],
    confirm: ['Leaver offboarding removes entity data from mobile devices'],
  }),
  '2-9-2': interim({
    title: 'Backup requirements implemented', platforms: 'Veeam, Commvault, Rubrik, Azure Backup',
    exportLabel: 'Backup job success and failure report',
    metrics: [pct('job_success', 'Job success rate (%)'), count('unprotected_systems', 'Systems with no backup')],
    evidence: ['Failure investigation records'],
    confirm: ['Coverage is reconciled against the asset inventory'],
  }),
  '2-9-3': interim({
    title: 'Three minimum backup requirements', platforms: 'the backup platform and DR tooling',
    exportLabel: 'Backup scope reconciliation against the critical asset list',
    extra: [
      select('restore_interval', 'Required test-restore interval', Object.keys(CADENCE_MONTHS)),
      date('last_restore_test', 'Date of the last successful test restore', null, { notFuture: true }),
    ],
    evidence: ['Restore test records with systems tested and outcomes', 'Documented and demonstrated recovery times'],
    confirm: ['Every critical system is within the backup scope'],
    rules: [{ test: (a, { now }) => withinMonths(a.last_restore_test, CADENCE_MONTHS[a.restore_interval], now),
      message: 'The last successful test restore is older than the required interval.' }],
  }),
  '2-10-2': interim({
    title: 'Vulnerability management requirements implemented', platforms: 'Tenable, Qualys, Rapid7, Defender VM',
    exportLabel: 'Scan coverage and open findings by severity and age',
    metrics: [pct('scan_coverage', 'Scan coverage against the asset inventory (%)')],
    confirm: ['Scans run at the frequency the policy defines'],
  }),
  '2-10-3': interim({
    title: 'Five minimum vulnerability requirements', platforms: 'Tenable, Qualys, Rapid7, Intune, ServiceNow',
    exportLabel: 'Scan schedule and results',
    metrics: [pct('sla_adherence', 'Remediation SLA adherence (%)')],
    evidence: [
      'Severity classification methodology', 'Change records showing patches tested before production',
      'Threat intelligence subscription records',
    ],
    confirm: ['All five subcontrols are covered by the evidence above'],
  }),
  '2-12-2': interim({
    title: 'Logging and monitoring requirements implemented', platforms: 'Microsoft Sentinel, Splunk, QRadar, Elastic',
    exportLabel: 'Log source inventory and ingestion status',
    metrics: [pct('critical_logging', 'Critical assets logging to the SIEM (%)')],
    evidence: ['Monitoring operating hours'],
    confirm: ['Log source coverage is reconciled against the critical asset list'],
  }),
  '2-12-3': interim({
    title: 'Five minimum logging requirements', platforms: 'Microsoft Sentinel, Splunk, QRadar, Elastic',
    exportLabel: 'SIEM retention configuration',
    metrics: [number('retention_months', 'Log retention (months)', null, { min: 0, max: 120 })],
    evidence: [
      'Privileged and remote access log configuration', 'SIEM architecture documentation',
      'Monitoring coverage and shift records',
    ],
    confirm: ['Logs twelve months old were retrieved to prove retention works'],
    rules: [{ test: a => a.retention_months === undefined || a.retention_months === '' || Number(a.retention_months) >= 12,
      message: '2-12-3-5 requires at least twelve months of retained, retrievable logs.' }],
  }),
  '2-13-2': interim({
    title: 'Incident management requirements implemented', platforms: 'RISYS incidents, ServiceNow SIR, Jira Service Management',
    exportLabel: 'Incident register export',
    metrics: [pct('sla_adherence', 'Incident SLA adherence (%)'), pct('closure_rate', 'Closure rate (%)')],
    confirm: ['Incidents are classified consistently'],
  }),
  '2-15-2': interim({
    title: 'Web application security requirements implemented', platforms: 'Cloudflare, Akamai, Azure Front Door, AWS WAF',
    exportLabel: 'WAF coverage per application',
    metrics: [pct('waf_coverage', 'External applications behind the WAF (%)')],
    extra: [select('waf_mode', 'WAF policy mode', ['Blocking', 'Detection only'])],
    evidence: ['Blocked request statistics'],
    confirm: ['Coverage is reconciled against the external application inventory'],
    rules: [{ test: a => a.waf_mode !== 'Detection only',
      message: 'A WAF in detection-only mode records attacks without stopping them — switch to blocking first.' }],
  }),
  '2-15-3': interim({
    title: 'Five minimum web application requirements', platforms: 'the WAF, SSL Labs or an internal TLS scanner',
    exportLabel: 'WAF configuration and mode',
    evidence: [
      'Architecture diagrams showing tier separation', 'TLS configuration and HSTS headers',
      'Published usage terms', 'Authentication impact assessment with the control decision',
    ],
    confirm: ['All five subcontrols are covered by the evidence above'],
  }),
  '4-2-2': interim({
    title: 'Cloud security requirements implemented', platforms: 'Defender for Cloud, Wiz, Prisma Cloud',
    exportLabel: 'CSPM findings and remediation state',
    metrics: [pct('baseline_score', 'Baseline compliance score (%)')],
    evidence: ['Shadow IT discovery results'],
    confirm: ['Every cloud subscription and account in use is connected to the CSPM'],
  }),
}

// ============================================================
// Semi-automated (50) — 28 implementation, 22 periodic review
// ============================================================
export const SEMI_REQUIREMENTS = {
  // ── Implementation ──
  '1-1-2': implementation({
    title: 'Action plan executed',
    measured: 'Roadmap export from Jira or Azure DevOps showing initiative status and completion',
    metrics: [pct('roadmap_completion', 'Roadmap completion (%)')],
    evidence: ['Project status reports', 'Steering committee minutes showing progress reviewed', 'Budget approvals'],
    judgement: ['Initiatives have named owners, budgets, timelines and milestones', 'Progress is reported to the supervisory committee'],
  }),
  '1-2-2': implementation({
    title: 'Positions filled by full-time qualified Saudi professionals',
    measured: 'Staffing roster export from the HRMS with employment type',
    metrics: [pct('saudisation', 'Cybersecurity positions held by full-time Saudi professionals (%)')],
    evidence: ['Certifications held', 'Vacancy ageing report'],
    judgement: ['People in cybersecurity positions are qualified for them', 'Any shortfall has a recruitment and Saudisation plan'],
  }),
  '1-3-2': implementation({
    title: 'Policies implemented',
    measured: 'Compliance check results against the technical policies',
    metrics: [pct('policy_compliance', 'Policy compliance rate (%)')],
    evidence: ['Configuration baselines compared against policy', 'Exception register'],
    judgement: ['System configuration matches the written technical policies', 'Exceptions are approved and time-bound'],
  }),
  '1-4-1': implementation({
    title: 'Governance structure, roles and responsibilities assigned',
    measured: 'Directory role export from Entra ID',
    evidence: ['Approved RACI or responsibility matrix', 'Appointment letters', 'Organisation chart', 'Conflict of interest assessment'],
    judgement: ['Privileged directory roles match the documented responsibility matrix'],
  }),
  '1-5-3': implementation({
    title: 'Risk assessment at four defined trigger points',
    measured: 'Change and project records from Jira or ServiceNow with linked risk assessments',
    metrics: [pct('assessed_before', 'Changes and projects with a prior risk assessment (%)')],
    evidence: ['Completed risk assessments'],
    judgement: ['Assessments cover projects, changes, vendor engagements and releases', 'Each assessment preceded its event'],
  }),
  '1-6-1': implementation({
    title: 'Cybersecurity built into project and change management',
    measured: 'Project and change records showing security sign-off',
    metrics: [pct('security_signoff', 'Projects and changes with security sign-off (%)')],
    evidence: ['Updated project methodology', 'Project gate templates with security sign-off', 'CAB records showing security representation'],
    judgement: ['Security is a mandatory gate in project and change management'],
  }),
  '1-6-3': implementation({
    title: 'Secure software development requirements',
    measured: 'SAST, DAST and dependency scan results per repository',
    evidence: ['Secure coding standard', 'Software composition analysis reports', 'Pre-release security test sign-offs'],
    judgement: ['Security testing completes before release', 'Licence and provenance of dependencies are reviewed'],
  }),
  '1-8-3': implementation({
    title: 'Results presented to committee and Authorized Official',
    measured: 'Findings and remediation tracker export from RISYS',
    evidence: ['Review results report', 'Committee minutes recording the presentation'],
    judgement: ['Results were presented to the supervisory committee and the Authorized Official'],
  }),
  '1-9-2': implementation({
    title: 'Personnel security requirements implemented',
    measured: 'HRMS completion report for screening, contracts, onboarding and offboarding',
    metrics: [pct('personnel_completion', 'Personnel requirements completion rate (%)')],
    evidence: ['Onboarding and offboarding checklists'],
    judgement: ['Offboarding includes access revocation'],
  }),
  '1-9-3': implementation({
    title: 'Pre-employment clauses and screening',
    measured: 'Screening completion per role from the HRMS',
    evidence: ['Contract templates showing the security clauses', 'List of positions designated as privileged', 'Screening records for privileged positions'],
    judgement: ['Everyone holding a privileged Entra role has a completed screening record'],
  }),
  '1-10-1': implementation({
    title: 'Awareness programme developed and approved',
    measured: 'Awareness platform delivery data',
    evidence: ['Approved awareness programme plan', 'Channel inventory', 'Content calendar'],
    judgement: ['The programme is formally approved'],
  }),
  '1-10-3': implementation({
    title: 'Programme content covers four required topics',
    measured: 'Module completion by topic',
    metrics: [pct('click_rate', 'Phishing simulation click rate (%)')],
    evidence: ['Content mapping against the four required topics', 'Phishing simulation results'],
    judgement: ['Content covers all four topics ECC requires'],
  }),
  '1-10-4': implementation({
    title: 'Specialised training for three personnel groups',
    measured: 'LMS completion records for specialised training',
    evidence: ['Training plans per personnel group', 'Certifications held with expiry dates', 'Budget allocation'],
    judgement: ['All three personnel groups have a specialised training plan', 'No required certification has expired'],
  }),
  '2-1-4': implementation({
    title: 'Acceptable use policy implemented',
    measured: 'Enforcement coverage and violation reports from endpoint and web filtering platforms',
    metrics: [pct('enforcement_coverage', 'Enforcement coverage (%)')],
    judgement: ['Violations are followed up, with disciplinary records where the policy was breached'],
  }),
  '2-1-5': implementation({
    title: 'Assets classified, labelled and handled',
    measured: 'Label coverage report from Microsoft Purview',
    metrics: [pct('label_coverage', 'Label coverage (%)')],
    evidence: ['Classification standard', 'Handling rules per classification level'],
    judgement: ['Labels are applied according to the classification standard'],
  }),
  '2-5-2': implementation({
    title: 'Network security requirements implemented',
    measured: 'Firewall rule base and configuration compliance reports',
    evidence: ['Segmentation verification'],
    judgement: ['Segmentation is adequate for the environments it separates'],
  }),
  '2-5-3': implementation({
    title: 'Nine minimum network requirements',
    measured: 'Firewall, IPS, web filtering and DNS security configuration exports',
    evidence: [
      'Network architecture and segmentation diagrams', 'Wireless configuration and its risk assessment',
      'Approved port and service baseline with exceptions', 'DDoS protection configuration',
    ],
    judgement: [
      'Network segmentation', 'Environment separation', 'Browsing and internet restrictions',
      'Wireless protection', 'Services, ports and protocols restricted', 'Intrusion prevention',
      'Secure DNS', 'Advanced persistent threat protection (sandboxing)', 'DDoS protection',
    ],
  }),
  '2-7-2': implementation({
    title: 'Protection implemented based on classification level',
    measured: 'Purview DLP policy state and label coverage',
    metrics: [pct('encryption_coverage', 'Encryption coverage (%)')],
    evidence: ['Handling rules per level', 'DLP policy configuration mapped to labels'],
    judgement: ['Protection matches each classification level'],
  }),
  '2-8-2': implementation({
    title: 'Cryptography requirements implemented',
    measured: 'TLS scan results and cipher suite configuration',
    evidence: ['Encryption-at-rest state per data store'],
    judgement: ['No prohibited protocol or cipher is in use'],
  }),
  '2-8-3': implementation({
    title: 'Compliance with National Cryptographic Standards',
    measured: 'Key vault inventory with rotation state and expiry',
    evidence: ['Mapping of systems to NCS levels', 'Key management procedure', 'Key rotation records'],
    judgement: ['Cryptography complies with the National Cryptographic Standards', 'No key is expired or overdue for rotation'],
  }),
  '2-11-3': implementation({
    title: 'Two minimum penetration testing requirements',
    measured: 'Internet-facing asset inventory from attack surface discovery',
    evidence: ['Test reports with dates showing the interval', 'Remediation status per finding'],
    judgement: ['Every internet-facing asset is inside the test scope'],
  }),
  '2-13-3': implementation({
    title: 'Five minimum incident requirements including NCA reporting',
    measured: 'Incident classification and tracking data',
    evidence: [
      'Classification scheme with NCA reporting thresholds', 'Reports submitted to NCA with timestamps',
      'Evidence of intelligence sharing', 'Threat intelligence source inventory',
    ],
    judgement: ['Every incident meeting an NCA threshold was reported'],
  }),
  '2-14-2': implementation({
    title: 'Physical security requirements implemented',
    measured: 'Access control system export of authorised personnel per area',
    evidence: ['Access control system configuration', 'CCTV coverage'],
    judgement: ['Only authorised personnel hold access to critical areas'],
  }),
  '2-14-3': implementation({
    title: 'Five minimum physical requirements',
    measured: 'Authorised access lists with review records',
    evidence: [
      'CCTV coverage map and retention configuration', 'Log protection measures',
      'Destruction certificates for media and paper', 'Asset removal authorisation records',
    ],
    judgement: ['Destroyed assets reconcile against the asset inventory'],
  }),
  '3-1-2': implementation({
    title: 'BCM cybersecurity requirements implemented',
    measured: 'Recovery capability state from DR tooling',
    evidence: ['Current continuity plans with version dates', 'Recovery objectives per service'],
    judgement: ['Plans are maintained and current'],
  }),
  '3-1-3': implementation({
    title: 'Three minimum resilience requirements',
    measured: 'DR test results and replication health',
    evidence: [
      'Resilience assessment of security infrastructure', 'Cyber incident response plans including ransomware',
      'DR plans with RTO and RPO per system',
    ],
    judgement: ['Security infrastructure has redundancy', 'Ransomware is covered in response planning'],
  }),
  '4-1-2': implementation({
    title: 'Three minimum contract clauses',
    measured: 'Vendor register with contract presence and renewal dates',
    metrics: [pct('clause_coverage', 'Contracts containing all three required clauses (%)')],
    evidence: ['Contract clause audit', 'Remediation plan for gaps'],
    judgement: ['Clause gaps are remediated at renewal'],
  }),
  '4-2-3': implementation({
    title: 'Cloud minimum requirements and data return',
    measured: 'CSPM tenant isolation and configuration evidence',
    evidence: ['Contract clauses on protection and data return', 'Exit plan with tested extraction procedure', 'NDMO position on data localisation'],
    judgement: [
      'Data return in a usable format has been tested, not assumed',
      'Localisation is assessed against NDMO, not the removed ECC-1 requirement',
    ],
  }),

  // ── Periodic review ──
  '1-1-3': reviewCycle({ title: 'Strategy reviewed at planned intervals', metrics: 'Dated strategy version history',
    covered: ['The planned review interval', 'Changes in legislative or regulatory requirements, including the ECC-2 update'] }),
  '1-3-4': reviewCycle({ title: 'Policies reviewed and updated at planned intervals', metrics: 'Policy version history and change approvals',
    covered: ['Every policy is within its review date'] }),
  '1-4-2': reviewCycle({ title: 'Roles reviewed and updated at planned intervals', metrics: 'Dated versions of the responsibility matrix',
    covered: ['Role changes since the last review', 'Roles held by people who have left'] }),
  '1-5-4': reviewCycle({ title: 'Risk methodology reviewed and updated', metrics: 'Methodology version history and approval of changes' }),
  '1-9-6': reviewCycle({ title: 'Personnel requirements periodically reviewed', metrics: 'Updated personnel designations' }),
  '1-10-5': reviewCycle({ title: 'Awareness implementation periodically reviewed', metrics: 'Awareness effectiveness metrics over time',
    covered: ['Programme adjustments made'] }),
  '2-1-6': reviewCycle({ title: 'Asset requirements periodically reviewed', metrics: 'Asset requirement updates' }),
  '2-3-4': reviewCycle({ title: 'System protection implementation reviewed', metrics: 'EDR and patching coverage metrics',
    covered: ['Remediation of gaps found'] }),
  '2-4-4': reviewCycle({ title: 'Email protection implementation reviewed', metrics: 'DMARC posture and email configuration changes' }),
  '2-5-4': reviewCycle({ title: 'Network implementation periodically reviewed', metrics: 'Rule review records and segmentation test results',
    covered: ['Removed and justified firewall rules'] }),
  '2-6-4': reviewCycle({ title: 'Mobile implementation periodically reviewed', metrics: 'Mobile device compliance metrics',
    covered: ['Remediation of non-compliant devices'] }),
  '2-7-3': reviewCycle({ title: 'Data protection implementation reviewed', metrics: 'Coverage trend and DLP rule tuning history' }),
  '2-8-4': reviewCycle({ title: 'Cryptography implementation reviewed', metrics: 'Certificate inventory with expiry dates',
    covered: ['Key and certificate rotation compliance'] }),
  '2-9-4': reviewCycle({ title: 'Backup implementation periodically reviewed', metrics: 'Backup metrics and scope changes' }),
  '2-10-4': reviewCycle({ title: 'Vulnerability implementation reviewed', metrics: 'Remediation SLA trend and exceptions with expiry' }),
  '2-11-4': reviewCycle({ title: 'Penetration testing implementation reviewed', metrics: 'Test scope updates and test dates',
    covered: ['Test interval adherence'] }),
  '2-12-4': reviewCycle({ title: 'Logging implementation periodically reviewed', metrics: 'SIEM coverage trend and rule tuning history' }),
  '2-13-4': reviewCycle({ title: 'Incident implementation periodically reviewed', metrics: 'Exercise reports and post-incident review findings with actions' }),
  '2-15-4': reviewCycle({ title: 'Web application requirements reviewed', metrics: 'WAF rule tuning, inventory updates and external posture scan' }),
  '3-1-4': reviewCycle({ title: 'BCM requirements periodically reviewed', metrics: 'Exercise reports with participants and scenarios',
    covered: ['Plan updates from lessons learned'] }),
  '4-1-4': reviewCycle({ title: 'Third-party requirements periodically reviewed', metrics: 'Vendor review records and security rating scores',
    covered: ['Remediation of vendor findings'] }),
  '4-2-4': reviewCycle({ title: 'Cloud requirements periodically reviewed', metrics: 'CSPM posture trend and newly discovered cloud services' }),
}

/**
 * How a main ECC control is evidenced, and the checklist for it.
 *   manual       — MANUAL_REQUIREMENTS, Comply sets the status
 *   semi         — SEMI_REQUIREMENTS, Comply sets the status
 *   interim      — automated with no measured result yet, Comply sets the status
 *   attestation  — automated with a measured result; recorded, status left to the connector
 */
export function evidenceRequirementFor(id, { measured = false } = {}) {
  switch (automationClassFor(id)) {
    case 'manual_evidence': return MANUAL_REQUIREMENTS[id] ? { mode: 'manual', def: MANUAL_REQUIREMENTS[id] } : null
    case 'semi_automated':  return SEMI_REQUIREMENTS[id] ? { mode: 'semi', def: SEMI_REQUIREMENTS[id] } : null
    case 'automated':
      if (measured) return { mode: 'attestation', def: ATTESTATION }
      return AUTOMATED_INTERIM[id] ? { mode: 'interim', def: AUTOMATED_INTERIM[id] } : null
    default: return null
  }
}
