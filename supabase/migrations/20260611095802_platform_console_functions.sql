-- ════════════════════════════════════════════════════════════════════
-- PLATFORM CONSOLE — vendor-side operations, all gated by is_platform_admin()
-- ════════════════════════════════════════════════════════════════════

-- List every tenant with usage (seats, risks, activity)
create or replace function public.platform_list_organizations()
returns json language plpgsql security definer stable set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc) from (
      select o.id, o.name, o.slug, o.industry, o.size, o.status, o.plan,
             o.max_members, o.storage_quota_gb, o.managed_by_platform, o.created_at,
             (select count(*) from organization_members m where m.org_id = o.id) as member_count,
             (select count(*) from org_invitations i where i.org_id = o.id and i.status = 'pending' and i.expires_at > now()) as pending_invites,
             (select count(*) from risks r where r.org_id = o.id) as risk_count,
             (select count(*) from incidents x where x.org_id = o.id) as incident_count,
             (select coalesce(json_agg(json_build_object('name', p.full_name, 'email', p.email)), '[]'::json)
              from organization_members m join profiles p on p.id = m.user_id
              where m.org_id = o.id and m.role in ('admin','owner')) as admins
      from organizations o
    ) t), '[]'::json);
end $$;

-- Provision a new tenant: org + admin activation invitation in one shot.
-- Returns the invitation token → activation link is /invite/<token>.
-- We NEVER create or know the admin's password: they set it on activation.
create or replace function public.platform_create_organization(
  p_name text, p_admin_email text,
  p_plan text default 'standard', p_max_members int default 25,
  p_storage_gb int default 5, p_industry text default null, p_size text default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_org organizations; v_inv org_invitations; v_email text := lower(trim(p_admin_email));
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Company name is required'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid admin email: %', v_email; end if;
  if p_max_members < 1 then raise exception 'Member limit must be at least 1'; end if;

  insert into organizations (name, slug, industry, size, plan, max_members, storage_quota_gb, managed_by_platform, status)
  values (trim(p_name),
          lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || floor(extract(epoch from now()))::text,
          p_industry, p_size, p_plan, p_max_members, p_storage_gb, true, 'active')
  returning * into v_org;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (v_org.id, v_email, 'admin', auth.uid(), 'pending',
          encode(gen_random_bytes(24),'hex'), now() + interval '14 days')
  returning * into v_inv;

  return json_build_object('org', row_to_json(v_org), 'activation_token', v_inv.token,
                           'admin_email', v_email, 'expires_at', v_inv.expires_at);
end $$;

-- Adjust a tenant's plan / limits
create or replace function public.platform_update_organization(
  p_org uuid, p_plan text default null, p_max_members int default null, p_storage_gb int default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  update organizations set
    plan = coalesce(p_plan, plan),
    max_members = coalesce(p_max_members, max_members),
    storage_quota_gb = coalesce(p_storage_gb, storage_quota_gb),
    updated_at = now()
  where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
end $$;

-- Suspend / reactivate: suspension blinds every member instantly via RLS
create or replace function public.platform_set_org_status(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status: %', p_status; end if;
  update organizations set status = p_status, updated_at = now() where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
end $$;

-- Re-issue an admin activation link for a tenant (e.g. expired, or new admin contact)
create or replace function public.platform_reissue_admin_invite(p_org uuid, p_admin_email text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_inv org_invitations; v_email text := lower(trim(p_admin_email));
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email: %', v_email; end if;
  if not exists (select 1 from organizations where id = p_org) then raise exception 'Organization not found'; end if;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (p_org, v_email, 'admin', auth.uid(), 'pending', encode(gen_random_bytes(24),'hex'), now() + interval '14 days')
  on conflict (org_id, lower(email)) do update
    set role = 'admin', invited_by = excluded.invited_by, status = 'pending',
        token = excluded.token, expires_at = excluded.expires_at, created_at = now()
  returning * into v_inv;

  return json_build_object('activation_token', v_inv.token, 'admin_email', v_email, 'expires_at', v_inv.expires_at);
end $$;

-- Platform staff management
create or replace function public.platform_list_admins()
returns json language plpgsql security definer stable set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return coalesce((
    select json_agg(json_build_object('user_id', a.user_id, 'name', p.full_name, 'email', p.email, 'created_at', a.created_at))
    from platform_admins a join profiles p on p.id = a.user_id), '[]'::json);
end $$;

create or replace function public.platform_add_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select id into v_uid from profiles where lower(email) = lower(trim(p_email)) and deleted_at is null;
  if v_uid is null then raise exception 'No account found for %. They must have a Sentrix login first.', p_email; end if;
  insert into platform_admins (user_id, added_by) values (v_uid, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.platform_remove_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove yourself from platform admins'; end if;
  if (select count(*) from platform_admins) <= 1 then raise exception 'Cannot remove the last platform admin'; end if;
  delete from platform_admins where user_id = p_user_id;
end $$;

revoke execute on function public.platform_list_organizations() from anon, public;
revoke execute on function public.platform_create_organization(text,text,text,int,int,text,text) from anon, public;
revoke execute on function public.platform_update_organization(uuid,text,int,int) from anon, public;
revoke execute on function public.platform_set_org_status(uuid,text) from anon, public;
revoke execute on function public.platform_reissue_admin_invite(uuid,text) from anon, public;
revoke execute on function public.platform_list_admins() from anon, public;
revoke execute on function public.platform_add_admin(text) from anon, public;
revoke execute on function public.platform_remove_admin(uuid) from anon, public;;
