-- ── Unified requirement list ───────────────────────────────────────────────
-- Only NCA ECC is in scope today. Add further frameworks with UNION ALL here
-- and nothing downstream changes.
create or replace view framework_requirements_v as
select
  'NCA ECC'::text          as framework,
  control_id::text         as requirement_id,
  control_type::text       as requirement_type,
  control_text::text       as requirement_text,
  domain_id::text          as domain_id,
  domain_name::text        as domain_name,
  subdomain_id::text       as subdomain_id,
  subdomain_name::text     as subdomain_name,
  -- parent is the id with the final segment stripped; null for top-level
  case
    when control_id ~ '^[0-9]+(-[0-9]+){3,}$'
      then regexp_replace(control_id, '-[0-9]+$', '')
    else null
  end                      as parent_requirement_id
from nca_ecc;

comment on view framework_requirements_v is
  'Framework-agnostic view of requirements. Parent is derived from the dotted id, so subcontrol rollup needs no extra column.';

-- ── Automated status per requirement, per org ──────────────────────────────
create or replace view v_requirement_automation as
with resolved_map as (
  -- org override wins over the platform default for the same signal+requirement
  select distinct on (m.signal_key, m.framework, m.requirement_id, o.id)
    o.id as org_id, m.signal_key, m.framework, m.requirement_id, m.weight
  from signal_requirement_map m
  cross join organizations o
  where m.org_id is null or m.org_id = o.id
  order by m.signal_key, m.framework, m.requirement_id, o.id, m.org_id nulls last
),
scoped as (
  -- a signal counts toward a requirement directly, or toward its ancestors
  select r.org_id, r.framework, r.requirement_id, r.signal_key, r.weight, true as is_direct
  from resolved_map r
  union all
  select r.org_id, r.framework, fr.parent_requirement_id, r.signal_key, r.weight, false
  from resolved_map r
  join framework_requirements_v fr
    on fr.framework = r.framework and fr.requirement_id = r.requirement_id
  where fr.parent_requirement_id is not null
),
joined as (
  select
    s.org_id, s.framework, s.requirement_id, s.signal_key, s.weight, s.is_direct,
    coalesce(res.status, 'unknown') as status,
    res.value, res.summary, res.computed_at,
    cs.name as signal_name, cs.connector_id, cs.requires_license
  from scoped s
  join compliance_signals cs on cs.signal_key = s.signal_key and cs.is_active
  left join org_signal_results res
    on res.org_id = s.org_id and res.signal_key = s.signal_key
)
select
  org_id,
  framework,
  requirement_id,
  count(*)                                              as signal_count,
  count(*) filter (where status = 'pass')                as pass_count,
  count(*) filter (where status = 'fail')                as fail_count,
  count(*) filter (where status = 'partial')             as partial_count,
  count(*) filter (where status = 'unknown')             as unknown_count,
  count(*) filter (where status = 'not_applicable')      as na_count,
  max(computed_at)                                       as last_computed_at,
  case
    when count(*) filter (where status <> 'not_applicable') = 0 then 'not_applicable'
    when count(*) filter (where status in ('pass','fail','partial')) = 0 then 'not_started'
    when count(*) filter (where status in ('fail','partial','unknown')) = 0 then 'compliant'
    when count(*) filter (where status = 'pass') = 0
         and count(*) filter (where status = 'partial') = 0 then 'not_compliant'
    else 'partial'
  end                                                    as automated_status,
  jsonb_agg(
    jsonb_build_object(
      'signal_key', signal_key,
      'name',       signal_name,
      'connector',  connector_id,
      'status',     status,
      'value',      value,
      'summary',    summary,
      'direct',     is_direct,
      'requires_license', requires_license
    ) order by is_direct desc, signal_key
  )                                                      as signals
from joined
group by org_id, framework, requirement_id;

comment on view v_requirement_automation is
  'Per-org automated status for every requirement that has at least one mapped signal, including signals mapped to its subcontrols. This is what the compliance scorer reads instead of the old free-text control string.';
;
