-- ============================================================
-- Policy Management (1 of 2): the policy library
--
-- A policy is a stable record; its text lives in versions. A version moves
--   draft → in_review → approved → published → superseded
-- and is frozen from in_review onwards. The rules are enforced here:
--   * authors, the submitter and the drafter never approve
--   * the approver holds the authority the policy's criticality needs
--     (low = the policy owner, medium = CISO, high = committee,
--      critical = board; risk_authority_holders)
--   * publishing hashes the version (SHA-256 over both texts and the file
--     hash) and writes it as evidence for the mapped requirements
--   * a published version never changes
-- Status of an ECC "documented and approved" control (X-Y-1) becomes
-- compliant only through publish_policy_version(); for other mapped
-- requirements the version is recorded as evidence, the status is left alone.
-- ============================================================

create table if not exists public.policies (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  ref                 text not null,
  title               text not null check (length(btrim(title)) between 3 and 200),
  kind                text not null default 'policy' check (kind in ('policy', 'procedure', 'standard', 'plan')),
  domain              text,
  purpose             text,
  scope               text,
  owner_id            uuid not null references auth.users(id) on delete restrict,
  owning_unit_id      uuid references public.business_units(id) on delete set null,
  criticality         text not null default 'high' check (criticality in ('low', 'medium', 'high', 'critical')),
  review_months       integer not null default 12 check (review_months in (6, 12, 24)),
  status              text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  current_version_id  uuid,
  next_review_on      date,
  last_published_at   timestamptz,
  retired_at          timestamptz,
  retired_reason      text,
  template_key        text,
  created_by          uuid references auth.users(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint policies_ref_key unique (org_id, ref)
);

create table if not exists public.policy_authors (
  policy_id  uuid not null references public.policies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (policy_id, user_id)
);

create table if not exists public.policy_versions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  policy_id          uuid not null references public.policies(id) on delete cascade,
  version_no         integer not null check (version_no >= 1),
  status             text not null default 'draft'
                       check (status in ('draft', 'in_review', 'approved', 'published', 'superseded', 'retired')),
  body_md            text,
  body_md_ar         text,
  file               jsonb check (file is null or jsonb_typeof(file) = 'object'),
  change_summary     text,
  sha256             text,
  created_by         uuid references auth.users(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  submitted_by       uuid references auth.users(id) on delete set null,
  submitted_at       timestamptz,
  returned_by        uuid references auth.users(id) on delete set null,
  returned_at        timestamptz,
  return_reason      text,
  approver_id        uuid references auth.users(id) on delete set null,
  approved_at        timestamptz,
  approved_authority text,
  approval_comment   text,
  published_by       uuid references auth.users(id) on delete set null,
  published_at       timestamptz,
  effective_on       date,
  superseded_at      timestamptz,
  evidence_item_id   uuid references public.evidence_items(id) on delete set null,
  updated_at         timestamptz not null default now(),
  constraint policy_versions_no_key unique (policy_id, version_no)
);

-- One open (draft / in review / approved) version per policy at a time.
create unique index if not exists policy_versions_one_open on public.policy_versions (policy_id)
  where status in ('draft', 'in_review', 'approved');

alter table public.policies drop constraint if exists policies_current_version_fkey;
alter table public.policies add constraint policies_current_version_fkey
  foreign key (current_version_id) references public.policy_versions(id) on delete set null;

create table if not exists public.policy_requirements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  policy_id       uuid not null references public.policies(id) on delete cascade,
  framework       text not null,
  requirement_id  text not null,
  relation        text not null default 'documents' check (relation in ('documents', 'reviews', 'supports')),
  created_by      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  constraint policy_requirements_key unique (policy_id, framework, requirement_id)
);

create index if not exists policy_requirements_req_idx on public.policy_requirements (org_id, framework, requirement_id);
create index if not exists policies_org_idx on public.policies (org_id, status, next_review_on);

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- May the caller edit this policy's record, mapping, authors and drafts?
create or replace function public.can_edit_policy(p_policy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from policies p
     where p.id = p_policy and is_org_member(p.org_id)
       and (is_compliance_writer(p.org_id) or p.owner_id = auth.uid()
            or exists (select 1 from policy_authors a where a.policy_id = p.id and a.user_id = auth.uid())));
