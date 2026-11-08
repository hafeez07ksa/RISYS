-- ============================================================
-- Policy reviews on the calendar, and "waiting on you" for the dashboard.
--
-- 1. policy_reviews: every review of a published policy is recorded, whether
--    it ended in a new version or in "reviewed, no change".
-- 2. confirm_policy_review(): the owner (or a compliance writer) confirms a
--    policy reviewed without change. The next review date moves on by the
--    policy's cycle, and the review is filed as evidence on the controls the
--    policy is mapped to.
-- 3. publish_policy_version() now also files the publication as a review on
--    controls mapped as "covers its periodic review" (the X-Y-4 controls), and
--    renews their review date when they are already compliant. It still sets
--    a status only for the 23 documented ECC controls.
-- 4. v_policy_review_schedule: published policies with their next review and
--    state, read by the Review calendar.
-- 5. my_work(org): what is waiting on the signed-in person across modules
--    (policy approvals, attestations, policy reviews, exception decisions,
--    evidence reviews). Later modules add their own kinds here.
--
-- Overdue reviews: a compliant control whose review date has passed already
-- counts as Partial (useComplianceStatuses, effectiveCompliance). Because the
-- policy's evidence carries the policy's next review date, an overdue policy
-- review turns the controls it evidences Partial, and confirming or
-- republishing the policy lifts that.
-- ============================================================

-- ── 1. Review record ─────────────────────────────────────────────────────────
create table if not exists public.policy_reviews (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  policy_id       uuid not null references public.policies(id) on delete cascade,
  version_id      uuid references public.policy_versions(id) on delete set null,
  outcome         text not null check (outcome in ('first_publication', 'new_version', 'unchanged')),
  note            text,
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_on     date not null,
  next_review_on  date not null,
  created_at      timestamptz not null default now()
);
create index if not exists policy_reviews_policy_idx on public.policy_reviews (policy_id, reviewed_on desc);

alter table public.policy_reviews enable row level security;
drop policy if exists policy_reviews_select on public.policy_reviews;
create policy policy_reviews_select on public.policy_reviews for select to authenticated using (is_org_member(org_id));
drop policy if exists tenant_active_guard on public.policy_reviews;
create policy tenant_active_guard on public.policy_reviews as restrictive for all to authenticated
  using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id));
revoke insert, update, delete on public.policy_reviews from authenticated, anon;
grant select on public.policy_reviews to authenticated;

-- Calendar label for a review cycle (the calendar knows Semi-annual and Annual).
create or replace function public.policy_cycle_label(p_months int)
returns text language sql immutable set search_path = public as $$
  select case p_months when 6 then 'Semi-annual' when 12 then 'Annual' when 24 then 'Every two years' end;
$$;

