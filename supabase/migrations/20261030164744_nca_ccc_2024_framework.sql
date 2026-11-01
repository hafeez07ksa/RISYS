-- ============================================================================
-- NCA Cloud Cybersecurity Controls (CCC-2:2024) as an active framework
--
-- Brings CCC into Compliance the same way as NCA ECC: requirement text,
-- per-workspace scope (tenant / provider, data level 1–4), connector findings
-- keyed to CCC requirements, automated signals, the review calendar and the
-- Ask RISYS lookups.
--
--  1. nca_ccc reloaded with CCC-2:2024 (175 controls; was CCC-1:2020, 177).
--     2-3-P-1-10/11 (in-Kingdom hosting) were deleted by NCA and moved to NDMO;
--     EDR is renumbered 2-3-P-1-12 → 2-3-P-1-10. Level applicability per row.
--  2. organizations.ccc_role / ccc_level, set by a workspace admin through
--     set_ccc_profile(); every change is written to audit_log.
--  3. ccc_scope(org): the CCC requirements in scope for a workspace and their
--     applicability at its level.
--  4. framework_requirements_v gains CCC, so automation and findings roll up
--     from subcontrol to main control as they do for ECC.
--  5. framework_crosswalk: CCC → ECC (extends / also serves) and ECC → CCC
--     (evidence). Findings a Microsoft cloud connector keys to ECC are also
--     keyed to the CCC tenant controls they evidence, in finding_control_refs.
--  6. Signal map rows for CCC tenant controls the Microsoft connectors measure.
--  7. Review calendar: CCC periodic controls, scoped by the workspace profile.
--  8. Ask RISYS tools: CCC lookups, and ECC figures no longer mix in CCC rows.
-- ============================================================================

-- ── 1. nca_ccc → CCC-2:2024 ─────────────────────────────────────────────────
alter table public.nca_ccc
  add column if not exists role                text,
  add column if not exists parent_control_id   varchar,
  add column if not exists ecc_refs            text[] not null default '{}',
  add column if not exists level_1             text,
  add column if not exists level_2             text,
  add column if not exists level_3             text,
  add column if not exists level_4             text,
  add column if not exists previous_control_id varchar,
  add column if not exists note                text,
  add column if not exists sort_order          integer;

-- Nothing references nca_ccc (checked 30 Oct 2026): no statuses, evidence,
-- mappings or finding keys exist for CCC yet, so the rows are replaced whole.
delete from public.nca_ccc;