$$;

create or replace function public.policy_version_hash(p_body text, p_body_ar text, p_file jsonb)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(
    coalesce(p_body, '') || chr(30) || coalesce(p_body_ar, '') || chr(30) || coalesce(p_file ->> 'sha256', ''), 'UTF8'), 'sha256'), 'hex');
$$;

-- ── Rules ─────────────────────────────────────────────────────────────────────
create or replace function public.policies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_system boolean := coalesce(current_setting('risys.policy_system', true), '') = 'on';
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.ref := next_ref(new.org_id, 'POL');
    if not v_system then
      new.status := 'draft'; new.current_version_id := null; new.next_review_on := null;
      new.last_published_at := null; new.retired_at := null; new.retired_reason := null;
    end if;
  else
    if new.org_id <> old.org_id or new.ref <> old.ref then raise exception 'A policy cannot move workspace or change its reference'; end if;
    if not v_system and (new.status, new.current_version_id, new.next_review_on, new.last_published_at, new.retired_at, new.retired_reason)
       is distinct from (old.status, old.current_version_id, old.next_review_on, old.last_published_at, old.retired_at, old.retired_reason) then
      raise exception 'Policy status changes through submit, approve, publish and retire';
    end if;
    if old.status = 'retired' and not v_system then raise exception 'A retired policy cannot change'; end if;
    -- A new review period applies from the next publication; keep the date as published.
  end if;
  if new.owning_unit_id is not null and not exists (select 1 from business_units where id = new.owning_unit_id and org_id = new.org_id) then
    raise exception 'The owning unit belongs to another workspace';
  end if;
  if not exists (select 1 from organization_members where org_id = new.org_id and user_id = new.owner_id) then
    raise exception 'The policy owner must be a member of this workspace';
  end if;
  return new;
end $$;

drop trigger if exists policies_guard on public.policies;
create trigger policies_guard before insert or update on public.policies
  for each row execute function public.policies_guard();

-- Every new policy starts with an empty version 1 draft.
create or replace function public.policies_first_draft()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('risys.policy_system', 'on', true);
  insert into policy_versions (org_id, policy_id, version_no, status, created_by)
  values (new.org_id, new.id, 1, 'draft', coalesce(auth.uid(), new.created_by));
  perform set_config('risys.policy_system', 'off', true);
  perform audit_log_write(new.org_id, 'policy.created', 'policy', new.id, new.ref || ' ' || new.title, '{}'::jsonb);
  return null;
end $$;

drop trigger if exists policies_first_draft on public.policies;
create trigger policies_first_draft after insert on public.policies
  for each row execute function public.policies_first_draft();

create or replace function public.policy_versions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_system boolean := coalesce(current_setting('risys.policy_system', true), '') = 'on';
begin
  if tg_op <> 'DELETE' then new.updated_at := now(); end if;
  if tg_op = 'INSERT' then
    if not v_system then raise exception 'New versions are created with new_policy_version()'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Only an unpublished draft goes, with its never-published policy (admin delete).
    if old.status = 'draft' and not exists (select 1 from policies where id = old.policy_id and current_version_id is not null) then
      return old;
    end if;
    raise exception 'Policy versions are kept; retire the policy instead';
  end if;
  if new.policy_id <> old.policy_id or new.org_id <> old.org_id or new.version_no <> old.version_no then
    raise exception 'A version cannot move';
  end if;
  if not v_system then
    if old.status <> 'draft' then
      raise exception 'Version % is % and cannot be edited', old.version_no, replace(old.status, '_', ' ');
    end if;
    if (new.status, new.sha256, new.submitted_by, new.submitted_at, new.approver_id, new.approved_at, new.approved_authority,
        new.published_by, new.published_at, new.effective_on, new.superseded_at, new.evidence_item_id, new.created_by)
       is distinct from
       (old.status, old.sha256, old.submitted_by, old.submitted_at, old.approver_id, old.approved_at, old.approved_authority,
        old.published_by, old.published_at, old.effective_on, old.superseded_at, old.evidence_item_id, old.created_by) then
      raise exception 'Only the text, file and change summary of a draft can be edited';
    end if;
  elsif old.status in ('published', 'superseded', 'retired')
        and (new.body_md, new.body_md_ar, new.file, new.sha256) is distinct from (old.body_md, old.body_md_ar, old.file, old.sha256) then
    raise exception 'A published version never changes';
  end if;
  return new;
