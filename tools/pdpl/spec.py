# RISYS — SDAIA PDPL as an implemented framework: the authored part.
#
# The regulatory text comes from the published documents (parse.py). What is
# here is RISYS's reading of it: thematic domains, which articles impose an
# obligation on a Controller, when a conditional article applies, the Law
# article(s) each Regulation article implements, the evidence an assessor will
# ask for, what RISYS measures, and the review cycle.

DOMAINS = {
    '1': ('Governance and accountability', 'الحوكمة والمساءلة',
          'The organisation-wide arrangements the Law expects: a privacy policy, the people responsible, a written record of processing, registration and the confidentiality of everyone who handles personal data.'),
    '2': ('Lawful processing and consent', 'المعالجة النظامية والموافقة',
          'Personal data is processed only on a lawful basis, for a stated purpose, and no more than the purpose needs.'),
    '3': ('Data subject rights', 'حقوق صاحب البيانات',
          'Individuals are informed, can see, copy, correct and destroy their data, and get an answer within 30 days.'),
    '4': ('Disclosure and processors', 'الإفصاح ومعالجو البيانات',
          'Personal data reaches other parties only within the Law, and processors work under a written agreement and instructions.'),
    '5': ('Security, breaches and impact assessment', 'الأمن والتسرب وتقييم الأثر',
          'Personal data is protected, breaches are reported to SDAIA within 72 hours, and high-risk processing is assessed before it starts.'),
    '6': ('Special categories and purposes', 'الفئات والأغراض الخاصة',
          'Additional rules for health and credit data, advertising, direct marketing and research.'),
    '7': ('Transfers outside the Kingdom', 'النقل خارج المملكة',
          'Personal data leaves the Kingdom only for a permitted purpose, under an adequacy decision or appropriate safeguards, after a risk assessment.'),
    '8': ('Definitions, scope and the regulator', 'التعريفات والنطاق والجهة المختصة',
          'Reference only: definitions, scope, and the duties of the Competent Authority. Not scored.'),
    '9': ('The Law — reference text', 'النظام — النص المرجعي',
          'The Personal Data Protection Law. Its obligations are scored through the Implementing Regulation and Transfer Regulation articles that implement them. Not scored.'),
}

LAW_TITLES = {
    1: 'Definitions', 2: 'Scope of application', 3: 'More protective provisions prevail', 4: 'Rights of the Data Subject',
    5: 'Consent', 6: 'Processing without consent', 7: 'Consent is not a condition of a service', 8: 'Choosing processors',
    9: 'Restricting the right of access', 10: 'Collection and purpose of processing', 11: 'Purpose and minimum necessary',
    12: 'Privacy policy', 13: 'Informing the Data Subject at collection', 14: 'Accuracy before processing',
    15: 'Disclosure of personal data', 16: 'When disclosure is not allowed', 17: 'Correction of personal data',
    18: 'Destruction and retention', 19: 'Protection of personal data', 20: 'Personal data breach notification',
    21: 'Responding to Data Subject requests', 22: 'Impact assessment', 23: 'Health data', 24: 'Credit data',
    25: 'Advertising and awareness messages', 26: 'Marketing', 27: 'Scientific, research and statistical purposes',
    28: 'Copying official documents', 29: 'Transfer outside the Kingdom', 30: 'Supervision by the Competent Authority',
    31: 'Records of processing activities', 32: 'Repealed', 33: 'Licensing and accreditation', 34: 'Complaints',
    35: 'Penalty for disclosing sensitive data', 36: 'Other violations', 37: 'Inspection', 38: 'Confiscation and publication',
    39: 'Discipline in Public Entities', 40: 'Compensation', 41: 'Confidentiality', 42: 'Issuing the Regulations',
    43: 'Entry into force',
}

TITLE_FIX = {
    ('IR', 28): ('Processing Data for Advertising or Awareness Purposes', 'Purposes'),
    ('IR', 31): ('Photographing or Copying Official Documents that Reveal the Identity of Data Subjects',
                 'that Reveal the Identity of Data Subjects'),
    ('TR', 6): ('Cases where Appropriate Safeguards for Transfer outside the Kingdom are not Required',
                'of Personal Data outside the Kingdom are not required'),
    ('TR', 8): ('Risk Assessment of Transferring or Disclosing Personal Data outside the Kingdom',
                'Personal Data outside the Kingdom'),
}