-- Controls carry their subdomain; levels are four letters, Level 1→4:
-- m mandatory, o optional (recommended), n not applicable (Annex A).
with sub(subdomain_id, domain_id, domain_name, subdomain_name, subdomain_objective) as (values
  ('1-1','1','Cybersecurity Governance','Cybersecurity Roles and Responsibilities','To ensure that the roles and responsibilities are defined for all parties participating in implementing the cloud cybersecurity controls, including the roles and responsibilities of the head of the CSP and CST or his/her delegate, referred to in these controls as the “Authorizing Official.”'),
  ('1-2','1','Cybersecurity Governance','Cybersecurity Risk Management','To ensure managing cybersecurity risks in a methodological approach in order to protect the CSP’s and CST’s information and technology assets as per entity-related policies and procedures, and related laws and regulations.'),
  ('1-3','1','Cybersecurity Governance','Compliance with Cybersecurity Standards, Laws, and Regulations','To ensure that the CSPs’ and CSTs’ cybersecurity program is in compliance with related laws and regulations.'),
  ('1-4','1','Cybersecurity Governance','Cybersecurity in Human Resources','To ensure that cybersecurity risks and requirements related to personnel (employees and contractors) are managed efficiently prior to employment, during employment and after termination/separation as per entity-related policies and procedures, and related laws and regulations.'),
  ('1-5','1','Cybersecurity Governance','Cybersecurity in Change Management','To ensure that cybersecurity requirements are included in change management methodology and procedures in order to protect the confidentiality, integrity and availability of information and technology assets as per CSPs policies and procedures, and related laws and regulations.'),
  ('2-1','2','Cybersecurity Defense','Asset Management','To ensure that the CSP and CST has an accurate and detailed inventory of information and technology assets in order to support the entity cybersecurity and operational requirements to maintain the confidentiality, integrity and availability of information and technology assets.'),
  ('2-2','2','Cybersecurity Defense','Identity and Access Management','To ensure the secure and restricted logical access to information and technology assets in order to prevent unauthorized access and allow only authorized access for users which are necessary to accomplish assigned tasks.'),
  ('2-3','2','Cybersecurity Defense','Information System and Information Processing Facilities Protection','To ensure the protection of information systems and information processing facilities (including workstations and infrastructures) against cyber risks.'),
  ('2-4','2','Cybersecurity Defense','Networks Security Management','To ensure the protection of CSP’s and CST’s network from cyber risks.'),
  ('2-5','2','Cybersecurity Defense','Mobile Devices Security','To ensure the protection of mobile devices (including laptops, smartphones, and tablets) from cyber risks and to ensure the secure handling of the CSPs’ and CSTs’ information (including sensitive information) while utilizing mobile devices.'),
  ('2-6','2','Cybersecurity Defense','Data and Information Protection','To ensure the confidentiality, integrity and availability of CSPs’ and CSTs’ data and information as per entity-related policies and procedures, and related laws and regulations.'),
  ('2-7','2','Cybersecurity Defense','Cryptography','To ensure the proper and efficient use of cryptography to protect information assets as per policies, procedures, and related laws and regulations.'),
  ('2-8','2','Cybersecurity Defense','Backup and Recovery Management','To ensure the protection of CSPs’ data and information including information systems and software configurations from cyber risks as per entity-related policies and procedures, and related laws and regulations.'),
  ('2-9','2','Cybersecurity Defense','Vulnerabilities Management','To ensure timely detection and effective remediation of technical vulnerabilities to prevent or minimize the probability of exploiting these vulnerabilities to launch cyber attacks against the CSP and CST.'),
  ('2-10','2','Cybersecurity Defense','Penetration Testing','To assess and evaluate the efficiency of the CSP’s cybersecurity defense capabilities through simulated cyber-attacks to discover unknown weaknesses within the technical infrastructure that may lead to a cyber breach.'),
  ('2-11','2','Cybersecurity Defense','Cybersecurity Event Logs and Monitoring Management','Ensure timely collection, analysis, and monitoring of cybersecurity event logs for the proactive detection and effective management of cyber-attacks to prevent or minimize the impact on the CSPs’ and CSTs’ business.'),
  ('2-12','2','Cybersecurity Defense','Cybersecurity Incident and Threat Management','Ensure timely identification and detection of cybersecurity incidents and their effective management and proactive response to cybersecurity threats to prevent or minimize the impact of the impacts resulting on the business of the CSPs.'),
  ('2-13','2','Cybersecurity Defense','Physical Security','To ensure the protection of CSPs’ information and technology assets from unauthorized physical access, loss, theft, and damage.'),
  ('2-14','2','Cybersecurity Defense','Web Application Security','Ensure the protection of external web applications of the CSP from cyber risks.'),
  ('2-15','2','Cybersecurity Defense','Key Management','Ensure secure management of CSPs’ and CSTs’ cryptographic keys to protect confidentiality, integrity and availability of information and technical assets.'),
  ('2-16','2','Cybersecurity Defense','System Development Security','Ensure CSPs’ systems are developed, integrated, and deployed in a secure manner.'),
  ('2-17','2','Cybersecurity Defense','Storage Media Security','Ensure CSPs’ secure handling of information and data on physical media.'),
  ('3-1','3','Cybersecurity Resilience','Cybersecurity Resilience Aspects of Business Continuity Management (BCM)','To ensure the inclusion of the cybersecurity resiliency requirements within the CSPs’ and CSTs’ business continuity management and to remediate and minimize the impacts on systems, information processing facilities and critical e-services from disasters caused by cybersecurity incidents.'),
  ('4-1','4','Third-Party Cybersecurity','Supply Chain and Third-Party Cybersecurity','To ensure the protection of assets against the cybersecurity risks related to thirdparties including outsourcing and managed services as per policies and procedures, and related laws and regulations.')
), ctl(control_id, kind, control_text, ecc, lv, previous_control_id, note, sort_order) as (values
  ('1-1-P-1','M','In addition to the ECC control 1-4-1, the Authorizing Official shall also identify, document, and approve:','1-4-1','mmmm',null,null,1),
  ('1-1-P-1-1','S','Cybersecurity roles and RACI assignment for all stakeholders of the cloud services including the Authorizing Official''s roles and responsibilities.','','mmmm',null,null,2),
  ('1-1-T-1','M','In addition to the ECC control 1-4-1, the Authorizing Official shall also identify, document, and approve:','1-4-1','mmmm',null,null,3),
  ('1-1-T-1-1','S','Cybersecurity roles and RACI assignment for all stakeholders of the cloud services including the Authorizing Official''s roles and responsibilities.','','mmmm',null,null,4),
  ('1-2-P-1','M','Cybersecurity risk management methodology mentioned in the ECC Subdomain 1-5, shall also include for the CSP, as a minimum:','1-5-1','mmmm',null,null,5),
  ('1-2-P-1-1','S','Defining acceptable risk levels for the cloud services and clarifying them to the CST if they are related to the CST.','','mmmm',null,null,6),
  ('1-2-P-1-2','S','Considering data and information classification in cybersecurity risk management methodology.','','mmmm',null,null,7),
  ('1-2-P-1-3','S','Developing cybersecurity risk register for cloud services and monitoring it periodically according to the risks.','','mmmm',null,null,8),
  ('1-2-T-1','M','Cybersecurity risk management methodology mentioned in the ECC Subdomain 1-5 shall also include for the CST, as a minimum:','1-5-1','mmmm',null,null,9),
  ('1-2-T-1-1','S','Defining acceptable risk levels for the cloud services.','','mmmm',null,null,10),
  ('1-2-T-1-2','S','Considering data and information classification accredited by CST in cybersecurity risk management methodology.','','mmmm',null,null,11),
  ('1-2-T-1-3','S','Developing cybersecurity risk register for cloud services and monitoring it periodically according to the risks.','','mmmm',null,null,12),
  ('1-3-P-1','M','In addition to the ECC control 1-7-1, the CSP legislative and regulatory compliance should include as a minimum with the following requirements:','1-7-1','mmmo',null,null,13),
  ('1-3-P-1-1','S','Continuous compliance with all laws, regulations, instructions, decisions, regulatory frameworks and controls, and mandates regarding cybersecurity in the Kingdom','','mmmo',null,null,14),
  ('1-3-T-1','M','In addition to the ECC control 1-7-1, the CST legislative and regulatory compliance should include as a minimum with the following requirements:','1-7-1','mmmm',null,null,15),
  ('1-3-T-1-1','S','Continuous or real-time compliance monitoring of the CSP with relevant cybersecurity legislation and contract clauses.','','mmmm',null,null,16),
  ('1-4-P-1','M','In addition to Subcontrols in the ECC controls 1-9-3 and 1-9-4, the following requirements should be covered prior and during the professional relationship of personnel with the CSP as a minimum:','1-9-3,1-9-4','mmmo',null,null,17),
  ('1-4-P-1-1','S','Positions of cybersecurity functions in CSP’s data centers within the Kingdom must be filled with qualified and suitable Saudi nationals.','','mmmo',null,null,18),
  ('1-4-P-1-2','S','Screening or vetting candidates of personnel working inside the Kingdom who have access to Cloud Technology Stack, periodically.','','mmmo',null,null,19),
  ('1-4-P-1-3','S','Cybersecurity policies as a prerequisite to access to Cloud Technology Stack, signed and appropriately approved.','','mmmo',null,null,20),
  ('1-4-P-2','M','In addition to Subcontrols in the ECC control 1-9-5, the following requirements should be in place, as a minimum, for the termination/completion of a human resource’s professional relationship with the CSP:','1-9-5','mmmo',null,null,21),
  ('1-4-P-2-1','S','Assurance that assets owned by the entity (especially those with security exposure) are accounted for and returned upon termination.','','mmmo',null,null,22),
  ('1-4-T-1','M','In addition to Subcontrols in the ECC control 1-9-3, the following requirements should be covered prior the professional relationship of staff with the CST shall cover, at a minimum:','1-9-3','mmmo',null,null,23),
  ('1-4-T-1-1','S','Screening or vetting candidates of personnel with access to Cloud Service sensitive functions (Key Management, Service Administration, Access Control).','','mmmo',null,null,24),
  ('1-5-P-1','M','Cybersecurity requirements for change management within the CSP shall be identified, documented, and approved.','','mmmm',null,null,25),
  ('1-5-P-2','M','Cybersecurity requirements for change management within the CSP shall be applied','','mmmm',null,null,26),
  ('1-5-P-3','M','Cybersecurity for change management in the CSP shall cover, as a minimum:','1-6-2','mmmm',null,null,27),
  ('1-5-P-3-1','S','Processes and procedures to securely implement changes (planned works) in production systems, with priority given to cybersecurity observations.','','mmmm',null,null,28),
  ('1-5-P-3-2','S','Process for the implementation of cybersecurity exceptional changes (e.g.: changes during incident restoration).','','mmmm',null,null,29),
  ('1-5-P-4','M','Cybersecurity requirements for change management within the CSP shall be applied and reviewed periodically.','','mmmm',null,null,30),
  ('2-1-P-1','M','In addition to controls in the ECC control 2-1, the CSP shall cover the following additional controls for cybersecurity requirements for cybersecurity event logs and monitoring management, as a minimum:','2-1-2','mmmm',null,null,31),
  ('2-1-P-1-1','S','Inventory of all information and technology assets using suitable techniques such as Configuration Management Database (CMDB) or similar capability containing an inventory of all technical assets.','','mmmm',null,null,32),
  ('2-1-P-1-2','S','Identifying assets owners and involving them in the asset management lifecycle.','','mmmm',null,null,33),
  ('2-1-T-1','M','In addition to controls in the ECC control 2-1, the CST shall cover the following additional controls for cybersecurity requirements for cybersecurity event logs and monitoring management, as a minimum:','2-1-2','mmmm',null,null,34),
  ('2-1-T-1-1','S','Inventory of all cloud services and information and technology assets related to the cloud services.','','mmmm',null,null,35),
  ('2-2-P-1','M','In addition to Subcontrols in the ECC control 2-2-3, the CSP shall cover the following additional Subcontrols for cybersecurity requirements for identity and access management requirements, as a minimum:','2-2-3','mmmm',null,null,36),
  ('2-2-P-1-1','S','Identity and access management of generic accounts credentials for accountability cannot be assigned for a specific individual.','','mmmm',null,null,37),
  ('2-2-P-1-2','S','Secure session management, including session authenticity, session lockout, and session timeout termination.','','mmmm',null,null,38),
  ('2-2-P-1-3','S','Multi-factor authentication for privileged users, and candidates of personnel with access to Cloud Technology Stack.','','mmmm',null,null,39),
  ('2-2-P-1-4','S','Formal process to detect and prevent unauthorized access (e.g., unsuccessful login attempt threshold).','','mmmm',null,null,40),
  ('2-2-P-1-5','S','Utilizing secure methods and algorithms for saving and processing passwords, such as: Secure Hashing functions.','','mmmm',null,null,41),
  ('2-2-P-1-6','S','Secure management of thirdparty personnel’s accounts.','','mmmm',null,null,42),
  ('2-2-P-1-7','S','Access control enforced to management systems, administrative consoles.','','mmmm',null,null,43),
  ('2-2-P-1-8','S','Masking of displayed authentication inputs, especially passwords, to prevent shoulder surfing.','','mmmm',null,null,44),
  ('2-2-P-1-9','S','Getting CST’s approval before accessing any CST-related asset by the CSP or CSP’s third parties.','','mmmo',null,null,45),
  ('2-2-P-1-10','S','Capability to immediately interrupt a remote access session and prevent any future access for a user.','','mmmo',null,null,46),
  ('2-2-P-1-11','S','Provision to CSTs of multi-factor authentication services for privileged cloud users.','','mmmm',null,null,47),
  ('2-2-P-1-12','S','Assurance of restricted and controlled access to storage systems and means (such as Storage Area Network (SAN)).','','mmmm',null,null,48),
  ('2-2-T-1','M','In addition to Subcontrols in the ECC control 2-2-3, the CST shall cover the following additional Subcontrols for cybersecurity requirements for identity and access management requirements, as a minimum:','2-2-3','mmmm',null,null,49),
  ('2-2-T-1-1','S','Identity and access management for all cloud credentials along their full lifecycle.','','mmmm',null,null,50),
  ('2-2-T-1-2','S','Confidentiality of cloud user identification, cloud credential and cloud access rights information, including the requirement on users to keep them private (for employed, third party and CST personnel).','','mmmm',null,null,51),
  ('2-2-T-1-3','S','Secure session management, including session authenticity, session lockout, and session timeout termination on the cloud.','','mmmm',null,null,52),
  ('2-2-T-1-4','S','Multi-factor authentication for privileged cloud users.','','mmmm',null,null,53),
  ('2-2-T-1-5','S','Formal process to detect and prevent unauthorized access to cloud (such as a threshold of unsuccessful login attempts).','','mmmm',null,null,54),
  ('2-3-P-1','M','In addition to Subcontrols in the ECC control 2-3-3, the CSP shall cover the following additional Subcontrols for cybersecurity requirements for information system and processing facilities protection requirements, as a minimum:','2-3-3','mmmm',null,null,55),
  ('2-3-P-1-1','S','Ensuring that all configurations are applied in accordance with CSP’s cybersecurity standards.','','mmmm',null,null,56),
  ('2-3-P-1-2','S','Assurance of separation and isolation of data, environments, and information systems across CSTs, to prevent data commingling.','','mmmm',null,null,57),
  ('2-3-P-1-3','S','Adopting cybersecurity principles for technical system configurations adhering to the minimum functionality principle.','','mmmm',null,null,58),
  ('2-3-P-1-4','S','Ability of the Cloud Technology Stacks to securely handle input validation, exceptions and failure.','','mmmo',null,null,59),
  ('2-3-P-1-5','S','Full isolation of security functions and applications from other functions and applications in the Cloud Technology Stack.','','mmmm',null,null,60),
  ('2-3-P-1-6','S','Notification to CSTs with cybersecurity requirements provided by the CSP that are useable by the CST.','','mmmm',null,null,61),
  ('2-3-P-1-7','S','Detection and prevention of unauthorized changes to software programs, and systems.','','mmmm',null,null,62),
  ('2-3-P-1-8','S','Complete isolation and protection of multiple guest environments.','','mmmm',null,null,63),
  ('2-3-P-1-9','S','The community cloud services provided to CSTs (government entities and CNI entities) shall be isolated from any other cloud computing provided to entities outside the scope of work.','','mmmn',null,null,64),
  ('2-3-P-1-10','S','Modern technologies, such as Endpoint Detection and Response (EDR) technologies, to ensure that the information servers and devices of CSP’s information processing systems and devices of are ready for rapid response to incidents.','','mmmm','2-3-P-1-12','Was 2-3-P-1-12 in CCC-1:2020 (renumbered after 2-3-P-1-10/11 were deleted).',65),
  ('2-3-T-1','M','In addition to Subcontrols in the ECC control 2-3-3, the CST shall cover the following additional Subcontrols for cybersecurity requirements for information system and processing facilities protection requirements, as a minimum:','2-3-3','mmmm',null,null,66),
  ('2-3-T-1-1','S','Verifying that the CSP isolates the community cloud services provided to CSTs (government entities and CNI entities) from any other cloud computing provided to entities outside the scope of work.','','mmmn',null,null,67),
  ('2-4-P-1','M','In addition to Subcontrols in the ECC control 2-5-3, the CSP shall cover the following additional Subcontrols for cybersecurity requirements for networks security management requirements, as a minimum:','2-5-3','mmmm',null,null,68),
  ('2-4-P-1-1','S','Monitoring of traffic across the external and internal networks to detect anomalies.','','mmmm',null,null,69),
  ('2-4-P-1-2','S','Network isolation and protection of Cloud Technology Stack network from other internal and external networks.','','mmmm',null,null,70),
  ('2-4-P-1-3','S','Protection from denial-of-service attacks (including Distributed Denial of Service (DDoS)).','','mmmm',null,null,71),
  ('2-4-P-1-4','S','Protection of data transmitted through the network; from and to the Cloud Technology Stack network using cryptography primitives; for management and administrative access.','','mmmm',null,null,72),
  ('2-4-P-1-5','S','Access control between different network segments.','','mmmm',null,null,73),
  ('2-4-P-1-6','S','Isolation between cloud service delivery network, cloud management network and CSP enterprise network.','','mmmm',null,null,74),
  ('2-4-T-1','M','In addition to Subcontrols in the ECC control 2-5-3, the CST shall cover the following additional Subcontrols for cybersecurity requirements for networks security management requirements, as a minimum:','2-5-3','mmmm',null,null,75),
  ('2-4-T-1-1','S','Protecting the connection channel with CSP.','','mmmm',null,null,76),
  ('2-5-P-1','M','In addition to Subcontrols in the ECC control 2-6-3, the CSP shall cover the following additional Subcontrols for cybersecurity requirements for mobile device security, as a minimum:','2-6-3','mmmm',null,null,77),
  ('2-5-P-1-1','S','Inventory of all end user and mobile devices.','','mmmm',null,null,78),
  ('2-5-P-1-2','S','Centralized mobile device security management.','','mmmo',null,null,79),
  ('2-5-P-1-3','S','Screen locking for end user devices.','','mmmm',null,'English CCC-2:2024 reads "Screen looking"; CCC-1:2020 reads "Screen locking". Arabic text is binding; treated as screen locking.',80),
  ('2-5-P-1-4','S','Data sanitation and secure disposal for end-user devices, especially for those with exposure to the Cloud Technology Stack.','','mmmm',null,null,81),
  ('2-5-T-1','M','In addition to Subcontrols in the ECC control 2-6-3, the CST shall cover the following additional Subcontrols for cybersecurity requirements for mobile device security, as a minimum:','2-6-3','mmmo',null,null,82),
  ('2-5-T-1-1','S','Data sanitation and secure disposal for end-user devices with access to the cloud services.','','mmmo',null,null,83),
  ('2-6-P-1','M','In addition to Subcontrols in the ECC control 2-7-3, the CSP shall cover the following additional Subcontrols for cybersecurity requirements for data and information protection requirements, as a minimum:','2-7-2','mmmm',null,null,84),
  ('2-6-P-1-1','S','Prohibiting the use of Cloud Technology Stack’s data in any environment other than production environment, except after applying strict controls for protecting that data, such as data masking or data scrambling techniques.','','mmmm',null,null,85),
  ('2-6-P-1-2','S','Provision to CSTs of securely data storage processes, procedures, and technologies to comply with related legal and regulatory requirements.','','mmmm',null,null,86),
  ('2-6-P-1-3','S','Disposal of CST’s data should be performed in a secure manner on termination or expiry of the contract with the CSP.','','mmmm',null,null,87),
  ('2-6-P-1-4','S','Commitment to maintain the confidentiality of the CST’s data and information, according to related legal and regulatory requirements.','','mmmm',null,null,88),
  ('2-6-P-1-5','S','Providing CSTs with secure means to export and transfer data and virtual infrastructure.','','mmmm',null,null,89),
  ('2-6-T-1','M','In addition to Subcontrols in the ECC control 2-7-3, the CST shall cover the following additional Subcontrols for cybersecurity requirements for protecting CST’s data and information in cloud computing, as a minimum:','2-7-2','mmmo',null,null,90),
  ('2-6-T-1-1','S','Exit Strategy to ensure means for secure disposal of data on termination or expiry of the contract with the CSP.','','mmmo',null,null,91),
  ('2-6-T-1-2','S','Using secure means to export and transfer data and virtual infrastructure.','','mmmo',null,null,92),
  ('2-7-P-1','M','In addition to Subcontrols in the ECC control 2-8-3, the CSP shall cover the following additional Subcontrols for cryptography, as a minimum:','2-8-3','mmmm',null,null,93),
  ('2-7-P-1-1','S','Technical mechanisms and cryptographic primitives for strong encryption, in according to the advanced level in the National Cryptographic Standards (NCS-1:2020).','','mmmo',null,null,94),
  ('2-7-P-1-2','S','Certification authority and issuance capability in a secure manner, or usage of certificates from a trusted certification authority.','','mmmm',null,null,95),
  ('2-7-T-1','M','In addition to subcontrols in the ECC control 2-8-3, the CST shall cover the following additional subcontrols for cryptography, as a minimum:','2-8-3','mmmm',null,null,96),
  ('2-7-T-1-1','S','Technical mechanisms and cryptographic primitives for strong encryption, in according to the advanced level in the National Cryptographic Standards (NCS-1:2020).','','mmmo',null,null,97),
  ('2-7-T-1-2','S','Encryption of data and information transferred to or transferred out of the cloud according to the relevant law and regulatory requirements.','','mmmm',null,null,98),
  ('2-8-P-1','M','In addition to subcontrols in the ECC control 2-9-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for backup and recovery management, as a minimum:','2-9-3','mmmm',null,null,99),
  ('2-8-P-1-1','S','Securing access, storage and transfer of CST’s data backups and its mediums, and protecting it against damage, amendment, or unauthorized access.','','mmmm',null,null,100),
  ('2-8-P-1-2','S','Securing access, storage and transfer of Cloud Technology Stack backups and its mediums, and protecting it against damage, amendment, or unauthorized access.','','mmmm',null,null,101),
  ('2-9-P-1','M','In addition to subcontrols in the ECC control 2-10-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for vulnerability management requirements, as a minimum:','2-10-3','mmmm',null,null,102),
  ('2-9-P-1-1','S','Assessing and remediating vulnerabilities on external components of Cloud Technology Stack at least once every month, and at least once every three months for internal components of Cloud Technology Stack.','','mmmm',null,null,103),
  ('2-9-P-1-2','S','Notification to CSTs of identified vulnerabilities that may affecting them, and safeguards in place.','','mmmm',null,null,104),
  ('2-9-T-1','M','In addition to subcontrols in the ECC control 2-10-3, the CST shall cover the following additional subcontrols for cybersecurity requirements for vulnerability management requirements, as a minimum:','2-10-3','mmmm',null,null,105),
  ('2-9-T-1-1','S','Assessing and remediating vulnerabilities cloud services and at least once every three months.','','mmmm',null,null,106),
  ('2-9-T-1-2','S','Management of CSP-notified vulnerabilities safeguards in place.','','mmmm',null,null,107),
  ('2-10-P-1','M','In addition to subcontrols in the ECC control 2-11-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for penetration testing, as a minimum:','2-11-3','mmmm',null,null,108),
  ('2-10-P-1-1','S','Scope of penetration tests must cover Cloud Technology Stack and must be conducted at least once every six months.','','mmmm',null,null,109),
  ('2-11-P-1','M','In addition to subcontrols in the ECC control 2-12-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for cybersecurity event logs and monitoring management, as a minimum:','2-12-3','mmmo',null,null,110),
  ('2-11-P-1-1','S','Activating and protecting event logs and audit trails of Cloud Technology Stack.','','mmmo',null,null,111),
  ('2-11-P-1-2','S','Activating and collecting login attempts history.','','mmmo',null,null,112),
  ('2-11-P-1-3','S','Activating and protecting all event logs of activities and operations performed by the CSP at the tenant level in order to support forensic analysis.','','mmmo',null,null,113),
  ('2-11-P-1-4','S','Protecting cybersecurity event logs from alteration, disclosure, destruction and unauthorized access and unauthorized release, in accordance with regulatory, or law requirements.','','mmmo',null,null,114),
  ('2-11-P-1-5','S','Continuous cybersecurity events monitoring using SIEM technique covering the full Cloud Technology Stack.','','mmmo',null,null,115),
  ('2-11-P-1-6','S','Reviewing cybersecurity event logs and audit trails periodically, covering CSP events in the Cloud Technology Stack.','','mmmo',null,null,116),
  ('2-11-P-1-7','S','Automated monitoring and logging of remote access sessions event logs.','','mmmo',null,null,117),
  ('2-11-P-1-8','S','Secure handling of user-related data found in the audit trails and the cybersecurity event logs.','','mmmo',null,null,118),
  ('2-11-T-1','M','In addition to subcontrols in the ECC control 2-12-3, the CST shall cover the following additional subcontrols for cybersecurity requirements for cybersecurity event logs and monitoring management, as a minimum:','2-12-3','mmmo',null,null,119),
  ('2-11-T-1-1','S','Activating and collecting of login event logs, and cybersecurity event logs on assets related to cloud services.','','mmmo',null,null,120),
  ('2-11-T-1-2','S','Monitoring shall include all activated cybersecurity logs on the cloud services of the CST.','','mmmo',null,null,121),
  ('2-12-P-1','M','In addition to subcontrols in the ECC control 2-13-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for cybersecurity incident and threat management, as a minimum:','2-13-3','mmmm',null,null,122),
  ('2-12-P-1-1','S','Subscribing in authorized and specialized entities and groups to stay upto-date on Cybersecurity threats, common practices, and key knowhow.','','mmmm',null,null,123),
  ('2-12-P-1-2','S','Training for employees and third-party personnel to respond to cybersecurity incidents, in line with their roles and responsibilities.','','mmmo',null,null,124),
  ('2-12-P-1-3','S','Periodically testing the incident response capability.','','mmmo',null,null,125),
  ('2-12-P-1-4','S','Root Cause Analysis of cybersecurity incidents and developing plans to address them.','','mmmm',null,null,126),
  ('2-12-P-1-5','S','Support the CST in cases legal proceedings and forensics, protecting the chain of custody that falls under the management and responsibility of the CSP, in accordance with the related law and regulatory requirements.','','mmmm',null,null,127),
  ('2-12-P-1-6','S','Real-time reporting to the CST of incidents that may affect CST; if the incident is discovered.','','mmmm',null,null,128),
  ('2-12-P-1-7','S','Support for CSTs to handle security incidents according to the agreement between the CSP and CST.','','mmmm',null,null,129),
  ('2-12-P-1-8','S','Measuring and monitoring cybersecurity incident metrics and monitor compliance with contracts and legislative requirements.','','mmmo',null,null,130),
  ('2-13-P-1','M','In addition to subcontrols in the ECC control 2-14-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for physical security, as a minimum:','2-14-3','mmmm',null,null,131),
  ('2-13-P-1-1','S','Continual monitoring of access to CSP’s sites and buildings.','','mmmm',null,null,132),
  ('2-13-P-1-2','S','Preventing unauthorized access to devices in the Cloud Technology Stack.','','mmmm',null,null,133),
  ('2-13-P-1-3','S','Disposal of cloud infrastructure hardware, in particular, storage equipment (external or internal), by adopting relevant legislation and best practices.','','mmmm',null,null,134),
  ('2-14-P-1','M','In addition to subcontrols in the ECC control 2-15-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for web application security, as a minimum:','2-15-3','mmmm',null,null,135),
  ('2-14-P-1-1','S','Protecting information involved in application service transactions against possible risks (e.g.: incomplete transmission, mis-routing, unauthorized message alteration, unauthorized disclosure….).','','mmmm',null,null,136),
  ('2-15-P-1','M','Cybersecurity requirements for key management process within the CSP shall be identified, documented, and approved.','','mmmm',null,null,137),
  ('2-15-P-2','M','Cybersecurity requirements for key management process within the CSP shall be applied.','','mmmm',null,null,138),
  ('2-15-P-3','M','In addition to the ECC Subcontrol 2-8-3-2, cybersecurity requirements for key management within the CSP shall cover, at minimum, the following:','2-8-3-2','mmmm',null,null,139),
  ('2-15-P-3-1','S','Ensure well-defined ownership for cryptographic keys.','','mmmo',null,null,140),
  ('2-15-P-3-2','S','A secure cryptographic key retrieval mechanism in case of cryptographic key lost (such as backup of keys and enforcement of trusted key storage, strictly external to cloud).','','mmmm',null,null,141),
  ('2-15-P-3-3','S','Activating and monitoring of all audit trails of keys.','','mmmm',null,null,142),
  ('2-15-P-4','M','Cybersecurity requirements for key management within the CSP shall be applied and reviewed periodically.','','mmmm',null,'CCC-2:2024 adds "applied and" (CCC-1:2020: reviewed periodically only).',143),
  ('2-15-T-1','M','Cybersecurity requirements for key management within the CST shall be identified, documented, and approved.','','mmmm',null,null,144),
  ('2-15-T-2','M','Cybersecurity requirements for key management within the CST shall applied.','','mmmm',null,null,145),
  ('2-15-T-3','M','In addition to the ECC Subcontrol 2-8-3-2, cybersecurity requirements for key management within the CST shall cover, at minimum, the following:','2-8-3-2','mmmm',null,null,146),
  ('2-15-T-3-1','S','Ensure well-defined ownership for cryptographic keys.','','mmmm',null,null,147),
  ('2-15-T-3-2','S','A secure data retrieval mechanism in case of cryptographic encryption key lost (such as backup of keys and enforcement of trusted key storage, strictly external to cloud).','','mmmm',null,null,148),
  ('2-15-T-4','M','Cybersecurity requirements for key management within the CST shall be applied and reviewed periodically.','','mmmm',null,null,149),
  ('2-16-P-1','M','Cybersecurity requirements for system development within the CSP shall be identified, documented, and approved.','','mmmm',null,null,150),
  ('2-16-P-2','M','Cybersecurity requirements for system development within the CSP shall be applied.','','mmmm',null,null,151),
  ('2-16-P-3','M','Cybersecurity requirements for system development within the CSP shall include as a minimum the following controls along the development lifecycle:','1-6-3','mmmm',null,null,152),
  ('2-16-P-3-1','S','Considering cybersecurity requirements of the Cloud Technology Stack and relevant systems in the design and implementation of the cloud computing services.','','mmmm',null,null,153),
  ('2-16-P-3-2','S','Protecting system development environments, testing environments (including data used in testing environment), and integration platforms.','','mmmm',null,null,154),
  ('2-16-P-4','M','Cybersecurity requirements for system development within the CSP shall be applied and reviewed periodically.','','mmmm',null,null,155),
  ('2-17-P-1','M','Cybersecurity requirements for usage of information and data media within the CSP shall be identified, documented, and approved.','','mmmm',null,null,156),
  ('2-17-P-2','M','Cybersecurity requirements for usage of information and data media within the CSP shall be applied.','','mmmm',null,null,157),
  ('2-17-P-3','M','Cybersecurity requirements for usage of information and data media within the CSP shall cover, at minimum, the following:','2-3-3-2,2-14-3-4','mmmm',null,null,158),
  ('2-17-P-3-1','S','Enforcement of sanitization of media, prior to disposal or reuse.','','mmmm',null,null,159),
  ('2-17-P-3-2','S','Using secure means when disposing of media.','','mmmm',null,null,160),
  ('2-17-P-3-3','S','Provision to maintain confidentiality and integrity of data on removable media.','','mmmm',null,null,161),
  ('2-17-P-3-4','S','Human readable labelling of media, to explain its classification and the sensitivity of the information it contains.','','mmmm',null,null,162),
  ('2-17-P-3-5','S','Controlled and physically secure storage of removable media.','','mmmm',null,null,163),
  ('2-17-P-3-6','S','Restriction and control of usage of portable media inside the Cloud Technology Stack.','','mmmm',null,null,164),
  ('2-17-P-4','M','Cybersecurity requirements for usage of information and data media within the CSP shall be applied and reviewed periodically.','','mmmm',null,null,165),
  ('3-1-P-1','M','In addition to subcontrols in the ECC control 3-1-3, the CSP shall cover the following additional subcontrols for cybersecurity requirements for cybersecurity resilience aspects of business continuity management, as a minimum:','3-1-3','mmmm',null,null,166),
  ('3-1-P-1-1','S','Developing and implementing disaster recovery and business continuity procedures in a secure manner.','','mmmm',null,null,167),
  ('3-1-P-1-2','S','Developing and implementing procedures to ensure resilience and continuity of cybersecurity systems dedicated to the protection of Cloud Technology Stack.','','mmmm',null,null,168),
  ('3-1-T-1','M','In addition to subcontrols in the ECC control 3-1-3, the CST shall cover the following additional subcontrols for cybersecurity requirements for cybersecurity resilience aspects of business continuity management, as a minimum:','3-1-3','mmmm',null,null,169),
  ('3-1-T-1-1','S','Developing and implementing disaster recovery and business continuity procedures related to cloud computing, in a secure manner.','','mmmm',null,null,170),
  ('4-1-P-1','M','In addition to implementing the ECC controls 4-1-2 and 4-1-3, the CSP shall cover the following additional subcontrols for third-party cybersecurity requirements, as a minimum:','4-1-2,4-1-3','mmmm',null,null,171),
  ('4-1-P-1-1','S','Ensure that the CSP fulfills NCA''s requests to remove software or services, provided by third-party providers that may be considered a cybersecurity threat to national entities, from the marketplace provided to CSTs.','','mmmo',null,null,172),
  ('4-1-P-1-2','S','Requirement to provide security documentation for any equipment or services from suppliers and third-party providers.','','mmmm',null,null,173),
  ('4-1-P-1-3','S','Third-party providers compliant with law and regulatory requirements relevant to their scope.','','mmmm',null,null,174),
  ('4-1-P-1-4','S','Risk management and security governance on third-party providers as part of general cybersecurity risk management and governance.','','mmmm',null,null,175)
)
insert into public.nca_ccc
  (framework, version, domain_id, domain_name, subdomain_id, subdomain_name, subdomain_objective,
   control_id, control_type, control_text, role, parent_control_id, ecc_refs,
   level_1, level_2, level_3, level_4, previous_control_id, note, sort_order)
