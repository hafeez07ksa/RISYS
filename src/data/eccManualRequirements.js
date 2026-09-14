import { CADENCE_MONTHS, withinMonths } from '../lib/manualCompliance.js'

// ============================================================
// NCA ECC — WHAT EACH MANUAL-EVIDENCE CONTROL MUST PUT ON RECORD
//
// The 32 main controls classified manual_evidence. Each checklist is
// taken from the RISYS NCA ECC-2:2024 Implementation & Integration Guide
// ("Evidence to keep", "How to implement", "In RISYS"), so the form asks
// for exactly what an assessor will ask to see.
//
// Field types: file · text · date · select · yesno · check · checklist ·
// multiselect · number. Every visible field is required unless `optional`.
// `rules` are the checks that block Comply even when every field is
// filled — the answers themselves show the control is not met.
// ============================================================

const file = (key, label, help, extra = {}) => ({ key, type: 'file', label, help, ...extra })
const text = (key, label, help, extra = {}) => ({ key, type: 'text', label, help, ...extra })
const date = (key, label, help, extra = {}) => ({ key, type: 'date', label, help, ...extra })
const yesno = (key, label, help, extra = {}) => ({ key, type: 'yesno', label, help, ...extra })
const check = (key, label, help, extra = {}) => ({ key, type: 'check', label, help, ...extra })
const select = (key, label, options, help, extra = {}) => ({ key, type: 'select', label, options, help, ...extra })
const number = (key, label, help, extra = {}) => ({ key, type: 'number', label, help, ...extra })
const multiselect = (key, label, options, help, extra = {}) => ({ key, type: 'multiselect', label, options, help, ...extra })
const checklist = (key, label, items, help, extra = {}) => ({
  key, type: 'checklist', label, help, ...extra,
  items: items.map((l, i) => ({ key: `i${i}`, label: l })),
})

/** The X-Y-1 pattern: an approved document with a signature behind it. */
const approvedDocument = (docName) => [
  file('document', `Approved ${docName}`, 'The signed, approved version — not a draft.', { section: 'Approved document' }),
  text('version', 'Document version', 'e.g. v2.1'),
  text('approver', 'Approved by', 'Name and title of the Authorized Official, or the documented delegate.'),
  date('approved_on', 'Approval date', null, { notFuture: true }),
  file('approval_record', 'Approval record', 'Committee minutes, a signature page or an approval memo.'),
]

const scope = (label, items) => checklist('content', label, items,
  'Confirm each item is covered in the approved document.', { section: 'Content' })

const nextReview = () => date('next_review', 'Next review date',
  'Compliance lapses to Partial after this date until evidence is re-submitted.',
  { section: 'Review cycle', future: true })

/** The X-Y-4 pattern: a review that happened, on a cycle. */
const reviewRecord = () => [
  date('reviewed_on', 'Date of the review', null, { section: 'Review', notFuture: true }),
  text('reviewer', 'Reviewed by', 'Name and title.'),
  file('review_record', 'Review record', 'Minutes or a signed review note.'),
]

const usesMssp = a => a.uses_mssp === 'yes'

