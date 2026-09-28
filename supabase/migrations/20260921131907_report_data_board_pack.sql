-- Report data functions. SECURITY INVOKER on purpose: they read with the
-- caller's own RLS, so a report can never contain a row the person
-- generating it could not already see. One statement per report means one
-- consistent point-in-time read, not twenty queries drifting apart.

create or replace function public.report_board_pack_data(p_org uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare v jsonb;
begin
  if not is_org_member(p_org) then raise exception 'You do not have access to this organisation'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'A valid reporting period is required'; end if;

  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'industry', o.industry) from organizations o where o.id = p_org),
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'generated_at', now(),

    'matrix', (select jsonb_build_object('cells', m.cells, 'dimensions', m.dimensions)
                 from risk_matrix_config m where m.org_id = p_org and m.is_active order by m.version desc limit 1),

    'risks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'ref', r.risk_id, 'title', r.title, 'category', r.category,
        'workflow_state', r.workflow_state, 'tolerance_status', r.tolerance_status,
        'il', r.inherent_likelihood, 'ii', r.inherent_impact, 'inherent', r.inherent_score,
        'rl', r.residual_likelihood, 'ri', r.residual_impact, 'residual', r.residual_score,
        'owner', coalesce(p.full_name, p.email), 'treatment', r.treatment,
        'breach_since', r.breach_since, 'treatment_due_at', r.treatment_due_at,
        'created_at', r.created_at, 'closed_at', r.closed_at)
        order by r.residual_score desc nulls last, r.inherent_score desc nulls last)
      from risks r left join profiles p on p.id = r.owner_id
      where r.org_id = p_org and coalesce(r.workflow_state, 'draft') not in ('draft', 'closed')), '[]'::jsonb),

    'risk_movement', jsonb_build_object(
      'opened', (select count(*) from risks where org_id = p_org and created_at::date between p_start and p_end and coalesce(workflow_state,'draft') <> 'draft'),
      'closed', (select count(*) from risks where org_id = p_org and closed_at::date between p_start and p_end),
      'drafts', (select count(*) from risks where org_id = p_org and coalesce(workflow_state,'draft') = 'draft')),

    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ref', e.exception_ref, 'risk_ref', r.risk_id, 'risk_title', r.title, 'status', e.status,
        'expires_at', e.expires_at, 'authority', e.decided_authority, 'band', e.band_at_request)
        order by e.expires_at nulls last)
      from risk_exceptions e join risks r on r.id = e.risk_id
      where e.org_id = p_org and e.status in ('approved', 'active', 'granted')), '[]'::jsonb),

    'treatment_plans', jsonb_build_object(
      'total',   (select count(*) from risk_treatment_plans where org_id = p_org and status not in ('completed','cancelled','rejected')),
      'overdue', (select count(*) from risk_treatment_plans where org_id = p_org and status not in ('completed','cancelled','rejected') and due_date < current_date)),

    'ecc', jsonb_build_object(
      'main_controls', (select count(*) from framework_requirements_v where framework = 'NCA ECC' and parent_requirement_id is null and requirement_type ilike 'main%'),
      'statuses', coalesce((
        select jsonb_agg(jsonb_build_object('req', cs.requirement_id, 'status', cs.status, 'review_due_at', cs.review_due_at,
                                            'domain', fr.domain_id, 'domain_name', fr.domain_name))
        from compliance_statuses cs
        left join framework_requirements_v fr on fr.framework = cs.framework and fr.requirement_id = cs.requirement_id
        where cs.org_id = p_org and cs.framework = 'NCA ECC'), '[]'::jsonb),
      'automation', coalesce((
        select jsonb_agg(jsonb_build_object('req', a.requirement_id, 'status', a.automated_status,
                                            'pass', a.pass_count, 'fail', a.fail_count, 'unknown', a.unknown_count))
        from v_requirement_automation a where a.org_id = p_org and a.framework = 'NCA ECC'), '[]'::jsonb),
      'domains', coalesce((
        select jsonb_agg(distinct jsonb_build_object('id', domain_id, 'name', domain_name))
        from framework_requirements_v where framework = 'NCA ECC' and domain_id is not null), '[]'::jsonb)),

    'signals', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.signal_key, 'name', cs.name, 'status', s.status,
                                          'num', s.numerator, 'den', s.denominator, 'summary', s.summary)
                       order by s.status, s.signal_key)
      from org_signal_results s join compliance_signals cs on cs.signal_key = s.signal_key
      where s.org_id = p_org), '[]'::jsonb),

    'incidents', jsonb_build_object(
      'in_period', coalesce((select jsonb_object_agg(sev, n) from (
          select coalesce(severity,'unknown') sev, count(*) n from incidents
           where org_id = p_org and created_at::date between p_start and p_end group by 1) x), '{}'::jsonb),
      'open', coalesce((select jsonb_object_agg(sev, n) from (
          select coalesce(severity,'unknown') sev, count(*) n from incidents
           where org_id = p_org and resolved_at is null and coalesce(status,'open') not in ('resolved','closed') group by 1) x), '{}'::jsonb),
      'resolved_in_period', (select count(*) from incidents where org_id = p_org and resolved_at::date between p_start and p_end),
      'sla_breached_in_period', (select count(*) from incidents where org_id = p_org and resolved_at::date between p_start and p_end and sla_breached),
      'mean_hours_to_resolve', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1)
                                  from incidents where org_id = p_org and resolved_at::date between p_start and p_end)),

    'connector_findings', coalesce((select jsonb_agg(x) from (
        select 'Microsoft Defender' as connector, severity, count(*) n from defender_findings where org_id = p_org and status = 'open' group by severity
        union all
        select 'SharePoint', severity, count(*) from sharepoint_findings where org_id = p_org and status = 'open' group by severity
        union all
        select 'Microsoft 365', severity, count(*) from m365_findings where org_id = p_org and status = 'open' group by severity) x), '[]'::jsonb),

    'audit', jsonb_build_object(
      'open_findings', coalesce((select jsonb_object_agg(rating, n) from (
          select rating, count(*) n from audit_findings
           where org_id = p_org and status in ('open','in_remediation','ready_for_validation') group by rating) x), '{}'::jsonb),
      'overdue_findings', (select count(*) from audit_findings where org_id = p_org
                            and status in ('open','in_remediation','ready_for_validation') and due_date < current_date),
      'engagements', coalesce((
        select jsonb_agg(jsonb_build_object('ref', ref, 'title', title, 'type', audit_type, 'status', status, 'opinion', opinion)
                         order by planned_start nulls last)
        from audit_engagements
        where org_id = p_org and status <> 'cancelled'
          and (coalesce(planned_start, created_at::date) <= p_end)
          and (closed_at is null or closed_at::date >= p_start)), '[]'::jsonb))
  ) into v;
  return v;
end $$;

revoke execute on function public.report_board_pack_data(uuid, date, date) from public, anon;
grant execute on function public.report_board_pack_data(uuid, date, date) to authenticated;;