# Profile conditions (organizations.pdpl_profile). A requirement with a
# condition is not applicable — shown, never scored — when it does not hold.
CONDITIONS = {
    'public_entity':       'The workspace is a Public Entity',
    'legitimate_interest': 'A private Controller relying on legitimate interest',
    'dpo_required':        'A data protection officer is required (IR Art. 32)',
    'health':              'Health data is processed',
    'credit':              'Credit data is processed',
    'advertising':         'Advertising or awareness messages are sent',
    'marketing':           'Personal data is used for direct marketing',
    'research':            'Data is processed for research or statistics without consent',
    'minors':              'Data of people who lack legal capacity is processed',
    'transfers':           'Personal data is transferred or disclosed outside the Kingdom',
}

# Main requirements (scored). part-no → domain, automation class, condition,
# Law articles implemented, and what goes on record per paragraph.
#   'skip'  paragraphs that are not an obligation on the Controller (no evidence section)
#   'dlv'   per paragraph: what an assessor will ask to see
M = 'manual_evidence'; S = 'semi_automated'; A = 'automated'

REQ = {
    # ── 1 Governance ───────────────────────────────────────────────────────
    ('L', 12): dict(d='1', cls=M, law=[12], review=12, dlv={0: [
        'An approved privacy policy covering the purpose of collection, the data collected, the means of collection, processing, storage and destruction, and how Data Subjects exercise their rights',
        'Evidence the policy is published or provided to Data Subjects before their data is collected (website link, app screen, notice at the point of collection)',
        'Version history and the date of the last review']}),
    ('L', 41): dict(d='1', cls=M, law=[41], dlv={0: [
        'Confidentiality clauses in employment and contractor agreements that survive the end of the relationship',
        'Signed confidentiality or acceptable-use acknowledgements for staff with access to personal data',
        'Offboarding checklist that reminds leavers of the continuing obligation']}),
    ('IR', 32): dict(d='1', cls=A, when='dpo_required', law=[30], skip=[2, 4], dlv={
        1: ['Appointment letter or decision naming the data protection officer(s)', 'The basis on which a DPO is required (public entity at scale, large-scale monitoring, or sensitive data as a core activity)'],
        3: ['DPO responsibilities documented: monitoring compliance, overseeing procedures, receiving requests and complaints, liaising with SDAIA', 'Evidence the DPO reports on compliance (a periodic report or minutes)']}),
    ('IR', 33): dict(d='1', cls=A, law=[31], skip=[6], review=12, dlv={
        1: ['Records of processing activities kept for the period of processing plus five years after it ends'],
        2: ['The record is written (the RISYS Records of processing register, or an export of it)'],
        3: ['Evidence the record is reviewed and kept current (review dates on each activity)'],
        4: ['A named route for giving SDAIA access to the record on request'],
        5: ['Each activity records: controller and DPO contact, purpose, data and subject categories, retention, recipients, transfers outside the Kingdom with their basis, and security measures']}),
    ('IR', 34): dict(d='1', cls=M, law=[30], dlv={0: [
        'Registration confirmation from the SDAIA National Register of Controllers, or',
        'A documented determination, against the rules SDAIA issued, that registration is not required']}),

    # ── 2 Lawful processing and consent ────────────────────────────────────
    ('IR', 11): dict(d='2', cls=M, law=[5, 6, 7], dlv={
        1: ['Consent wording and the means of collecting it (form, screen or script)', 'Records that prove consent was obtained for each Data Subject where consent is the basis', 'Evidence consent is specific, informed and not a condition of an unrelated service'],
        2: ['Explicit consent captured for sensitive data, credit data and solely automated decisions']}),
    ('IR', 12): dict(d='2', cls=M, law=[5], skip=[5], dlv={
        1: ['A withdrawal route available through the same channels used for requests'],
        2: ['A documented consent-withdrawal procedure in place before consent is requested'],
        3: ['Evidence processing stops without undue delay after withdrawal (log or ticket)'],
        4: ['Notification to parties the data was disclosed to, asking them to destroy it']}),
    ('IR', 13): dict(d='2', cls=M, when='minors', law=[5], dlv={
        1: ['Procedure for acting through a legal guardian in the Data Subject\'s best interest'],
        2: ['Guardian consent records with proof of guardianship'],
        3: ['Evidence the processing does not harm the Data Subject\'s interests']}),
    ('IR', 14): dict(d='2', cls=M, law=[6], dlv={0: [
        'Where processing relies on the Data Subject\'s actual interest: the evidence that the interest exists and that contacting the Data Subject was difficult']}),
    ('IR', 15): dict(d='2', cls=M, law=[10], dlv={
        1: ['For data not collected from the Data Subject: the source, the basis for collecting it and how it is checked'],
        2: ['Evidence a publicly available source was lawful'],
        3: ['Anonymisation applied where the data is used under paragraph (6) of Law Article 10']}),
    ('IR', 16): dict(d='2', cls=S, when='legitimate_interest', law=[6], skip=[2], dlv={
        1: ['Each legitimate-interest activity: the purpose, why it is necessary, and why it does not override the Data Subject\'s rights'],
        3: ['A documented legitimate-interest assessment, completed before processing started'],
        4: ['Where the assessment found harm: the change made, or the decision not to process']}),
    ('IR', 18): dict(d='2', cls=M, law=[10], dlv={1: [
        'For every further purpose: the documented compatibility assessment, the new purpose in the record, and the notice given to Data Subjects']}),
    ('IR', 19): dict(d='2', cls=S, law=[11], dlv={
        1: ['Collection forms and data fields reviewed against the purpose — only necessary fields collected'],
        2: ['A retention period for each data category, and evidence data is not kept longer']}),
    ('IR', 9): dict(d='2', cls=M, law=[18], skip=[2], dlv={1: [
        'Anonymisation method documented, with an assessment that re-identification is impossible', 'Periodic re-assessment of anonymised data sets against new techniques']}),
    ('IR', 31): dict(d='2', cls=M, law=[28], dlv={0: [
        'A rule (policy or procedure) prohibiting the copying or photographing of identity documents unless a law requires it or a competent authority requests it',
        'Where copies are kept: the legal basis and the protection applied']}),

    # ── 3 Data subject rights ──────────────────────────────────────────────
    ('IR', 3): dict(d='3', cls=S, law=[4, 21], skip=[3], dlv={
        1: ['The Data Subject request procedure: 30-day response, one extension of 30 days with advance notice and reasons', 'Identity verification before acting on a request', 'A log of every request, including oral ones (the RISYS Data subject requests register)'],
        2: ['Each refusal recorded with its reason and the notice sent to the requester']}),
    ('IR', 4): dict(d='3', cls=M, law=[13, 4], skip=[2, 4], dlv={
        1: ['Notice at collection covering: legal basis and purpose, identity and contact of the Controller (and DPO), recipients, transfers, consequences of not providing data, rights and retention'],
        3: ['Notice to Data Subjects within 30 days where data was collected from someone else'],
        5: ['Where processing is large-scale, monitors individuals, uses new technology or makes automated decisions: the additional notice'],
        6: ['Notice given before data is processed for a new purpose'],
        7: ['Notice in appropriate language for people who lack legal capacity']}),
    ('IR', 5): dict(d='3', cls=M, law=[4, 9], dlv={
        1: ['Procedure for giving access, including any time frames set under Law Article 9'],
        2: ['A check that access does not reveal another individual\'s data']}),
    ('IR', 6): dict(d='3', cls=M, law=[4], dlv={
        1: ['A check that a copy does not breach others\' rights (intellectual property, trade secrets)'],
        2: ['Copies provided in a common electronic format, or printed on request'],
        3: ['Redaction of other individuals\' data before the copy is released']}),
    ('IR', 7): dict(d='3', cls=M, law=[4, 17], dlv={
        1: ['Processing restricted while the accuracy of data is contested'],
        2: ['Supporting documents destroyed once the correction is verified'],
        3: ['Parties the data was disclosed to notified of the correction']}),
    ('IR', 8): dict(d='3', cls=M, law=[4, 18], skip=[3], review=12, dlv={
        1: ['Destruction triggers documented: on request, when no longer needed, on consent withdrawal, when processing is unlawful'],
        2: ['Destruction records, including notification to recipients and destruction of copies and backups']}),
    ('IR', 10): dict(d='3', cls=M, law=[21], dlv={0: [
        'At least one published channel for requests (email, SMS, national address, app or another channel), and the Data Subject\'s choice of channel respected']}),
    ('IR', 22): dict(d='3', cls=M, law=[14, 17], dlv={
        2: ['Corrections checked against supporting documents and logged'],
        3: ['Processing suspended where inaccurate data may harm the Data Subject'],
        4: ['Corrections made without undue delay once inaccuracy is known'],
        5: ['Data-quality controls: periodic accuracy checks, validation at entry, and a procedure for handling inaccurate data']}),

    # ── 4 Disclosure and processors ────────────────────────────────────────
    ('IR', 17): dict(d='4', cls=M, law=[8], skip=[4], review=12, dlv={
        1: ['Data processing agreements with every processor covering purpose, data categories, duration, breach notification, foreign-law exposure, mandatory disclosure and sub-processors'],
        2: ['Written processing instructions issued to each processor'],
        3: ['Periodic assessment of each processor\'s compliance (questionnaire, audit report or certification)'],
        5: ['Sub-processor terms flowed down, with the Controller\'s approval']}),
    ('IR', 20): dict(d='4', cls=S, law=[15, 16], skip=[5], dlv={
        1: ['For data from public sources: a check the original publication was lawful'],
        2: ['A disclosure procedure: purpose, minimum data, and the Law Article 16 checks'],
        3: ['Disclosures to public authorities recorded with the request and its legal basis'],
        4: ['Care taken when disclosing data about someone other than the Data Subject'],
        6: ['Disclosures recorded in the record of processing: dates, methods and purposes']}),
    ('IR', 21): dict(d='4', cls=M, when='public_entity', law=[10, 15], dlv={
        1: ['The public interest for each such processing, documented'],
        2: ['The mandate in law the public interest relates to'],
        3: ['Administrative and technical controls limiting harm, including staff confidentiality'],
        4: ['The processing recorded in the record of processing'],
        5: ['Only the minimum necessary data collected']}),

    # ── 5 Security, breaches, impact assessment ────────────────────────────
    ('IR', 23): dict(d='5', cls=S, law=[19], dlv={
        1: ['Technical and organisational measures that limit breach risk to personal data: access control, MFA, encryption, logging, data loss prevention'],
        2: ['Compliance with NCA controls (ECC, and CCC for cloud) or recognised standards where NCA controls do not apply']}),
    ('IR', 24): dict(d='5', cls=A, law=[20], skip=[4], dlv={
        1: ['A breach procedure that notifies SDAIA within 72 hours of becoming aware, with the required content'],
        2: ['Where information came later: the follow-up notification and the reason for the delay'],
        3: ['Copies of every report sent to SDAIA and the corrective measures taken'],
        5: ['Notice to affected Data Subjects without undue delay, in simple language, with advice to limit harm']}),
    ('IR', 25): dict(d='5', cls=A, law=[22], review=12, dlv={
        1: ['A written impact assessment for every activity that meets an IR Article 25 trigger'],
        2: ['Each assessment covers purpose and basis, nature and scope, necessity, risks to Data Subjects and the measures to address them'],
        3: ['A copy shared with every processor acting on the activity'],
        4: ['Where harm was found: the measures taken and a reassessment']}),

    # ── 6 Special categories and purposes ──────────────────────────────────
    ('IR', 26): dict(d='6', cls=M, when='health', law=[23], dlv={
        1: ['The sector requirements adopted (Ministry of Health, Saudi Health Council, SAMA, Council of Health Insurance)'],
        2: ['Internal policies that include the PDPL provisions'],
        3: ['Role separation and graded access to health data'],
        4: ['Each stage of health-data processing documented, with the person in charge'],
        5: ['Processor agreements for health data that bind the processor to the same measures'],
        6: ['Processing limited to what healthcare or insurance requires']}),
    ('IR', 27): dict(d='6', cls=M, when='credit', law=[24], dlv={
        1: ['SAMA and Credit Information Law requirements adopted, with roles defined'],
        2: ['Consent and notification records for every disclosure of credit data']}),
    ('IR', 28): dict(d='6', cls=M, when='advertising', law=[25], dlv={
        1: ['Consent obtained before sending advertising or awareness material where there was no prior interaction'],
        2: ['Consent obtained freely, with a clear opt-out in every message'],
        3: ['The sender identified, and telecommunications rules followed']}),
    ('IR', 29): dict(d='6', cls=M, when='marketing', law=[26], dlv={
        1: ['Direct-marketing consent captured, with a simple way to withdraw it'],
        2: ['The sending entity clearly identified in every marketing message'],
        3: ['Opt-outs honoured without undue delay (suppression list)']}),
    ('IR', 30): dict(d='6', cls=M, when='research', law=[27], dlv={
        1: ['The research or statistical purpose stated in the record of processing'],
        2: ['Only the minimum data collected'],
        3: ['Pseudonymisation applied where it does not defeat the purpose'],
        4: ['An assessment showing no negative impact on Data Subjects']}),

    # ── 7 Transfers ────────────────────────────────────────────────────────
    ('TR', 2): dict(d='7', cls=M, when='transfers', law=[29], dlv={
        1: ['Each transfer checked for any effect on national security or the Kingdom\'s vital interests'],
        2: ['Transfers limited to the minimum data necessary'],
        3: ['Evidence the transfer does not reduce the level of protection for Data Subjects'],
        4: ['The permitted purpose of each transfer (Law Article 29 or the Regulations)']}),
    ('TR', 5): dict(d='7', cls=S, when='transfers', law=[29], skip=[2, 3], dlv={1: [
        'For each transfer without an adequacy decision: the safeguard used — Binding Common Rules, SDAIA Standard Contractual Clauses, a certification, or a Binding Code of Conduct',
        'The signed safeguard documents']}),
    ('TR', 6): dict(d='7', cls=M, when='transfers', law=[29], dlv={0: [
        'Where a transfer relies on an exemption (contract with the Data Subject, national security, crime, vital interest): the documented case and why safeguards could not be used']}),
    ('TR', 7): dict(d='7', cls=M, when='transfers', law=[29], skip=[3], dlv={
        1: ['A procedure to stop a transfer immediately when it affects national security, the risk assessment shows high risk, or safeguards no longer apply'],
        2: ['Records of any transfer stopped and the reassessment that followed']}),
    ('TR', 8): dict(d='7', cls=S, when='transfers', law=[29], review=12, dlv={
        1: ['A transfer risk assessment for every transfer under TR Article 5 or 6, and for continuous or large-scale transfer of sensitive data'],
        2: ['Each assessment covers purpose and basis, nature and geography, safeguards, minimisation, impact, and mitigating measures']}),
}

