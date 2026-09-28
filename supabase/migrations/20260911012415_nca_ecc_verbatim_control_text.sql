-- ═══════════════════════════════════════════════════════════════════════════
--  Restore NCA ECC-2:2024 control text verbatim from the published document.
--
--  The seeded text abridged the parent controls: each one had its subcontrols
--  inlined as "(1) ...; (2) ...", and some of those inlined items carried the
--  superseded ECC-1:2018 wording (e.g. 2-2-3 item 2 read "Multi-factor
--  authentication for remote access and privileged accounts", which ECC-2
--  replaced with the risk-based formulation). A parent control in the source
--  document is only the lead-in sentence; the numbered items are the
--  subcontrol rows, which were already verbatim.
--
--  Originals are preserved in control_text_seeded in case anything downstream
--  matched on the old strings.
-- ═══════════════════════════════════════════════════════════════════════════

alter table nca_ecc add column if not exists control_text_seeded text;

update nca_ecc set control_text_seeded = control_text where control_text_seeded is null;

-- ── Parent controls: lead-in sentence only, exactly as published ───────────
update nca_ecc set control_text = v.txt from (values
 ('1-5-3',  'The cybersecurity risk assessment procedures shall be implemented at least in the following cases:'),
 ('1-6-2',  'The cybersecurity requirements for project management and information and technology asset changes within the entity shall include the following as a minimum:'),
 ('1-6-3',  'The cybersecurity requirements for software and application development projects within the entity shall include the following as a minimum:'),
 ('1-9-3',  'Cybersecurity requirements prior to the commencement of the employment relationship between personnel and the entity shall include the following as a minimum:'),
 ('1-9-4',  'Cybersecurity requirements for personnel during their employment relationship with the entity shall include the following as a minimum:'),
 ('1-10-3', 'The cybersecurity awareness program shall include how to protect the entity against the most important and latest cyber risks and threats, including:'),
 ('1-10-4', 'Specialized skills and necessary training shall be provided to personnel in positions that are linked directly to cybersecurity within the entity. Such skills and training shall be classified in line with their cybersecurity responsibilities, including:'),
 ('2-2-3',  'Cybersecurity requirements for identity and access management of the entity shall include the following as a minimum:'),
 ('2-3-3',  'Cybersecurity requirements for protection of information systems and processing facilities of the entity shall include the following as a minimum:'),
 ('2-4-3',  'Cybersecurity requirements for protection of the email service of the entity shall include the following as a minimum:'),
 ('2-5-3',  'Cybersecurity requirements for the entity''s network security management shall include the following as a minimum:'),
 ('2-6-3',  'Cybersecurity requirements for mobile devices and BYOD security of the entity shall include the following as a minimum:'),
 ('2-8-3',  'Cybersecurity requirements for cryptography shall include at least the requirements in the National Cryptographic Standards, published by NCA. The appropriate cryptographic standard level shall be implemented based on the nature and sensitivity of the data, systems, and networks to be protected as well as the entity''s risk assessment, and as per the relevant legislative and regulatory requirements, as follows:'),
 ('2-9-3',  'Cybersecurity requirements for backup and recovery management shall include the following as a minimum:'),
 ('2-10-3', 'Cybersecurity requirements for technical vulnerabilities management shall include the following as a minimum:'),
 ('2-11-3', 'Cybersecurity requirements for penetration testing shall include the following as a minimum:'),
 ('2-12-3', 'Cybersecurity requirements for cybersecurity event logs and monitoring management shall include the following as a minimum:'),
 ('2-13-3', 'Requirements for cybersecurity incident and threat management shall include the following as a minimum:'),
 ('2-14-3', 'Cybersecurity requirements for protection of information and technology assets of the entity against unauthorized physical access, loss, theft, and damage shall include the following as a minimum:'),
 ('2-15-3', 'Cybersecurity requirements for protection of external web applications of the entity shall include the following as a minimum:'),
 ('3-1-3',  'Cybersecurity requirements for business continuity management within the entity shall include the following as a minimum:'),
 ('4-1-2',  'Cybersecurity requirements for contracts and agreements with third parties, e.g. Service Level Agreement (SLA), which, if impaired, may affect the entity''s data or services shall include the following as a minimum:'),
 ('4-1-3',  'Cybersecurity requirements for contracts and agreements with third parties providing IT or cybersecurity outsourcing or managed services shall include the following as a minimum:'),
 ('4-2-3',  'In accordance with the relevant legislative and regulatory requirements, and in addition to the applicable controls in the Main Domains (1), (2), and (3) and Subdomain (4.1) that are necessary to protect the entity''s data or services provided thereto, cybersecurity requirements for use of cloud computing and hosting services shall include the following as a minimum:')
) as v(cid, txt)
where nca_ecc.control_id = v.cid and nca_ecc.control_type = 'Main Control';

-- ── Other departures from the published text ──────────────────────────────
update nca_ecc set control_text =
 'The cybersecurity strategy of the entity shall be identified, documented, and approved, and it shall be supported by the head of the entity or his/her delegate (Hereinafter referred to as the "Authorized Official"). The strategy goals shall be in line with the relevant legislative and regulatory requirements.'
where control_id = '1-1-1';

update nca_ecc set control_text =
 'Cybersecurity requirements for protection of information and technology assets of the entity against unauthorized physical access, loss, theft, and damage shall be periodically reviewed.'
where control_id = '2-14-4';

update nca_ecc set control_text =
 'Retention period of cybersecurity event logs (shall be at least 12 months).'
where control_id = '2-12-3-5';
;
