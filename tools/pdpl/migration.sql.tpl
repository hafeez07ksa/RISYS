-- ============================================================================
-- SDAIA Personal Data Protection Law (PDPL) as an active framework
--
-- Brings PDPL into Compliance the same way as NCA ECC and NCA CCC: the
-- regulatory text, a per-workspace scope, automated signals from the Privacy
-- registers and the Microsoft connectors, connector findings keyed to PDPL,
-- the review calendar and the Ask RISYS lookups.
--
--  1. sdaia_pdpl reloaded from the published texts: the Law (43 articles),
--     the Implementing Regulation (38) and the Transfer Regulation (10), one
--     row per article (main) and per numbered paragraph (sub). Ids are unique:
--     L-12, IR-23, IR-23-1, TR-5. /*N_REQ*/ articles that put an obligation on
--     a Controller are scored; definitions, the regulator's duties and the Law
--     articles the Regulations implement are reference text. The binding Arabic
--     text is loaded for the Law. /*N_ROWS*/ rows.
--  2. organizations.pdpl_profile: whether PDPL is in scope and which
--     conditional articles apply (public entity, health, credit, marketing,
--     transfers outside the Kingdom, ...), set by a workspace admin through
--     set_pdpl_profile(); every change is written to audit_log.
--     pdpl_applies() and pdpl_scope(org) evaluate it.
--  3. framework_requirements_v gains PDPL, so signals and findings roll up from
--     paragraph to article as they do for ECC and CCC.
--  4. framework_crosswalk: PDPL → ECC (also serves) and ECC → PDPL (evidence).
--     Microsoft findings keyed to the ECC access, logging and data protection
--     controls are also keyed to IR Art. 23, forwarding to IR Art. 20 and the
--     cloud provider's access to IR Art. 17, in finding_control_refs.
--  5. Signals: 13 measured from the Privacy registers (requests, breaches,
--     records of processing, impact assessments, DPO, transfers) and 12
--     Microsoft / RISYS signals mapped to PDPL paragraphs. Computed with every
--     signal refresh and hourly for workspaces with PDPL in scope.
--  6. Review calendar: PDPL periodic requirements, scoped by the profile.
--  7. Ask RISYS: PDPL lookups by id and in the overview.
-- ============================================================================

-- ── 2. Workspace PDPL scope ─────────────────────────────────────────────────
alter table public.organizations
  add column if not exists pdpl_profile    jsonb,
  add column if not exists pdpl_updated_at timestamptz,
  add column if not exists pdpl_updated_by uuid;

comment on column public.organizations.pdpl_profile is
  'SDAIA PDPL scope, or null when PDPL is not in scope. Boolean answers that decide which conditional articles apply. Set by a workspace admin through set_pdpl_profile().';

