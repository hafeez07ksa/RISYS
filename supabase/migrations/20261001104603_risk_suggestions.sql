-- ── Suggested risks: RISYS raises risks from what it detects ─────────────────
--
-- Connectors find problems; until now a person had to triage every finding
-- before anything reached the risk register. RISYS now does that work and
-- puts a ready-to-approve risk in front of the risk manager:
--
--   • One suggestion per ECC area (subdomain, e.g. 2-7 Data and Information
--     Protection) that has open critical/warning findings or failing
--     measurements from a connected system. Grouping by area is deliberate:
--     54 findings are a handful of risks, not 54.
--   • Fully written: title, cause (with the actual evidence), event, impact,
--     category, inherent likelihood and impact, the affected ECC controls, and
--     an existing risk that may already cover it.
--   • Kept current: refreshed after every scan and nightly. Pending text the
--     person has not edited is rewritten with the latest evidence; edited text
--     is kept. A dismissed suggestion comes back only when NEW findings appear
--     after it was dismissed. A pending one retires itself when its findings
--     are fixed.
--   • Approve admits it straight to the register (risk manager / admin), with
--     the findings linked as triaged. Or add it as a draft, edit it, or
--     dismiss it with a reason.
--   • Risk managers and admins are notified (and emailed) when new ones appear.
--
-- Nothing reaches the register without a person approving it.

-- ── Wording per area ─────────────────────────────────────────────────────────
create table if not exists public.risk_suggestion_templates (
  framework     text not null default 'NCA ECC',
  area_id       text not null,
  title         text not null,
  cause         text not null,
  event         text not null,
  impact        text not null,
  category      text not null default 'Cybersecurity',
  subcategory   text,
  likelihood    int  not null default 3 check (likelihood between 1 and 5),
  impact_score  int  not null default 3 check (impact_score between 1 and 5),
  primary key (framework, area_id)
);

insert into public.risk_suggestion_templates (area_id, title, cause, event, impact, category, subcategory, likelihood, impact_score) values
 ('2-2', 'Unauthorised access through weak identity and access controls',
  'Identity and access controls do not fully protect accounts and privileges',
  'An attacker or an unauthorised insider signs in with a stolen, shared or over-privileged account',
  'Unauthorised access to email, files and business systems, leading to data loss, fraud or a reportable breach',
  'Cybersecurity', 'Access Control', 3, 4),
 ('2-3', 'Systems compromised through weak hardening and protection',
  'Information systems and processing facilities are not hardened and protected as required',
  'An attacker exploits a weakly configured or unprotected system',
  'Malware infection, service disruption or loss of data held on the affected systems',
  'Cybersecurity', 'Vulnerability Management', 3, 4),
 ('2-4', 'Phishing and email-borne attacks reach users',
  'Email protection controls do not filter and block malicious messages effectively',
  'A phishing or malware email bypasses filtering and a user acts on it',
  'Credential theft, malware infection or payment fraud originating from email',
  'Cybersecurity', 'Phishing', 4, 4),
 ('2-5', 'Unauthorised access across the network',
  'Network security controls do not adequately segment and protect the network',
  'An attacker moves across the network from a compromised device or connection',
  'Wider compromise of systems and data than the initial foothold would allow',
  'Cybersecurity', 'Access Control', 3, 4),
 ('2-6', 'Organisation data exposed on unmanaged devices',
  'Mobile and personal devices can reach and store organisation data without adequate control',
  'A lost, stolen or compromised personal device exposes the data synchronised to it',
  'Disclosure of confidential or personal data from devices the organisation cannot protect or wipe',
  'Cybersecurity', 'Data Breach', 3, 3),
 ('2-7', 'Sensitive data exposed through uncontrolled sharing',
  'Data protection controls do not restrict how information is shared and sent outside the organisation',
  'Files, links or mailbox content reach people outside the organisation without control',
  'Disclosure of confidential or personal data, breaching PDPL and contractual obligations',
  'Cybersecurity', 'Data Breach', 3, 4),
 ('2-8', 'Data readable by attackers due to weak cryptography',
  'Cryptographic controls do not adequately protect data in transit and at rest',
  'An attacker intercepts or obtains data that is not adequately encrypted',
  'Disclosure of confidential or personal data and loss of trust in protected communications',
  'Cybersecurity', 'Data Breach', 2, 4),
 ('2-9', 'Data cannot be recovered after an incident',
  'Backup and recovery controls are incomplete or untested',
  'Ransomware, deletion or failure destroys data that cannot be restored',
  'Prolonged outage and permanent loss of business records',
  'Cybersecurity', 'Ransomware', 3, 5),
 ('2-10', 'Exploitation of unpatched vulnerabilities',
  'Vulnerabilities are not identified and remediated within required timeframes',
  'An attacker exploits a known, unpatched vulnerability',
  'System compromise, malware infection and data loss through a preventable weakness',
  'Cybersecurity', 'Vulnerability Management', 4, 4),
 ('2-12', 'Attacks go undetected for lack of logging and monitoring',
  'Event logging and monitoring do not capture and review security-relevant activity',
  'Malicious activity occurs without being logged, alerted on or reviewed',
  'Incidents are found late or not at all, increasing damage and preventing investigation and regulatory reporting',
  'Cybersecurity', null, 3, 4),
 ('2-13', 'Slow or ineffective response to cyber incidents',
  'Incident and threat management is not fully implemented',
  'A cyber incident is not detected, escalated and contained in time',
  'Greater damage, longer outage and missed regulatory notification deadlines',
  'Cybersecurity', null, 3, 4),
 ('2-14', 'Physical access to sensitive facilities and equipment',
  'Physical security controls do not fully protect facilities and equipment',
  'An unauthorised person gains physical access to systems or media',
  'Theft or tampering with equipment and data',
  'Cybersecurity', 'Insider Threat', 2, 3),
 ('2-15', 'Web applications compromised through common attacks',
  'Web application protection controls are incomplete',
  'An attacker exploits a web application weakness',
  'Data theft, defacement or service disruption of public-facing services',
  'Cybersecurity', 'Vulnerability Management', 3, 4),
 ('4-1', 'Cyber risk introduced through third parties',
  'Cybersecurity requirements for third parties are not fully applied and monitored',
  'A supplier or service provider with access is compromised or fails to protect data',
  'Data breach or disruption originating outside the organisation',
  'Third Party / Vendor', 'Supply Chain Attack', 3, 4),
 ('4-2', 'Data exposed through cloud services',
  'Cloud and hosting services are not configured and governed to the required standard',
  'A misconfiguration or weak control in a cloud service exposes data or access',
  'Disclosure of data or unauthorised access to cloud-hosted systems',
  'Cybersecurity', 'Data Breach', 3, 4)