# PDPL main requirement → NCA ECC controls it also serves (informational crosswalk).
ALSO_SERVES_ECC = {
    'L-12': ['1-3-1'], 'L-41': ['1-9-3', '1-9-4'], 'IR-32': ['1-4-1'], 'IR-33': ['1-7-1', '2-1-2'],
    'IR-17': ['4-1-2', '4-1-3'], 'IR-20': ['2-7-2'], 'IR-23': ['2-7-2', '1-7-1'], 'IR-24': ['2-13-2', '2-13-3'],
    'IR-25': ['1-5-2'], 'IR-9': ['2-7-2'], 'TR-2': ['4-2-3', '2-7-2'], 'TR-8': ['1-5-2', '4-2-3'],
}

# ECC requirement on a Microsoft finding → PDPL requirement it is also evidence for.
EVIDENCE_FROM_ECC = [
    ('2-2-3-2', 'IR-23', 'Sign-in without strong authentication exposes personal data'),
    ('2-2-3-1', 'IR-23', 'Authentication weaknesses that let unauthorised access to personal data through'),
    ('2-2-3-3', 'IR-23', 'Access beyond need-to-know to systems that hold personal data'),
    ('2-2-3-4', 'IR-23', 'Privileged access to systems that hold personal data'),
    ('2-2-3-5', 'IR-23', 'Accounts and access rights not reviewed'),
    ('2-2-2',   'IR-23', 'Session and access controls'),
    ('2-12-3-1', 'IR-23', 'Audit logging that would show a personal data breach'),
    ('2-7-2',   'IR-23', 'Data protection controls in Microsoft 365'),
    ('2-6-3-1', 'IR-23', 'Personal data on unmanaged devices'),
    ('2-4-2',   'IR-20', 'Mail forwarded to external recipients is an uncontrolled disclosure'),
    ('4-2-3-1', 'IR-17', 'The cloud provider is a processor of personal data'),
]

