-- ============================================================
-- Step 0 (1 of 2): business units and the shared exception component
--
-- Business units: a per-tenant tree of organisation units, used by policies
-- now and by risks, audits and vendors later.
--
-- Exceptions: one table for every time-bound, approved deviation from a
-- policy, a finding, a vendor rule, a control or a requirement. The rules
-- live here, not in the UI:
--   * the requester can never approve their own exception
--   * the approver must hold the authority the risk rating requires
--     (risk_authority_holders; low = the subject's owner)
--   * a decision cannot be edited, only revoked
--   * every exception expires; high at most 12 months, critical 6
--   * expire_exceptions() (nightly) ends them and tells the owner
-- risk_exceptions stays as it is for the risk register for now.
-- ============================================================

-- ── 1. Business units ─────────────────────────────────────────────────────────
create table if not exists public.business_units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  code        text check (code is null or length(code) <= 24),
  parent_id   uuid references public.business_units(id) on delete restrict,
  head_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'active' check (status in ('active', 'retired')),
  source      text not null default 'manual' check (source in ('manual', 'entra_department')),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists business_units_org_name_key on public.business_units (org_id, lower(btrim(name)));
create index if not exists business_units_parent_idx on public.business_units (parent_id);

create or replace function public.business_units_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_id uuid := new.parent_id; v_depth int := 0;
begin
  new.updated_at := now();
  if new.parent_id is not null then
    if not exists (select 1 from business_units where id = new.parent_id and org_id = new.org_id) then
      raise exception 'The parent unit belongs to another workspace';
    end if;
    while v_id is not null loop
      if v_id = new.id then raise exception 'A unit cannot sit under itself'; end if;
      v_depth := v_depth + 1;
      if v_depth > 12 then raise exception 'Units can be nested at most 12 levels deep'; end if;
      select parent_id into v_id from business_units where id = v_id;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists business_units_guard on public.business_units;
create trigger business_units_guard before insert or update on public.business_units
  for each row execute function public.business_units_guard();

alter table public.business_units enable row level security;
drop policy if exists business_units_select on public.business_units;
create policy business_units_select on public.business_units for select to authenticated using (is_org_member(org_id));
drop policy if exists business_units_insert on public.business_units;
create policy business_units_insert on public.business_units for insert to authenticated with check (is_org_admin(org_id));
drop policy if exists business_units_update on public.business_units;
create policy business_units_update on public.business_units for update to authenticated using (is_org_admin(org_id)) with check (is_org_admin(org_id));
drop policy if exists business_units_delete on public.business_units;
create policy business_units_delete on public.business_units for delete to authenticated using (is_org_admin(org_id));
drop policy if exists tenant_active_guard on public.business_units;
create policy tenant_active_guard on public.business_units as restrictive for all to authenticated
  using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id));
drop policy if exists tenant_readonly_guard_ins on public.business_units;
create policy tenant_readonly_guard_ins on public.business_units as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id));
drop policy if exists tenant_readonly_guard_upd on public.business_units;
create policy tenant_readonly_guard_upd on public.business_units as restrictive for update to authenticated using (org_id is null or not is_org_readonly(org_id));
drop policy if exists tenant_readonly_guard_del on public.business_units;
create policy tenant_readonly_guard_del on public.business_units as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id));

grant select, insert, update, delete on public.business_units to authenticated;

-- Members belong to one unit (optional). Set by admins through the RPC below.
alter table public.organization_members
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null;