end $$;

drop trigger if exists policy_versions_guard on public.policy_versions;
create trigger policy_versions_guard before insert or update or delete on public.policy_versions
  for each row execute function public.policy_versions_guard();

create or replace function public.policy_children_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from policies where id = new.policy_id and org_id = new.org_id) then
    raise exception 'Policy belongs to another workspace';
  end if;
  -- Nested IFs: PL/pgSQL does not short-circuit a field that the other table's row lacks.
  if tg_table_name = 'policy_requirements' then
    if not exists (select 1 from framework_requirements_v where framework = new.framework and requirement_id = new.requirement_id) then
      raise exception 'Unknown requirement % %', new.framework, new.requirement_id;
    end if;
  elsif tg_table_name = 'policy_authors' then
    if not exists (select 1 from organization_members where org_id = new.org_id and user_id = new.user_id) then
      raise exception 'Authors must be members of this workspace';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists policy_requirements_guard on public.policy_requirements;
create trigger policy_requirements_guard before insert or update on public.policy_requirements
  for each row execute function public.policy_children_guard();
drop trigger if exists policy_authors_guard on public.policy_authors;
create trigger policy_authors_guard before insert or update on public.policy_authors
  for each row execute function public.policy_children_guard();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.policies enable row level security;
alter table public.policy_authors enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_requirements enable row level security;

drop policy if exists policies_select on public.policies;
create policy policies_select on public.policies for select to authenticated using (is_org_member(org_id));
drop policy if exists policies_insert on public.policies;
create policy policies_insert on public.policies for insert to authenticated with check (is_compliance_writer(org_id));
drop policy if exists policies_update on public.policies;
create policy policies_update on public.policies for update to authenticated
  using (is_compliance_writer(org_id) or owner_id = auth.uid()) with check (is_compliance_writer(org_id) or owner_id = auth.uid());
drop policy if exists policies_delete on public.policies;
create policy policies_delete on public.policies for delete to authenticated
  using (is_org_admin(org_id) and current_version_id is null and status = 'draft');

drop policy if exists policy_authors_select on public.policy_authors;
create policy policy_authors_select on public.policy_authors for select to authenticated using (is_org_member(org_id));
drop policy if exists policy_authors_write on public.policy_authors;
create policy policy_authors_write on public.policy_authors for insert to authenticated
  with check (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));
drop policy if exists policy_authors_delete on public.policy_authors;
create policy policy_authors_delete on public.policy_authors for delete to authenticated
  using (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));

-- Viewers and auditors see published text; drafts are visible to the people working on them and to compliance writers.
drop policy if exists policy_versions_select on public.policy_versions;
create policy policy_versions_select on public.policy_versions for select to authenticated
  using (is_org_member(org_id) and (status in ('published', 'superseded', 'retired')
         or coalesce(my_role(org_id), '') not in ('viewer')));
drop policy if exists policy_versions_update on public.policy_versions;
create policy policy_versions_update on public.policy_versions for update to authenticated
  using (status = 'draft' and can_edit_policy(policy_id)) with check (can_edit_policy(policy_id));

drop policy if exists policy_requirements_select on public.policy_requirements;
create policy policy_requirements_select on public.policy_requirements for select to authenticated using (is_org_member(org_id));
drop policy if exists policy_requirements_insert on public.policy_requirements;
create policy policy_requirements_insert on public.policy_requirements for insert to authenticated
  with check (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));
drop policy if exists policy_requirements_update on public.policy_requirements;
create policy policy_requirements_update on public.policy_requirements for update to authenticated
  using (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));
