-- V8 + V9: suspension revokes access everywhere; pin search_path on remaining definer functions
-- Applied to project cfyjfmlhquyxgwrekswe on 2026-09-15.

create or replace function public.is_org_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from organizations where id = p_org and status = 'active');
$$;
revoke all on function public.is_org_active(uuid) from public, anon;
grant execute on function public.is_org_active(uuid) to authenticated, service_role;

-- user_org_ids: only memberships of active organisations
create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = auth.uid()
     and o.status = 'active';
$$;

-- expire_risk_exceptions: previously callable for ANY org by anyone
create or replace function public.expire_risk_exceptions(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Not a member of this organisation';
  end if;
  with expired as (
    update risk_exceptions
       set status = 'expired', updated_at = now()
     where org_id = p_org and status = 'approved'
       and expires_at is not null and expires_at < now()
     returning risk_id
  )
  update risks r
     set status = 'open', updated_at = now()
    from expired e
   where r.id = e.risk_id and r.status = 'accepted';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_risk_exceptions(uuid) from public, anon;
grant execute on function public.expire_risk_exceptions(uuid) to authenticated;

-- Restrictive guard on every tenant table: ANDed with all existing policies,
-- so the policies that query organization_members directly also respect suspension.
do $$
declare t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col
        on col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id'
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname not in ('organization_members', 'ingest_tokens')
  loop
    execute format('drop policy if exists tenant_active_guard on public.%I', t);
    execute format(
      'create policy tenant_active_guard on public.%I as restrictive for all to public
         using (org_id is null or public.is_org_active(org_id))
         with check (org_id is null or public.is_org_active(org_id))', t);
  end loop;
end $$;

-- Applied separately right after this migration (anon evaluates the guard policy too):
grant execute on function public.is_org_active(uuid) to anon;
