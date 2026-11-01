-- ============================================================
-- Publishing sets a compliance status only where ECC asks for a document.
--
-- Not every X-Y-1 control is "documented and approved": 1-2-1 establishes a
-- department, 1-8-1 is a periodic review, 1-10-1 an awareness programme. The
-- status is now set only for ECC main controls whose text asks for the
-- requirements to be documented (23 controls); for every other mapped
-- requirement the published version is recorded as evidence and the status
-- is left alone. The coverage view uses the same rule.
-- ============================================================

create or replace function public.is_documented_requirement(p_framework text, p_requirement text)
returns boolean language sql stable set search_path = public as $$
  select p_framework = 'NCA ECC' and exists (
    select 1 from nca_ecc e
     where e.control_id = p_requirement and e.control_type = 'Main Control'
       and e.control_id ~ '^[0-9]+-[0-9]+-1$' and e.control_text ilike '%document%');
$$;

create or replace function public.publish_policy_version(p_version uuid, p_effective date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v policy_versions; p policies; prev uuid; v_eff date; v_next date; v_hash text; v_item uuid;
  r record; v_ev uuid; v_status_n int := 0; v_ev_n int := 0;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  select * into v from policy_versions where id = p_version for update;
  select * into p from policies where id = v.policy_id for update;
  if not found or not is_org_member(p.org_id) then raise exception 'Policy not found'; end if;
  if v.status <> 'approved' then raise exception 'Only an approved version can be published'; end if;
  if not (is_compliance_writer(p.org_id) or p.owner_id = auth.uid()) then raise exception 'Only the owner or a compliance writer can publish'; end if;
  v_eff := coalesce(p_effective, v_today);
  if v_eff < v_today - 30 or v_eff > v_today + 90 then raise exception 'The effective date must be within 30 days back and 90 days ahead'; end if;
  v_next := (v_eff + make_interval(months => p.review_months))::date;
  v_hash := policy_version_hash(v.body_md, v.body_md_ar, v.file);
  prev := p.current_version_id;

  perform set_config('risys.policy_system', 'on', true);
  perform set_config('risys.evidence_system', 'on', true);

  -- The version as an accepted evidence item (approval was the four-eyes review).
  insert into evidence_items (org_id, ref, title, kind, files, valid_from, valid_until, owner_id,
                              source_type, source_id, review_status, reviewed_by, reviewed_at, review_note, added_by)
  values (p.org_id, next_ref(p.org_id, 'EVD'), format('%s %s, version %s', p.ref, p.title, v.version_no), 'policy_version',
          case when v.file is null then '[]'::jsonb else jsonb_build_array(v.file) end,
          v_eff, v_next, p.owner_id, 'policy_version', v.id, 'accepted', v.approver_id, v.approved_at,
          format('Approved at %s level; SHA-256 %s', replace(v.approved_authority, '_', ' '), v_hash), auth.uid())
  returning id into v_item;

  if prev is not null then
    update policy_versions set status = 'superseded', superseded_at = now() where id = prev;
    update evidence_items set superseded_by = v_item
     where id = (select evidence_item_id from policy_versions where id = prev) and superseded_by is null;
  end if;

  update policy_versions set status = 'published', sha256 = v_hash, published_by = auth.uid(), published_at = now(),
         effective_on = v_eff, evidence_item_id = v_item
   where id = p_version;
  update policies set status = 'published', current_version_id = p_version, next_review_on = v_next, last_published_at = now()
   where id = p.id;

  for r in select * from policy_requirements where policy_id = p.id loop
    insert into evidence_links (org_id, evidence_id, framework, requirement_id)
    values (p.org_id, v_item, r.framework, r.requirement_id) on conflict do nothing;

    if r.relation = 'documents' then
      insert into compliance_evidence (org_id, framework, requirement_id, answers, files, next_review_date, submitted_by)
      values (p.org_id, r.framework, r.requirement_id,
              jsonb_build_object('source', 'policy', 'title', format('%s %s v%s', p.ref, p.title, v.version_no),
                                 'policy_id', p.id, 'policy_ref', p.ref, 'version_id', v.id, 'version_no', v.version_no,
                                 'sha256', v_hash, 'approver_id', v.approver_id, 'approved_at', v.approved_at,
                                 'approved_authority', v.approved_authority, 'effective_on', v_eff, 'evidence_item', v_item),
              case when v.file is null then '[]'::jsonb else jsonb_build_array(v.file) end,
              v_next, auth.uid())
      returning id into v_ev;
      v_ev_n := v_ev_n + 1;

      -- ECC controls that ask for a documented, approved requirement are evidenced by the publication itself.
      if r.framework = 'NCA ECC' and is_documented_requirement(r.framework, r.requirement_id) then
        insert into compliance_statuses (org_id, framework, requirement_id, status, notes, updated_by, updated_at, review_due_at, evidence_id)
        values (p.org_id, r.framework, r.requirement_id, 'compliant',
                format('Evidenced by %s v%s (published %s)', p.ref, v.version_no, to_char(v_eff, 'DD Mon YYYY')),
                auth.uid(), now(), v_next, v_ev)
        on conflict (org_id, framework, requirement_id) do update
          set status = 'compliant', notes = excluded.notes, updated_by = excluded.updated_by,
              updated_at = now(), review_due_at = excluded.review_due_at, evidence_id = excluded.evidence_id
          where compliance_statuses.status is distinct from 'not_applicable';
        v_status_n := v_status_n + 1;
      end if;
    end if;
  end loop;

  perform set_config('risys.policy_system', 'off', true);
  perform set_config('risys.evidence_system', 'off', true);

  perform audit_log_write(p.org_id, 'policy.published', 'policy', p.id, p.ref || ' v' || v.version_no,
    jsonb_build_object('sha256', v_hash, 'effective_on', v_eff, 'next_review_on', v_next, 'evidence_rows', v_ev_n, 'statuses', v_status_n));
  return jsonb_build_object('sha256', v_hash, 'evidence_item', v_item, 'evidence_rows', v_ev_n, 'statuses_set', v_status_n, 'next_review_on', v_next);
end $$;


create or replace view public.v_policy_coverage
with (security_invoker = true) as
  with req as (
    select e.control_id::text as requirement_id, e.control_text, e.domain_id::text as domain_id, e.domain_name::text as domain_name,
           case when is_documented_requirement('NCA ECC', e.control_id) then 'documented'
                when e.control_id ~ '^[0-9]+-[0-9]+-4$' then 'review' else 'standard' end as need
      from nca_ecc e
     where e.control_type = 'Main Control'
       and (is_documented_requirement('NCA ECC', e.control_id) or e.control_id ~ '^[0-9]+-[0-9]+-4$' or e.control_id = '1-3-3')
  )
  select o.id as org_id, r.requirement_id, r.control_text, r.domain_id, r.domain_name, r.need,
         (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'ref', p.ref, 'title', p.title, 'status', p.status,
                                                       'relation', pr.relation, 'next_review_on', p.next_review_on) order by p.ref), '[]'::jsonb)
            from policy_requirements pr join policies p on p.id = pr.policy_id
           where pr.org_id = o.id and pr.framework = 'NCA ECC' and pr.requirement_id = r.requirement_id and p.status <> 'retired') as policies,
         exists (select 1 from policy_requirements pr join policies p on p.id = pr.policy_id
                  where pr.org_id = o.id and pr.framework = 'NCA ECC' and pr.requirement_id = r.requirement_id and p.status = 'published') as covered
    from organizations o cross join req r
   where is_org_member(o.id);

grant select on public.v_policy_coverage to authenticated;
grant execute on function public.is_documented_requirement(text, text) to authenticated;