-- ── 2. File a review as evidence on the mapped controls ─────────────────────
-- Internal: called by publish and confirm. For every "documents" or "reviews"
-- mapping it appends a compliance_evidence row (the calendar reads the latest
-- one) and renews the review date on statuses that are already compliant.
create or replace function public.policy_file_review(
  p_policy uuid, p_version uuid, p_reviewed_on date, p_next date, p_outcome text, p_skip_documents boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare p policies; v policy_versions; r record; v_ev uuid; n int := 0;
begin
  select * into p from policies where id = p_policy;
  select * into v from policy_versions where id = p_version;
  for r in select * from policy_requirements where policy_id = p_policy and relation in ('documents', 'reviews') loop
    continue when p_skip_documents and r.relation = 'documents';
    insert into compliance_evidence (org_id, framework, requirement_id, answers, files, next_review_date, submitted_by)
    values (p.org_id, r.framework, r.requirement_id,
            jsonb_build_object('source', case when r.relation = 'documents' then 'policy' else 'policy_review' end,
                               'title', format('%s %s v%s', p.ref, p.title, v.version_no),
                               'policy_id', p.id, 'policy_ref', p.ref, 'version_id', v.id, 'version_no', v.version_no,
                               'sha256', v.sha256, 'approver_id', v.approver_id, 'approved_at', v.approved_at,
                               'approved_authority', v.approved_authority, 'effective_on', v.effective_on,
                               'evidence_item', v.evidence_item_id, 'review_outcome', p_outcome,
                               'reviewed_on', p_reviewed_on, 'owner', p.owner_id, 'frequency', policy_cycle_label(p.review_months)),
            case when v.file is null then '[]'::jsonb else jsonb_build_array(v.file) end,
            p_next, auth.uid())
    returning id into v_ev;
    n := n + 1;
    -- A review renews the date; it never sets a status that was not already there.
    update compliance_statuses
       set review_due_at = p_next, evidence_id = v_ev, updated_by = auth.uid(), updated_at = now()
     where org_id = p.org_id and framework = r.framework and requirement_id = r.requirement_id
       and status = 'compliant';
  end loop;
  return n;
end $$;
revoke execute on function public.policy_file_review(uuid, uuid, date, date, text, boolean) from public, anon, authenticated;

-- ── 3. Publish (as 20261031160337, plus reviews) ─────────────────────────────
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
                                 'approved_authority', v.approved_authority, 'effective_on', v_eff, 'evidence_item', v_item,
                                 'reviewed_on', v_eff, 'owner', p.owner_id, 'frequency', policy_cycle_label(p.review_months)),
              case when v.file is null then '[]'::jsonb else jsonb_build_array(v.file) end,
              v_next, auth.uid())
      returning id into v_ev;
      v_ev_n := v_ev_n + 1;

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
      else
        -- Not a documented control: evidence only, but a compliant status takes the new review date.
        update compliance_statuses set review_due_at = v_next, evidence_id = v_ev, updated_by = auth.uid(), updated_at = now()
         where org_id = p.org_id and framework = r.framework and requirement_id = r.requirement_id and status = 'compliant';
      end if;
    end if;
  end loop;

  -- The "covers its periodic review" mappings: publication is the review.
  v_ev_n := v_ev_n + policy_file_review(p.id, p_version, v_eff, v_next,
                                        case when prev is null then 'first_publication' else 'new_version' end, true);

  insert into policy_reviews (org_id, policy_id, version_id, outcome, reviewed_by, reviewed_on, next_review_on)
  values (p.org_id, p.id, p_version, case when prev is null then 'first_publication' else 'new_version' end,
          auth.uid(), v_eff, v_next);

  perform set_config('risys.policy_system', 'off', true);
  perform set_config('risys.evidence_system', 'off', true);

  perform audit_log_write(p.org_id, 'policy.published', 'policy', p.id, p.ref || ' v' || v.version_no,
    jsonb_build_object('sha256', v_hash, 'effective_on', v_eff, 'next_review_on', v_next, 'evidence_rows', v_ev_n, 'statuses', v_status_n));
  return jsonb_build_object('sha256', v_hash, 'evidence_item', v_item, 'evidence_rows', v_ev_n, 'statuses_set', v_status_n, 'next_review_on', v_next);
end $$;