create or replace function public.pdpl_applies(p_profile jsonb, p_when text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_when is null then true
    when p_profile is null then false
    when p_when = 'dpo_required' then
         (coalesce((p_profile->>'public_entity')::boolean, false) and coalesce((p_profile->>'large_scale')::boolean, false))
      or coalesce((p_profile->>'large_scale_monitoring')::boolean, false)
      or coalesce((p_profile->>'sensitive_core')::boolean, false)
    when p_when = 'legitimate_interest' then
         coalesce((p_profile->>'legitimate_interest')::boolean, false)
     and not coalesce((p_profile->>'public_entity')::boolean, false)
    else coalesce((p_profile->>p_when)::boolean, false)
  end;
$$;

grant execute on function public.pdpl_applies(jsonb, text) to authenticated;

create or replace function public.set_pdpl_profile(p_org uuid, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys  text[] := array['public_entity', 'large_scale', 'large_scale_monitoring', 'sensitive_core',
                          'health', 'credit', 'advertising', 'marketing', 'research', 'minors',
                          'transfers', 'legitimate_interest'];
  v_old   jsonb;
  v_new   jsonb;
  v_name  text;
begin
  if not is_org_admin(p_org) then
    raise exception 'Only a workspace administrator can change the PDPL scope';
  end if;
  if p_profile is not null and jsonb_typeof(p_profile) <> 'object' then
    raise exception 'The PDPL scope must be a set of yes/no answers';
  end if;
  if p_profile is not null and exists (
       select 1 from jsonb_each(p_profile) e
        where e.key <> all (v_keys) or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Unknown PDPL scope setting';
  end if;

  if p_profile is not null then
    select jsonb_object_agg(k, coalesce((p_profile->>k)::boolean, false)) into v_new from unnest(v_keys) k;
  end if;

  select pdpl_profile into v_old from organizations where id = p_org for update;

  update organizations
     set pdpl_profile = v_new, pdpl_updated_at = now(), pdpl_updated_by = auth.uid()
   where id = p_org;

  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  insert into audit_log (org_id, actor_id, actor_name, action, entity_type, entity_id, entity_title, meta, created_at)
  values (p_org, auth.uid(), v_name, 'compliance.pdpl_scope_changed', 'organization', p_org, 'SDAIA PDPL scope',
          jsonb_build_object('from', v_old, 'to', v_new), now());

  perform compute_signals_privacy(p_org);
  return coalesce(v_new, 'null'::jsonb);
end
$$;

revoke all on function public.set_pdpl_profile(uuid, jsonb) from public, anon;
grant execute on function public.set_pdpl_profile(uuid, jsonb) to authenticated;

-- The scored PDPL requirements for a workspace and whether each applies.
create or replace function public.pdpl_scope(p_org uuid)
returns table (control_id text, control_type text, parent_control_id text, applies_when text, applicability text)
language sql
stable
security invoker
set search_path = public
as $$
  select d.control_id::text, d.control_type, d.parent_control_id::text, d.applies_when,
         case when pdpl_applies(o.pdpl_profile, d.applies_when) then 'mandatory' else 'not_applicable' end
    from organizations o
    join sdaia_pdpl d on d.is_requirement
   where o.id = p_org and o.pdpl_profile is not null;
$$;

grant execute on function public.pdpl_scope(uuid) to authenticated;

-- ── 3. Generic requirement view gains PDPL ──────────────────────────────────
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
   from nca_ccc
union all
 select 'SDAIA PDPL'::text,
    (sdaia_pdpl.control_id)::text,
    sdaia_pdpl.control_type,
    sdaia_pdpl.control_text,
    (sdaia_pdpl.domain_id)::text,
    sdaia_pdpl.domain_name,
    (sdaia_pdpl.subdomain_id)::text,
    sdaia_pdpl.subdomain_name,
    (sdaia_pdpl.parent_control_id)::text
   from sdaia_pdpl;

-- ── 4. Crosswalk and PDPL finding keys ──────────────────────────────────────
insert into public.framework_crosswalk (from_framework, from_requirement_id, to_framework, to_requirement_id, relation, note)
select 'SDAIA PDPL', v.p, 'NCA ECC', v.e, 'also_serves', 'Evidence for the PDPL requirement also serves this ECC control.'
  from (values
  /*ALSO_SERVES*/
  ) as v(p, e)
 where exists (select 1 from nca_ecc where control_id = v.e)
on conflict on constraint framework_crosswalk_unique do nothing;

insert into public.framework_crosswalk (from_framework, from_requirement_id, to_framework, to_requirement_id, relation, connector_ids, note)
select 'NCA ECC', v.e, 'SDAIA PDPL', v.p, 'evidence', array['m365', 'defender', 'sharepoint'], v.note
  from (values
  /*EVIDENCE_FROM_ECC*/
  ) as v(e, p, note)
on conflict on constraint framework_crosswalk_unique do nothing;

comment on column public.finding_control_refs.via_requirement_id is
  'For a derived key (NCA CCC, SDAIA PDPL): the ECC requirement on the finding that the crosswalk derived it from.';

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

  -- PDPL keys derived the same way. A finding whose label already names the
  -- PDPL article keeps that direct key (the insert skips it).
  insert into finding_control_refs
    (org_id, source_table, finding_row_id, connector_id, framework, pdpl_part, pdpl_article, via_requirement_id, position, is_primary)
  select distinct on (x.to_requirement_id)
         p_org, p_table, p_row, v_conn, 'SDAIA PDPL',
         split_part(x.to_requirement_id, '-', 1), split_part(x.to_requirement_id, '-', 2)::int,
         k.ecc_control_id, (200 + k.position)::smallint, false
    from finding_control_refs k
    join framework_crosswalk x
      on x.relation = 'evidence' and x.from_framework = 'NCA ECC' and x.to_framework = 'SDAIA PDPL'
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

-- ── 5. Signals ──────────────────────────────────────────────────────────────
insert into public.compliance_signals
  (signal_key, connector_id, name, description, method, unit, pass_threshold, partial_threshold, higher_is_better, source_note)
values
  /*SIGNALS*/
on conflict (signal_key) do update
   set name = excluded.name, description = excluded.description, unit = excluded.unit,
       pass_threshold = excluded.pass_threshold, partial_threshold = excluded.partial_threshold,
       higher_is_better = excluded.higher_is_better, source_note = excluded.source_note, is_active = true;

insert into public.signal_requirement_map (signal_key, framework, requirement_id, weight, note)
select v.signal_key, 'SDAIA PDPL', v.requirement_id, 1,
       case when v.signal_key like 'privacy.%' then 'Measured from the RISYS Privacy registers.'
            else 'Measured on the Microsoft estate that holds personal data.' end
  from (values
  /*SIGNAL_MAP*/
  ) as v(signal_key, requirement_id)
 where exists (select 1 from compliance_signals s where s.signal_key = v.signal_key)
   and not exists (select 1 from signal_requirement_map m
                    where m.signal_key = v.signal_key and m.framework = 'SDAIA PDPL'
                      and m.requirement_id = v.requirement_id and m.org_id is null);

create or replace function public.compute_signals_privacy(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile    jsonb;
  v_today      date := (now() at time zone 'Asia/Riyadh')::date;
  v_acts       int;
  v_controller boolean;
  v_num int; v_den int; v_val numeric; v_status text;
begin
  if p_org is null then raise exception 'org_id is required'; end if;

  select pdpl_profile into v_profile from organizations where id = p_org;
  select count(*) into v_acts from processing_activities where org_id = p_org and status = 'active';
  select coalesce(nullif(trim(controller_name), '') is not null, false) into v_controller
    from privacy_settings where org_id = p_org;
  v_controller := coalesce(v_controller, false);

  -- ── Data Subject requests (IR Art. 3) ─────────────────────────────────────
  select count(*) filter (where closed_at is not null
                            and (closed_at at time zone 'Asia/Riyadh')::date <= coalesce(extended_due_on, due_on)),
         count(*)
    into v_num, v_den
    from data_subject_requests
   where org_id = p_org and status <> 'withdrawn'
     and ((closed_at is not null and closed_at > now() - interval '12 months')
       or (closed_at is null and coalesce(extended_due_on, due_on) < v_today));
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.dsr_on_time', 'unknown', null, 0, 0,
      'No Data Subject request was closed in the last 12 months and none is overdue, so response times cannot be measured.',
      jsonb_build_object('reason', 'no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.dsr_on_time', grade_signal('privacy.dsr_on_time', v_val), v_val, v_num, v_den,
      format('%s of %s Data Subject requests in the last 12 months were answered by their due date.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  select count(*) filter (where identity_verified_at is not null), count(*)
    into v_num, v_den
    from data_subject_requests
   where org_id = p_org and status = 'completed' and closed_at > now() - interval '12 months';
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.dsr_identity_verified', 'unknown', null, 0, 0,
      'No Data Subject request was completed in the last 12 months.', jsonb_build_object('reason', 'no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.dsr_identity_verified', grade_signal('privacy.dsr_identity_verified', v_val), v_val, v_num, v_den,
      format('%s of %s completed requests had the requester''s identity verified first.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  -- ── Personal data breaches (IR Art. 24) ───────────────────────────────────
  select count(*) filter (where sdaia_notified_at is not null and sdaia_notified_at <= sdaia_due_at), count(*)
    into v_num, v_den
    from personal_data_breaches
   where org_id = p_org and aware_at > now() - interval '24 months'
     and ((notifiable = 'notifiable' and (sdaia_notified_at is not null or sdaia_due_at < now()))
       or (notifiable = 'pending' and sdaia_due_at < now()));
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.breach_notified_on_time', 'unknown', null, 0, 0,
      'No notifiable personal data breach in the last 24 months, so the 72-hour notification cannot be measured.',
      jsonb_build_object('reason', 'no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.breach_notified_on_time', grade_signal('privacy.breach_notified_on_time', v_val), v_val, v_num, v_den,
      format('%s of %s notifiable breaches in the last 24 months were reported to SDAIA within 72 hours.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  select count(*) filter (where nullif(trim(corrective_actions), '') is not null
                            and (notifiable <> 'notifiable' or sdaia_report is not null or sdaia_reference is not null)),
         count(*)
    into v_num, v_den
    from personal_data_breaches
   where org_id = p_org and status = 'closed' and closed_at > now() - interval '24 months';
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.breach_records_kept', 'unknown', null, 0, 0,
      'No personal data breach was closed in the last 24 months.', jsonb_build_object('reason', 'no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.breach_records_kept', grade_signal('privacy.breach_records_kept', v_val), v_val, v_num, v_den,
      format('%s of %s closed breaches record the corrective measures and, where notifiable, the SDAIA report.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  select count(*) filter (where subjects_notified_at is not null or nullif(trim(subjects_not_required), '') is not null), count(*)
    into v_num, v_den
    from personal_data_breaches
   where org_id = p_org and notifiable = 'notifiable' and aware_at > now() - interval '24 months'
     and (status = 'closed' or aware_at < now() - interval '7 days');
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.breach_subjects_notified', 'unknown', null, 0, 0,
      'No notifiable breach old enough to measure whether Data Subjects were told.', jsonb_build_object('reason', 'no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.breach_subjects_notified', grade_signal('privacy.breach_subjects_notified', v_val), v_val, v_num, v_den,
      format('%s of %s notifiable breaches record a notice to Data Subjects or why none was needed.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  -- ── Records of processing (IR Art. 33, 19) ────────────────────────────────
  if v_acts = 0 then
    perform record_signal(p_org, 'privacy.ropa_complete', 'fail', 0, 0, 0,
      'No processing activity is recorded. The record of processing activities is required for every Controller.', '{}'::jsonb, 24);
    perform record_signal(p_org, 'privacy.ropa_current', 'unknown', null, 0, 0,
      'No processing activity is recorded.', jsonb_build_object('reason', 'no_data'), 24);
    perform record_signal(p_org, 'privacy.retention_defined', 'unknown', null, 0, 0,
      'No processing activity is recorded.', jsonb_build_object('reason', 'no_data'), 24);
  else
    select count(*) filter (where nullif(trim(purpose), '') is not null and lawful_basis is not null
                              and coalesce(array_length(data_categories, 1), 0) > 0
                              and coalesce(array_length(data_subjects, 1), 0) > 0
                              and recipients is not null
                              and nullif(trim(retention), '') is not null
                              and nullif(trim(security_measures), '') is not null
                              and (not coalesce(transfers_outside_ksa, false)
                                   or (nullif(trim(transfer_countries), '') is not null and nullif(trim(transfer_safeguard), '') is not null))),
           count(*)
      into v_num, v_den
      from processing_activities where org_id = p_org and status = 'active';
    v_val := v_num::numeric / v_den;
    v_status := grade_signal('privacy.ropa_complete', v_val);
    if not v_controller and v_status = 'pass' then v_status := 'partial'; end if;
    perform record_signal(p_org, 'privacy.ropa_complete', v_status, v_val, v_num, v_den,
      format('%s of %s active processing activities have every field the record must hold.', v_num, v_den)
        || case when v_controller then '' else ' The Controller''s name and contact are not set in Privacy settings.' end,
      jsonb_build_object('controller_identified', v_controller), 24);

    select count(*) filter (where (next_review_on is null or next_review_on >= v_today) and updated_at > now() - interval '12 months'), count(*)
      into v_num, v_den
      from processing_activities where org_id = p_org and status = 'active';
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.ropa_current', grade_signal('privacy.ropa_current', v_val), v_val, v_num, v_den,
      format('%s of %s active processing activities are within their review date and updated in the last 12 months.', v_num, v_den), '{}'::jsonb, 24);

    select count(*) filter (where nullif(trim(retention), '') is not null), count(*)
      into v_num, v_den
      from processing_activities where org_id = p_org and status = 'active';
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.retention_defined', grade_signal('privacy.retention_defined', v_val), v_val, v_num, v_den,
      format('%s of %s active processing activities record a retention period.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  -- ── Impact assessments (IR Art. 25, 16; TR Art. 8) ────────────────────────
  if v_acts = 0 then
    perform record_signal(p_org, 'privacy.dpia_coverage', 'unknown', null, 0, 0,
      'No processing activity is recorded, so impact assessment coverage cannot be measured.', jsonb_build_object('reason', 'no_data'), 24);
  else
    select count(*) filter (where exists (
             select 1 from privacy_assessments a
              where a.org_id = p_org and a.activity_id = pa.id and a.status = 'approved'
                and (a.reassess_by is null or a.reassess_by >= v_today))),
           count(*)
      into v_num, v_den
      from processing_activities pa
     where pa.org_id = p_org and pa.status = 'active' and pa.assessment_required;
    if v_den = 0 then
      perform record_signal(p_org, 'privacy.dpia_coverage', 'pass', 1, 0, 0,
        format('None of the %s active processing activities meets an IR Article 25 trigger.', v_acts), '{}'::jsonb, 24);
    else
      v_val := v_num::numeric / v_den;
      perform record_signal(p_org, 'privacy.dpia_coverage', grade_signal('privacy.dpia_coverage', v_val), v_val, v_num, v_den,
        format('%s of %s activities that need an impact assessment have a current approved one.', v_num, v_den), '{}'::jsonb, 24);
    end if;
  end if;

  select count(*) filter (where exists (
           select 1 from privacy_assessments a
            where a.org_id = p_org and a.activity_id = pa.id and a.status = 'approved')),
         count(*)
    into v_num, v_den
    from processing_activities pa
   where pa.org_id = p_org and pa.status = 'active' and pa.lawful_basis = 'legitimate_interest';
  if v_den = 0 then
    perform record_signal(p_org, 'privacy.legitimate_interest_assessed', 'not_applicable', null, 0, 0,
      'No active processing activity relies on legitimate interest.', '{}'::jsonb, 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.legitimate_interest_assessed', grade_signal('privacy.legitimate_interest_assessed', v_val), v_val, v_num, v_den,
      format('%s of %s legitimate-interest activities have an approved assessment.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  -- ── Data protection officer (IR Art. 32) ──────────────────────────────────
  if v_profile is null then
    perform record_signal(p_org, 'privacy.dpo_appointed', 'unknown', null, null, null,
      'The PDPL scope is not set, so whether a data protection officer is required is not known.', jsonb_build_object('reason', 'no_profile'), 24);
  elsif not pdpl_applies(v_profile, 'dpo_required') then
    perform record_signal(p_org, 'privacy.dpo_appointed', 'not_applicable', null, null, null,
      'The PDPL scope does not require a data protection officer.', '{}'::jsonb, 24);
  elsif exists (select 1 from privacy_settings
                 where org_id = p_org and (dpo_user_id is not null or nullif(trim(dpo_name), '') is not null)) then
    perform record_signal(p_org, 'privacy.dpo_appointed', 'pass', 1, 1, 1,
      'A data protection officer is named in Privacy settings.', '{}'::jsonb, 24);
  else
    perform record_signal(p_org, 'privacy.dpo_appointed', 'fail', 0, 0, 1,
      'A data protection officer is required but none is named in Privacy settings.', '{}'::jsonb, 24);
  end if;

  -- ── Transfers outside the Kingdom (TR Art. 5, 8) ──────────────────────────
  select count(*) filter (where nullif(trim(transfer_countries), '') is not null and nullif(trim(transfer_safeguard), '') is not null),
         count(*)
    into v_num, v_den
    from processing_activities where org_id = p_org and status = 'active' and coalesce(transfers_outside_ksa, false);
  if v_den = 0 then
    if pdpl_applies(v_profile, 'transfers') then
      perform record_signal(p_org, 'privacy.transfer_safeguards', 'unknown', null, 0, 0,
        'The PDPL scope says personal data leaves the Kingdom, but no processing activity records a transfer.', jsonb_build_object('reason', 'no_data'), 24);
      perform record_signal(p_org, 'privacy.transfer_risk_assessed', 'unknown', null, 0, 0,
        'The PDPL scope says personal data leaves the Kingdom, but no processing activity records a transfer.', jsonb_build_object('reason', 'no_data'), 24);
    else
      perform record_signal(p_org, 'privacy.transfer_safeguards', 'not_applicable', null, 0, 0,
        'No processing activity transfers personal data outside the Kingdom.', '{}'::jsonb, 24);
      perform record_signal(p_org, 'privacy.transfer_risk_assessed', 'not_applicable', null, 0, 0,
        'No processing activity transfers personal data outside the Kingdom.', '{}'::jsonb, 24);
    end if;
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.transfer_safeguards', grade_signal('privacy.transfer_safeguards', v_val), v_val, v_num, v_den,
      format('%s of %s activities that transfer data outside the Kingdom record the destination and the safeguard.', v_num, v_den), '{}'::jsonb, 24);

    select count(*) filter (where exists (
             select 1 from privacy_assessments a
              where a.org_id = p_org and a.activity_id = pa.id and a.status = 'approved'
                and (a.reassess_by is null or a.reassess_by >= v_today))),
           count(*)
      into v_num, v_den
      from processing_activities pa
     where pa.org_id = p_org and pa.status = 'active' and coalesce(pa.transfers_outside_ksa, false);
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'privacy.transfer_risk_assessed', grade_signal('privacy.transfer_risk_assessed', v_val), v_val, v_num, v_den,
      format('%s of %s activities that transfer data outside the Kingdom have a current approved assessment.', v_num, v_den), '{}'::jsonb, 24);
  end if;

  return jsonb_build_object('privacy', true, 'activities', v_acts, 'pdpl_scope', v_profile is not null);
end
$$;

revoke all on function public.compute_signals_privacy(uuid) from public, anon, authenticated;

create or replace function public.refresh_org_signals(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a jsonb; b jsonb; c jsonb; d jsonb; v_reqs int;
begin
  if not (is_org_member(p_org) or auth.uid() is null) then
    raise exception 'You do not have access to this organisation';
  end if;
  a := compute_org_signals(p_org);
  b := compute_signals_platform(p_org);
  c := compute_signals_findings(p_org);
  d := compute_signals_privacy(p_org);
  select count(*) into v_reqs from v_requirement_automation where org_id = p_org;
  return a || b || c || d || jsonb_build_object('requirements_covered', v_reqs, 'refreshed_at', now());
end $$;

-- Privacy registers change during the day; recompute their signals hourly for
-- workspaces with PDPL in scope (the nightly refresh covers everyone).
create or replace function public.refresh_privacy_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare o record; n int := 0;
begin
  for o in select id from organizations where pdpl_profile is not null loop
    begin
      perform compute_signals_privacy(o.id);
      n := n + 1;
    exception when others then
      raise warning 'privacy signals failed for %: %', o.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.refresh_privacy_signals() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'risys-privacy-signals';
select cron.schedule('risys-privacy-signals', '7 * * * *', $cron$select public.refresh_privacy_signals()$cron$);

-- ── 6. Review calendar ──────────────────────────────────────────────────────
insert into public.periodic_review_requirements (framework, requirement_id, title, default_months)
values
  /*PERIODIC*/
on conflict (framework, requirement_id) do update set title = excluded.title, default_months = excluded.default_months;

-- CCC and PDPL review requirements appear only for workspaces whose scope includes them.
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
          where (p.framework <> all (array['NCA CCC', 'SDAIA PDPL']))
             or (p.framework = 'NCA CCC' and exists (select 1 from nca_ccc c
                         where c.control_id = p.requirement_id
                           and (o.ccc_role = 'both' or upper(o.ccc_role) = c.role)
                           and (case o.ccc_level when 1 then c.level_1 when 2 then c.level_2
                                                 when 3 then c.level_3 else c.level_4 end) = 'mandatory'))
             or (p.framework = 'SDAIA PDPL' and o.pdpl_profile is not null and exists (select 1 from sdaia_pdpl d
                         where d.control_id = p.requirement_id and d.is_requirement
                           and pdpl_applies(o.pdpl_profile, d.applies_when)))
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

-- ── 7. Ask RISYS ────────────────────────────────────────────────────────────
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
      union all
      select jsonb_build_object(
          'framework', 'SDAIA PDPL', 'document', regulation_part, 'requirement', control_id, 'type', control_type,
          'article', article_title, 'text', control_text, 'scored', is_requirement,
          'applies_when', applies_when, 'implements_law', law_refs,
          'link', '/app/compliance/SDAIA%20PDPL/' || control_id),
          (control_id = upper(trim(p_query))), control_id::text
        from sdaia_pdpl
       where control_id = upper(trim(p_query))
          or control_text ilike '%' || trim(p_query) || '%'
          or control_text_ar ilike '%' || trim(p_query) || '%'
          or article_title ilike '%' || trim(p_query) || '%'
    ) u
    order by exact desc, cid
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ) s;
$$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.ai_tool_compliance(uuid, text)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, 'v_ccc jsonb;', 'v_ccc jsonb; v_pdpl jsonb;');
  v_new := replace(v_new, '  if req is null then', $pdpl$
  -- A PDPL id starts with L (the Law), IR (Implementing Regulation) or TR (Transfer Regulation).
  if req ~* '^(L|IR|TR)-\d+(-\d+)?$' then
    req := upper(req);
    select jsonb_build_object(
      'framework', 'SDAIA PDPL', 'document', d.regulation_part, 'requirement', d.control_id, 'type', d.control_type,
      'article', d.article_title, 'domain', d.domain_id || ' ' || d.domain_name,
      'text', d.control_text, 'text_ar', d.control_text_ar,
      'scored', d.is_requirement, 'applies_when', d.applies_when, 'implements_law', d.law_refs,
      'in_scope_for_this_workspace', s.control_id is not null,
      'applicability', s.applicability,
      'link', '/app/compliance/SDAIA%20PDPL/' || d.control_id,
      'manual_status', (select jsonb_build_object('status', cs.status, 'notes', cs.notes,
          'updated_at', cs.updated_at::date, 'review_due', cs.review_due_at)
        from compliance_statuses cs where cs.org_id = p_org and cs.framework = 'SDAIA PDPL' and cs.requirement_id = d.control_id),
      'automated', (select jsonb_build_object('status', va.automated_status, 'pass', va.pass_count, 'fail', va.fail_count,
          'partial', va.partial_count, 'unknown', va.unknown_count, 'computed', va.last_computed_at::date,
          'signals', va.signals)
        from v_requirement_automation va where va.org_id = p_org and va.framework = 'SDAIA PDPL' and va.requirement_id = d.control_id),
      'open_findings', case when ai_can_read_findings(p_org) then (
          select jsonb_build_object('total', vf.open_count, 'critical', vf.open_critical, 'warning', vf.open_warning,
            'info', vf.open_info, 'connectors', vf.connectors)
            from v_requirement_findings vf where vf.org_id = p_org and vf.framework = 'SDAIA PDPL' and vf.requirement_id = d.control_id)
        else to_jsonb('not visible to your role'::text) end,
      'review', (select jsonb_build_object('state', rs.state, 'due', rs.due_date, 'last_reviewed', rs.last_reviewed_on,
          'frequency', rs.frequency)
        from v_review_schedule rs where rs.org_id = p_org and rs.framework = 'SDAIA PDPL' and rs.requirement_id = d.control_id limit 1)
    ) into v
    from sdaia_pdpl d left join pdpl_scope(p_org) s on s.control_id = d.control_id
    where d.control_id = req;
    return coalesce(v, jsonb_build_object('error', 'no SDAIA PDPL requirement ' || req));
  end if;

  if req is null then$pdpl$);
  v_new := replace(v_new, $a$    if v_ccc is not null then v := v || jsonb_build_object('ccc', v_ccc); end if;$a$, $b$    if v_ccc is not null then v := v || jsonb_build_object('ccc', v_ccc); end if;

    -- PDPL alongside, when the workspace has a PDPL scope.
    select jsonb_build_object(
      'framework', 'SDAIA PDPL',
      'scope', (select o.pdpl_profile from organizations o where o.id = p_org),
      'requirements_in_scope', count(*) filter (where sp.control_type = 'Main Control' and sp.applicability = 'mandatory'),
      'statuses', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
          select coalesce(cs.status, 'not_assessed') st, count(*) n
            from pdpl_scope(p_org) s3
            left join compliance_statuses cs on cs.org_id = p_org and cs.framework = 'SDAIA PDPL' and cs.requirement_id = s3.control_id
           where s3.control_type = 'Main Control' and s3.applicability = 'mandatory' group by 1) z))
      into v_pdpl
      from pdpl_scope(p_org) sp
     having count(*) > 0;
    if v_pdpl is not null then v := v || jsonb_build_object('pdpl', v_pdpl); end if;$b$);
  if v_new = v_def or position('v_pdpl jsonb;' in v_new) = 0 or position('SDAIA%20PDPL' in v_new) = 0
     or position('jsonb_build_object(''pdpl''' in v_new) = 0 then
    raise exception 'ai_tool_compliance patch did not apply';
  end if;
  execute v_new;
end
$patch$;
