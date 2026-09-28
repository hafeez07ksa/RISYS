-- org_connectors has last_synced, not last_sync_at. The wrong name made
-- platform_get_organization raise as soon as a company page was opened.
create or replace function platform_get_organization(p_org uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_org organizations; v_storage bigint := 0;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;

  begin
    select coalesce(sum((metadata->>'size')::bigint), 0) into v_storage
    from storage.objects where bucket_id = 'risk-evidence' and name like p_org::text || '%';
  exception when others then v_storage := 0;
  end;

  return json_build_object(
    'org', row_to_json(v_org),
    'member_count',   (select count(*) from organization_members m where m.org_id = p_org),
    'risk_count',     (select count(*) from risks r where r.org_id = p_org),
    'incident_count', (select count(*) from incidents x where x.org_id = p_org),
    'task_count',     (select count(*) from tasks t where t.org_id = p_org),
    'control_count',  (select count(*) from risk_controls c where c.org_id = p_org),
    'evidence_count', (select count(*) from risk_evidence e where e.org_id = p_org),
    'connector_count',(select count(*) from org_connectors c where c.org_id = p_org and c.status = 'connected'),
    'storage_bytes',  v_storage,
    'last_risk_activity', (select max(performed_at) from risk_audit_log a where a.org_id = p_org),
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'user_id', m.user_id, 'role', m.role, 'title', m.title,
        'joined_at', m.joined_at, 'last_active', m.last_active,
        'name', p.full_name, 'email', p.email,
        'is_platform_staff', exists (select 1 from platform_admins pa where pa.user_id = m.user_id)
      ) order by m.joined_at)
      from organization_members m left join profiles p on p.id = m.user_id
      where m.org_id = p_org), '[]'::json),
    'invitations', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'email', i.email, 'role', i.role, 'status', i.status,
        'token', i.token, 'expires_at', i.expires_at, 'created_at', i.created_at,
        'expired', i.expires_at < now()
      ) order by i.created_at desc)
      from org_invitations i where i.org_id = p_org), '[]'::json),
    'connectors', coalesce((
      select json_agg(json_build_object(
        'connector_id', c.connector_id, 'status', c.status,
        'last_sync_at', c.last_synced, 'connected_at', c.connected_at
      ) order by c.connector_id)
      from org_connectors c where c.org_id = p_org), '[]'::json),
    'activity', coalesce((
      select json_agg(json_build_object(
        'id', a.id, 'action', a.action, 'actor_email', a.actor_email,
        'reason', a.reason, 'meta', a.meta, 'target_email', a.target_email, 'created_at', a.created_at
      ) order by a.created_at desc)
      from (select * from platform_audit_log where org_id = p_org order by created_at desc limit 50) a), '[]'::json)
  );
end $$;;