select 'NCA CCC', 'CCC-2:2024', s.domain_id, s.domain_name, s.subdomain_id, s.subdomain_name, s.subdomain_objective,
       c.control_id, case c.kind when 'M' then 'Main Control' else 'Sub-Control' end, c.control_text,
       case split_part(c.control_id, '-', 3) when 'P' then 'CSP' else 'CST' end,
       case when c.kind = 'S' then regexp_replace(c.control_id, '-[0-9]+$', '') end,
       case when c.ecc = '' then '{}'::text[] else string_to_array(c.ecc, ',') end,
       l[1], l[2], l[3], l[4], coalesce(c.previous_control_id, c.control_id), c.note, c.sort_order
  from ctl c
  join sub s on s.subdomain_id = split_part(c.control_id, '-', 1) || '-' || split_part(c.control_id, '-', 2)
  cross join lateral (select array(
    select case ch when 'm' then 'mandatory' when 'o' then 'optional' else 'not_applicable' end
      from unnest(string_to_array(c.lv, null)) as ch) as l) x;

alter table public.nca_ccc
  alter column framework set default 'NCA CCC',
  alter column version set default 'CCC-2:2024',
  alter column control_id set not null,
  alter column control_text set not null,
  alter column role set not null,
  alter column level_1 set not null, alter column level_2 set not null,
  alter column level_3 set not null, alter column level_4 set not null,
  add constraint nca_ccc_control_id_key unique (control_id),
  add constraint nca_ccc_role_check check (role in ('CST', 'CSP')),
  add constraint nca_ccc_levels_check check (
    level_1 in ('mandatory', 'optional', 'not_applicable') and
    level_2 in ('mandatory', 'optional', 'not_applicable') and
    level_3 in ('mandatory', 'optional', 'not_applicable') and
    level_4 in ('mandatory', 'optional', 'not_applicable'));