export const MANUAL_REQUIREMENTS = {
  // ── Domain 1 — Governance ────────────────────────────────────────────────
  '1-1-1': {
    title: 'Strategy documented and approved',
    fields: [
      ...approvedDocument('cybersecurity strategy'),
      select('horizon', 'Strategy horizon', ['3 years', '4 years', '5 years'],
        'ECC expects a three to five year strategy.', { section: 'Content' }),
      checklist('content', 'The strategy covers', [
        'Objectives', 'Initiatives', 'Target state',
        'Each goal traced to a regulatory driver — ECC, the sector regulator, Vision 2030',
      ]),
      yesno('delegate_signed', 'Was it signed by a delegate rather than the head of entity?', null, { section: 'Authority' }),
      file('delegation_letter', 'Delegation letter', 'Documents the delegation itself.', { showIf: a => a.delegate_signed === 'yes' }),
      nextReview(),
    ],
  },

  '1-2-1': {
    title: 'Independent cybersecurity department',
    fields: [
      file('org_chart', 'Organisation chart', 'Must show the cybersecurity reporting line.', { section: 'Structure' }),
      file('establishment_decision', 'Establishment decision'),
      file('role_descriptions', 'Role descriptions'),
      text('reports_to', 'The cybersecurity department reports to',
        'NCA recommends the head of entity, where that creates no conflict of interest.'),
      yesno('independent_of_it', 'Is the department organisationally independent of the IT and communications department?',
        'Required by High Order No. 37140.'),
      nextReview(),
    ],
    rules: [
      { test: a => a.independent_of_it !== 'no',
        message: 'A cybersecurity function sitting under IT fails 1-2-1. This needs restructuring, not documentation.' },
    ],
  },

  '1-2-3': {
    title: 'Cybersecurity supervisory committee',
    fields: [
      file('charter', 'Committee charter', null, { section: 'Establishment' }),
      file('establishment_decision', 'Establishment decision', "Issued on the Authorized Official's instruction."),
      file('membership', 'Approved membership list'),
      yesno('head_is_member', 'Does the head of the cybersecurity department sit on the committee?'),
      select('cadence', 'Meeting cadence set in the charter', Object.keys(CADENCE_MONTHS), null, { section: 'Meetings' }),
      date('last_meeting', 'Date of the most recent meeting', null, { notFuture: true }),
      file('minutes', 'Minutes of that meeting, with attendance',
        'An assessor will look for the security head on the attendance list.'),
      nextReview(),
    ],
    rules: [
      { test: a => a.head_is_member !== 'no',
        message: 'ECC requires the head of the cybersecurity department to sit on the committee.' },
      { test: (a, { now }) => withinMonths(a.last_meeting, CADENCE_MONTHS[a.cadence], now),
        message: 'The committee has not met within its charter cadence — a lapsed committee is a common finding.' },
    ],
  },

  '1-3-1': {
    title: 'Policies documented, approved and communicated',
    fields: [
      ...approvedDocument('cybersecurity policy set'),
      scope('The policy set', [
        'Covers every applicable ECC subdomain',
        'Was authored by the cybersecurity department',
      ]),
      file('acknowledgements', 'Distribution and acknowledgement records',
        'An unread policy does not satisfy the communication limb.', { section: 'Communication' }),
      number('ack_rate', 'Acknowledgement rate (%)', 'Share of relevant personnel who have acknowledged.', { min: 0, max: 100 }),
      nextReview(),
    ],
  },

  '1-3-3': {
    title: 'Supported by technical security standards',
    fields: [
      ...approvedDocument('technical security standards'),
      scope('Hardening baselines cover at minimum', [
        'Operating systems', 'Database platforms', 'Firewalls', 'Hypervisors',
      ]),
      file('mapping', 'Mapping of standards to estate components', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  '1-5-1': {
    title: 'Risk management methodology documented and approved',
    fields: [
      ...approvedDocument('risk management methodology'),
      scope('The methodology defines', [
        'How risks are identified',
        'The likelihood and impact scoring scale',
        'The risk appetite statement and acceptance thresholds',
        'The treatment options',
        'The review cadence',
      ]),
      nextReview(),
    ],
  },

  '1-6-4': {
    title: 'Project cybersecurity requirements periodically reviewed',
    fields: [
      ...reviewRecord(),
      file('gate_criteria', 'Updated project security gate criteria'),
      checklist('content', 'The review considered', ['Current threats', 'Lessons from incidents']),
      nextReview(),
    ],
  },

  '1-7-1': {
    title: 'Comply with nationally approved international commitments',
    fields: [
      multiselect('commitments', 'International commitments that bind the entity',
        ['SWIFT CSP', 'PCI-DSS', 'Treaty-derived obligations', 'Other', 'None apply'], null, { section: 'Applicability' }),
      file('register', 'Register of applicable international requirements'),
      file('assessments', 'Compliance assessment against each commitment', null,
        { showIf: a => !(a.commitments || []).includes('None apply') }),
      file('certifications', 'Certifications held', null,
        { optional: true, showIf: a => !(a.commitments || []).includes('None apply') }),
      nextReview(),
    ],
    rules: [
      { test: a => !((a.commitments || []).includes('None apply') && (a.commitments || []).length > 1),
        message: '"None apply" cannot be combined with a commitment.' },
    ],
  },

  '1-8-2': {
    title: 'Independent review by a party other than the security department',
    fields: [
      select('review_type', 'Type of review', ['Internal audit', 'External assessor'], null, { section: 'Review' }),
      text('reviewer_org', 'Reviewing party'),
      date('review_date', 'Date of the review', null, { notFuture: true }),
      file('audit_report', 'Audit report'),
      file('engagement_letter', 'Engagement letter'),
      file('credentials', 'Auditor credentials'),
      file('independence_declaration', 'Independence declaration', null, { section: 'Independence' }),
      yesno('reports_to_ciso', 'Does the reviewer report to the head of cybersecurity?'),
      nextReview(),
    ],
    rules: [
      { test: a => a.reports_to_ciso !== 'yes',
        message: 'A reviewer who reports to the head of cybersecurity is not independent — 1-8-2 is not met.' },
    ],
  },

  '1-9-1': {
    title: 'Personnel security requirements documented and approved',
    fields: [
      ...approvedDocument('personnel security policy'),
      scope('The standard covers', [
        'Pre-employment screening', 'Contractual security clauses',
        'Awareness obligations', 'Revocation of access on exit',
      ]),
      nextReview(),
    ],
  },

  // ── Domain 2 — Defense ───────────────────────────────────────────────────
  '2-1-1': {
    title: 'Asset management requirements documented and approved',
    fields: [
      ...approvedDocument('asset management policy'),
      scope('The standard defines', [
        'What counts as an asset', 'Ownership of each asset class',
        'Required inventory attributes', 'Lifecycle from acquisition to disposal',
      ]),
      nextReview(),
    ],
  },

  '2-1-3': {
    title: 'Acceptable use policy documented, approved and communicated',
    fields: [
      ...approvedDocument('acceptable use policy'),
      file('acknowledgements', 'Acknowledgement records per employee', null, { section: 'Communication' }),
      checklist('ack_points', 'Acknowledgement is recorded', ['At onboarding', 'On annual refresh']),
      number('ack_rate', 'Acknowledgement rate (%)', null, { min: 0, max: 100 }),
      nextReview(),
    ],
  },

  '2-2-1': {
    title: 'IAM requirements documented and approved',
    fields: [
      ...approvedDocument('identity and access management policy'),
      scope('The standard covers', [
        'Authentication requirements', 'Authorisation model', 'Privileged access rules',
        'Joiner-mover-leaver process', 'Access review cadence',
      ]),
      nextReview(),
    ],
  },

  '2-3-1': {
    title: 'System protection requirements documented and approved',
    fields: [
      ...approvedDocument('system protection standard'),
      scope('The standard covers', ['Malware protection', 'Removable media control', 'Patching', 'Time synchronisation']),
      nextReview(),
    ],
  },

  '2-4-1': {
    title: 'Email protection requirements documented and approved',
    fields: [
      ...approvedDocument('email protection standard'),
      scope('The standard covers', ['Filtering', 'Email authentication', 'Archiving', 'Access controls']),
      nextReview(),
    ],
  },

  '2-5-1': {
    title: 'Network security requirements documented and approved',
    fields: [
      ...approvedDocument('network security standard'),
      scope('The standard covers', [
        'Segmentation', 'Environment separation', 'Browsing controls', 'Wireless',
        'Services and ports', 'Intrusion prevention', 'DNS security', 'APT protection', 'DDoS protection',
      ]),
      file('architecture', 'Network architecture documentation', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  '2-6-1': {
    title: 'Mobile and BYOD requirements documented and approved',
    fields: [
      ...approvedDocument('mobile and BYOD policy'),
      yesno('byod_permitted', 'Is BYOD permitted?',
        'A clear prohibition is easier to evidence than a permissive policy.', { section: 'BYOD' }),
      file('user_acceptance', 'User acceptance records'),
      nextReview(),
    ],
  },

  '2-7-1': {
    title: 'Data protection requirements documented and approved',
    fields: [
      ...approvedDocument('data protection policy'),
      scope('The policy is aligned to', ['PDPL', 'NDMO requirements']),
      nextReview(),
    ],
  },

  '2-8-1': {
    title: 'Cryptography requirements documented and approved',
    fields: [
      ...approvedDocument('cryptographic standard'),
      scope('The standard specifies', ['Approved algorithms', 'Key lengths', 'Protocol versions', 'Prohibited legacy ciphers']),
      nextReview(),
    ],
  },

  '2-9-1': {
    title: 'Backup requirements documented and approved',
    fields: [
      ...approvedDocument('backup policy'),
      scope('The policy defines', ['Scope', 'Frequency', 'Retention', 'Storage location', 'Encryption', 'RTO and RPO per system tier']),
      nextReview(),
    ],
  },

  '2-10-1': {
    title: 'Vulnerability management requirements documented and approved',
    fields: [
      ...approvedDocument('vulnerability management policy'),
      scope('The policy defines', [
        'Scan scope and frequency', 'Severity classification',
        'Remediation SLAs per severity', 'Exception process',
      ]),
      nextReview(),
    ],
  },

  '2-11-1': {
    title: 'Penetration testing requirements documented and approved',
    fields: [
      ...approvedDocument('penetration testing policy'),
      scope('The policy defines', ['Scope', 'Frequency', 'Tester qualification requirements', 'Rules of engagement', 'Finding handling']),
      nextReview(),
    ],
  },

  '2-11-2': {
    title: 'Penetration testing requirements implemented',
    fields: [
      text('tester', 'Testing firm or team', null, { section: 'Latest test' }),
      date('test_date', 'Test date', null, { notFuture: true }),
      select('cycle', 'Testing cycle defined in 2-11-1', ['Quarterly', 'Semi-annual', 'Annual']),
      file('engagement_letter', 'Engagement letter'),
      file('test_report', 'Test report'),
      checklist('assurance', 'Confirm', [
        'The testers meet the qualification requirements',
        'Findings have entered the remediation process with owners and due dates',
      ]),
      nextReview(),
    ],
    rules: [
      { test: (a, { now }) => withinMonths(a.test_date, CADENCE_MONTHS[a.cycle], now),
        message: 'The latest penetration test is older than the testing cycle — test on the defined cycle.' },
    ],
  },

  '2-12-1': {
    title: 'Logging and monitoring requirements documented and approved',
    fields: [
      ...approvedDocument('logging and monitoring policy'),
      scope('The standard defines', [
        'Which systems log', 'Which events are logged', 'Where logs are sent',
        'Retention', 'Monitoring responsibilities',
      ]),
      nextReview(),
    ],
  },

  '2-13-1': {
    title: 'Incident management requirements documented and approved',
    fields: [
      ...approvedDocument('incident response plan'),
      scope('The plan covers', [
        'Classification scheme', 'Severity definitions', 'Escalation paths',
        'Roles', 'Communication plan', 'NCA reporting procedure',
      ]),
      file('escalation_matrix', 'Escalation matrix', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  '2-14-1': {
    title: 'Physical security requirements documented and approved',
    fields: [
      ...approvedDocument('physical security policy'),
      scope('The standard covers', [
        'Critical area access', 'Surveillance', 'Log protection', 'Secure disposal', 'Equipment security',
      ]),
      file('critical_areas', 'List of designated critical areas', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  '2-14-4': {
    title: 'Physical security requirements periodically reviewed',
    fields: [
      ...reviewRecord(),
      file('access_list', 'Access list revisions'),
      checklist('content', 'The review covered', ['Critical area designations', 'Access lists', 'CCTV coverage']),
      nextReview(),
    ],
  },

  '2-15-1': {
    title: 'Web application security requirements documented and approved',
    fields: [
      ...approvedDocument('web application security standard'),
      scope('The standard covers', ['WAF', 'Architecture', 'Protocols', 'Usage policy', 'Authentication']),
      file('app_inventory', 'Inventory of external web applications', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  // ── Domain 3 — Resilience ────────────────────────────────────────────────
  '3-1-1': {
    title: 'BCM cybersecurity requirements documented and approved',
    fields: [
      ...approvedDocument('business continuity policy'),
      scope('Confirm', [
        'Cyber scenarios are integrated into the existing BCM programme',
        'The business impact analysis covers cyber-driven outage, not only physical and natural disruption',
      ]),
      file('bia', 'Business impact analysis covering cyber events', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },

  // ── Domain 4 — Third-party and cloud ─────────────────────────────────────
  '4-1-1': {
    title: 'Third-party contract requirements documented and approved',
    fields: [
      ...approvedDocument('contract security schedule'),
      file('procurement_standard', 'Procurement standard requiring the schedule', null, { section: 'Supporting evidence' }),
      check('mandatory', 'The security schedule is mandatory in the procurement process'),
      nextReview(),
    ],
  },

  '4-1-3': {
    title: 'Outsourcing requirements including the in-Kingdom SOC rule',
    fields: [
      file('risk_assessment', 'Pre-contract risk assessment', null, { section: 'Outsourcing risk assessment' }),
      date('assessed_on', 'Risk assessment date', null, { notFuture: true }),
      date('signed_on', 'Contract signature date', null, { notFuture: true }),
      yesno('uses_mssp', 'Does the entity use a managed cybersecurity service?', null,
        { section: 'Managed service centres (4-1-3-2)' }),
      text('mssp_provider', 'Provider name', null, { showIf: usesMssp }),
      select('mssp_location', 'Location of the managed service centre', ['Inside the Kingdom', 'Outside the Kingdom'], null, { showIf: usesMssp }),
      text('mssp_city', 'City of the service centre', null, { showIf: usesMssp }),
      yesno('mssp_remote', 'Does it access the environment remotely?', null, { showIf: usesMssp }),
      date('mssp_attested_on', 'Provider attestation date', null, { showIf: usesMssp, notFuture: true }),
      file('mssp_attestation', 'Signed provider attestation of the service centre location', null, { showIf: usesMssp }),
      nextReview(),
    ],
    rules: [
      { test: a => !a.assessed_on || !a.signed_on || a.assessed_on < a.signed_on,
        message: 'The risk assessment must be dated before contract signature — run it before signing, not after.' },
      { test: a => !(a.uses_mssp === 'yes' && a.mssp_location === 'Outside the Kingdom' && a.mssp_remote === 'yes'),
        message: '4-1-3-2: a managed service centre with remote access must be located entirely inside the Kingdom. No contract language fixes this.' },
    ],
  },

  '4-2-1': {
    title: 'Cloud requirements documented and approved',
    fields: [
      ...approvedDocument('cloud security policy'),
      scope('The standard covers', [
        'Permitted service models', 'Approved providers',
        'Data classification limits per service', 'Shared responsibility interpretation',
      ]),
      file('provider_list', 'Approved cloud provider list', null, { section: 'Supporting evidence' }),
      nextReview(),
    ],
  },
}

/** The checklist for a main control id, or null when it is not a manual-evidence control. */
export function manualRequirementFor(id) {
  return MANUAL_REQUIREMENTS[id] || null
}
