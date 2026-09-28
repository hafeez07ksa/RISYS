-- ════════════════════════════════════════════════════════════════════
-- 1. PROFILES — names/emails usable by the app (auth.users is not readable)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.sync_profile();

-- Backfill existing users
insert into public.profiles (id, email, full_name, avatar_url)
select id, email,
       coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
       raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- FK so PostgREST can embed profiles from organization_members
alter table public.organization_members
  drop constraint if exists organization_members_user_id_profiles_fkey;
alter table public.organization_members
  add constraint organization_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════
-- 2. MEMBERSHIP HELPERS (security definer → no RLS recursion)
-- ════════════════════════════════════════════════════════════════════
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from organization_members
                 where org_id = p_org and user_id = auth.uid() and role in ('admin','owner'));
$$;

-- ════════════════════════════════════════════════════════════════════
-- 3. INVITATION HARDENING
-- ════════════════════════════════════════════════════════════════════
alter table public.org_invitations alter column token set default encode(gen_random_bytes(24), 'hex');
update public.org_invitations set token = encode(gen_random_bytes(24), 'hex') where token is null;
alter table public.org_invitations alter column token set not null;
create unique index if not exists org_invitations_token_key on public.org_invitations(token);
create unique index if not exists org_invitations_org_email_key on public.org_invitations(org_id, lower(email));

-- Create (or refresh) an invitation. Admin-only, validated server-side.
create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns public.org_invitations
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_inv public.org_invitations;
begin
  if not is_org_admin(p_org) then raise exception 'Only admins can invite members'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address: %', v_email; end if;
  if p_role not in ('admin','risk_manager','member','viewer') then raise exception 'Invalid role: %', p_role; end if;
  if exists (select 1 from organization_members m join profiles p on p.id = m.user_id
             where m.org_id = p_org and lower(p.email) = v_email) then
    raise exception '% is already a member of this organization', v_email;
  end if;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (p_org, v_email, p_role, auth.uid(), 'pending', encode(gen_random_bytes(24),'hex'), now() + interval '7 days')
  on conflict (org_id, lower(email)) do update
    set role = excluded.role, invited_by = excluded.invited_by, status = 'pending',
        token = excluded.token, expires_at = excluded.expires_at, created_at = now()
  returning * into v_inv;
  return v_inv;
end $$;

-- Token lookup for the accept page (safe for anon: requires knowing the token)
create or replace function public.get_invitation_by_token(p_token text)
returns json language plpgsql security definer stable set search_path = public as $$
declare v record;
begin
  select i.*, o.name as org_name, p.full_name as inviter_name, p.email as inviter_email
  into v
  from org_invitations i
  join organizations o on o.id = i.org_id
  left join profiles p on p.id = i.invited_by
  where i.token = p_token;

  if not found then return json_build_object('valid', false, 'reason', 'not_found'); end if;
  if v.status = 'accepted' then return json_build_object('valid', false, 'reason', 'accepted', 'org_name', v.org_name); end if;
  if v.status = 'revoked' then return json_build_object('valid', false, 'reason', 'revoked', 'org_name', v.org_name); end if;
  if v.expires_at < now() then return json_build_object('valid', false, 'reason', 'expired', 'org_name', v.org_name); end if;

  return json_build_object('valid', true, 'org_name', v.org_name, 'email', v.email, 'role', v.role,
    'inviter_name', coalesce(v.inviter_name, v.inviter_email), 'expires_at', v.expires_at);