on conflict (framework, area_id) do update set
  title = excluded.title, cause = excluded.cause, event = excluded.event, impact = excluded.impact,
  category = excluded.category, subcategory = excluded.subcategory,
  likelihood = excluded.likelihood, impact_score = excluded.impact_score;

alter table public.risk_suggestion_templates enable row level security;
drop policy if exists "signed in can read suggestion templates" on public.risk_suggestion_templates;
create policy "signed in can read suggestion templates" on public.risk_suggestion_templates
  for select to authenticated using (true);
revoke all on public.risk_suggestion_templates from anon, authenticated;
grant select on public.risk_suggestion_templates to authenticated;

-- ── Suggestions ──────────────────────────────────────────────────────────────
create table if not exists public.risk_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  framework          text not null default 'NCA ECC',
  area_id            text not null,
  area_name          text,
  controls           text[] not null default '{}',
  status             text not null default 'pending'
                     check (status in ('pending', 'added', 'dismissed', 'resolved')),
  title              text not null,
  description        text,
  cause              text,
  event              text,
  impact_statement   text,
  category           text,
  subcategory        text,
  inherent_likelihood int check (inherent_likelihood between 1 and 5),
  inherent_impact    int check (inherent_impact between 1 and 5),
  owner_id           uuid references auth.users(id) on delete set null,
  business_unit      text,
  edited             boolean not null default false,
  edited_by          uuid references auth.users(id) on delete set null,
  edited_at          timestamptz,
  evidence           jsonb not null default '[]',
  open_findings      int not null default 0,
  critical_findings  int not null default 0,
  failing_signals    int not null default 0,
  connectors         text[] not null default '{}',
  existing_risk_id   uuid references public.risks(id) on delete set null,
  risk_id            uuid references public.risks(id) on delete set null,
  dismiss_reason     text,
  decided_by         uuid references auth.users(id) on delete set null,
  decided_at         timestamptz,
  first_raised_at    timestamptz not null default now(),
  reraised_at        timestamptz,
  last_evaluated_at  timestamptz not null default now(),
  unique (org_id, framework, area_id)
);

