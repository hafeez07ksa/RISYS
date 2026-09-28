-- ════════════════════════════════════════════════════════════════════
-- PLATFORM FOUNDATION — vendor-managed multi-tenancy controls
-- ════════════════════════════════════════════════════════════════════

-- 1. Tenant controls on organizations
alter table public.organizations
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended')),
  add column if not exists plan text not null default 'standard',
  add column if not exists max_members int not null default 25,
  add column if not exists storage_quota_gb int not null default 5,
  add column if not exists managed_by_platform boolean not null default false;

-- 2. Platform admins (Sentrix staff) — completely separate from tenant roles
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists platform_admins_self_select on public.platform_admins;
create policy platform_admins_self_select on public.platform_admins
  for select to authenticated using (user_id = auth.uid());
-- (no insert/update/delete policies: rows are managed only via SQL / future
--  security-definer functions — a tenant admin can never make themself one)

create or replace function public.is_platform_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- 3. Suspension kills ALL tenant access instantly, app-wide:
--    every RLS policy goes through these two helpers.
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from organization_members m
    join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and o.status = 'active');
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from organization_members m
    join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid()
      and m.role in ('admin','owner') and o.status = 'active');
$$;

-- 4. Seat limits enforced where membership is born
create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns public.org_invitations
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_inv public.org_invitations;
        v_seats int; v_used int;
begin
  if not is_org_admin(p_org) then raise exception 'Only admins can invite members'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address: %', v_email; end if;
  if p_role not in ('admin','risk_manager','member','viewer') then raise exception 'Invalid role: %', p_role; end if;
  if exists (select 1 from organization_members m join profiles p on p.id = m.user_id
             where m.org_id = p_org and lower(p.email) = v_email) then
    raise exception '% is already a member of this organization', v_email;
  end if;

  select max_members into v_seats from organizations where id = p_org;
  select count(*) into v_used from organization_members where org_id = p_org;
  if v_used >= v_seats then
    raise exception 'Member limit reached (% seats). Contact Sentrix to increase your plan.', v_seats;
  end if;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (p_org, v_email, p_role, auth.uid(), 'pending', encode(gen_random_bytes(24),'hex'), now() + interval '7 days')
  on conflict (org_id, lower(email)) do update
    set role = excluded.role, invited_by = excluded.invited_by, status = 'pending',
        token = excluded.token, expires_at = excluded.expires_at, created_at = now()
  returning * into v_inv;
  return v_inv;
end $$;

-- Seat limit re-checked at acceptance time too (invites may outnumber seats)
create or replace function public.accept_invitation(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v record; v_user_email text; v_org_name text; v_seats int; v_used int; v_status text;
begin
  if auth.uid() is null then raise exception 'You must be signed in to accept an invitation'; end if;

  select * into v from org_invitations where token = p_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v.status = 'revoked' then raise exception 'This invitation has been revoked'; end if;
  if v.status = 'accepted' then raise exception 'This invitation has already been used'; end if;
  if v.expires_at < now() then
    update org_invitations set status = 'expired' where id = v.id;
    raise exception 'This invitation has expired — ask your administrator to send a new one';
  end if;

  select status, max_members, name into v_status, v_seats, v_org_name from organizations where id = v.org_id;
  if v_status <> 'active' then raise exception 'This organization is currently suspended'; end if;
  select count(*) into v_used from organization_members where org_id = v.org_id;
  if v_used >= v_seats then raise exception 'This organization has reached its member limit'; end if;

  select lower(email) into v_user_email from profiles where id = auth.uid();
  if v_user_email is distinct from lower(v.email) then
    raise exception 'This invitation was sent to % — you are signed in as %', v.email, v_user_email;
  end if;
  if exists (select 1 from organization_members where org_id = v.org_id and user_id = auth.uid()) then
    update org_invitations set status = 'accepted' where id = v.id;
    return json_build_object('org_id', v.org_id, 'org_name', v_org_name, 'already_member', true);
  end if;

  insert into organization_members (org_id, user_id, role, invited_by, joined_at)
  values (v.org_id, auth.uid(), v.role, v.invited_by, now());
  update org_invitations set status = 'accepted' where id = v.id;

  if v.invited_by is not null then
    insert into notifications (org_id, user_id, type, title, body, link)
    select v.org_id, v.invited_by, 'success', 'Invitation accepted',
           coalesce(p.full_name, p.email) || ' joined the organization', '/app/people'
    from profiles p where p.id = auth.uid();
  end if;

  return json_build_object('org_id', v.org_id, 'org_name', v_org_name, 'already_member', false);
end $$;

-- 5. Seed: the current account (Hafeez) is the first platform admin
insert into public.platform_admins (user_id)
select id from public.profiles where email = 'hafeez07ksa@gmail.com'
on conflict (user_id) do nothing;;
