-- ============================================================
-- Step 0 (2 of 2): the unified evidence library
--
-- One evidence item can serve many requirements, controls and audit tests,
-- and carries its own validity period. Items are never deleted, only
-- superseded. Accepting or returning an item is a four-eyes step: the person
-- who added it cannot review it.
--
-- compliance_evidence stays the record of a compliance decision for one
-- requirement (the Comply flow). v_requirement_evidence lists both.
-- ============================================================

create table if not exists public.evidence_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  ref            text not null,
  title          text not null check (length(btrim(title)) between 3 and 200),
  description    text,
  kind           text not null default 'document'
                   check (kind in ('document', 'export', 'screenshot', 'record', 'attestation_set', 'policy_version')),
  files          jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  valid_from     date,
  valid_until    date,
  owner_id       uuid references auth.users(id) on delete set null,
  source_type    text not null default 'upload' check (source_type in ('upload', 'policy_version', 'attestation_campaign')),
  source_id      uuid,
  review_status  text not null default 'pending' check (review_status in ('pending', 'accepted', 'returned')),
  review_note    text,
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  superseded_by  uuid references public.evidence_items(id) on delete set null,
  added_by       uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint evidence_items_ref_key unique (org_id, ref),
  constraint evidence_items_validity check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists evidence_items_org_idx on public.evidence_items (org_id, review_status, valid_until);
create index if not exists evidence_items_source_idx on public.evidence_items (source_type, source_id);

create table if not exists public.evidence_links (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  evidence_id          uuid not null references public.evidence_items(id) on delete cascade,
  framework            text,
  requirement_id       text,
  control_id           uuid references public.risk_controls(id) on delete cascade,
  audit_scope_item_id  uuid references public.audit_scope_items(id) on delete cascade,
  linked_by            uuid references auth.users(id) on delete set null default auth.uid(),
  linked_at            timestamptz not null default now(),
  constraint evidence_links_one_target check (
    (case when framework is not null and requirement_id is not null then 1 else 0 end)
    + (case when control_id is not null then 1 else 0 end)
    + (case when audit_scope_item_id is not null then 1 else 0 end) = 1),
  constraint evidence_links_pair check ((framework is null) = (requirement_id is null))
);

create unique index if not exists evidence_links_req_key on public.evidence_links (evidence_id, framework, requirement_id) where requirement_id is not null;
create unique index if not exists evidence_links_ctl_key on public.evidence_links (evidence_id, control_id) where control_id is not null;
create unique index if not exists evidence_links_scope_key on public.evidence_links (evidence_id, audit_scope_item_id) where audit_scope_item_id is not null;
create index if not exists evidence_links_req_idx on public.evidence_links (org_id, framework, requirement_id);

-- ── Rules ─────────────────────────────────────────────────────────────────────
create or replace function public.evidence_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if coalesce(current_setting('risys.evidence_system', true), '') <> 'on' or new.ref is null or new.ref = '' then
      new.ref := next_ref(new.org_id, 'EVD');
    end if;
    if coalesce(current_setting('risys.evidence_system', true), '') <> 'on' then
      new.review_status := 'pending'; new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
      new.added_by := coalesce(auth.uid(), new.added_by);
    end if;
    return new;
  end if;
  -- Review fields change only through review_evidence() / the system.
  if coalesce(current_setting('risys.evidence_review', true), '') <> 'on'
     and coalesce(current_setting('risys.evidence_system', true), '') <> 'on'
     and (new.review_status, new.reviewed_by, new.reviewed_at, new.review_note)
         is distinct from (old.review_status, old.reviewed_by, old.reviewed_at, old.review_note) then
    raise exception 'Evidence is accepted or returned through review, not edited';
  end if;
  if new.org_id <> old.org_id or new.added_by <> old.added_by or new.ref <> old.ref
     or new.source_type <> old.source_type or new.source_id is distinct from old.source_id then
    raise exception 'The origin of an evidence item cannot change';
  end if;
  -- An accepted item is fixed; a returned one may be corrected and goes back to pending.
  if old.review_status = 'accepted' and coalesce(current_setting('risys.evidence_review', true), '') <> 'on'
     and (new.files, new.title, new.kind, new.valid_from, new.valid_until)
         is distinct from (old.files, old.title, old.kind, old.valid_from, old.valid_until) then
    raise exception 'An accepted evidence item cannot change; add a new item and supersede this one';
  end if;
  if old.review_status = 'returned' and new.review_status = 'returned' and new.files is distinct from old.files then
    new.review_status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists evidence_items_guard on public.evidence_items;
create trigger evidence_items_guard before insert or update on public.evidence_items
  for each row execute function public.evidence_items_guard();

create or replace function public.evidence_links_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from evidence_items where id = new.evidence_id and org_id = new.org_id) then
    raise exception 'Evidence item belongs to another workspace';
  end if;
  if new.control_id is not null and not exists (select 1 from risk_controls where id = new.control_id and org_id = new.org_id) then
    raise exception 'Control belongs to another workspace';
  end if;
  if new.audit_scope_item_id is not null and not exists (select 1 from audit_scope_items where id = new.audit_scope_item_id and org_id = new.org_id) then
    raise exception 'Audit test belongs to another workspace';
  end if;
  if new.requirement_id is not null and not exists (
       select 1 from framework_requirements_v where framework = new.framework and requirement_id = new.requirement_id) then
    raise exception 'Unknown requirement % %', new.framework, new.requirement_id;
  end if;
  return new;
end $$;

drop trigger if exists evidence_links_guard on public.evidence_links;
create trigger evidence_links_guard before insert or update on public.evidence_links
  for each row execute function public.evidence_links_guard();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.evidence_items enable row level security;