# Signals → PDPL requirement (paragraph level; rolls up to the article).
SIGNAL_MAP = [
    # RISYS privacy registers
    ('privacy.dsr_on_time', 'IR-3-1'),
    ('privacy.dsr_identity_verified', 'IR-3-1'),
    ('privacy.breach_notified_on_time', 'IR-24-1'),
    ('privacy.breach_records_kept', 'IR-24-3'),
    ('privacy.breach_subjects_notified', 'IR-24-5'),
    ('privacy.dpia_coverage', 'IR-25-1'),
    ('privacy.ropa_complete', 'IR-33-5'),
    ('privacy.ropa_current', 'IR-33-3'),
    ('privacy.dpo_appointed', 'IR-32-1'),
    ('privacy.legitimate_interest_assessed', 'IR-16-3'),
    ('privacy.retention_defined', 'IR-19-2'),
    ('privacy.transfer_safeguards', 'TR-5-1'),
    ('privacy.transfer_risk_assessed', 'TR-8-1'),
    # Microsoft connectors
    ('entra.mfa_enforcement', 'IR-23-1'),
    ('entra.mfa_registration', 'IR-23-1'),
    ('entra.legacy_auth_blocked', 'IR-23-1'),
    ('entra.least_privilege', 'IR-23-1'),
    ('defender.audit_logging', 'IR-23-1'),
    ('defender.data_protection_posture', 'IR-23-1'),
    ('sharepoint.unmanaged_sync_blocked', 'IR-23-1'),
    ('m365.external_forwarding', 'IR-20-2'),
    ('sharepoint.anyone_links_disabled', 'IR-20-2'),
    ('sharepoint.sharing_domain_restricted', 'IR-20-2'),
    ('sharepoint.guest_reshare_blocked', 'IR-20-2'),
    ('risys.ecc_assessment_active', 'IR-23-2'),
]