-- ── 4. Reviewed, no change ───────────────────────────────────────────────────
create or replace function public.confirm_policy_review(p_policy uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p policies; v policy_versions; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_next date; n int;
begin
  select * into p from policies where id = p_policy for update;
  if not found or not is_org_member(p.org_id) then raise exception 'Policy not found'; end if;
  if p.status <> 'published' or p.current_version_id is null then raise exception 'Only a published policy can be reviewed'; end if;
  if not (p.owner_id = auth.uid() or is_compliance_writer(p.org_id)) then
    raise exception 'Only the policy owner or a compliance writer can record a review';
  end if;
  if length(coalesce(btrim(p_note), '')) < 10 then
    raise exception 'Say what was reviewed (at least 10 characters)';
  end if;
  if exists (select 1 from policy_versions where policy_id = p.id and status in ('in_review', 'approved')) then
    raise exception 'A new version is already in approval; publish it instead';
  end if;
  if p.next_review_on is not null and p.next_review_on > v_today + 90 then
    raise exception 'The next review is not due until %; record it within 90 days of the date', to_char(p.next_review_on, 'DD Mon YYYY');
  end if;
  select * into v from policy_versions where id = p.current_version_id;
  v_next := (v_today + make_interval(months => p.review_months))::date;

  perform set_config('risys.policy_system', 'on', true);
  update policies set next_review_on = v_next where id = p.id;
  perform set_config('risys.policy_system', 'off', true);

  -- The version's evidence item stays valid until the new review date.
  perform set_config('risys.evidence_review', 'on', true);
  update evidence_items set valid_until = v_next where id = v.evidence_item_id;
  perform set_config('risys.evidence_review', 'off', true);

  insert into policy_reviews (org_id, policy_id, version_id, outcome, note, reviewed_by, reviewed_on, next_review_on)
  values (p.org_id, p.id, v.id, 'unchanged', btrim(p_note), auth.uid(), v_today, v_next);

  n := policy_file_review(p.id, v.id, v_today, v_next, 'unchanged', false);

  perform audit_notify(p.org_id, p.owner_id, 'workflow', format('%s reviewed', p.ref),
    format('Reviewed with no change; next review %s.', to_char(v_next, 'DD Mon YYYY')), '/app/policies/' || p.id);
  perform audit_log_write(p.org_id, 'policy.reviewed', 'policy', p.id, p.ref || ' v' || v.version_no,
    jsonb_build_object('outcome', 'unchanged', 'next_review_on', v_next, 'evidence_rows', n));
  return jsonb_build_object('next_review_on', v_next, 'evidence_rows', n);
end $$;
revoke execute on function public.confirm_policy_review(uuid, text) from public, anon;
grant execute on function public.confirm_policy_review(uuid, text) to authenticated;

-- ── 5. Policy review schedule ────────────────────────────────────────────────
create or replace view public.v_policy_review_schedule
with (security_invoker = true) as
  with today as (select (now() at time zone 'Asia/Riyadh')::date as d)
  select p.org_id, p.id as policy_id, p.ref, p.title, p.kind, p.criticality, p.owner_id, p.review_months,
         policy_cycle_label(p.review_months) as frequency,
         (select max(r.reviewed_on) from policy_reviews r where r.policy_id = p.id) as last_reviewed_on,
         p.next_review_on as due_date,
         p.next_review_on - t.d as days_until_due,
         case when p.next_review_on is null then 'unscheduled'
              when p.next_review_on < t.d then 'overdue'
              when p.next_review_on <= t.d + 30 then 'due_soon'
              else 'scheduled' end as state,
         (select coalesce(jsonb_agg(jsonb_build_object('framework', pr.framework, 'requirement_id', pr.requirement_id,
                                                       'relation', pr.relation) order by pr.framework, pr.requirement_id), '[]'::jsonb)
            from policy_requirements pr where pr.policy_id = p.id and pr.relation in ('documents', 'reviews')) as controls
    from policies p cross join today t
   where p.status = 'published';
grant select on public.v_policy_review_schedule to authenticated;

-- ── 6. What is waiting on me ─────────────────────────────────────────────────
create or replace function public.my_work(p_org uuid)
returns table (kind text, item_id uuid, ref text, title text, detail text, due_on date, since timestamptz, href text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if me is null or not is_org_member(p_org) then return; end if;

  -- Policy versions I may approve.
  return query
    select 'policy_approval'::text, pv.id, p.ref, p.title, format('Version %s', pv.version_no),
           null::date, pv.submitted_at, '/app/policies/' || p.id || '?tab=text'
      from policy_versions pv join policies p on p.id = pv.policy_id
     where pv.org_id = p_org and pv.status = 'in_review'
       and me in (select policy_eligible_approvers(pv.id));

  -- Policies I must read and accept.
  return query
    select 'attestation'::text, a.id, p.ref, p.title, format('Version %s', pv.version_no),
           c.due_on, a.created_at, '/app/my-policies/' || a.id
      from attestations a
      join attestation_campaigns c on c.id = a.campaign_id
      join policies p on p.id = a.policy_id
      join policy_versions pv on pv.id = a.policy_version_id
     where a.org_id = p_org and a.user_id = me and a.status = 'pending' and c.status = 'open';

  -- Policies I own that are due for review within 30 days, or overdue.
  return query
    select 'policy_review'::text, p.id, p.ref, p.title, null::text,
           p.next_review_on, null::timestamptz, '/app/policies/' || p.id
      from policies p
     where p.org_id = p_org and p.owner_id = me and p.status = 'published'
       and p.next_review_on is not null and p.next_review_on <= v_today + 30;

  -- Exceptions I may decide (never my own request).
  return query
    select 'exception_decision'::text, e.id, e.ref, e.title, initcap(e.risk_rating) || ' risk',
           null::date, e.requested_at, '/app/exceptions/' || e.id
      from exceptions e
     where e.org_id = p_org and e.status = 'submitted' and e.requested_by is distinct from me
       and authority_rank(user_authority(p_org, me, e.subject_owner_id)) >= authority_rank(e.required_authority);

  -- Evidence I may review (compliance writers, never my own upload).
  if is_compliance_writer(p_org) then
    return query
      select 'evidence_review'::text, i.id, i.ref, i.title, null::text,
             null::date, i.created_at, '/app/evidence/' || i.id
        from evidence_items i
       where i.org_id = p_org and i.review_status = 'pending' and i.added_by is distinct from me;
  end if;
end $$;
revoke execute on function public.my_work(uuid) from public, anon;
grant execute on function public.my_work(uuid) to authenticated;
