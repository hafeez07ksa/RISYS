
INSERT INTO compliance_statuses (org_id,framework,requirement_id,status,notes,updated_by,updated_at) VALUES
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','1-1-1','compliant','Cybersecurity strategy documented and approved by CISO.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'30 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','1-1-2','in_progress','Action plan drafted, awaiting board approval next quarter.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'20 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','1-2-1','compliant','Cybersecurity department established, independent from IT.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'30 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','1-3-1','partial','Roles defined but training not completed for 3 of 8 staff.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'15 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','2-1-1','in_progress','Identity lifecycle documented. Automated deprovisioning not yet implemented.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'10 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','2-1-3','not_compliant','Privileged accounts without MFA. PIM not implemented.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'1 day'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','2-3-1','compliant','Network segmentation in place. DMZ with firewall rules reviewed quarterly.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'25 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','3-1-1','partial','Asset inventory exists but not automated. Last manual update 45 days ago.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'5 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','4-1-1','not_compliant','No formal incident response plan. Handling is ad hoc.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'2 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','NCA ECC','4-2-1','in_progress','Logging on 70% of systems. SIEM procurement in progress.','34d3a1e6-c7a3-4934-82d6-bb8c3876c096',now()-'8 days'::interval)
ON CONFLICT (org_id,framework,requirement_id) DO UPDATE
  SET status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at;

INSERT INTO audit_log (org_id,actor_id,actor_name,action,entity_type,entity_id,entity_title,meta,created_at) VALUES
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.created','risk','68e44673-dce7-4b45-8363-578cb8a8241e','Privileged Accounts Without MFA Enforcement','{"score":25}'::jsonb,now()-'3 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.created','risk','2ab41c47-46c6-401d-a479-4a1417663490','Lack of Data Classification Policy','{"score":12}'::jsonb,now()-'5 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.created','risk','cb564459-27c1-4fd5-ab75-e42f39a8dc08','Third-Party Vendor Access Not Reviewed','{"score":9}'::jsonb,now()-'8 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.created','risk','cbd66c6f-6627-4816-ad01-2d55a41e2ebc','No Incident Response Plan Documented','{"score":10}'::jsonb,now()-'12 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.created','risk','c0dabdd6-2864-4b00-9899-e89932580949','Outdated Endpoint Protection on Workstations','{"score":12}'::jsonb,now()-'2 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','risk.submitted_for_review','risk','cbd66c6f-6627-4816-ad01-2d55a41e2ebc','No Incident Response Plan Documented','{}'::jsonb,now()-'10 days'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','task.created','task',null,'Enable MFA for all 6 Entra ID users','{"priority":"critical"}'::jsonb,now()-'1 day'::interval),
('dd75cb72-ada6-4b96-9833-fbece1173573','34d3a1e6-c7a3-4934-82d6-bb8c3876c096','Hafeez','task.created','task',null,'Revoke Global Admin from Faisal Khan','{"priority":"high"}'::jsonb,now()-'2 days'::interval);
;