create index if not exists risk_suggestions_org_status_idx on public.risk_suggestions (org_id, status);

alter table public.risk_suggestions enable row level security;

-- Readable by the people who work the register and the findings; written only
-- through the functions below.
drop policy if exists "risk roles read suggestions" on public.risk_suggestions;
create policy "risk roles read suggestions" on public.risk_suggestions
  for select to authenticated
  using (is_org_member(org_id) and my_role(org_id) in ('owner', 'admin', 'risk_manager', 'compliance_officer', 'auditor'));

drop policy if exists tenant_active_guard on public.risk_suggestions;
create policy tenant_active_guard on public.risk_suggestions
  as restrictive for all
  using ((org_id is null) or is_org_active(org_id))
  with check ((org_id is null) or is_org_active(org_id));

revoke all on public.risk_suggestions from anon, authenticated;
grant select on public.risk_suggestions to authenticated;

-- ── Generator ────────────────────────────────────────────────────────────────
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
           f.title, f.severity, coalesce(f.first_seen_at, f.created_at) as seen
      from finding_control_refs k
      join (
        select 'm365_findings'::text src, id, finding_id, title, severity, status, first_seen_at, created_at from m365_findings
        union all select 'defender_findings', id, finding_id, title, severity, status, first_seen_at, created_at from defender_findings
        union all select 'sharepoint_findings', id, finding_id, title, severity, status, first_seen_at, created_at from sharepoint_findings
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
           r.computed_at
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
             'severity', e.severity, 'control', e.ctrl, 'seen', e.seen)
             order by case e.severity when 'critical' then 0 else 1 end, e.kind, e.seen desc) as evidence,
           (array_agg(e.title order by case e.severity when 'critical' then 0 else 1 end, e.seen desc))[1:3] as top_titles
      from jsonb_to_recordset(v_ev) as e(area text, ctrl text, kind text, connector text, ref text,
                                         title text, severity text, seen timestamptz)
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
      || array_to_string(a.top_titles, '; ')
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

revoke execute on function public.refresh_risk_suggestions(uuid) from public, anon, authenticated;
grant  execute on function public.refresh_risk_suggestions(uuid) to service_role;

