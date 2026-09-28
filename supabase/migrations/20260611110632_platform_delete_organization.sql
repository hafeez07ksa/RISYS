-- ════════════════════════════════════════════════════════════════════
-- PLATFORM: permanently delete a tenant and every trace of it.
--   * platform admins only, and the name must be supplied as confirmation
--   * removes all org-scoped rows in every table that has org_id
--   * deletes the logins of users whose ONLY workspace was this org
--     (platform staff are never deleted), including their profiles
--   * removes uploaded evidence files from storage
-- ════════════════════════════════════════════════════════════════════
create or replace function public.platform_delete_organization(p_org uuid, p_confirm_name text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  v_users uuid[];
  v_deleted_users int := 0;
  t record;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;

  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  if lower(trim(p_confirm_name)) is distinct from lower(trim(v_org.name)) then
    raise exception 'Confirmation name does not match the company name';
  end if;

  -- Members whose only workspace is this org (and who are not platform staff):
  -- their logins will be destroyed entirely.
  select coalesce(array_agg(m.user_id), '{}') into v_users
  from organization_members m
  where m.org_id = p_org
    and not exists (select 1 from organization_members o where o.user_id = m.user_id and o.org_id <> p_org)
    and not exists (select 1 from platform_admins pa where pa.user_id = m.user_id);

  -- The last-admin guard exists to protect live orgs; it must not block demolition.
  alter table organization_members disable trigger protect_last_admin;

  -- Risk children first (their delete-triggers write into risk_audit_log,
  -- which is why the audit log is cleared after them).
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

  -- Catch-all: any table added later that carries org_id gets swept too,
  -- so this function cannot silently start leaving traces behind.
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_name = c.table_name and tb.table_schema = 'public' and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'org_id'
      and c.table_name <> 'organizations'
  loop
    execute format('delete from public.%I where org_id = $1', t.table_name) using p_org;
  end loop;

  -- Uploaded evidence files (stored under org-scoped paths)
  begin
    delete from storage.objects
    where bucket_id = 'risk-evidence' and name like p_org::text || '%';
  exception when others then null; -- storage cleanup is best-effort
  end;

  -- The organization itself
  delete from organizations where id = p_org;

  -- Destroy logins that existed only for this company (sessions cascade → signed out)
  if array_length(v_users, 1) > 0 then
    delete from auth.users where id = any(v_users);
    delete from profiles where id = any(v_users);
    v_deleted_users := array_length(v_users, 1);
  end if;

  return json_build_object('deleted_org', v_org.name, 'deleted_user_accounts', v_deleted_users);
end $$;

revoke execute on function public.platform_delete_organization(uuid, text) from anon, public;
grant execute on function public.platform_delete_organization(uuid, text) to authenticated;;
