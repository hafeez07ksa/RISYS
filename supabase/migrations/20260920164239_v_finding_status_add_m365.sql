create or replace view public.v_finding_status as
  select org_id, 'defender:'   || finding_id as finding_key, status, resolved_at, last_seen_at from defender_findings
  union all
  select org_id, 'sharepoint:' || finding_id as finding_key, status, resolved_at, last_seen_at from sharepoint_findings
  union all
  select org_id, 'm365:'       || finding_id as finding_key, status, resolved_at, last_seen_at from m365_findings;;