-- Regulator text is reference data: read by anyone, written only by migrations.
revoke insert, update, delete, truncate on public.nca_ccc from anon, authenticated;

comment on table public.nca_ccc is
  'NCA Cloud Cybersecurity Controls CCC-2:2024 (English). role: CST tenant / CSP provider. level_1..level_4: applicability at each data classification level (Annex A). The Arabic NCA text is binding.';

-- ── 2. Workspace CCC profile ────────────────────────────────────────────────
alter table public.organizations
  add column if not exists ccc_role       text,
  add column if not exists ccc_level      smallint,
  add column if not exists ccc_updated_at timestamptz,
  add column if not exists ccc_updated_by uuid;

alter table public.organizations
  add constraint organizations_ccc_role_check  check (ccc_role in ('cst', 'csp', 'both')),
  add constraint organizations_ccc_level_check check (ccc_level between 1 and 4),
  add constraint organizations_ccc_profile_check check ((ccc_role is null) = (ccc_level is null));

comment on column public.organizations.ccc_role is
  'NCA CCC scope: cst (uses cloud services), csp (provides them), both, or null when CCC does not apply. Set by a workspace admin through set_ccc_profile().';
comment on column public.organizations.ccc_level is
  'Highest classification of the data in the cloud: 1 top secret, 2 secret, 3 confidential, 4 public (CCC Annex A).';