-- "Check now" from the page.
create or replace function public.request_risk_suggestions(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not (is_org_member(p_org) and my_role(p_org) in ('owner', 'admin', 'risk_manager', 'compliance_officer')) then
    raise exception 'Only risk and compliance roles can refresh suggestions';
  end if;
  if not is_org_active(p_org) then raise exception 'This workspace is suspended'; end if;
  return refresh_risk_suggestions(p_org);
end $$;

-- ── Decisions ────────────────────────────────────────────────────────────────
create or replace function public.update_risk_suggestion(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare s risk_suggestions;
begin
  select * into s from risk_suggestions where id = p_id;
  if s.id is null then raise exception 'Suggestion not found'; end if;
  if not (is_org_member(s.org_id) and my_role(s.org_id) in ('owner', 'admin', 'risk_manager', 'compliance_officer')) then
    raise exception 'You cannot edit suggested risks';
  end if;
  if not is_org_active(s.org_id) or is_org_readonly(s.org_id) then raise exception 'This workspace is read-only'; end if;
  if s.status <> 'pending' then raise exception 'Only pending suggestions can be edited'; end if;

  update risk_suggestions set
    title              = coalesce(nullif(trim(p_patch ->> 'title'), ''), title),
    description        = case when p_patch ? 'description' then p_patch ->> 'description' else description end,
    cause              = case when p_patch ? 'cause' then p_patch ->> 'cause' else cause end,
    event              = case when p_patch ? 'event' then p_patch ->> 'event' else event end,
    impact_statement   = case when p_patch ? 'impact_statement' then p_patch ->> 'impact_statement' else impact_statement end,
    category           = case when p_patch ? 'category' then p_patch ->> 'category' else category end,
    subcategory        = case when p_patch ? 'subcategory' then nullif(p_patch ->> 'subcategory', '') else subcategory end,
    inherent_likelihood = case when p_patch ? 'inherent_likelihood' then greatest(1, least(5, (p_patch ->> 'inherent_likelihood')::int)) else inherent_likelihood end,
    inherent_impact    = case when p_patch ? 'inherent_impact' then greatest(1, least(5, (p_patch ->> 'inherent_impact')::int)) else inherent_impact end,
    owner_id           = case when p_patch ? 'owner_id' then nullif(p_patch ->> 'owner_id', '')::uuid else owner_id end,
    business_unit      = case when p_patch ? 'business_unit' then nullif(p_patch ->> 'business_unit', '') else business_unit end,
    edited = true, edited_by = auth.uid(), edited_at = now()
  where id = p_id;
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

  update risk_suggestions set status = 'added', risk_id = v_risk, decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  return v_risk;
end $$;

create or replace function public.dismiss_risk_suggestion(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare s risk_suggestions;
begin
  select * into s from risk_suggestions where id = p_id;
  if s.id is null or not is_org_member(s.org_id) then raise exception 'Suggestion not found'; end if;
  if not is_risk_manager_or_admin(s.org_id) then raise exception 'Only a risk manager or admin can dismiss a suggested risk'; end if;
  if not is_org_active(s.org_id) or is_org_readonly(s.org_id) then raise exception 'This workspace is read-only'; end if;
  if s.status <> 'pending' then raise exception 'This suggestion has already been decided'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Say why it is not a risk (at least 5 characters)'; end if;
  update risk_suggestions set status = 'dismissed', dismiss_reason = trim(p_reason),
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

create or replace function public.restore_risk_suggestion(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare s risk_suggestions;
begin
  select * into s from risk_suggestions where id = p_id;
  if s.id is null or not is_org_member(s.org_id) then raise exception 'Suggestion not found'; end if;
  if not is_risk_manager_or_admin(s.org_id) then raise exception 'Only a risk manager or admin can restore a suggested risk'; end if;
  if s.status <> 'dismissed' then raise exception 'Only dismissed suggestions can be restored'; end if;
  update risk_suggestions set status = 'pending', dismiss_reason = null, decided_by = null, decided_at = null
   where id = p_id;
end $$;

revoke execute on function public.request_risk_suggestions(uuid) from public, anon;
revoke execute on function public.update_risk_suggestion(uuid, jsonb) from public, anon;
revoke execute on function public.accept_risk_suggestion(uuid, boolean) from public, anon;
revoke execute on function public.dismiss_risk_suggestion(uuid, text) from public, anon;
revoke execute on function public.restore_risk_suggestion(uuid) from public, anon;
grant execute on function public.request_risk_suggestions(uuid) to authenticated;
grant execute on function public.update_risk_suggestion(uuid, jsonb) to authenticated;
grant execute on function public.accept_risk_suggestion(uuid, boolean) to authenticated;
grant execute on function public.dismiss_risk_suggestion(uuid, text) to authenticated;
grant execute on function public.restore_risk_suggestion(uuid) to authenticated;

-- ── Run after every scan and nightly, after signals ──────────────────────────
create or replace function public.refresh_all_org_signals()
returns void language plpgsql security definer set search_path to 'public' as $$
declare o record;
begin
  for o in select id from organizations where status = 'active' loop
    begin
      perform compute_org_signals(o.id);
      perform compute_signals_platform(o.id);
      perform compute_signals_findings(o.id);
    exception when others then
      raise warning 'refresh signals for % failed: %', o.id, sqlerrm;
    end;
    begin
      perform refresh_risk_suggestions(o.id);
    exception when others then
      raise warning 'risk suggestions for % failed: %', o.id, sqlerrm;
    end;
  end loop;
end $$;

create or replace function public.trg_refresh_signals_after_scan()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.finished_at is not null and (old.finished_at is null or old.status is distinct from new.status) then
    begin
      perform compute_org_signals(new.org_id);
      perform compute_signals_platform(new.org_id);
      perform compute_signals_findings(new.org_id);
    exception when others then
      raise warning 'refresh signals for % failed: %', new.org_id, sqlerrm;
    end;
    -- After the signals, so suggestions see this scan's measurements too.
    -- A suggestion that cannot be built must never fail the scan.
    begin
      perform refresh_risk_suggestions(new.org_id);
    exception when others then
      raise warning 'risk suggestions for % failed: %', new.org_id, sqlerrm;
    end;
  end if;
  return new;
end $$;
