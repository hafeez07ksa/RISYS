-- ============================================================================
-- Framework status reports for NCA CCC and SDAIA PDPL
--
-- The NCA ECC status report (report_ecc_status_data) now has siblings for the
-- other implemented frameworks. One reader serves both: the requirements in
-- the workspace's scope (ccc_scope / pdpl_scope), each with its recorded
-- status, the automated measurement, mapped controls, evidence on record and
-- open issues — audit findings raised against it and connector findings keyed
-- to it (v_requirement_findings, which includes the keys derived through the
-- ECC crosswalk).
--
-- SECURITY INVOKER: a report holds only what the person generating it can
-- read. report_runs accepts the two new report types.
-- ============================================================================

create or replace function public.report_framework_status_data(p_org uuid, p_framework text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare v jsonb; v_scope jsonb;
begin
  if not is_org_member(p_org) then raise exception 'You do not have access to this organisation'; end if;
  if p_framework not in ('NCA CCC', 'SDAIA PDPL') then
    raise exception 'No status report for framework %', p_framework;
  end if;

  if p_framework = 'NCA CCC' then
    select jsonb_build_object('role', o.ccc_role, 'level', o.ccc_level) into v_scope
      from organizations o where o.id = p_org and o.ccc_role is not null;
  else
    select o.pdpl_profile into v_scope from organizations o where o.id = p_org and o.pdpl_profile is not null;
  end if;
  if v_scope is null then
    raise exception '% is not in scope for this workspace. A workspace administrator sets the scope in Settings → Organization.', p_framework;
  end if;

  with scope as (
    select control_id, applicability from ccc_scope(p_org) where p_framework = 'NCA CCC'
    union all
    select control_id, applicability from pdpl_scope(p_org) where p_framework = 'SDAIA PDPL'
  )
  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'industry', o.industry) from organizations o where o.id = p_org),
    'generated_at', now(),
    'framework', case p_framework
      when 'NCA CCC' then jsonb_build_object('id', 'NCA CCC', 'name', 'Cloud Cybersecurity Controls', 'version', 'CCC-2:2024',
                                             'authority', 'National Cybersecurity Authority')
      else jsonb_build_object('id', 'SDAIA PDPL', 'name', 'Personal Data Protection Law, its Implementing Regulation and the Transfer Regulation',
                              'version', 'PDPL 2023 · IR · TR', 'authority', 'Saudi Data and AI Authority') end,
    'scope', v_scope,
    'requirements', coalesce(jsonb_agg(jsonb_build_object(
        'req', fr.requirement_id, 'type', fr.requirement_type, 'text', fr.requirement_text,
        'parent', fr.parent_requirement_id,
        'domain', fr.domain_id, 'domain_name', fr.domain_name,
        'subdomain', fr.subdomain_id, 'subdomain_name', fr.subdomain_name,
        'applicability', s.applicability,
        'law_refs', (select d.law_refs from sdaia_pdpl d where p_framework = 'SDAIA PDPL' and d.control_id = fr.requirement_id),
        'status', cs.status, 'notes', cs.notes, 'review_due_at', cs.review_due_at, 'updated_at', cs.updated_at,
        'auto_status', a.automated_status, 'auto_pass', a.pass_count, 'auto_fail', a.fail_count,
        'auto_unknown', a.unknown_count, 'signals', a.signals,
        'controls', (select coalesce(jsonb_agg(jsonb_build_object('ref', rc.control_id, 'name', rc.name,
                                                                  'testing', rc.testing_status, 'effectiveness', rc.effectiveness)), '[]'::jsonb)
                       from control_framework_mappings m join risk_controls rc on rc.id = m.control_id
                      where m.org_id = p_org and m.framework = p_framework and m.requirement_id = fr.requirement_id),
        'evidence', (select count(*) from compliance_evidence ce
                      where ce.org_id = p_org and ce.framework = p_framework and ce.requirement_id = fr.requirement_id)
                  + (select count(*) from evidence_links el
                      where el.org_id = p_org and el.framework = p_framework and el.requirement_id = fr.requirement_id),
        'audit_findings', (select count(*) from audit_findings af
                            where af.org_id = p_org and af.framework = p_framework and af.requirement_id = fr.requirement_id
                              and af.status in ('open', 'in_remediation', 'ready_for_validation')),
        'connector_findings', coalesce(vf.open_count, 0),
        'connector_critical', coalesce(vf.open_critical, 0))
      order by fr.requirement_id), '[]'::jsonb)
  ) into v
  from framework_requirements_v fr
  join scope s on s.control_id = fr.requirement_id
  left join compliance_statuses cs on cs.org_id = p_org and cs.framework = fr.framework and cs.requirement_id = fr.requirement_id
  left join v_requirement_automation a on a.org_id = p_org and a.framework = fr.framework and a.requirement_id = fr.requirement_id
  left join v_requirement_findings vf on vf.org_id = p_org and vf.framework = fr.framework and vf.requirement_id = fr.requirement_id
  where fr.framework = p_framework;
  return v;
end $$;

revoke all on function public.report_framework_status_data(uuid, text) from public, anon;
grant execute on function public.report_framework_status_data(uuid, text) to authenticated;

alter table public.report_runs drop constraint if exists report_runs_report_type_check;
alter table public.report_runs add constraint report_runs_report_type_check
  check (report_type in ('board_pack', 'ecc_status', 'ccc_status', 'pdpl_status', 'audit_report'));