alter table public.evidence_links enable row level security;

drop policy if exists evidence_items_select on public.evidence_items;
create policy evidence_items_select on public.evidence_items for select to authenticated using (is_org_member(org_id));
drop policy if exists evidence_items_insert on public.evidence_items;
create policy evidence_items_insert on public.evidence_items for insert to authenticated
  with check (is_org_member(org_id) and coalesce(my_role(org_id), '') not in ('viewer', 'auditor'));
drop policy if exists evidence_items_update on public.evidence_items;
create policy evidence_items_update on public.evidence_items for update to authenticated
  using (is_compliance_writer(org_id) or added_by = auth.uid())
  with check (is_compliance_writer(org_id) or added_by = auth.uid());

drop policy if exists evidence_links_select on public.evidence_links;
create policy evidence_links_select on public.evidence_links for select to authenticated using (is_org_member(org_id));
drop policy if exists evidence_links_insert on public.evidence_links;
create policy evidence_links_insert on public.evidence_links for insert to authenticated
  with check (is_compliance_writer(org_id) or exists (select 1 from evidence_items i where i.id = evidence_id and i.added_by = auth.uid()));
drop policy if exists evidence_links_delete on public.evidence_links;
create policy evidence_links_delete on public.evidence_links for delete to authenticated using (is_compliance_writer(org_id));

do $$
declare t text;
begin
  foreach t in array array['evidence_items', 'evidence_links'] loop
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

grant select, insert, update on public.evidence_items to authenticated;
grant select, insert, delete on public.evidence_links to authenticated;
revoke delete on public.evidence_items from authenticated, anon;

-- ── RPCs ──────────────────────────────────────────────────────────────────────
-- Four-eyes review: a compliance writer who did not add the item.
create or replace function public.review_evidence(p_id uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare i evidence_items;
begin
  select * into i from evidence_items where id = p_id for update;
  if not found or not is_org_member(i.org_id) then raise exception 'Evidence not found'; end if;
  if not is_compliance_writer(i.org_id) then raise exception 'Only compliance writers review evidence'; end if;
  if i.added_by = auth.uid() then raise exception 'You cannot review evidence you added'; end if;
  if i.review_status <> 'pending' then raise exception 'Evidence % is not waiting for review', i.ref; end if;
  if not p_accept and coalesce(btrim(p_note), '') = '' then raise exception 'Say what is missing when returning evidence'; end if;
  perform set_config('risys.evidence_review', 'on', true);
  update evidence_items
     set review_status = case when p_accept then 'accepted' else 'returned' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_id;
  perform set_config('risys.evidence_review', 'off', true);
  perform audit_notify(i.org_id, i.added_by, 'workflow',
    format('Evidence %s %s', i.ref, case when p_accept then 'accepted' else 'returned' end),
    coalesce(nullif(btrim(p_note), ''), i.title), '/app/evidence/' || i.id);
  perform audit_log_write(i.org_id, case when p_accept then 'evidence.accepted' else 'evidence.returned' end,
    'evidence', i.id, i.ref, '{}'::jsonb);
end $$;

-- Replace an item with a newer one; the old one stays on record.
create or replace function public.supersede_evidence(p_old uuid, p_new uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o evidence_items; n evidence_items;
begin
  select * into o from evidence_items where id = p_old for update;
  select * into n from evidence_items where id = p_new;
  if o.id is null or n.id is null or o.org_id <> n.org_id or not is_org_member(o.org_id) then raise exception 'Evidence not found'; end if;
  if not (is_compliance_writer(o.org_id) or o.added_by = auth.uid()) then raise exception 'You cannot supersede this evidence'; end if;
  if o.superseded_by is not null then raise exception 'Evidence % is already superseded', o.ref; end if;
  perform set_config('risys.evidence_review', 'on', true);
  update evidence_items set superseded_by = p_new where id = p_old;
  perform set_config('risys.evidence_review', 'off', true);
  -- The new item inherits the old one's links.
  insert into evidence_links (org_id, evidence_id, framework, requirement_id, control_id, audit_scope_item_id)
  select org_id, p_new, framework, requirement_id, control_id, audit_scope_item_id from evidence_links where evidence_id = p_old
  on conflict do nothing;
  perform audit_log_write(o.org_id, 'evidence.superseded', 'evidence', o.id, o.ref, jsonb_build_object('by', n.ref));
end $$;

revoke all on function public.review_evidence(uuid, boolean, text) from public, anon;
revoke all on function public.supersede_evidence(uuid, uuid) from public, anon;
grant execute on function public.review_evidence(uuid, boolean, text) to authenticated;
grant execute on function public.supersede_evidence(uuid, uuid) to authenticated;

-- ── Both kinds of evidence per requirement ───────────────────────────────────
create or replace view public.v_requirement_evidence
with (security_invoker = true) as
  select e.org_id, e.framework, e.requirement_id, 'comply'::text as source, e.id as evidence_id,
         null::text as ref, coalesce(e.answers ->> 'title', 'Comply submission') as title,
         e.submitted_at as recorded_at, e.submitted_by as recorded_by,
         null::date as valid_until, 'accepted'::text as review_status, e.next_review_date
    from compliance_evidence e
  union all
  select l.org_id, l.framework, l.requirement_id, 'library', i.id, i.ref, i.title,
         i.created_at, i.added_by, i.valid_until, i.review_status, null::date
    from evidence_links l join evidence_items i on i.id = l.evidence_id
   where l.requirement_id is not null and i.superseded_by is null;

grant select on public.v_requirement_evidence to authenticated;