create or replace function public.set_ccc_profile(p_org uuid, p_role text, p_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   record;
  v_role  text := nullif(lower(trim(coalesce(p_role, ''))), '');
  v_name  text;
begin
  if not is_org_admin(p_org) then
    raise exception 'Only a workspace administrator can change the CCC scope';
  end if;
  if v_role is not null and v_role not in ('cst', 'csp', 'both') then
    raise exception 'Unknown CCC role %', p_role;
  end if;
  if v_role is not null and (p_level is null or p_level not between 1 and 4) then
    raise exception 'Choose the data classification level (1 to 4)';
  end if;

  select ccc_role, ccc_level into v_old from organizations where id = p_org for update;

  update organizations
     set ccc_role = v_role,
         ccc_level = case when v_role is null then null else p_level end,
         ccc_updated_at = now(),
         ccc_updated_by = auth.uid()
   where id = p_org;

  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  insert into audit_log (org_id, actor_id, actor_name, action, entity_type, entity_id, entity_title, meta, created_at)
  values (p_org, auth.uid(), v_name, 'compliance.ccc_scope_changed', 'organization', p_org, 'NCA CCC scope',
          jsonb_build_object('from_role', v_old.ccc_role, 'from_level', v_old.ccc_level,
                             'to_role', v_role, 'to_level', case when v_role is null then null else p_level end),
          now());

  return jsonb_build_object('ccc_role', v_role, 'ccc_level', case when v_role is null then null else p_level end);
end
$$;

revoke all on function public.set_ccc_profile(uuid, text, integer) from public, anon;
grant execute on function public.set_ccc_profile(uuid, text, integer) to authenticated;

-- ── 3. Requirements in scope for a workspace ────────────────────────────────
create or replace function public.ccc_scope(p_org uuid)
returns table (control_id text, role text, control_type text, parent_control_id text, applicability text)
language sql
stable
security invoker
set search_path = public
as $$
  select c.control_id::text, c.role, c.control_type::text, c.parent_control_id::text,
         case o.ccc_level when 1 then c.level_1 when 2 then c.level_2 when 3 then c.level_3 else c.level_4 end
    from organizations o
    join nca_ccc c on o.ccc_role = 'both' or upper(o.ccc_role) = c.role
   where o.id = p_org and o.ccc_role is not null;
$$;

grant execute on function public.ccc_scope(uuid) to authenticated;

-- ── 4. Generic requirement view gains CCC ───────────────────────────────────
create or replace view public.framework_requirements_v
with (security_invoker = true) as
 select 'NCA ECC'::text as framework,
    (nca_ecc.control_id)::text as requirement_id,
    (nca_ecc.control_type)::text as requirement_type,
    nca_ecc.control_text as requirement_text,
    (nca_ecc.domain_id)::text as domain_id,
    (nca_ecc.domain_name)::text as domain_name,
    (nca_ecc.subdomain_id)::text as subdomain_id,
    (nca_ecc.subdomain_name)::text as subdomain_name,
        case
            when ((nca_ecc.control_id)::text ~ '^[0-9]+(-[0-9]+){3,}$'::text) then regexp_replace((nca_ecc.control_id)::text, '-[0-9]+$'::text, ''::text)
            else null::text
        end as parent_requirement_id
   from nca_ecc
union all
 select 'NCA CCC'::text,
    (nca_ccc.control_id)::text,
    (nca_ccc.control_type)::text,
    nca_ccc.control_text,
    (nca_ccc.domain_id)::text,
    (nca_ccc.domain_name)::text,
    (nca_ccc.subdomain_id)::text,
    (nca_ccc.subdomain_name)::text,
    (nca_ccc.parent_control_id)::text
   from nca_ccc;

-- ── 5. Crosswalk and CCC finding keys ───────────────────────────────────────
create table if not exists public.framework_crosswalk (
  id                  bigint generated always as identity primary key,
  from_framework      text not null,
  from_requirement_id text not null,
  to_framework        text not null,
  to_requirement_id   text not null,
  relation            text not null check (relation in ('extends', 'also_serves', 'evidence')),
  connector_ids       text[],
  note                text,
  created_at          timestamptz not null default now(),
  constraint framework_crosswalk_unique unique (from_framework, from_requirement_id, to_framework, to_requirement_id, relation)
);

comment on table public.framework_crosswalk is
  'Requirement links between frameworks. extends: a CCC control adds to this ECC control (CCC text). also_serves: evidence for the CCC control also serves this ECC control (RISYS Control Integration Reference). evidence: findings keyed to the ECC requirement by these connectors are also evidence for the CCC requirement.';

alter table public.framework_crosswalk enable row level security;
create policy "anyone signed in can read the crosswalk" on public.framework_crosswalk
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.framework_crosswalk from anon, authenticated;
grant select on public.framework_crosswalk to authenticated;

create index if not exists framework_crosswalk_from_idx on public.framework_crosswalk (from_framework, from_requirement_id);
create index if not exists framework_crosswalk_to_idx   on public.framework_crosswalk (to_framework, to_requirement_id);

-- CCC → ECC, written 'ccc id|relation|ecc ids'
insert into public.framework_crosswalk (from_framework, from_requirement_id, to_framework, to_requirement_id, relation)
select 'NCA CCC', split_part(v, '|', 1), 'NCA ECC', e, split_part(v, '|', 2)
  from unnest(array[
  '1-1-P-1|extends|1-4-1',
  '1-1-T-1|extends|1-4-1',
  '1-2-P-1|extends|1-5-1',
  '1-2-T-1|extends|1-5-1',
  '1-3-P-1|extends|1-7-1',
  '1-3-T-1|extends|1-7-1',
  '1-4-P-1|extends|1-9-3,1-9-4',
  '1-4-P-2|extends|1-9-5',
  '1-4-T-1|extends|1-9-3',
  '1-5-P-3|extends|1-6-2',
  '2-1-P-1|extends|2-1-2',
  '2-1-T-1|extends|2-1-2',
  '2-2-P-1|extends|2-2-3',
  '2-2-T-1|extends|2-2-3',
  '2-3-P-1|extends|2-3-3',
  '2-3-T-1|extends|2-3-3',
  '2-4-P-1|extends|2-5-3',
  '2-4-T-1|extends|2-5-3',
  '2-5-P-1|extends|2-6-3',
  '2-5-T-1|extends|2-6-3',
  '2-6-P-1|extends|2-7-2',
  '2-6-T-1|extends|2-7-2',
  '2-7-P-1|extends|2-8-3',
  '2-7-T-1|extends|2-8-3',
  '2-8-P-1|extends|2-9-3',
  '2-9-P-1|extends|2-10-3',
  '2-9-T-1|extends|2-10-3',
  '2-10-P-1|extends|2-11-3',
  '2-11-P-1|extends|2-12-3',
  '2-11-T-1|extends|2-12-3',
  '2-12-P-1|extends|2-13-3',
  '2-13-P-1|extends|2-14-3',
  '2-14-P-1|extends|2-15-3',
  '2-15-P-3|extends|2-8-3-2',
  '2-15-T-3|extends|2-8-3-2',
  '2-16-P-3|extends|1-6-3',
  '2-17-P-3|extends|2-3-3-2,2-14-3-4',
  '3-1-P-1|extends|3-1-3',
  '3-1-T-1|extends|3-1-3',
  '4-1-P-1|extends|4-1-2,4-1-3',
  '1-1-P-1-1|also_serves|1-2-1,1-4-1',
  '1-1-T-1-1|also_serves|1-2-1,1-4-1',
  '1-2-P-1-1|also_serves|1-5-1',
  '1-2-P-1-2|also_serves|1-5-1,2-1-5,2-7-2',
  '1-2-P-1-3|also_serves|1-5-2',
  '1-2-T-1-1|also_serves|1-5-1',
  '1-2-T-1-2|also_serves|1-5-1,2-1-5,2-7-2',
  '1-2-T-1-3|also_serves|1-5-2,4-2-3-1,4-2-3-2',
  '1-3-P-1-1|also_serves|1-7-1',
  '1-3-T-1-1|also_serves|1-5-3-3,1-7-1,4-1-2-1,4-1-2-2,4-1-2-3,4-1-3-1,4-2-3-1,4-2-3-2',
  '1-4-P-1-1|also_serves|1-2-2',
  '1-4-P-1-2|also_serves|1-9-2,1-9-3-2',
  '1-4-P-1-3|also_serves|1-9-2,1-9-3-1,1-9-4-2',
  '1-4-P-2-1|also_serves|1-9-2,1-9-5,2-1-2,2-1-5,2-14-3-5',
  '1-4-T-1-1|also_serves|1-9-2,1-9-3-2',
  '1-5-P-1|also_serves|1-6-1',
  '1-5-P-2|also_serves|1-5-3-2,1-6-1',
  '1-5-P-3-1|also_serves|1-5-3-2,1-6-1,1-6-2-2',
  '1-5-P-3-2|also_serves|1-5-3-2,1-6-1,2-13-3-2,2-13-3-3,2-13-3-4',
  '1-5-P-4|also_serves|1-5-3-2,1-6-1,1-6-4',
  '2-1-P-1-1|also_serves|2-1-2,2-1-5,2-14-3-5',
  '2-1-P-1-2|also_serves|2-1-2,2-1-5,2-14-3-5',
  '2-1-T-1-1|also_serves|2-1-2,2-1-5,2-14-3-5',
  '2-2-P-1-1|also_serves|2-2-3-4',
  '2-2-P-1-2|also_serves|2-2-2',
  '2-2-P-1-3|also_serves|2-2-3-2,2-4-3-2',
  '2-2-P-1-4|also_serves|2-2-3-1',
  '2-2-P-1-5|also_serves|2-2-3-1,2-8-3-1',
  '2-2-P-1-6|also_serves|2-2-3-3,2-2-3-5,2-2-4,4-1-2-3,4-1-3-2',
  '2-2-P-1-7|also_serves|2-2-3-2,2-2-3-4,2-4-3-2',
  '2-2-P-1-8|also_serves|2-2-3-1',
  '2-2-P-1-9|also_serves|2-2-3-3,2-2-3-4,4-1-2-1,4-1-2-2,4-1-2-3,4-2-3-1',
  '2-2-P-1-10|also_serves|2-2-3-4',
  '2-2-P-1-11|also_serves|2-2-3-2,2-4-3-2,2-15-3-5',
  '2-2-P-1-12|also_serves|2-2-3-3,2-2-3-4',
  '2-2-T-1-1|also_serves|1-9-2,1-9-5,2-2-3-3,2-2-3-5,2-2-4',
  '2-2-T-1-2|also_serves|2-2-3-1',
  '2-2-T-1-3|also_serves|2-2-2',
  '2-2-T-1-4|also_serves|2-2-3-2,2-4-3-2',
  '2-2-T-1-5|also_serves|2-2-3-1',
  '2-3-P-1-1|also_serves|1-3-3,1-6-2-2,1-6-3-5',
  '2-3-P-1-2|also_serves|2-15-3-2,4-2-3-1,4-2-3-2',
  '2-3-P-1-3|also_serves|1-3-3,1-6-2-2,1-6-3-5,2-5-3-5',
  '2-3-P-1-4|also_serves|1-6-3-1,2-11-3-1,2-11-3-2',
  '2-3-P-1-5|also_serves|2-5-3-1,2-5-3-2,2-15-3-2',
  '2-3-P-1-7|also_serves|1-5-3-2,1-6-1,2-3-3-1,2-12-3-1,2-12-3-2',
  '2-3-P-1-8|also_serves|2-15-3-2,4-2-3-1,4-2-3-2',
  '2-3-P-1-9|also_serves|2-15-3-2,4-2-3-2',
  '2-3-P-1-10|also_serves|2-3-3-1',
  '2-3-T-1-1|also_serves|1-5-3-3,4-1-2-1,4-1-2-2,4-1-2-3,4-1-3-1,4-2-3-1,4-2-3-2',
  '2-4-P-1-1|also_serves|2-5-3-6,2-12-3-3,2-12-3-4',
  '2-4-P-1-2|also_serves|2-5-3-1,2-5-3-2',
  '2-4-P-1-3|also_serves|2-5-3-9',
  '2-4-P-1-4|also_serves|2-8-3-1,2-8-3-3,2-15-3-3',
  '2-4-P-1-5|also_serves|2-5-3-1,2-5-3-2',
  '2-4-P-1-6|also_serves|2-5-3-1,2-5-3-2',
  '2-4-T-1-1|also_serves|2-5-3-1,2-8-3-1,2-8-3-3,2-15-3-3',
  '2-5-P-1-1|also_serves|2-1-2,2-1-5,2-6-3-1,2-6-3-2,2-14-3-5',
  '2-5-P-1-2|also_serves|2-6-3-1,2-6-3-2',
  '2-5-P-1-3|also_serves|2-6-3-1,2-6-3-2',
  '2-5-P-1-4|also_serves|2-6-3-3,2-14-3-4',
  '2-5-T-1-1|also_serves|2-6-3-3,2-14-3-4',
  '2-6-P-1-1|also_serves|2-5-3-1,2-5-3-2,2-7-2',
  '2-6-P-1-2|also_serves|2-6-3-1,2-7-2,2-8-3-3,2-14-3-5',
  '2-6-P-1-3|also_serves|2-14-3-4,4-1-2-1,4-1-2-2,4-1-2-3,4-2-3-1',
  '2-6-P-1-4|also_serves|2-7-2,4-1-2-1,4-1-2-2,4-1-2-3,4-2-3-1',
  '2-6-P-1-5|also_serves|2-8-3-1,2-8-3-3,2-15-3-3,4-2-3-1',
  '2-6-T-1-1|also_serves|4-1-2-1,4-1-2-2,4-1-2-3,4-2-3-1',
  '2-6-T-1-2|also_serves|2-8-3-1,2-8-3-3,2-15-3-3',
  '2-7-P-1-1|also_serves|2-6-3-1,2-7-2,2-8-3-1,2-8-3-2,2-8-3-3,2-14-3-5,2-15-3-3',
  '2-7-P-1-2|also_serves|2-8-3-2,2-15-3-3',
  '2-7-T-1-1|also_serves|2-6-3-1,2-7-2,2-8-3-1,2-8-3-2,2-8-3-3,2-14-3-5,2-15-3-3',
  '2-7-T-1-2|also_serves|2-8-3-1,2-8-3-3,2-15-3-3',
  '2-8-P-1-1|also_serves|2-9-3-1,2-9-3-2',
  '2-8-P-1-2|also_serves|2-9-3-1,2-9-3-2',
  '2-9-P-1-1|also_serves|1-6-2-1,2-10-3-1,2-10-3-2,2-10-3-3',
  '2-9-P-1-2|also_serves|2-10-3-5',
  '2-9-T-1-1|also_serves|1-6-2-1,2-10-3-1,2-10-3-2,2-10-3-3,4-2-3-1,4-2-3-2',
  '2-9-T-1-2|also_serves|2-10-3-5',
  '2-10-P-1-1|also_serves|2-11-3-1,2-11-3-2',
  '2-11-P-1-1|also_serves|2-12-3-1,2-12-3-2',
  '2-11-P-1-2|also_serves|2-12-3-1,2-12-3-2',
  '2-11-P-1-3|also_serves|2-12-3-1,2-12-3-2',
  '2-11-P-1-4|also_serves|2-12-3-1,2-12-3-2,2-12-3-5',
  '2-11-P-1-5|also_serves|2-12-3-1,2-12-3-2,2-12-3-3,2-12-3-4',
  '2-11-P-1-6|also_serves|2-12-3-3,2-12-3-4',
  '2-11-P-1-7|also_serves|2-12-3-1,2-12-3-2,2-12-3-3,2-12-3-4',
  '2-11-P-1-8|also_serves|2-2-3-3,2-12-3-5',
  '2-11-T-1-1|also_serves|2-12-3-1,2-12-3-2',
  '2-11-T-1-2|also_serves|2-12-3-3,2-12-3-4',
  '2-12-P-1-1|also_serves|2-10-3-5,2-13-3-5',
  '2-12-P-1-2|also_serves|1-10-4-1,1-10-4-2,1-10-4-3',
  '2-12-P-1-3|also_serves|2-13-3-1,3-1-3-2',
  '2-12-P-1-4|also_serves|2-13-2,2-13-3-2,2-13-3-3,2-13-3-4',
  '2-12-P-1-5|also_serves|2-12-3-5,2-13-2,2-13-3-2,2-13-3-3,2-13-3-4',
  '2-12-P-1-6|also_serves|2-13-3-2,2-13-3-3,2-13-3-4,4-1-2-2',
  '2-12-P-1-7|also_serves|2-13-3-2,2-13-3-3,2-13-3-4,4-1-2-1,4-1-2-2,4-1-2-3,4-2-3-1',
  '2-12-P-1-8|also_serves|2-12-3-3,2-12-3-4,2-13-3-2,2-13-3-3,2-13-3-4,2-13-4',
  '2-13-P-1-1|also_serves|2-14-3-1,2-14-3-2,2-14-3-3',
  '2-13-P-1-2|also_serves|2-14-3-1',
  '2-13-P-1-3|also_serves|2-14-3-4',
  '2-14-P-1-1|also_serves|1-6-3-4,2-15-3-1,2-15-3-3',
  '2-15-P-1|also_serves|2-8-1',
  '2-15-P-2|also_serves|2-8-3-2',
  '2-15-P-3-1|also_serves|2-8-3-2',
  '2-15-P-3-2|also_serves|2-8-3-2,2-9-3-1,2-9-3-2',
  '2-15-P-3-3|also_serves|2-8-3-2,2-12-3-1,2-12-3-2',
  '2-15-P-4|also_serves|2-8-4',
  '2-15-T-1|also_serves|2-8-1',
  '2-15-T-2|also_serves|2-8-3-2',
  '2-15-T-3-1|also_serves|2-8-3-2',
  '2-15-T-3-2|also_serves|2-8-3-2,2-9-3-1,2-9-3-2',
  '2-15-T-4|also_serves|2-8-3-2,2-8-4',
  '2-16-P-1|also_serves|1-6-1',
  '2-16-P-2|also_serves|1-6-3,1-6-3-1,1-6-3-2,1-6-3-3',
  '2-16-P-3-1|also_serves|1-5-3-1,1-5-3-2,1-5-3-3,1-5-3-4,1-6-1',
  '2-16-P-3-2|also_serves|2-5-3-1,2-5-3-2,2-7-2',
  '2-16-P-4|also_serves|1-6-4',
  '2-17-P-1|also_serves|2-3-1',
  '2-17-P-2|also_serves|2-3-3-2,2-14-3-4',
  '2-17-P-3-1|also_serves|2-14-3-4',
  '2-17-P-3-2|also_serves|2-14-3-4',
  '2-17-P-3-3|also_serves|2-3-3-2,2-6-3-1,2-7-2,2-8-3-3,2-14-3-5',
  '2-17-P-3-4|also_serves|2-1-5,2-7-2',
  '2-17-P-3-5|also_serves|2-14-3-1,2-14-3-5',
  '2-17-P-3-6|also_serves|2-3-3-2',
  '2-17-P-4|also_serves|2-3-4',
  '3-1-P-1-1|also_serves|2-9-3-3,3-1-3-3',
  '3-1-P-1-2|also_serves|3-1-3-1',
  '3-1-T-1-1|also_serves|2-9-3-3,3-1-3-3',
  '4-1-P-1-2|also_serves|1-5-3-3,4-1-2-1,4-1-2-2,4-1-2-3,4-1-3-1,4-2-3-1',
  '4-1-P-1-3|also_serves|1-5-3-3,4-1-2-3,4-1-3-1',
  '4-1-P-1-4|also_serves|1-5-2,1-5-3-3,4-1-3-1'
  ]) as v
  cross join lateral unnest(string_to_array(split_part(v, '|', 3), ',')) as e
on conflict on constraint framework_crosswalk_unique do nothing;

-- ECC → CCC evidence, for the Microsoft cloud connectors (tenant controls only:
-- a provider's own Microsoft 365 is corporate IT, not its cloud technology stack)
insert into public.framework_crosswalk (from_framework, from_requirement_id, to_framework, to_requirement_id, relation, connector_ids, note)
select 'NCA ECC', v.ecc, 'NCA CCC', v.ccc, 'evidence', array['m365', 'defender', 'sharepoint'], v.note
  from (values
  ('2-2-3-2','2-2-T-1-4','Sign-in without strong authentication on a cloud service'),
  ('2-2-3-1','2-2-T-1-5','Authentication policy weaknesses that let unauthorised access through'),
  ('2-2-2','2-2-T-1-3','Session controls on a cloud service'),
  ('2-2-3-5','2-2-T-1-1','Cloud accounts not reviewed or removed in their lifecycle'),
  ('2-2-3-4','2-2-T-1-1','Privileged cloud credentials'),
  ('2-12-3-1','2-11-T-1-1','Sign-in and audit logging on a cloud service'),
  ('4-2-3-1','1-3-T-1-1','Controls over the cloud provider''s access to tenant data')
  ) as v(ecc, ccc, note)
on conflict on constraint framework_crosswalk_unique do nothing;

-- finding_control_refs: CCC keys, derived through the crosswalk
alter table public.finding_control_refs
  add column if not exists ccc_control_id     varchar references public.nca_ccc (control_id) on update cascade on delete restrict,
  add column if not exists via_requirement_id text;

alter table public.finding_control_refs drop constraint if exists finding_control_refs_framework_check;
alter table public.finding_control_refs
  add constraint finding_control_refs_framework_check check (framework in ('NCA ECC', 'SDAIA PDPL', 'NCA CCC')),
  add constraint finding_control_refs_ccc_key check ((framework = 'NCA CCC') = (ccc_control_id is not null));

alter table public.finding_control_refs
  alter column requirement_id set expression as
    (coalesce(ecc_control_id::text, ccc_control_id::text, pdpl_part || '-' || pdpl_article::text));

comment on column public.finding_control_refs.via_requirement_id is
  'For a derived key (NCA CCC): the ECC requirement on the finding that the crosswalk derived it from.';

create or replace function public.sync_finding_control_refs(p_table text, p_row uuid, p_org uuid, p_finding_id text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_conn text := case p_table when 'm365_findings' then 'm365'
                              when 'defender_findings' then 'defender'
                              when 'sharepoint_findings' then 'sharepoint' end;
begin
  if v_conn is null then raise exception 'Unsupported findings table %', p_table; end if;

  delete from finding_control_refs       where source_table = p_table and finding_row_id = p_row;
  delete from finding_control_ref_issues where source_table = p_table and finding_row_id = p_row;

  for r in select * from parse_control_label(p_label) loop
    if r.framework is null then
      insert into finding_control_ref_issues (org_id, source_table, finding_row_id, finding_id, segment, problem)
      values (p_org, p_table, p_row, p_finding_id, r.segment, 'unparsed')
      on conflict do nothing;
    elsif r.framework = 'NCA ECC' and not exists (select 1 from nca_ecc where control_id = r.requirement_id) then
      insert into finding_control_ref_issues (org_id, source_table, finding_row_id, finding_id, segment, problem)
      values (p_org, p_table, p_row, p_finding_id, r.segment, 'unknown_ecc_control')
      on conflict do nothing;
    else
      insert into finding_control_refs
        (org_id, source_table, finding_row_id, connector_id, framework, ecc_control_id, pdpl_part, pdpl_article, position, is_primary)
      values
        (p_org, p_table, p_row, v_conn, r.framework,
         case when r.framework = 'NCA ECC' then r.requirement_id end,
         r.pdpl_part, r.pdpl_article, r.pos, r.pos = 1)
      on conflict on constraint finding_control_refs_unique do nothing;
    end if;
  end loop;

  -- CCC keys derived from the ECC keys just written. The ECC reference stays
  -- the primary key of the finding; the CCC row says which ECC id it came from.
  insert into finding_control_refs
    (org_id, source_table, finding_row_id, connector_id, framework, ccc_control_id, via_requirement_id, position, is_primary)
  select distinct on (x.to_requirement_id)
         p_org, p_table, p_row, v_conn, 'NCA CCC', x.to_requirement_id, k.ecc_control_id,
         (100 + k.position)::smallint, k.is_primary
    from finding_control_refs k
    join framework_crosswalk x
      on x.relation = 'evidence' and x.from_framework = 'NCA ECC' and x.to_framework = 'NCA CCC'
     and x.from_requirement_id = k.ecc_control_id
     and (x.connector_ids is null or v_conn = any (x.connector_ids))
   where k.source_table = p_table and k.finding_row_id = p_row and k.framework = 'NCA ECC'
   order by x.to_requirement_id, k.is_primary desc, k.position
  on conflict on constraint finding_control_refs_unique do nothing;
end
$$;

-- Key the findings already on record.
do $$
declare f record;
begin
  for f in
    select 'm365_findings' t, id, org_id, finding_id, control from m365_findings
    union all select 'defender_findings', id, org_id, finding_id, control from defender_findings
    union all select 'sharepoint_findings', id, org_id, finding_id, control from sharepoint_findings
  loop
    perform sync_finding_control_refs(f.t, f.id, f.org_id, f.finding_id, f.control);
  end loop;
end $$;

-- ── 6. Signals that measure CCC tenant controls ─────────────────────────────
insert into public.signal_requirement_map (signal_key, framework, requirement_id, weight, note)
select v.signal_key, 'NCA CCC', v.requirement_id, 1,
       'Microsoft 365 is a cloud service the tenant uses; this measurement is evidence for the CCC tenant control.'
  from (values
  ('entra.mfa_enforcement', '2-2-T-1-4'),
  ('entra.mfa_registration', '2-2-T-1-4'),
  ('entra.password_policy', '2-2-T-1-5'),
  ('entra.legacy_auth_blocked', '2-2-T-1-5'),
  ('entra.inactive_accounts', '2-2-T-1-1'),
  ('entra.access_review_completion', '2-2-T-1-1'),
  ('entra.privileged_pim', '2-2-T-1-1'),
  ('entra.standing_global_admins', '2-2-T-1-1'),
  ('sharepoint.idle_signout', '2-2-T-1-3'),
  ('defender.audit_logging', '2-11-T-1-1')
  ) as v(signal_key, requirement_id)
 where exists (select 1 from compliance_signals s where s.signal_key = v.signal_key)
   and not exists (select 1 from signal_requirement_map m
                    where m.signal_key = v.signal_key and m.framework = 'NCA CCC'
                      and m.requirement_id = v.requirement_id and m.org_id is null);

-- ── 7. Review calendar ──────────────────────────────────────────────────────
insert into public.periodic_review_requirements (framework, requirement_id, title, default_months)
values
  ('NCA CCC', '2-9-T-1', 'Cloud vulnerabilities assessed and remediated (at least every three months)', 3),
  ('NCA CCC', '2-15-T-4', 'Cloud key management requirements applied and reviewed', 12),
  ('NCA CCC', '2-9-P-1', 'Cloud technology stack vulnerabilities assessed (external monthly, internal quarterly)', 1),
  ('NCA CCC', '2-10-P-1', 'Cloud technology stack penetration tested (at least every six months)', 6),
  ('NCA CCC', '1-5-P-4', 'Cloud change management requirements applied and reviewed', 12),
  ('NCA CCC', '2-15-P-4', 'Cloud key management requirements applied and reviewed', 12),
  ('NCA CCC', '2-16-P-4', 'System development requirements applied and reviewed', 12),
  ('NCA CCC', '2-17-P-4', 'Storage media requirements applied and reviewed', 12)
on conflict (framework, requirement_id) do update set title = excluded.title, default_months = excluded.default_months;

-- CCC review controls appear only for workspaces whose CCC scope includes them.
create or replace view public.v_review_schedule
with (security_invoker = true) as
 with today as (
         select ((now() at time zone 'Asia/Riyadh'::text))::date as d
        ), ev as (
         select distinct on (compliance_evidence.org_id, compliance_evidence.framework, compliance_evidence.requirement_id) compliance_evidence.org_id,
            compliance_evidence.framework,
            compliance_evidence.requirement_id,
            compliance_evidence.answers,
            compliance_evidence.next_review_date,
            compliance_evidence.submitted_at,
            compliance_evidence.submitted_by
           from compliance_evidence
          order by compliance_evidence.org_id, compliance_evidence.framework, compliance_evidence.requirement_id, compliance_evidence.submitted_at desc
        ), dated as (
         select compliance_statuses.org_id,
            compliance_statuses.framework,
            compliance_statuses.requirement_id
           from compliance_statuses
          where (compliance_statuses.review_due_at is not null)
        union
         select ev.org_id,
            ev.framework,
            ev.requirement_id
           from ev
          where (ev.next_review_date is not null)
        ), scope as (
         select o.id as org_id,
            p.framework,
            p.requirement_id,
            p.title,
            p.default_months,
            true as is_review_control
           from (organizations o
             cross join periodic_review_requirements p)
          where p.framework <> 'NCA CCC'
             or exists (select 1 from nca_ccc c
                         where c.control_id = p.requirement_id
                           and (o.ccc_role = 'both' or upper(o.ccc_role) = c.role)
                           and (case o.ccc_level when 1 then c.level_1 when 2 then c.level_2
                                                 when 3 then c.level_3 else c.level_4 end) = 'mandatory')
        union all
         select d.org_id,
            d.framework,
            d.requirement_id,
            null::text as text,
            null::integer as int4,
            false
           from dated d
          where (not (exists ( select 1
                   from periodic_review_requirements p
                  where ((p.framework = d.framework) and (p.requirement_id = d.requirement_id)))))
        ), joined as (
         select s.org_id,
            s.framework,
            s.requirement_id,
            s.title,
            s.default_months,
            s.is_review_control,
            cs.status,
            cs.review_due_at,
            ev.answers,
            ev.next_review_date,
            ev.submitted_at,
            coalesce(cs.review_due_at, ev.next_review_date) as due_date,
                case
                    when ((ev.answers ->> 'owner'::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) then ((ev.answers ->> 'owner'::text))::uuid
                    else null::uuid
                end as owner_candidate,
            ( select (max(x.x))::date as max
                   from unnest(array[(ev.answers ->> 'reviewed_on'::text), (ev.answers ->> 'review_date'::text), (ev.answers ->> 'approved_on'::text)]) x(x)
                  where (x.x ~ '^\d{4}-\d{2}-\d{2}$'::text)) as last_reviewed_on
           from ((scope s
             left join compliance_statuses cs on (((cs.org_id = s.org_id) and (cs.framework = s.framework) and (cs.requirement_id = s.requirement_id))))
             left join ev on (((ev.org_id = s.org_id) and (ev.framework = s.framework) and (ev.requirement_id = s.requirement_id))))
        )
 select j.org_id,
    j.framework,
    j.requirement_id,
    j.is_review_control,
    j.title,
    j.status,
    j.last_reviewed_on,
    nullif((j.answers ->> 'frequency'::text), ''::text) as frequency,
    coalesce(
        case (j.answers ->> 'frequency'::text)
            when 'Monthly'::text then 1
            when 'Quarterly'::text then 3
            when 'Semi-annual'::text then 6
            when 'Annual'::text then 12
            else null::integer
        end, j.default_months) as cycle_months,
        case
            when (exists ( select 1
               from organization_members m
              where ((m.org_id = j.org_id) and (m.user_id = j.owner_candidate)))) then j.owner_candidate
            else null::uuid
        end as owner_id,
    j.due_date,
    (j.due_date - t.d) as days_until_due,
        case
            when ((j.due_date is null) and (j.submitted_at is null)) then 'never_reviewed'::text
            when (j.due_date is null) then 'unscheduled'::text
            when (j.due_date < t.d) then 'overdue'::text
            when (j.due_date <= (t.d + 30)) then 'due_soon'::text
            else 'scheduled'::text
        end as state,
    j.submitted_at as last_submitted_at
   from (joined j
     cross join today t);

-- ── 8. Ask RISYS: CCC lookups; ECC figures stay ECC-only ────────────────────
create or replace function public.ai_tool_framework_search(p_query text, p_limit integer default 10)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb) from (
    select * from (
      select jsonb_build_object(
          'framework', 'NCA ECC', 'requirement', control_id, 'type', control_type,
          'subdomain', subdomain_id || ' ' || subdomain_name, 'text', control_text,
          'link', '/app/compliance/NCA%20ECC/' || control_id) as r,
          (control_id = trim(p_query)) as exact, control_id::text as cid
        from nca_ecc
       where control_id = trim(p_query)
          or control_text ilike '%' || trim(p_query) || '%'
          or control_text_ar ilike '%' || trim(p_query) || '%'
          or subdomain_name ilike '%' || trim(p_query) || '%'
      union all
      select jsonb_build_object(
          'framework', 'NCA CCC', 'requirement', control_id, 'type', control_type,
          'applies_to', case role when 'CST' then 'cloud service tenants' else 'cloud service providers' end,
          'subdomain', subdomain_id || ' ' || subdomain_name, 'text', control_text,
          'extends_ecc', ecc_refs,
          'link', '/app/compliance/NCA%20CCC/' || control_id),
          (control_id = trim(p_query)), control_id::text
        from nca_ccc
       where control_id = trim(p_query)
          or control_text ilike '%' || trim(p_query) || '%'
          or subdomain_name ilike '%' || trim(p_query) || '%'
    ) u
    order by exact desc, cid
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ) s;
$$;

create or replace function public.ai_tool_compliance(p_org uuid, p_requirement text default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare v jsonb; req text := nullif(trim(p_requirement), ''); v_ccc jsonb;
begin
  if not is_org_member(p_org) then return jsonb_build_object('error', 'not a member of this organisation'); end if;

  -- A CCC requirement id carries P (provider) or T (tenant) in its third part.
  if req ~ '^\d+-\d+-[PTpt]-' then
    req := upper(req);
    select jsonb_build_object(
      'framework', 'NCA CCC', 'version', c.version, 'requirement', c.control_id, 'type', c.control_type,
      'applies_to', case c.role when 'CST' then 'cloud service tenants' else 'cloud service providers' end,
      'in_scope_for_this_workspace', s.control_id is not null,
      'applicability_at_workspace_level', s.applicability,
      'domain', c.domain_id || ' ' || c.domain_name, 'subdomain', c.subdomain_id || ' ' || c.subdomain_name,
      'text', c.control_text, 'extends_ecc', c.ecc_refs,
      'link', '/app/compliance/NCA%20CCC/' || c.control_id,
      'manual_status', (select jsonb_build_object('status', cs.status, 'notes', cs.notes,
          'updated_at', cs.updated_at::date, 'review_due', cs.review_due_at)
        from compliance_statuses cs where cs.org_id = p_org and cs.framework = 'NCA CCC' and cs.requirement_id = c.control_id),
      'automated', (select jsonb_build_object('status', va.automated_status, 'pass', va.pass_count, 'fail', va.fail_count,
          'partial', va.partial_count, 'unknown', va.unknown_count, 'computed', va.last_computed_at::date,
          'signals', va.signals)
        from v_requirement_automation va where va.org_id = p_org and va.framework = 'NCA CCC' and va.requirement_id = c.control_id),
      'open_findings', case when ai_can_read_findings(p_org) then (
          select jsonb_build_object('total', vf.open_count, 'critical', vf.open_critical, 'warning', vf.open_warning,
            'info', vf.open_info, 'connectors', vf.connectors)
            from v_requirement_findings vf where vf.org_id = p_org and vf.framework = 'NCA CCC' and vf.requirement_id = c.control_id)
        else to_jsonb('not visible to your role'::text) end,
      'review', (select jsonb_build_object('state', rs.state, 'due', rs.due_date, 'last_reviewed', rs.last_reviewed_on,
          'frequency', rs.frequency)
        from v_review_schedule rs where rs.org_id = p_org and rs.framework = 'NCA CCC' and rs.requirement_id = c.control_id limit 1)
    ) into v
    from nca_ccc c left join ccc_scope(p_org) s on s.control_id = c.control_id
    where c.control_id = req;
    return coalesce(v, jsonb_build_object('error', 'no NCA CCC requirement ' || req));
  end if;

  if req is null then
    select jsonb_build_object('framework', 'NCA ECC', 'domains', coalesce(jsonb_agg(d order by d->>'domain'), '[]'::jsonb)) into v
    from (
      select jsonb_build_object(
        'domain', e.domain_id || ' ' || e.domain_name,
        'requirements', count(*),
        'statuses', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
            select coalesce(cs.status, 'not_assessed') st, count(*) n
              from nca_ecc e2 left join compliance_statuses cs
                on cs.org_id = p_org and cs.framework = 'NCA ECC' and cs.requirement_id = e2.control_id
             where e2.domain_id = e.domain_id group by 1) z),
        'automated', (select coalesce(jsonb_object_agg(a.automated_status, n), '{}'::jsonb) from (
            select va.automated_status, count(*) n from v_requirement_automation va
             where va.org_id = p_org and va.framework = 'NCA ECC' and va.requirement_id like e.domain_id || '-%' group by 1) a)
      ) d
      from nca_ecc e group by e.domain_id, e.domain_name
    ) s;

    -- CCC alongside, when the workspace has a CCC scope.
    select jsonb_build_object(
      'framework', 'NCA CCC', 'version', 'CCC-2:2024',
      'scope', (select jsonb_build_object('role', o.ccc_role, 'level', o.ccc_level) from organizations o where o.id = p_org),
      'main_controls_in_scope', count(*) filter (where sc.control_type = 'Main Control' and sc.applicability <> 'not_applicable'),
      'statuses', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
          select coalesce(cs.status, 'not_assessed') st, count(*) n
            from ccc_scope(p_org) s2
            left join compliance_statuses cs on cs.org_id = p_org and cs.framework = 'NCA CCC' and cs.requirement_id = s2.control_id
           where s2.control_type = 'Main Control' and s2.applicability <> 'not_applicable' group by 1) z))
      into v_ccc
      from ccc_scope(p_org) sc
     having count(*) > 0;
    if v_ccc is not null then v := v || jsonb_build_object('ccc', v_ccc); end if;
    return v;
  end if;

  select jsonb_build_object(
    'framework', 'NCA ECC', 'requirement', e.control_id, 'type', e.control_type,
    'domain', e.domain_id || ' ' || e.domain_name, 'subdomain', e.subdomain_id || ' ' || e.subdomain_name,
    'text', e.control_text, 'text_ar', e.control_text_ar,
    'link', '/app/compliance/NCA%20ECC/' || e.control_id,
    'extended_by_ccc', (select coalesce(jsonb_agg(x.from_requirement_id order by x.from_requirement_id), '[]'::jsonb)
        from framework_crosswalk x where x.relation = 'extends' and x.to_framework = 'NCA ECC' and x.to_requirement_id = e.control_id),
    'manual_status', (select jsonb_build_object('status', cs.status, 'notes', cs.notes,
        'updated_at', cs.updated_at::date, 'review_due', cs.review_due_at)
      from compliance_statuses cs where cs.org_id = p_org and cs.framework = 'NCA ECC' and cs.requirement_id = e.control_id),
    'automated', (select jsonb_build_object('status', va.automated_status, 'pass', va.pass_count, 'fail', va.fail_count,
        'partial', va.partial_count, 'unknown', va.unknown_count, 'computed', va.last_computed_at::date,
        'signals', va.signals)
      from v_requirement_automation va where va.org_id = p_org and va.framework = 'NCA ECC' and va.requirement_id = e.control_id),
    'open_findings', case when ai_can_read_findings(p_org) then (
        select jsonb_build_object('total', vf.open_count, 'critical', vf.open_critical, 'warning', vf.open_warning,
          'info', vf.open_info, 'connectors', vf.connectors)
          from v_requirement_findings vf where vf.org_id = p_org and vf.framework = 'NCA ECC' and vf.requirement_id = e.control_id)
      else to_jsonb('not visible to your role'::text) end,
    'review', (select jsonb_build_object('state', rs.state, 'due', rs.due_date, 'last_reviewed', rs.last_reviewed_on,
        'frequency', rs.frequency)
      from v_review_schedule rs where rs.org_id = p_org and rs.framework = 'NCA ECC' and rs.requirement_id = e.control_id limit 1)
  ) into v
  from nca_ecc e where e.control_id = req;
  return coalesce(v, jsonb_build_object('error', 'no NCA ECC requirement ' || req));