create or replace function public.set_member_business_unit(p_org uuid, p_user uuid, p_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_admin(p_org) then raise exception 'Only a workspace administrator can assign units'; end if;
  if p_unit is not null and not exists (select 1 from business_units where id = p_unit and org_id = p_org and status = 'active') then
    raise exception 'Unknown or retired unit';
  end if;
  update organization_members set business_unit_id = p_unit where org_id = p_org and user_id = p_user;
  if not found then raise exception 'Not a member of this workspace'; end if;
end $$;

-- Departments from the Entra directory as a starting list. Existing names are kept.
create or replace function public.import_business_units_from_entra(p_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_org_admin(p_org) then raise exception 'Only a workspace administrator can import units'; end if;
  insert into business_units (org_id, name, source, created_by)
  select distinct on (lower(btrim(e.department))) p_org, btrim(e.department), 'entra_department', auth.uid()
    from entra_users e
   where e.org_id = p_org and coalesce(btrim(e.department), '') <> '' and length(btrim(e.department)) <= 120
     and not exists (select 1 from business_units b where b.org_id = p_org and lower(btrim(b.name)) = lower(btrim(e.department)))
   order by lower(btrim(e.department));
  get diagnostics v_n = row_count;
  perform audit_log_write(p_org, 'business_units.imported', 'organization', p_org, 'Business units', jsonb_build_object('added', v_n));
  return v_n;
end $$;

revoke all on function public.set_member_business_unit(uuid, uuid, uuid) from public, anon;
revoke all on function public.import_business_units_from_entra(uuid) from public, anon;
grant execute on function public.set_member_business_unit(uuid, uuid, uuid) to authenticated;
grant execute on function public.import_business_units_from_entra(uuid) to authenticated;

-- ── 2. Authority helpers (the risk ladder, in SQL) ───────────────────────────
-- Mirrors src/lib/authority.js: risk_owner < ciso < committee < board.
create or replace function public.authority_rank(p_tier text)
returns integer language sql immutable as $$
  select case p_tier when 'risk_owner' then 0 when 'ciso' then 1 when 'committee' then 2 when 'board' then 3 else -1 end;
$$;

-- The tier a rating needs: low = the subject's owner, then CISO, committee, board.
create or replace function public.authority_for_rating(p_rating text)
returns text language sql immutable as $$
  select case p_rating when 'low' then 'risk_owner' when 'medium' then 'ciso' when 'high' then 'committee' when 'critical' then 'board' end;
$$;

-- Highest tier a user holds in a workspace; owning the subject confers risk_owner.
create or replace function public.user_authority(p_org uuid, p_user uuid, p_subject_owner uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select t from (
    select h.tier as t, authority_rank(h.tier) as r from risk_authority_holders h where h.org_id = p_org and h.user_id = p_user
    union all
    select 'risk_owner', 0 where p_subject_owner is not null and p_subject_owner = p_user
  ) x order by r desc limit 1;
$$;

revoke all on function public.user_authority(uuid, uuid, uuid) from public, anon;
grant execute on function public.user_authority(uuid, uuid, uuid) to authenticated;

-- ── 3. Exceptions ─────────────────────────────────────────────────────────────
create table if not exists public.exceptions (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  ref                   text not null,
  subject_type          text not null check (subject_type in ('policy', 'finding', 'vendor', 'control', 'requirement')),
  subject_id            text not null check (length(subject_id) <= 200),
  subject_label         text,
  subject_owner_id      uuid references auth.users(id) on delete set null,
  title                 text not null check (length(btrim(title)) between 3 and 200),
  justification         text not null check (length(btrim(justification)) >= 20),
  compensating_controls text not null check (length(btrim(compensating_controls)) >= 10),
  risk_rating           text not null check (risk_rating in ('low', 'medium', 'high', 'critical')),
  required_authority    text not null,
  decided_authority     text,
  requested_by          uuid not null references auth.users(id) on delete restrict,
  requested_at          timestamptz not null default now(),
  approver_id           uuid references auth.users(id) on delete set null,
  decided_at            timestamptz,
  decision_comment      text,
  starts_on             date not null,
  expires_on            date not null,
  status                text not null default 'submitted'
                          check (status in ('submitted', 'approved', 'rejected', 'expired', 'revoked')),
  revoked_by            uuid references auth.users(id) on delete set null,
  revoked_at            timestamptz,
  revoke_reason         text,
  updated_at            timestamptz not null default now(),
  constraint exceptions_ref_key unique (org_id, ref),
  constraint exceptions_dates check (expires_on > starts_on)
);

create index if not exists exceptions_subject_idx on public.exceptions (org_id, subject_type, subject_id);
create index if not exists exceptions_status_idx on public.exceptions (org_id, status, expires_on);

alter table public.exceptions enable row level security;
drop policy if exists exceptions_select on public.exceptions;
create policy exceptions_select on public.exceptions for select to authenticated using (is_org_member(org_id));
drop policy if exists tenant_active_guard on public.exceptions;
create policy tenant_active_guard on public.exceptions as restrictive for all to authenticated
  using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id));
-- No insert / update / delete for clients: every change goes through the RPCs below.
revoke insert, update, delete on public.exceptions from authenticated, anon;
grant select on public.exceptions to authenticated;

-- A decided exception is fixed: only revoke / expire may follow.
create or replace function public.exceptions_lifecycle()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if old.status in ('rejected', 'expired', 'revoked') then
      raise exception 'Exception % is closed and cannot change', old.ref;
    end if;
    if old.status = 'approved' and new.status not in ('approved', 'expired', 'revoked') then
      raise exception 'An approved exception can only expire or be revoked';
    end if;
    if (new.justification, new.compensating_controls, new.risk_rating, new.starts_on, new.expires_on, new.subject_type, new.subject_id, new.requested_by)
       is distinct from
       (old.justification, old.compensating_controls, old.risk_rating, old.starts_on, old.expires_on, old.subject_type, old.subject_id, old.requested_by) then
      raise exception 'The request of an exception cannot be edited; withdraw it and raise a new one';
    end if;
    if old.status <> 'submitted' and (new.approver_id, new.decided_at, new.decided_authority) is distinct from (old.approver_id, old.decided_at, old.decided_authority) then
      raise exception 'A decision cannot be edited';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists exceptions_lifecycle on public.exceptions;
create trigger exceptions_lifecycle before update on public.exceptions
  for each row execute function public.exceptions_lifecycle();

-- Who owns the subject (low-rated exceptions are decided by them).
create or replace function public.exception_subject_owner(p_org uuid, p_type text, p_id text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if p_type = 'policy' and to_regclass('public.policies') is not null then
    execute 'select owner_id from policies where org_id = $1 and id::text = $2' into v using p_org, p_id;
  elsif p_type = 'control' then
    select owner_id into v from risk_controls where org_id = p_org and id::text = p_id;
  end if;
  return v;
exception when undefined_column or undefined_table then
  return null;
end $$;

create or replace function public.request_exception(
  p_org uuid, p_subject_type text, p_subject_id text, p_subject_label text,
  p_title text, p_justification text, p_compensating text, p_rating text,
  p_starts date, p_expires date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ref text; v_tier text := authority_for_rating(p_rating);
  v_owner uuid := exception_subject_owner(p_org, p_subject_type, p_subject_id);
  v_max int := case p_rating when 'critical' then 6 when 'high' then 12 else 24 end;
begin
  if not is_org_member(p_org) or my_role(p_org) = 'viewer' then
    raise exception 'Only workspace members can request an exception';
  end if;
  if v_tier is null then raise exception 'Choose a risk rating: low, medium, high or critical'; end if;
  if p_starts is null or p_expires is null then raise exception 'An exception needs a start and an expiry date'; end if;
  if p_expires > (p_starts + make_interval(months => v_max))::date then
    raise exception 'A % exception can last at most % months', p_rating, v_max;
  end if;
  if p_expires <= (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'The expiry date must be in the future';
  end if;

  v_ref := next_ref(p_org, 'EXC');
  insert into exceptions (org_id, ref, subject_type, subject_id, subject_label, subject_owner_id, title,
                          justification, compensating_controls, risk_rating, required_authority,
                          requested_by, starts_on, expires_on)
  values (p_org, v_ref, p_subject_type, p_subject_id, p_subject_label, v_owner, btrim(p_title),
          btrim(p_justification), btrim(p_compensating), p_rating, v_tier, auth.uid(), p_starts, p_expires)
  returning id into v_id;

  -- Everyone who can decide it, except the requester.
  insert into notifications (org_id, user_id, type, title, body, link)
  select distinct p_org, u, 'workflow', format('Exception to decide: %s', v_ref),
         format('%s (%s rating) needs a decision at %s level or above.', btrim(p_title), p_rating, replace(v_tier, '_', ' ')),
         '/app/exceptions/' || v_id
    from (
      select h.user_id as u from risk_authority_holders h
       where h.org_id = p_org and authority_rank(h.tier) >= authority_rank(v_tier)
      union select v_owner where v_tier = 'risk_owner' and v_owner is not null
    ) x
   where u is not null and u <> auth.uid();

  perform audit_log_write(p_org, 'exception.requested', 'exception', v_id, v_ref,
    jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id, 'rating', p_rating, 'required', v_tier));
  return v_id;
end $$;

create or replace function public.decide_exception(p_id uuid, p_approve boolean, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare e exceptions; v_mine text;
begin
  select * into e from exceptions where id = p_id for update;
  if not found or not is_org_member(e.org_id) then raise exception 'Exception not found'; end if;
  if e.status <> 'submitted' then raise exception 'Exception % has already been decided', e.ref; end if;
  if e.requested_by = auth.uid() then raise exception 'You cannot decide an exception you requested'; end if;
  v_mine := user_authority(e.org_id, auth.uid(), e.subject_owner_id);
  if v_mine is null or authority_rank(v_mine) < authority_rank(e.required_authority) then
    raise exception 'Deciding this exception needs % authority or above', replace(e.required_authority, '_', ' ');
  end if;
  if not p_approve and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Give a reason when rejecting';
  end if;

  update exceptions
     set status = case when p_approve then 'approved' else 'rejected' end,
         approver_id = auth.uid(), decided_at = now(), decided_authority = v_mine,
         decision_comment = nullif(btrim(p_comment), '')
   where id = p_id;

  perform audit_notify(e.org_id, e.requested_by, 'workflow',
    format('Exception %s %s', e.ref, case when p_approve then 'approved' else 'rejected' end),
    e.title, '/app/exceptions/' || e.id);
  perform audit_log_write(e.org_id, case when p_approve then 'exception.approved' else 'exception.rejected' end,
    'exception', e.id, e.ref, jsonb_build_object('authority', v_mine));
end $$;

create or replace function public.revoke_exception(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e exceptions;
begin
  select * into e from exceptions where id = p_id for update;
  if not found or not is_org_member(e.org_id) then raise exception 'Exception not found'; end if;
  if e.status not in ('submitted', 'approved') then raise exception 'Exception % is already closed', e.ref; end if;
  if length(coalesce(btrim(p_reason), '')) < 10 then raise exception 'Give a reason of at least 10 characters'; end if;
  -- The requester may withdraw; an approver-level holder or an admin may revoke.
  if not (e.requested_by = auth.uid() or is_org_admin(e.org_id)
          or authority_rank(user_authority(e.org_id, auth.uid(), e.subject_owner_id)) >= authority_rank(e.required_authority)) then
    raise exception 'You cannot revoke this exception';
  end if;
  update exceptions set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revoke_reason = btrim(p_reason) where id = p_id;
  perform audit_notify(e.org_id, e.requested_by, 'workflow', format('Exception %s revoked', e.ref), btrim(p_reason), '/app/exceptions/' || e.id);
  perform audit_log_write(e.org_id, 'exception.revoked', 'exception', e.id, e.ref, jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- Nightly: approved exceptions past their expiry end; the requester and owner are told 14 days ahead and on the day.
create or replace function public.expire_exceptions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Riyadh')::date; v_exp int; v_warn int;
begin
  with ended as (
    update exceptions set status = 'expired'
     where status = 'approved' and expires_on <= v_today
     returning *
  ), told as (
    insert into notifications (org_id, user_id, type, title, body, link)
    select e.org_id, u, 'workflow', format('Exception %s expired', e.ref),
           e.title || '. The deviation is no longer approved; fix the gap or request a new exception.',
           '/app/exceptions/' || e.id
      from ended e cross join lateral (select e.requested_by as u union select e.subject_owner_id) x
     where u is not null
    returning 1
  ) select count(*) into v_exp from ended;

  insert into notifications (org_id, user_id, type, title, body, link)
  select e.org_id, u, 'workflow', format('Exception %s expires in 14 days', e.ref),
         e.title || '. Renew it or close the gap before ' || to_char(e.expires_on, 'DD Mon YYYY') || '.',
         '/app/exceptions/' || e.id
    from exceptions e cross join lateral (select e.requested_by as u union select e.subject_owner_id) x
   where e.status = 'approved' and e.expires_on = v_today + 14 and u is not null;
  get diagnostics v_warn = row_count;
  return jsonb_build_object('expired', v_exp, 'warned', v_warn, 'ran_at', now());
end $$;

revoke all on function public.request_exception(uuid, text, text, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.decide_exception(uuid, boolean, text) from public, anon;
revoke all on function public.revoke_exception(uuid, text) from public, anon;
revoke all on function public.expire_exceptions() from public, anon, authenticated;
revoke all on function public.exception_subject_owner(uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_exception(uuid, text, text, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.decide_exception(uuid, boolean, text) to authenticated;
grant execute on function public.revoke_exception(uuid, text) to authenticated;
