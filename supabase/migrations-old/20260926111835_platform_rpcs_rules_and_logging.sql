-- Every platform RPC now (a) enforces its rules in the database rather than
-- trusting the console, and (b) writes to platform_audit_log.

-- ── Provision a company ─────────────────────────────────────────────────────
create or replace function platform_create_organization(
  p_name text, p_admin_email text, p_plan text default 'standard',
  p_max_members integer default 25, p_storage_gb integer default 5,
  p_industry text default null, p_size text default null,
  p_primary_contact text default null, p_notes text default null
) returns json language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_org organizations; v_inv org_invitations; v_email text := lower(trim(p_admin_email)); v_name text := trim(p_name);
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if coalesce(v_name,'') = '' then raise exception 'Company name is required'; end if;
  if length(v_name) < 2 then raise exception 'Company name is too short'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid admin email: %', v_email; end if;
  if p_plan is not null and p_plan not in ('standard','professional','enterprise') then
    raise exception 'Unknown plan: %', p_plan; end if;
  if p_max_members < 1 then raise exception 'Member limit must be at least 1'; end if;
  if p_max_members > 10000 then raise exception 'Member limit above 10000 needs a database change, not a console entry'; end if;
  if p_storage_gb < 1 then raise exception 'Storage quota must be at least 1 GB'; end if;
  -- Two workspaces with the same name split a client's data in half and nobody
  -- notices until reporting. Names must be distinct.
  if exists (select 1 from organizations where lower(name) = lower(v_name)) then
    raise exception 'A company named "%" already exists', v_name; end if;

  insert into organizations (name, slug, industry, size, plan, max_members, storage_quota_gb,
                             managed_by_platform, status, primary_contact, notes)
  values (v_name,
          lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || floor(extract(epoch from now()))::text,
          p_industry, p_size, coalesce(p_plan,'standard'), p_max_members, p_storage_gb,
          true, 'active', nullif(trim(coalesce(p_primary_contact,'')),''), nullif(trim(coalesce(p_notes,'')),''))
  returning * into v_org;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (v_org.id, v_email, 'admin', auth.uid(), 'pending',
          encode(gen_random_bytes(24),'hex'), now() + interval '14 days')
  returning * into v_inv;

  perform platform_log('company.provisioned', v_org.id, v_org.name, null, v_email, null,
    jsonb_build_object('plan', v_org.plan, 'max_members', v_org.max_members, 'storage_gb', v_org.storage_quota_gb));

  return json_build_object('org', row_to_json(v_org), 'activation_token', v_inv.token,
                           'admin_email', v_email, 'expires_at', v_inv.expires_at);
end $$;

-- ── Plan and limits ─────────────────────────────────────────────────────────
create or replace function platform_update_organization(
  p_org uuid, p_plan text default null, p_max_members integer default null, p_storage_gb integer default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org organizations; v_members int; v_changes jsonb := '{}'::jsonb;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;

  if p_plan is not null and p_plan not in ('standard','professional','enterprise') then
    raise exception 'Unknown plan: %', p_plan; end if;

  select count(*) into v_members from organization_members where org_id = p_org;
  -- A seat limit below the people already inside would leave the tenant in a
  -- state its own admin cannot fix.
  if p_max_members is not null then
    if p_max_members < 1 then raise exception 'Member limit must be at least 1'; end if;
    if p_max_members < v_members then
      raise exception 'The workspace already has % members; remove members before lowering the limit to %', v_members, p_max_members;
    end if;
  end if;
  if p_storage_gb is not null and p_storage_gb < 1 then raise exception 'Storage quota must be at least 1 GB'; end if;

  if p_plan        is not null and p_plan        is distinct from v_org.plan             then v_changes := v_changes || jsonb_build_object('plan', jsonb_build_array(v_org.plan, p_plan)); end if;
  if p_max_members is not null and p_max_members is distinct from v_org.max_members      then v_changes := v_changes || jsonb_build_object('max_members', jsonb_build_array(v_org.max_members, p_max_members)); end if;
  if p_storage_gb  is not null and p_storage_gb  is distinct from v_org.storage_quota_gb then v_changes := v_changes || jsonb_build_object('storage_gb', jsonb_build_array(v_org.storage_quota_gb, p_storage_gb)); end if;

  if v_changes = '{}'::jsonb then return; end if;

  update organizations set plan = coalesce(p_plan, plan), max_members = coalesce(p_max_members, max_members),
                           storage_quota_gb = coalesce(p_storage_gb, storage_quota_gb), updated_at = now()
  where id = p_org;

  perform platform_log('company.limits_changed', p_org, v_org.name, null, null, null, v_changes);
end $$;

-- ── Company profile and internal notes ──────────────────────────────────────
create or replace function platform_update_org_profile(
  p_org uuid, p_name text default null, p_industry text default null,
  p_size text default null, p_primary_contact text default null, p_notes text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org organizations; v_name text := nullif(trim(coalesce(p_name,'')),''); v_changes jsonb := '{}'::jsonb;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;

  if v_name is not null and lower(v_name) is distinct from lower(v_org.name)
     and exists (select 1 from organizations where lower(name) = lower(v_name) and id <> p_org) then
    raise exception 'A company named "%" already exists', v_name; end if;

  if v_name is not null and v_name is distinct from v_org.name then
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_org.name, v_name)); end if;

  update organizations set
    name            = coalesce(v_name, name),
    industry        = coalesce(nullif(trim(coalesce(p_industry,'')),''), industry),
    size            = coalesce(nullif(trim(coalesce(p_size,'')),''), size),
    primary_contact = case when p_primary_contact is null then primary_contact else nullif(trim(p_primary_contact),'') end,
    notes           = case when p_notes is null then notes else nullif(trim(p_notes),'') end,
    updated_at      = now()
  where id = p_org;

  perform platform_log('company.profile_updated', p_org, coalesce(v_name, v_org.name), null, null, null, v_changes);