end
$$;

create or replace function public.ai_tool_overview(p_org uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $function$
declare v jsonb;
begin
  if not is_org_member(p_org) then return jsonb_build_object('error', 'not a member of this organisation'); end if;
  select jsonb_build_object(
    'as_of', now(),
    'risks_open', (select count(*) from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed'),
    'risk_levels_note', 'inherent = before controls (what the dashboard shows); current = after controls (residual if scored, otherwise inherent)',
    'open_risks_by_inherent_band', (select coalesce(jsonb_object_agg(coalesce(b, 'not_scored'), n), '{}'::jsonb) from (
        select ai_band(p_org, inherent_likelihood, inherent_impact) b, count(*) n
          from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed' group by 1) r),
    'open_risks_by_current_band', (select coalesce(jsonb_object_agg(coalesce(b, 'not_scored'), n), '{}'::jsonb) from (
        select ai_band(p_org, coalesce(residual_likelihood, inherent_likelihood), coalesce(residual_impact, inherent_impact)) b, count(*) n
          from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed' group by 1) r),
    'risks_by_state', (select coalesce(jsonb_object_agg(coalesce(workflow_state, 'draft'), n), '{}'::jsonb) from (
        select workflow_state, count(*) n from risks where org_id = p_org group by 1) w),
    'risks_outside_tolerance', (select count(*) from risks where org_id = p_org and tolerance_status in ('breached', 'outside') and coalesce(workflow_state,'draft') <> 'closed'),
    'suggested_risks_pending', (select count(*) from risk_suggestions where org_id = p_org and status = 'pending'),
    'tasks_open', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled')),
    'tasks_overdue', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled') and due_at < now()),
    'tasks_without_due_date', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled') and due_at is null),
    'incidents_open', (select count(*) from incidents where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed')),
    'incidents_open_by_status', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
        select coalesce(status, 'open') st, count(*) n from incidents
         where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed') group by 1) s),
    'incidents_open_note', 'incidents_open counts every unresolved incident, including in_progress; the dashboard tile counts status open only',
    'incidents_past_sla', (select count(*) from incidents where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed')
                             and ai_incident_deadline(severity, created_at, due_at) < now()),
    'compliance_nca_ecc', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from compliance_statuses where org_id = p_org and framework = 'NCA ECC' group by status) s),
    'automated_requirements', (select coalesce(jsonb_object_agg(automated_status, n), '{}'::jsonb)
        from (select automated_status, count(*) n from v_requirement_automation where org_id = p_org and framework = 'NCA ECC' group by automated_status) a),
    'ccc_scope', (select case when o.ccc_role is null then to_jsonb('NCA CCC is not in scope for this workspace'::text)
                              else jsonb_build_object('role', o.ccc_role, 'level', o.ccc_level, 'version', 'CCC-2:2024') end
                    from organizations o where o.id = p_org),
    'compliance_nca_ccc', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from compliance_statuses where org_id = p_org and framework = 'NCA CCC' group by status) s),
    'automated_requirements_ccc', (select coalesce(jsonb_object_agg(automated_status, n), '{}'::jsonb)
        from (select a.automated_status, count(*) n from v_requirement_automation a
               join ccc_scope(p_org) s on s.control_id = a.requirement_id
              where a.org_id = p_org and a.framework = 'NCA CCC' group by a.automated_status) a),
    'open_findings', case when ai_can_read_findings(p_org) then (
        select coalesce(jsonb_object_agg(severity, n), '{}'::jsonb) from (
          select severity, count(*) n from (
            select severity from m365_findings where org_id = p_org and status = 'open'
            union all select severity from defender_findings where org_id = p_org and status = 'open'
            union all select severity from sharepoint_findings where org_id = p_org and status = 'open') f
          group by severity) g)
      else to_jsonb('not visible to your role'::text) end
  ) into v;
  return v;
end $function$;