# name, description, unit, pass, partial, higher_is_better, source_note
PRIVACY_SIGNALS = {
    'privacy.dsr_on_time': ('Data Subject requests answered on time',
        'Requests closed within 30 days (or the notified extension) over the last 12 months; open requests past their due date count as late.',
        'ratio', 0.95, 0.80, True, 'Counted from Privacy → Data subject requests.'),
    'privacy.dsr_identity_verified': ('Requester identity verified',
        'Completed requests in the last 12 months where the requester\'s identity was verified before acting.',
        'ratio', 1, 0.90, True, 'Counted from Privacy → Data subject requests.'),
    'privacy.breach_notified_on_time': ('Breaches reported to SDAIA within 72 hours',
        'Notifiable personal data breaches in the last 24 months reported to SDAIA by their 72-hour deadline; unreported ones past the deadline count as late.',
        'ratio', 1, 0.50, True, 'Counted from Privacy → Personal data breaches.'),
    'privacy.breach_records_kept': ('Breach reports and corrective measures kept',
        'Closed breaches with corrective measures recorded and, where notifiable, a copy of the SDAIA report.',
        'ratio', 1, 0.50, True, 'Counted from Privacy → Personal data breaches.'),
    'privacy.breach_subjects_notified': ('Data Subjects told about breaches',
        'Notifiable breaches where affected Data Subjects were notified, or the reason they did not need to be is recorded.',
        'ratio', 1, 0.50, True, 'Counted from Privacy → Personal data breaches.'),
    'privacy.dpia_coverage': ('Impact assessments in place',
        'Active processing activities that meet an IR Article 25 trigger and have an approved impact assessment that is not past its reassessment date.',
        'ratio', 1, 0.70, True, 'Counted from Privacy → Records of processing and Impact assessments.'),
    'privacy.ropa_complete': ('Record of processing complete',
        'Active processing activities that record purpose, lawful basis, data and subject categories, recipients, retention, security measures and, for transfers, the countries and safeguard.',
        'ratio', 0.95, 0.70, True, 'Counted from Privacy → Records of processing.'),
    'privacy.ropa_current': ('Record of processing kept current',
        'Active processing activities reviewed by their next review date and updated in the last 12 months.',
        'ratio', 1, 0.80, True, 'Counted from Privacy → Records of processing.'),
    'privacy.dpo_appointed': ('Data protection officer appointed',
        'A data protection officer is named in Privacy settings, where the PDPL scope says one is required.',
        'boolean', 1, None, True, 'Read from Privacy → Settings and the PDPL scope.'),
    'privacy.legitimate_interest_assessed': ('Legitimate-interest processing assessed',
        'Active activities whose lawful basis is legitimate interest and that have an approved assessment.',
        'ratio', 1, 0.70, True, 'Counted from Privacy → Records of processing and Impact assessments.'),
    'privacy.retention_defined': ('Retention periods defined',
        'Active processing activities with a retention period recorded.',
        'ratio', 1, 0.80, True, 'Counted from Privacy → Records of processing.'),
    'privacy.transfer_safeguards': ('Transfers outside the Kingdom safeguarded',
        'Active activities that transfer personal data outside the Kingdom and record the destination and the safeguard.',
        'ratio', 1, 0.70, True, 'Counted from Privacy → Records of processing.'),
    'privacy.transfer_risk_assessed': ('Transfer risk assessed',
        'Active activities that transfer personal data outside the Kingdom and have an approved assessment.',
        'ratio', 1, 0.70, True, 'Counted from Privacy → Records of processing and Impact assessments.'),
}

