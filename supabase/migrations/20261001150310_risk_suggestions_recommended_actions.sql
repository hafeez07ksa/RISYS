-- ── Recommended actions on approved risks ────────────────────────────────────
--
-- A risk approved from a suggestion keeps what RISYS found as its list of
-- recommended actions:
--   • risk_suggestions.evidence_at_approval — the evidence at the moment it was
--     approved (the baseline);
--   • risk_suggestions.evidence — kept current by every refresh, also for
--     approved suggestions, so an action shows as done once its finding or
--     measurement is fixed, and new problems in the area appear as new actions;
--   • each finding now carries its recommendation and link; each failing
--     measurement carries what passing looks like.
-- People who can read the risk can read the suggestion behind it.

alter table public.risk_suggestions add column if not exists evidence_at_approval jsonb;

drop policy if exists "risk readers read the suggestion behind it" on public.risk_suggestions;
create policy "risk readers read the suggestion behind it" on public.risk_suggestions
  for select to authenticated
  using (risk_id is not null and exists (select 1 from public.risks r where r.id = risk_suggestions.risk_id));

create or replace function public.refresh_risk_suggestions(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  a        record;
  t        record;
  s        record;
  v_new    int := 0;
  v_upd    int := 0;
  v_ret    int := 0;
  v_l      int;
  v_cause  text;
  v_desc   text;
  v_title  text;
  v_dup    uuid;
  v_conn   text;
  v_ev     jsonb;
begin
  if p_org is null then raise exception 'org_id is required'; end if;

  -- Evidence, held in a variable rather than a temp table: a temp table
  -- inside a function breaks on pooled connections after its first use.
  select coalesce(jsonb_agg(x), '[]') into v_ev from (
    -- Open critical/warning findings, by their primary ECC requirement.
    select split_part(k.requirement_id, '-', 1) || '-' || split_part(k.requirement_id, '-', 2) as area,
           k.requirement_id as ctrl, 'finding' as kind, k.connector_id as connector, f.finding_id as ref,
           f.title, f.severity, coalesce(f.first_seen_at, f.created_at) as seen,
           nullif(f.recommendation, '') as recommendation, nullif(f.source_url, '') as url
      from finding_control_refs k
      join (
        select 'm365_findings'::text src, id, finding_id, title, severity, status, first_seen_at, created_at, recommendation, source_url from m365_findings
        union all select 'defender_findings', id, finding_id, title, severity, status, first_seen_at, created_at, recommendation, source_url from defender_findings
        union all select 'sharepoint_findings', id, finding_id, title, severity, status, first_seen_at, created_at, recommendation, source_url from sharepoint_findings
      ) f on f.src = k.source_table and f.id = k.finding_row_id
     where k.org_id = p_org and k.framework = 'NCA ECC' and k.is_primary
       and f.status = 'open' and f.severity in ('critical', 'warning')
    union all
    -- Failing or partial measurements from connected systems (not RISYS's
    -- own governance checks).
    select distinct on (r.signal_key, m.requirement_id)
           split_part(m.requirement_id, '-', 1) || '-' || split_part(m.requirement_id, '-', 2),
           m.requirement_id, 'signal', c.connector_id, r.signal_key,
           c.name || coalesce(' — ' || r.summary, ''),
           case r.status when 'fail' then 'critical' else 'warning' end,
           r.computed_at,
           -- What passing looks like, as the action for a failing measurement.
           'Target: ' || coalesce(c.description, c.name), null
      from org_signal_results r
      join compliance_signals c on c.signal_key = r.signal_key and c.is_active and c.method <> 'internal'
      join signal_requirement_map m on m.signal_key = r.signal_key and m.framework = 'NCA ECC'
                                   and (m.org_id is null or m.org_id = p_org)
     where r.org_id = p_org and r.status in ('fail', 'partial')
  ) x;

  -- One suggestion per area with evidence.
  for a in
    select e.area,
           (select subdomain_name from nca_ecc n where n.subdomain_id = e.area limit 1) as area_name,
           array_agg(distinct e.ctrl order by e.ctrl) as controls,
           array_agg(distinct e.connector order by e.connector) as connectors,
           count(*) filter (where e.kind = 'finding') as n_find,
           count(*) filter (where e.kind = 'finding' and e.severity = 'critical') as n_crit,
           count(*) filter (where e.kind = 'signal') as n_sig,
           max(e.seen) filter (where e.kind = 'finding') as newest_finding,
           jsonb_agg(jsonb_build_object(
             'kind', e.kind, 'connector', e.connector, 'ref', e.ref, 'title', e.title,
             'severity', e.severity, 'control', e.ctrl, 'seen', e.seen,
             'recommendation', e.recommendation, 'url', e.url)
             order by case e.severity when 'critical' then 0 else 1 end, e.kind, e.seen desc) as evidence,
           (array_agg(e.title order by case e.severity when 'critical' then 0 else 1 end, e.seen desc))[1:3] as top_titles
      from jsonb_to_recordset(v_ev) as e(area text, ctrl text, kind text, connector text, ref text,
                                         title text, severity text, seen timestamptz,
                                         recommendation text, url text)
     group by e.area
  loop
    select * into t from risk_suggestion_templates where framework = 'NCA ECC' and area_id = a.area;
    v_conn := array_to_string(array(
      select case c when 'm365' then 'Microsoft 365' when 'defender' then 'Microsoft Defender'
                    when 'sharepoint' then 'SharePoint' when 'entra' then 'Microsoft Entra ID' else initcap(c) end
        from unnest(a.connectors) c), ', ');

    v_title := coalesce(t.title, 'Weaknesses in ' || coalesce(a.area_name, 'ECC ' || a.area));
    v_cause := coalesce(t.cause, coalesce(a.area_name, 'ECC ' || a.area) || ' controls are not fully implemented')
      || '. Detected by ' || v_conn || ': '
      -- Items are joined with '; ', so drop each one's own closing full stop.
      || array_to_string(array(select rtrim(x, '. ') from unnest(a.top_titles) x), '; ')
      || case when a.n_find + a.n_sig > 3 then format(' (and %s more)', a.n_find + a.n_sig - 3) else '' end
      || '.';
    v_desc := format('Raised automatically by RISYS from %s open finding%s%s and %s failing measurement%s in %s, mapped to NCA ECC %s (%s).',
                     a.n_find, case when a.n_find = 1 then '' else 's' end,
                     case when a.n_crit > 0 then format(' (%s critical)', a.n_crit) else '' end,
                     a.n_sig, case when a.n_sig = 1 then '' else 's' end,
                     v_conn, a.area, array_to_string(a.controls, ', '));
    v_l := least(5, coalesce(t.likelihood, 3) + case when a.n_crit > 0 or a.n_find + a.n_sig >= 10 then 1 else 0 end);

    -- A live risk that may already cover this area.
    select r.id into v_dup from risks r
     where r.org_id = p_org and coalesce(r.workflow_state, 'draft') <> 'closed'
       and (r.framework_ref ilike '%' || a.area || '-%' or r.framework_ref ilike '% ' || a.area || ' %'
            or r.framework_ref ilike '% ' || a.area)
     order by r.created_at desc limit 1;

    select * into s from risk_suggestions where org_id = p_org and framework = 'NCA ECC' and area_id = a.area;

    if s.id is null then
      insert into risk_suggestions (org_id, framework, area_id, area_name, controls, title, description, cause, event,
                                    impact_statement, category, subcategory, inherent_likelihood, inherent_impact,
                                    evidence, open_findings, critical_findings, failing_signals, connectors, existing_risk_id)
      values (p_org, 'NCA ECC', a.area, a.area_name, a.controls, v_title, v_desc, v_cause,
              coalesce(t.event, 'A weakness in this area is exploited'),
              coalesce(t.impact, 'Loss, disclosure or disruption of the systems and data the controls protect'),
              coalesce(t.category, 'Cybersecurity'), t.subcategory, v_l, coalesce(t.impact_score, 3),
              a.evidence, a.n_find, a.n_crit, a.n_sig, a.connectors, v_dup);
      v_new := v_new + 1;
    else
      update risk_suggestions set
        area_name = a.area_name, controls = a.controls, evidence = a.evidence,
        open_findings = a.n_find, critical_findings = a.n_crit, failing_signals = a.n_sig,
        connectors = a.connectors, existing_risk_id = coalesce(v_dup, existing_risk_id),
        last_evaluated_at = now(),
        -- Untouched wording follows the evidence; a person's edits are kept.
        title = case when edited then title else v_title end,
        description = case when edited then description else v_desc end,
        cause = case when edited then cause else v_cause end,
        inherent_likelihood = case when edited then inherent_likelihood else v_l end,
        -- Retired (fixed) or dismissed suggestions come back only with new evidence.
        status = case
          when status = 'resolved' then 'pending'
          when status = 'dismissed' and a.newest_finding > decided_at then 'pending'
          else status end,
        reraised_at = case
          when status = 'resolved' or (status = 'dismissed' and a.newest_finding > decided_at) then now()
          else reraised_at end
      where id = s.id;
      if s.status = 'resolved' or (s.status = 'dismissed' and a.newest_finding > s.decided_at) then
        v_new := v_new + 1;
      else
        v_upd := v_upd + 1;
      end if;
    end if;
  end loop;

  -- Pending suggestions whose findings were all fixed retire themselves.
  update risk_suggestions rs set status = 'resolved', last_evaluated_at = now(),
         open_findings = 0, critical_findings = 0, failing_signals = 0, evidence = '[]'
   where rs.org_id = p_org and rs.status = 'pending'
     and not exists (select 1 from jsonb_to_recordset(v_ev) as e(area text) where e.area = rs.area_id);
  get diagnostics v_ret = row_count;

  -- Approved suggestions keep tracking their area for the risk's
  -- Recommended actions; when nothing is open any more, say so.
  update risk_suggestions rs set evidence = '[]', open_findings = 0, critical_findings = 0,
         failing_signals = 0, last_evaluated_at = now()
   where rs.org_id = p_org and rs.status = 'added' and rs.evidence <> '[]'::jsonb
     and not exists (select 1 from jsonb_to_recordset(v_ev) as e(area text) where e.area = rs.area_id);

  -- Tell the people who approve risks.
  if v_new > 0 then
    insert into notifications (org_id, user_id, type, title, body, link)
    select p_org, m.user_id, 'workflow',
           case when v_new = 1 then 'RISYS suggested a new risk' else format('RISYS suggested %s new risks', v_new) end,
           'Raised automatically from findings in your connected systems, written and scored. Review and approve them for the register.',
           '/app/risks/suggestions'
      from organization_members m
     where m.org_id = p_org and m.role in ('owner', 'admin', 'risk_manager');
  end if;

  return jsonb_build_object('new', v_new, 'updated', v_upd, 'resolved', v_ret);
end $$;


create or replace function public.accept_risk_suggestion(p_id uuid, p_admit boolean default true)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  s        risk_suggestions;
  v_risk   uuid;
  v_state  text;
  v_conn   text;
  e        jsonb;
begin
  select * into s from risk_suggestions where id = p_id for update;
  if s.id is null then raise exception 'Suggestion not found'; end if;
  if not is_org_member(s.org_id) then raise exception 'Suggestion not found'; end if;
  if not is_org_active(s.org_id) or is_org_readonly(s.org_id) then raise exception 'This workspace is read-only'; end if;
  if s.status <> 'pending' then raise exception 'This suggestion has already been decided'; end if;
  if p_admit and not is_risk_manager_or_admin(s.org_id) then
    raise exception 'Only a risk manager or admin can approve a risk into the register. Add it as a draft instead.';
  end if;
  if not p_admit and my_role(s.org_id) not in ('owner', 'admin', 'risk_manager', 'compliance_officer') then
    raise exception 'You cannot add suggested risks';
  end if;
  if nullif(trim(coalesce(s.title, '')), '') is null then raise exception 'Give the risk a title first'; end if;

  v_state := case when p_admit then 'registered' else 'draft' end;
  v_conn := array_to_string(s.connectors, ', ');

  insert into risks (
    org_id, title, description, category, subcategory, cause, event, impact_statement, risk_statement,
    likelihood, impact, inherent_likelihood, inherent_impact,
    status, workflow_state, owner_id, business_unit, created_by,
    source, source_connector, source_entity_name, source_finding, framework_ref, identified_date,
    approved_at, approved_by)
  values (
    s.org_id, s.title, s.description, s.category, s.subcategory, s.cause, s.event, s.impact_statement,
    -- "Because <cause>, there is a risk that <event>, resulting in <impact>."
    -- The cause without its evidence list, which stays in the cause field.
    format('Because %s, there is a risk that %s, resulting in %s.',
           lower(left(rtrim(split_part(coalesce(s.cause, ''), '. Detected by', 1), '.'), 1))
             || substr(rtrim(split_part(coalesce(s.cause, ''), '. Detected by', 1), '.'), 2),
           lower(left(coalesce(s.event, ''), 1)) || substr(coalesce(s.event, ''), 2),
           lower(left(coalesce(s.impact_statement, ''), 1)) || substr(coalesce(s.impact_statement, ''), 2)),
    coalesce(s.inherent_likelihood, 3), coalesce(s.inherent_impact, 3),
    coalesce(s.inherent_likelihood, 3), coalesce(s.inherent_impact, 3),
    'open', v_state, s.owner_id, s.business_unit, auth.uid(),
    'Automated detection', v_conn, coalesce(s.area_name, 'NCA ECC ' || s.area_id),
    format('%s open findings (%s critical), %s failing measurements', s.open_findings, s.critical_findings, s.failing_signals),
    'NCA ECC ' || s.area_id || ' (' || array_to_string(s.controls, ', ') || ')',
    current_date,
    case when p_admit then now() end, case when p_admit then auth.uid() end)
  returning id into v_risk;

  insert into risk_workflow_history (org_id, risk_id, from_state, to_state, action, comment, performed_by)
  values (s.org_id, v_risk, null, v_state, case when p_admit then 'admitted' else 'created' end,
          'Raised automatically by RISYS from connector findings'
            || case when p_admit then '; approved into the register.' else '; added as a draft.' end,
          auth.uid());

  -- The findings behind it count as triaged into this risk (earlier decisions stand).
  for e in select * from jsonb_array_elements(s.evidence) loop
    if e ->> 'kind' = 'finding' then
      insert into finding_triage (org_id, finding_key, connector_id, finding_title, severity, control_ref,
                                  disposition, note, risk_id, decided_by, decided_at)
      values (s.org_id, (e ->> 'connector') || ':' || (e ->> 'ref'), e ->> 'connector', e ->> 'title',
              e ->> 'severity', 'NCA ECC ' || (e ->> 'control'), 'created',
              'Linked automatically when the suggested risk was added', v_risk, auth.uid(), now())
      on conflict (org_id, finding_key) do nothing;
    end if;
  end loop;

  -- The evidence at approval is the baseline for the risk's Recommended actions.
  update risk_suggestions set status = 'added', risk_id = v_risk, decided_by = auth.uid(), decided_at = now(),
         evidence_at_approval = evidence
   where id = p_id;

  return v_risk;
end $$;

