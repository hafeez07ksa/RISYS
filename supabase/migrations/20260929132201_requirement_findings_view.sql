-- ── Findings per framework requirement ───────────────────────────────────────
--
-- Rolls the keyed findings up to each requirement, the same way
-- v_requirement_automation rolls signals up: a finding on a subcontrol
-- (2-2-3-2) also counts on its main control (2-2-3), marked as not direct.
--
-- Product rule (29 Sep 2026): a finding is evidence of a gap, not a verdict.
-- Open findings never change the automated status; they are shown alongside it
-- as a warning (needs_attention), so a requirement can read "Compliant" from
-- its signals while still telling the assessor what is open against it.
--
-- security_invoker: the caller's RLS on the findings tables and on
-- finding_control_refs decides what is visible.

create or replace view public.v_requirement_findings
with (security_invoker = true) as
with f as (
  select 'm365_findings'::text as source_table, 'm365'::text as connector_id,
         id, finding_id, title, severity, status, category, last_seen_at
    from public.m365_findings
  union all
  select 'defender_findings', 'defender', id, finding_id, title, severity, status, category, last_seen_at
    from public.defender_findings
  union all
  select 'sharepoint_findings', 'sharepoint', id, finding_id, title, severity, status, category, last_seen_at
    from public.sharepoint_findings
),
linked as (
  select r.org_id, r.framework, r.requirement_id, r.is_primary, true as is_direct,
         f.source_table, f.connector_id, f.id, f.finding_id, f.title, f.severity, f.status, f.category, f.last_seen_at
    from public.finding_control_refs r
    join f on f.source_table = r.source_table and f.id = r.finding_row_id
  union all
  select r.org_id, r.framework, fr.parent_requirement_id, r.is_primary, false,
         f.source_table, f.connector_id, f.id, f.finding_id, f.title, f.severity, f.status, f.category, f.last_seen_at
    from public.finding_control_refs r
    join f on f.source_table = r.source_table and f.id = r.finding_row_id
    join public.framework_requirements_v fr
      on fr.framework = r.framework and fr.requirement_id = r.requirement_id
   where fr.parent_requirement_id is not null
),
-- A finding keyed to two subcontrols of the same parent reaches the parent twice;
-- count it once, preferring the direct link.
one as (
  select distinct on (org_id, framework, requirement_id, source_table, id) *
    from linked
   order by org_id, framework, requirement_id, source_table, id, is_direct desc, is_primary desc
)
select
  org_id,
  framework,
  requirement_id,
  count(*) filter (where status = 'open')                                   as open_count,
  count(*) filter (where status = 'open' and severity = 'critical')         as open_critical,
  count(*) filter (where status = 'open' and severity = 'warning')          as open_warning,
  count(*) filter (where status = 'open' and severity = 'info')             as open_info,
  count(*) filter (where status = 'open' and is_direct and is_primary)      as open_primary,
  count(*) filter (where status = 'resolved')                               as resolved_count,
  (count(*) filter (where status = 'open' and severity in ('critical', 'warning')) > 0) as needs_attention,
  max(last_seen_at) filter (where status = 'open')                          as last_seen_at,
  coalesce(array_agg(distinct connector_id) filter (where status = 'open'), '{}') as connectors,
  coalesce(jsonb_agg(jsonb_build_object(
      'connector',  connector_id,
      'finding_id', finding_id,
      'title',      title,
      'severity',   severity,
      'category',   category,
      'primary',    is_primary,
      'direct',     is_direct,
      'last_seen_at', last_seen_at)
    order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
             is_direct desc, last_seen_at desc)
    filter (where status = 'open'), '[]'::jsonb)                            as findings
from one
group by org_id, framework, requirement_id;

grant select on public.v_requirement_findings to authenticated;
revoke all on public.v_requirement_findings from anon;