PERIODIC = [  # requirement, title, months
    ('L-12', 'Privacy policy reviewed', 12),
    ('IR-33', 'Record of processing activities reviewed', 12),
    ('IR-17', 'Processors assessed for compliance', 12),
    ('IR-25', 'Impact assessments reviewed', 12),
    ('IR-8', 'Retention and destruction reviewed', 12),
    ('TR-8', 'Transfer risk assessments reviewed', 12),
]

# What RISYS reads, per main requirement, for the guidance panel.
RISYS_NOTES = {
    'IR-3':  ['Privacy → Data subject requests: due dates, extensions, identity checks, outcomes and refusals.'],
    'IR-16': ['Privacy → Records of processing: activities whose lawful basis is legitimate interest, and their assessments.'],
    'IR-19': ['Privacy → Records of processing: the retention period of each activity.'],
    'IR-20': ['Microsoft 365: mail forwarding to external addresses.', 'SharePoint and OneDrive: "Anyone" links, sharing domains and guest re-sharing.'],
    'IR-23': ['Microsoft Entra ID: MFA enforcement and registration, legacy authentication, least privilege.', 'Microsoft Defender: audit logging and data protection posture.', 'SharePoint: sync from unmanaged devices.', 'Findings keyed to the ECC access, logging and data protection controls are also evidence here.', 'Your NCA ECC assessment in RISYS (IR Art. 23(2)).'],
    'IR-24': ['Privacy → Personal data breaches: awareness time, the 72-hour SDAIA deadline, notification, notices to Data Subjects and corrective measures.'],
    'IR-25': ['Privacy → Records of processing and Impact assessments: which activities meet an Article 25 trigger and whether each has a current approved assessment.'],
    'IR-32': ['Privacy → Settings: the named data protection officer, against the PDPL scope.'],
    'IR-33': ['Privacy → Records of processing: completeness of each activity and its review date.'],
    'IR-17': ['Findings on the cloud provider\'s access to tenant data (ECC 4-2-3-1).'],
    'TR-5':  ['Privacy → Records of processing: destination countries and safeguard for each transfer.'],
    'TR-8':  ['Privacy → Impact assessments approved for activities that transfer data outside the Kingdom.'],
}
