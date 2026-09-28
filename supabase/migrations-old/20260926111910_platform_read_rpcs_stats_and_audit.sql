-- ── Company list ────────────────────────────────────────────────────────────
create or replace function platform_list_organizations()
returns json language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc) from (
      select o.id, o.name, o.slug, o.industry, o.size, o.status, o.plan,
             o.max_members, o.storage_quota_gb, o.managed_by_platform, o.created_at, o.updated_at,
             o.suspended_at, o.suspension_reason, o.primary_contact, o.notes,
             (select count(*) from organization_members m where m.org_id = o.id) as member_count,
             (select count(*) from org_invitations i where i.org_id = o.id and i.status = 'pending' and i.expires_at > now()) as pending_invites,
             (select count(*) from risks r where r.org_id = o.id) as risk_count,
             (select count(*) from incidents x where x.org_id = o.id) as incident_count,
             (select max(a.performed_at) from risk_audit_log a where a.org_id = o.id) as last_activity,
             (select max(m.last_active) from organization_members m where m.org_id = o.id) as last_seen,
             (select coalesce(json_agg(json_build_object('name', p.full_name, 'email', p.email, 'role', m.role)), '[]'::json)
              from organization_members m join profiles p on p.id = m.user_id
              where m.org_id = o.id and m.role in ('admin','owner')) as admins
      from organizations o
    ) t), '[]'::json);
end $$;

-- ── One company, in full ────────────────────────────────────────────────────
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
      select json_agg(json_build_object('connector_id', c.connector_id, 'status', c.status, 'last_sync_at', c.last_sync_at) order by c.connector_id)
      from org_connectors c where c.org_id = p_org), '[]'::json),
    'activity', coalesce((
      select json_agg(json_build_object(
        'id', a.id, 'action', a.action, 'actor_email', a.actor_email,
        'reason', a.reason, 'meta', a.meta, 'target_email', a.target_email, 'created_at', a.created_at
      ) order by a.created_at desc)
      from (select * from platform_audit_log where org_id = p_org order by created_at desc limit 50) a), '[]'::json)
  );
end $$;

-- ── Platform-wide figures ───────────────────────────────────────────────────
create or replace function platform_stats()
returns json language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return json_build_object(
    'companies',        (select count(*) from organizations),
    'active',           (select count(*) from organizations where status = 'active'),
    'suspended',        (select count(*) from organizations where status = 'suspended'),
    'seats_used',       (select count(*) from organization_members),
    'seats_licensed',   (select coalesce(sum(max_members), 0) from organizations),
    'total_users',      (select count(*) from profiles where deleted_at is null),
    'pending_invites',  (select count(*) from org_invitations where status = 'pending' and expires_at > now()),
    'expired_invites',  (select count(*) from org_invitations where status = 'pending' and expires_at <= now()),
    'never_activated',  (select count(*) from organizations o where not exists (select 1 from organization_members m where m.org_id = o.id)),
    'staff',            (select count(*) from platform_admins),
    'risks',            (select count(*) from risks),
    'incidents',        (select count(*) from incidents),
    'open_incidents',   (select count(*) from incidents where status <> 'closed'),
    'by_plan',          (select coalesce(json_object_agg(plan, n), '{}'::json) from (select plan, count(*) n from organizations group by plan) p),
    'signups_30d',      (select count(*) from organizations where created_at > now() - interval '30 days'),
    'console_actions_7d', (select count(*) from platform_audit_log where created_at > now() - interval '7 days')
  );
end $$;

-- ── Console activity ────────────────────────────────────────────────────────
create or replace function platform_list_audit(
  p_limit integer default 100, p_before timestamptz default null,
  p_action text default null, p_org uuid default null, p_search text default null
) returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500); v_q text := nullif(trim(coalesce(p_search,'')),'');
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc) from (
      select a.id, a.action, a.actor_email, a.org_id, a.org_name, a.target_email,
             a.reason, a.meta, a.created_at
      from platform_audit_log a
      where (p_before is null or a.created_at < p_before)
        and (p_action is null or a.action = p_action)
        and (p_org    is null or a.org_id = p_org)
        and (v_q is null or a.org_name ilike '%'||v_q||'%' or a.actor_email ilike '%'||v_q||'%'
             or a.target_email ilike '%'||v_q||'%' or a.action ilike '%'||v_q||'%' or a.reason ilike '%'||v_q||'%')
      order by a.created_at desc
      limit v_limit
    ) t), '[]'::json);
end $$;

-- ── Staff list, with who granted access ─────────────────────────────────────
create or replace function platform_list_admins()
returns json language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'user_id', a.user_id, 'name', p.full_name, 'email', p.email, 'created_at', a.created_at,
      'added_by_email', (select p2.email from profiles p2 where p2.id = a.added_by),
      'last_action_at', (select max(l.created_at) from platform_audit_log l where l.actor_id = a.user_id)
    ) order by a.created_at)
    from platform_admins a join profiles p on p.id = a.user_id), '[]'::json);
end $$;