drop policy if exists policy_requirements_delete on public.policy_requirements;
create policy policy_requirements_delete on public.policy_requirements for delete to authenticated
  using (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['policies', 'policy_authors', 'policy_versions', 'policy_requirements'] loop
    execute format('drop policy if exists tenant_active_guard on public.%I', t);
    execute format('create policy tenant_active_guard on public.%I as restrictive for all to authenticated using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_ins on public.%I', t);
    execute format('create policy tenant_readonly_guard_ins on public.%I as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_upd on public.%I', t);
    execute format('create policy tenant_readonly_guard_upd on public.%I as restrictive for update to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_del on public.%I', t);
    execute format('create policy tenant_readonly_guard_del on public.%I as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
  end loop;
end $$;

grant select, insert, update, delete on public.policies to authenticated;
grant select, insert, delete on public.policy_authors to authenticated;
grant select, update on public.policy_versions to authenticated;
grant select, insert, update, delete on public.policy_requirements to authenticated;
revoke insert, delete on public.policy_versions from authenticated, anon;

-- ── Workflow RPCs ─────────────────────────────────────────────────────────────
-- The tier a policy's approval needs.
create or replace function public.policy_required_authority(p_criticality text)
returns text language sql immutable as $$ select authority_for_rating(p_criticality); $$;

-- People who could approve: tier holders at or above the level (or the owner for low), minus the people who wrote it.
create or replace function public.policy_eligible_approvers(p_version uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with v as (
    select pv.*, p.owner_id, p.criticality, p.org_id as porg from policy_versions pv join policies p on p.id = pv.policy_id where pv.id = p_version
  ), cand as (
    select h.user_id from v join risk_authority_holders h on h.org_id = v.porg
     where authority_rank(h.tier) >= authority_rank(policy_required_authority(v.criticality))
    union
    select v.owner_id from v where policy_required_authority(v.criticality) = 'risk_owner'
  )
  select c.user_id from cand c, v
   where c.user_id is not null
     and c.user_id is distinct from v.submitted_by and c.user_id is distinct from v.created_by
     and not exists (select 1 from policy_authors a where a.policy_id = v.policy_id and a.user_id = c.user_id)
     and exists (select 1 from organization_members m where m.org_id = v.porg and m.user_id = c.user_id);
$$;

create or replace function public.new_policy_version(p_policy uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare p policies; cur policy_versions; v_id uuid; v_no int;
begin
  select * into p from policies where id = p_policy for update;
  if not found or not can_edit_policy(p_policy) then raise exception 'You cannot edit this policy'; end if;
  if p.status = 'retired' then raise exception 'A retired policy cannot get a new version'; end if;
  if exists (select 1 from policy_versions where policy_id = p_policy and status in ('draft', 'in_review', 'approved')) then
    raise exception 'This policy already has a version in progress';
  end if;
  select * into cur from policy_versions where id = p.current_version_id;
  select coalesce(max(version_no), 0) + 1 into v_no from policy_versions where policy_id = p_policy;
  perform set_config('risys.policy_system', 'on', true);
  insert into policy_versions (org_id, policy_id, version_no, status, body_md, body_md_ar, file, created_by)
  values (p.org_id, p_policy, v_no, 'draft', cur.body_md, cur.body_md_ar, cur.file, auth.uid())
  returning id into v_id;
  perform set_config('risys.policy_system', 'off', true);
  perform audit_log_write(p.org_id, 'policy.version_started', 'policy', p.id, p.ref || ' v' || v_no, '{}'::jsonb);
  return v_id;
end $$;

create or replace function public.submit_policy_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v policy_versions; p policies; v_n int;
begin
  select * into v from policy_versions where id = p_version for update;
  if not found or not can_edit_policy(v.policy_id) then raise exception 'You cannot submit this policy'; end if;
  if v.status <> 'draft' then raise exception 'Only a draft can be submitted'; end if;
  if coalesce(btrim(v.body_md), '') = '' and v.file is null then raise exception 'Add the policy text or attach the approved file first'; end if;
  if v.version_no > 1 and coalesce(btrim(v.change_summary), '') = '' then raise exception 'Say what changed in this version'; end if;
  select * into p from policies where id = v.policy_id;
  if not exists (select 1 from policy_requirements where policy_id = p.id) then
    raise exception 'Map the policy to at least one requirement before review';
  end if;

  perform set_config('risys.policy_system', 'on', true);
  update policy_versions set status = 'in_review', submitted_by = auth.uid(), submitted_at = now(),
         returned_by = null, returned_at = null, return_reason = null
   where id = p_version;
  if p.current_version_id is null then update policies set status = 'in_review' where id = p.id; end if;
  perform set_config('risys.policy_system', 'off', true);

  insert into notifications (org_id, user_id, type, title, body, link)
  select p.org_id, u, 'workflow', format('Policy to approve: %s', p.ref),
         format('%s v%s needs approval at %s level or above.', p.title, v.version_no, replace(policy_required_authority(p.criticality), '_', ' ')),
         '/app/policies/' || p.id
    from policy_eligible_approvers(p_version) u
   where u <> auth.uid();
  get diagnostics v_n = row_count;
  perform audit_log_write(p.org_id, 'policy.submitted', 'policy', p.id, p.ref || ' v' || v.version_no, jsonb_build_object('approvers_notified', v_n));
end $$;

create or replace function public.return_policy_version(p_version uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v policy_versions; p policies;
begin
  select * into v from policy_versions where id = p_version for update;
  select * into p from policies where id = v.policy_id;
  if not found or not is_org_member(p.org_id) then raise exception 'Policy not found'; end if;
  if v.status not in ('in_review', 'approved') then raise exception 'Only a version in review or approved can be returned'; end if;
  if not (auth.uid() in (select policy_eligible_approvers(p_version)) or is_compliance_writer(p.org_id) or p.owner_id = auth.uid()) then
    raise exception 'You cannot return this version';
  end if;
  if length(coalesce(btrim(p_reason), '')) < 5 then raise exception 'Say why the version is returned'; end if;
  perform set_config('risys.policy_system', 'on', true);
  update policy_versions set status = 'draft', returned_by = auth.uid(), returned_at = now(), return_reason = btrim(p_reason),
         approver_id = null, approved_at = null, approved_authority = null, approval_comment = null
   where id = p_version;
  if p.current_version_id is null then update policies set status = 'draft' where id = p.id; end if;
  perform set_config('risys.policy_system', 'off', true);
  perform audit_notify(p.org_id, v.submitted_by, 'workflow', format('Policy returned: %s v%s', p.ref, v.version_no), btrim(p_reason), '/app/policies/' || p.id);
  perform audit_log_write(p.org_id, 'policy.returned', 'policy', p.id, p.ref || ' v' || v.version_no, jsonb_build_object('reason', btrim(p_reason)));
end $$;

create or replace function public.approve_policy_version(p_version uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v policy_versions; p policies; v_need text; v_mine text;
begin
  select * into v from policy_versions where id = p_version for update;
  select * into p from policies where id = v.policy_id;
  if not found or not is_org_member(p.org_id) then raise exception 'Policy not found'; end if;
  if v.status <> 'in_review' then raise exception 'Only a version in review can be approved'; end if;
  if auth.uid() = v.submitted_by or auth.uid() = v.created_by
     or exists (select 1 from policy_authors a where a.policy_id = p.id and a.user_id = auth.uid()) then
    raise exception 'The author or submitter of a policy cannot approve it';
  end if;
  v_need := policy_required_authority(p.criticality);
  v_mine := user_authority(p.org_id, auth.uid(), p.owner_id);
  if v_mine is null or authority_rank(v_mine) < authority_rank(v_need) then
    raise exception 'A % policy needs % approval or above', p.criticality, replace(v_need, '_', ' ');
  end if;
  perform set_config('risys.policy_system', 'on', true);
  update policy_versions set status = 'approved', approver_id = auth.uid(), approved_at = now(),
         approved_authority = v_mine, approval_comment = nullif(btrim(p_comment), '')
   where id = p_version;
  if p.current_version_id is null then update policies set status = 'approved' where id = p.id; end if;
  perform set_config('risys.policy_system', 'off', true);
  perform audit_notify(p.org_id, p.owner_id, 'workflow', format('Policy approved: %s v%s', p.ref, v.version_no), 'Ready to publish.', '/app/policies/' || p.id);
  perform audit_notify(p.org_id, v.submitted_by, 'workflow', format('Policy approved: %s v%s', p.ref, v.version_no), 'Ready to publish.', '/app/policies/' || p.id);
  perform audit_log_write(p.org_id, 'policy.approved', 'policy', p.id, p.ref || ' v' || v.version_no, jsonb_build_object('authority', v_mine));
end $$;

-- Publish: hash, supersede, evidence, and (for ECC X-Y-1) the compliance status.
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

      -- "Documented and approved" ECC controls (X-Y-1) are evidenced by the publication itself.
      if r.framework = 'NCA ECC' and r.requirement_id ~ '^[0-9]+-[0-9]+-1$' then
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

create or replace function public.retire_policy(p_policy uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p policies; v_n int;
begin
  select * into p from policies where id = p_policy for update;
  if not found or not is_org_member(p.org_id) then raise exception 'Policy not found'; end if;
  if not (is_compliance_writer(p.org_id) or p.owner_id = auth.uid()) then raise exception 'Only the owner or a compliance writer can retire a policy'; end if;
  if p.status = 'retired' then raise exception 'Already retired'; end if;
  if length(coalesce(btrim(p_reason), '')) < 10 then raise exception 'Give a reason of at least 10 characters'; end if;
  perform set_config('risys.policy_system', 'on', true);
  update policy_versions set status = 'retired', superseded_at = now() where policy_id = p.id and status = 'published';
  update policy_versions set status = 'retired' where policy_id = p.id and status in ('draft', 'in_review', 'approved');
  update policies set status = 'retired', retired_at = now(), retired_reason = btrim(p_reason) where id = p.id;
  -- ECC controls whose status rested on this policy go back to not started.
  update compliance_statuses s
     set status = 'not_started', evidence_id = null, review_due_at = null, updated_by = auth.uid(), updated_at = now(),
         notes = format('%s retired: %s', p.ref, btrim(p_reason))
    from compliance_evidence e
   where s.evidence_id = e.id and s.org_id = p.org_id and e.answers ->> 'policy_id' = p.id::text;
  get diagnostics v_n = row_count;
  perform set_config('risys.policy_system', 'off', true);
  perform audit_log_write(p.org_id, 'policy.retired', 'policy', p.id, p.ref, jsonb_build_object('reason', btrim(p_reason), 'statuses_reset', v_n));
end $$;

-- Re-hash a version and compare with what was stored at publication.
create or replace function public.verify_policy_version(p_version uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('stored', v.sha256, 'computed', policy_version_hash(v.body_md, v.body_md_ar, v.file),
                            'match', v.sha256 = policy_version_hash(v.body_md, v.body_md_ar, v.file))
    from policy_versions v where v.id = p_version and is_org_member(v.org_id) and v.sha256 is not null;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'new_policy_version(uuid)', 'submit_policy_version(uuid)', 'return_policy_version(uuid, text)',
    'approve_policy_version(uuid, text)', 'publish_policy_version(uuid, date)', 'retire_policy(uuid, text)',
    'verify_policy_version(uuid)', 'policy_eligible_approvers(uuid)', 'can_edit_policy(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── Coverage: ECC controls that call for a document or a review, and the policies behind them ──
create or replace view public.v_policy_coverage
with (security_invoker = true) as
  with req as (
    select e.control_id::text as requirement_id, e.control_text, e.domain_id::text as domain_id, e.domain_name::text as domain_name,
           case when e.control_id ~ '^[0-9]+-[0-9]+-1$' then 'documented'
                when e.control_id ~ '^[0-9]+-[0-9]+-4$' then 'review' else 'standard' end as need
      from nca_ecc e
     where e.control_type = 'Main Control' and (e.control_id ~ '^[0-9]+-[0-9]+-1$' or e.control_id ~ '^[0-9]+-[0-9]+-4$' or e.control_id in ('1-3-3'))
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