end $$;

-- ── Suspend / reactivate ────────────────────────────────────────────────────
create or replace function platform_set_org_status(p_org uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org organizations; v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status: %', p_status; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  if v_org.status = p_status then return; end if;

  -- Cutting off a paying client's access is a decision someone must own.
  if p_status = 'suspended' then
    if v_reason is null or length(v_reason) < 10 then
      raise exception 'A reason of at least 10 characters is required to suspend a company';
    end if;
    update organizations set status = 'suspended', suspended_at = now(), suspension_reason = v_reason, updated_at = now() where id = p_org;
    perform platform_log('company.suspended', p_org, v_org.name, null, null, v_reason,
      jsonb_build_object('member_count', (select count(*) from organization_members where org_id = p_org)));
  else
    update organizations set status = 'active', suspended_at = null, suspension_reason = null, updated_at = now() where id = p_org;
    perform platform_log('company.reactivated', p_org, v_org.name, null, null, v_reason, '{}'::jsonb);
  end if;
end $$;

-- ── Delete a company ────────────────────────────────────────────────────────
-- Unchanged demolition logic; new gates in front of it.
create or replace function platform_delete_organization(p_org uuid, p_confirm_name text, p_reason text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_org organizations; v_users uuid[]; v_deleted_users int := 0; t record;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_counts jsonb;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;

  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  if lower(trim(p_confirm_name)) is distinct from lower(trim(v_org.name)) then
    raise exception 'Confirmation name does not match the company name';
  end if;
  -- Deletion is irreversible, so it cannot be the first action taken against a
  -- live tenant: suspend first, which gives the client a visible signal and
  -- staff a chance to notice a mistake.
  if v_org.status <> 'suspended' then
    raise exception 'Suspend the company first. A live workspace cannot be deleted directly.';
  end if;
  if v_org.suspended_at is not null and v_org.suspended_at > now() - interval '15 minutes' then
    raise exception 'This company was suspended less than 15 minutes ago. Deletion is available after that cooling-off period.';
  end if;
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'A reason of at least 10 characters is required to delete a company';
  end if;

  select jsonb_build_object(
    'members',  (select count(*) from organization_members where org_id = p_org),
    'risks',    (select count(*) from risks where org_id = p_org),
    'incidents',(select count(*) from incidents where org_id = p_org),
    'tasks',    (select count(*) from tasks where org_id = p_org),
    'evidence', (select count(*) from risk_evidence where org_id = p_org)) into v_counts;

  select coalesce(array_agg(m.user_id), '{}') into v_users
  from organization_members m
  where m.org_id = p_org
    and not exists (select 1 from organization_members o where o.user_id = m.user_id and o.org_id <> p_org)
    and not exists (select 1 from platform_admins pa where pa.user_id = m.user_id);

  alter table organization_members disable trigger protect_last_admin;

  delete from risk_treatment_updates   where org_id = p_org;
  delete from risk_treatment_actions   where org_id = p_org;
  delete from risk_exceptions          where org_id = p_org;
  delete from risk_reviews             where org_id = p_org;
  delete from risk_control_tests       where org_id = p_org;
  delete from risk_control_mappings    where org_id = p_org;
  delete from risk_evidence            where org_id = p_org;
  delete from risk_kris                where org_id = p_org;
  delete from risk_loss_events         where org_id = p_org;
  delete from risk_workflow_history    where org_id = p_org;
  delete from risk_comments            where org_id = p_org;
  delete from risk_assessment_responses where org_id = p_org;
  delete from risk_assessments         where org_id = p_org;
  delete from risk_controls            where org_id = p_org;
  delete from risks                    where org_id = p_org;
  delete from risk_audit_log           where org_id = p_org;

  delete from incident_comments        where org_id = p_org;
  delete from incidents                where org_id = p_org;
  delete from task_comments            where org_id = p_org;
  delete from tasks                    where org_id = p_org;
  delete from notifications            where org_id = p_org;
  delete from sla_config               where org_id = p_org;
  delete from connector_mappings       where org_id = p_org;
  delete from org_connectors           where org_id = p_org;
  delete from entra_signin_logs        where org_id = p_org;
  delete from org_group_members        where org_id = p_org;
  delete from org_groups               where org_id = p_org;
  delete from org_invitations          where org_id = p_org;
  delete from org_counters             where org_id = p_org;
  delete from organization_members     where org_id = p_org;

  alter table organization_members enable trigger protect_last_admin;

  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_name = c.table_name and tb.table_schema = 'public' and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'org_id'
      and c.table_name not in ('organizations','platform_audit_log')
  loop
    execute format('delete from public.%I where org_id = $1', t.table_name) using p_org;
  end loop;

  begin
    delete from storage.objects where bucket_id = 'risk-evidence' and name like p_org::text || '%';
  exception when others then null;
  end;

  delete from organizations where id = p_org;

  if array_length(v_users, 1) > 0 then
    delete from auth.users where id = any(v_users);
    delete from profiles where id = any(v_users);
    v_deleted_users := array_length(v_users, 1);
  end if;

  -- Logged last, and deliberately after the org row is gone: org_name carries
  -- the record forward.
  perform platform_log('company.deleted', p_org, v_org.name, null, null, v_reason,
    v_counts || jsonb_build_object('deleted_user_accounts', v_deleted_users, 'plan', v_org.plan));

  return json_build_object('deleted_org', v_org.name, 'deleted_user_accounts', v_deleted_users, 'counts', v_counts);
end $$;

-- ── Admin activation links ──────────────────────────────────────────────────
create or replace function platform_reissue_admin_invite(p_org uuid, p_admin_email text)
returns json language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_inv org_invitations; v_email text := lower(trim(p_admin_email)); v_org organizations;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email: %', v_email; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  if v_org.status <> 'active' then raise exception 'This company is suspended; reactivate it before issuing an activation link'; end if;
  if exists (select 1 from organization_members m join profiles p on p.id = m.user_id
             where m.org_id = p_org and lower(p.email) = v_email) then
    raise exception '% is already a member of this workspace', v_email; end if;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (p_org, v_email, 'admin', auth.uid(), 'pending', encode(gen_random_bytes(24),'hex'), now() + interval '14 days')
  on conflict (org_id, lower(email)) do update
    set role = 'admin', invited_by = excluded.invited_by, status = 'pending',
        token = excluded.token, expires_at = excluded.expires_at, created_at = now()
  returning * into v_inv;

  perform platform_log('company.admin_link_issued', p_org, v_org.name, null, v_email, null, '{}'::jsonb);
  return json_build_object('activation_token', v_inv.token, 'admin_email', v_email, 'expires_at', v_inv.expires_at);
end $$;

create or replace function platform_revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_inv org_invitations; v_org_name text;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_inv from org_invitations where id = p_invitation;
  if not found then raise exception 'Invitation not found'; end if;
  select name into v_org_name from organizations where id = v_inv.org_id;
  delete from org_invitations where id = p_invitation;
  perform platform_log('company.invitation_revoked', v_inv.org_id, v_org_name, null, v_inv.email, null,
    jsonb_build_object('role', v_inv.role, 'status', v_inv.status));
end $$;

-- ── Platform staff ──────────────────────────────────────────────────────────
create or replace function platform_add_admin(p_email text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_email text := lower(trim(p_email));
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select id into v_uid from profiles where lower(email) = v_email and deleted_at is null;
  if v_uid is null then raise exception 'No account found for %. They must sign in to RISYS once before they can be granted console access.', v_email; end if;
  if exists (select 1 from platform_admins where user_id = v_uid) then
    raise exception '% already has console access', v_email; end if;
  insert into platform_admins (user_id, added_by) values (v_uid, auth.uid());
  perform platform_log('staff.granted', null, null, v_uid, v_email, null, '{}'::jsonb);
end $$;

create or replace function platform_remove_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_email text;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove your own console access'; end if;
  if (select count(*) from platform_admins) <= 1 then raise exception 'Cannot remove the last platform admin'; end if;
  select email into v_email from profiles where id = p_user_id;
  delete from platform_admins where user_id = p_user_id;
  if not found then raise exception 'That person does not have console access'; end if;
  perform platform_log('staff.revoked', null, null, p_user_id, v_email, null, '{}'::jsonb);
end $$;
