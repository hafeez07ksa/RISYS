-- NCA ECC status: every requirement, its recorded status, what automation
-- says, the controls mapped to it, evidence on file, and open issues that
-- cite it — from audits and from connector findings.
create or replace function public.report_ecc_status_data(p_org uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare v jsonb;
begin
  if not is_org_member(p_org) then raise exception 'You do not have access to this organisation'; end if;

  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'industry', o.industry) from organizations o where o.id = p_org),
    'generated_at', now(),
    'framework', jsonb_build_object('id', 'NCA ECC', 'name', 'Essential Cybersecurity Controls', 'version', 'ECC-2:2024'),
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
          'req', fr.requirement_id, 'type', fr.requirement_type, 'text', fr.requirement_text,
          'parent', fr.parent_requirement_id,
          'domain', fr.domain_id, 'domain_name', fr.domain_name,
          'subdomain', fr.subdomain_id, 'subdomain_name', fr.subdomain_name,
          'status', cs.status, 'notes', cs.notes, 'review_due_at', cs.review_due_at, 'updated_at', cs.updated_at,
          'auto_status', a.automated_status, 'auto_pass', a.pass_count, 'auto_fail', a.fail_count,
          'auto_unknown', a.unknown_count, 'signals', a.signals,
          'controls', (select coalesce(jsonb_agg(jsonb_build_object('ref', rc.control_id, 'name', rc.name,
                                                                    'testing', rc.testing_status, 'effectiveness', rc.effectiveness)), '[]'::jsonb)
                         from control_framework_mappings m join risk_controls rc on rc.id = m.control_id
                        where m.org_id = p_org and m.framework = 'NCA ECC' and m.requirement_id = fr.requirement_id),
          'evidence', (select count(*) from compliance_evidence ce
                        where ce.org_id = p_org and ce.framework = 'NCA ECC' and ce.requirement_id = fr.requirement_id),
          'audit_findings', (select count(*) from audit_findings af
                              where af.org_id = p_org and af.requirement_id = fr.requirement_id
                                and af.status in ('open','in_remediation','ready_for_validation')),
          'connector_findings',
            (select count(*) from defender_findings f where f.org_id = p_org and f.status = 'open'
                and f.control like '%NCA ECC ' || fr.requirement_id || ' %')
          + (select count(*) from sharepoint_findings f where f.org_id = p_org and f.status = 'open'
                and f.control like '%NCA ECC ' || fr.requirement_id || ' %')
          + (select count(*) from m365_findings f where f.org_id = p_org and f.status = 'open'
                and f.control like '%NCA ECC ' || fr.requirement_id || ' %'))
        order by string_to_array(fr.requirement_id, '-')::int[])
      from framework_requirements_v fr
      left join compliance_statuses cs on cs.org_id = p_org and cs.framework = fr.framework and cs.requirement_id = fr.requirement_id
      left join v_requirement_automation a on a.org_id = p_org and a.framework = fr.framework and a.requirement_id = fr.requirement_id
      where fr.framework = 'NCA ECC'), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- One audit engagement, everything its report needs.
create or replace function public.report_audit_data(p_engagement uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare v jsonb; v_org uuid;
begin
  select org_id into v_org from audit_engagements where id = p_engagement;
  if v_org is null or not is_org_member(v_org) then raise exception 'Audit engagement not found'; end if;

  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name) from organizations o where o.id = v_org),
    'generated_at', now(),
    'engagement', (select to_jsonb(e) || jsonb_build_object('lead_auditor', coalesce(p.full_name, p.email))
                     from audit_engagements e left join profiles p on p.id = e.lead_auditor_id where e.id = p_engagement),
    'scope', coalesce((
      select jsonb_agg(to_jsonb(s) || jsonb_build_object(
                'tester', coalesce(pt.full_name, pt.email), 'reviewer', coalesce(pr.full_name, pr.email),
                'requirement_text', fr.requirement_text,
                'control_ref', rc.control_id, 'control_name', rc.name)
             order by s.sort_order, s.created_at)
      from audit_scope_items s
      left join profiles pt on pt.id = s.tested_by
      left join profiles pr on pr.id = s.reviewed_by
      left join framework_requirements_v fr on fr.framework = s.framework and fr.requirement_id = s.requirement_id
      left join risk_controls rc on rc.id = s.control_id
      where s.engagement_id = p_engagement), '[]'::jsonb),
    'requests', jsonb_build_object(
      'total',    (select count(*) from audit_evidence_requests where engagement_id = p_engagement),
      'accepted', (select count(*) from audit_evidence_requests where engagement_id = p_engagement and status = 'accepted'),
      'open',     (select count(*) from audit_evidence_requests where engagement_id = p_engagement and status in ('open','rejected')),
      'overdue',  (select count(*) from audit_evidence_requests where engagement_id = p_engagement
                     and status in ('open','rejected') and due_date < current_date)),
    'evidence_files', (select count(*) from audit_evidence_files where engagement_id = p_engagement),
    'findings', coalesce((
      select jsonb_agg(to_jsonb(f) || jsonb_build_object('owner', coalesce(p.full_name, p.email),
                                                          'risk_ref', r.risk_id)
             order by case f.rating when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end, f.ref)
      from audit_findings f
      left join profiles p on p.id = f.response_owner
      left join risks r on r.id = f.risk_id
      where f.engagement_id = p_engagement and f.status <> 'draft'), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke execute on function public.report_ecc_status_data(uuid) from public, anon;
revoke execute on function public.report_audit_data(uuid) from public, anon;
grant execute on function public.report_ecc_status_data(uuid) to authenticated;
grant execute on function public.report_audit_data(uuid) to authenticated;;
