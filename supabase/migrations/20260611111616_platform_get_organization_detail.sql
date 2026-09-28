-- Full detail view of one tenant for the platform console:
-- org + usage counts + member roster + all invitations (with tokens, so
-- support can re-send any activation/invite link without DB access).
create or replace function public.platform_get_organization(p_org uuid)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_org organizations;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;

  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;

  return json_build_object(
    'org', row_to_json(v_org),
    'member_count', (select count(*) from organization_members m where m.org_id = p_org),
    'risk_count', (select count(*) from risks r where r.org_id = p_org),
    'incident_count', (select count(*) from incidents x where x.org_id = p_org),
    'task_count', (select count(*) from tasks t where t.org_id = p_org),
    'evidence_count', (select count(*) from risk_evidence e where e.org_id = p_org),
    'last_risk_activity', (select max(performed_at) from risk_audit_log a where a.org_id = p_org),
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'user_id', m.user_id, 'role', m.role, 'title', m.title,
        'joined_at', m.joined_at, 'last_active', m.last_active,
        'name', p.full_name, 'email', p.email
      ) order by m.joined_at)
      from organization_members m left join profiles p on p.id = m.user_id
      where m.org_id = p_org), '[]'::json),
    'invitations', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'email', i.email, 'role', i.role, 'status', i.status,
        'token', i.token, 'expires_at', i.expires_at, 'created_at', i.created_at
      ) order by i.created_at desc)
      from org_invitations i where i.org_id = p_org), '[]'::json)
  );
end $$;

revoke execute on function public.platform_get_organization(uuid) from anon, public;
grant execute on function public.platform_get_organization(uuid) to authenticated;;