end $$;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- Accept: must be signed in, email must match, then membership is created
create or replace function public.accept_invitation(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v record; v_user_email text; v_org_name text;
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

  select lower(email) into v_user_email from profiles where id = auth.uid();
  if v_user_email is distinct from lower(v.email) then
    raise exception 'This invitation was sent to % — you are signed in as %', v.email, v_user_email;
  end if;
  if exists (select 1 from organization_members where org_id = v.org_id and user_id = auth.uid()) then
    update org_invitations set status = 'accepted' where id = v.id;
    select name into v_org_name from organizations where id = v.org_id;
    return json_build_object('org_id', v.org_id, 'org_name', v_org_name, 'already_member', true);
  end if;

  insert into organization_members (org_id, user_id, role, invited_by, joined_at)
  values (v.org_id, auth.uid(), v.role, v.invited_by, now());
  update org_invitations set status = 'accepted' where id = v.id;

  -- tell the inviter
  if v.invited_by is not null then
    insert into notifications (org_id, user_id, type, title, body, link)
    select v.org_id, v.invited_by, 'success', 'Invitation accepted',
           coalesce(p.full_name, p.email) || ' joined the organization', '/app/people'
    from profiles p where p.id = auth.uid();
  end if;

  select name into v_org_name from organizations where id = v.org_id;
  return json_build_object('org_id', v.org_id, 'org_name', v_org_name, 'already_member', false);
end $$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from org_invitations where id = p_id;
  if v_org is null then raise exception 'Invitation not found'; end if;
  if not is_org_admin(v_org) then raise exception 'Only admins can revoke invitations'; end if;
  update org_invitations set status = 'revoked' where id = p_id and status = 'pending';
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 4. LAST-ADMIN PROTECTION — an org can never be left without an admin
-- ════════════════════════════════════════════════════════════════════
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admins int;
begin
  if (tg_op = 'DELETE' and old.role in ('admin','owner'))
     or (tg_op = 'UPDATE' and old.role in ('admin','owner') and new.role not in ('admin','owner')) then
    select count(*) into v_admins from organization_members
    where org_id = old.org_id and role in ('admin','owner') and id <> old.id;
    if v_admins = 0 then
      raise exception 'Cannot remove the last admin of an organization. Promote someone else first.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_last_admin on public.organization_members;
create trigger protect_last_admin before update or delete on public.organization_members
for each row execute function public.protect_last_admin();

-- ════════════════════════════════════════════════════════════════════
-- 5. RLS LOCKDOWN — every exposed table gets org-scoped policies
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from organization_members m1 join organization_members m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.organizations enable row level security;
drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations for select to authenticated using (is_org_member(id));
drop policy if exists orgs_insert on public.organizations;
create policy orgs_insert on public.organizations for insert to authenticated with check (true);
drop policy if exists orgs_update on public.organizations;
create policy orgs_update on public.organizations for update to authenticated using (is_org_admin(id));

alter table public.organization_members enable row level security;
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated using (is_org_member(org_id));
drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members for insert to authenticated
  with check (
    is_org_admin(org_id)
    or (user_id = auth.uid() and not exists (select 1 from organization_members m where m.org_id = organization_members.org_id))
  ); -- admins add members; the org creator may add themself as first member (onboarding)
drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members for update to authenticated using (is_org_admin(org_id));
drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members for delete to authenticated
  using (is_org_admin(org_id) or user_id = auth.uid());

alter table public.org_invitations enable row level security;
drop policy if exists invitations_admin_all on public.org_invitations;
create policy invitations_admin_all on public.org_invitations for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

alter table public.org_groups enable row level security;
drop policy if exists org_groups_select on public.org_groups;
create policy org_groups_select on public.org_groups for select to authenticated using (is_org_member(org_id));
drop policy if exists org_groups_write on public.org_groups;
create policy org_groups_write on public.org_groups for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

alter table public.org_group_members enable row level security;
drop policy if exists org_group_members_select on public.org_group_members;
create policy org_group_members_select on public.org_group_members for select to authenticated using (is_org_member(org_id));
drop policy if exists org_group_members_write on public.org_group_members;
create policy org_group_members_write on public.org_group_members for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- Connectors hold credentials/config → admin only
alter table public.org_connectors enable row level security;
drop policy if exists org_connectors_admin on public.org_connectors;
create policy org_connectors_admin on public.org_connectors for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

alter table public.connector_mappings enable row level security;
drop policy if exists connector_mappings_admin on public.connector_mappings;
create policy connector_mappings_admin on public.connector_mappings for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

alter table public.entra_signin_logs enable row level security;
drop policy if exists entra_logs_admin on public.entra_signin_logs;
create policy entra_logs_admin on public.entra_signin_logs for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- Working tables → all org members
alter table public.incidents enable row level security;
drop policy if exists incidents_member_all on public.incidents;
create policy incidents_member_all on public.incidents for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table public.incident_comments enable row level security;
drop policy if exists incident_comments_member_all on public.incident_comments;
create policy incident_comments_member_all on public.incident_comments for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table public.tasks enable row level security;
drop policy if exists tasks_member_all on public.tasks;
create policy tasks_member_all on public.tasks for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table public.task_comments enable row level security;
drop policy if exists task_comments_member_all on public.task_comments;
create policy task_comments_member_all on public.task_comments for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table public.sla_config enable row level security;
drop policy if exists sla_config_select on public.sla_config;
create policy sla_config_select on public.sla_config for select to authenticated using (is_org_member(org_id));
drop policy if exists sla_config_write on public.sla_config;
create policy sla_config_write on public.sla_config for all to authenticated
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

alter table public.risks enable row level security;
drop policy if exists risks_member_all on public.risks;
create policy risks_member_all on public.risks for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table public.risk_comments enable row level security;
drop policy if exists risk_comments_member_all on public.risk_comments;
create policy risk_comments_member_all on public.risk_comments for all to authenticated
  using (is_org_member(org_id)) with check (is_org_member(org_id));;
