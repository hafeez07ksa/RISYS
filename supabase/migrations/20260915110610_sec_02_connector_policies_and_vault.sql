-- V5: remove permissive member policies; only org admins (and service role) touch connector rows
-- V4: OAuth tokens live in Vault, reachable only by the service role
-- Applied to project cfyjfmlhquyxgwrekswe on 2026-09-15.

drop policy if exists connectors_select on public.org_connectors;
drop policy if exists connectors_insert on public.org_connectors;
drop policy if exists connectors_update on public.org_connectors;
drop policy if exists connectors_delete on public.org_connectors;
-- remaining: org_connectors_admin (ALL, authenticated, is_org_admin(org_id))

create or replace function public.connector_secret_set(p_org uuid, p_connector text, p_secret jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'connector:' || p_org::text || ':' || p_connector;
  v_id   uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'RISYS connector OAuth tokens');
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
end $$;

create or replace function public.connector_secret_get(p_org uuid, p_connector text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret::jsonb
    from vault.decrypted_secrets
   where name = 'connector:' || p_org::text || ':' || p_connector
   limit 1;
$$;

create or replace function public.connector_secret_delete(p_org uuid, p_connector text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'connector:' || p_org::text || ':' || p_connector;
$$;

revoke all on function public.connector_secret_set(uuid, text, jsonb)  from public, anon, authenticated;
revoke all on function public.connector_secret_get(uuid, text)         from public, anon, authenticated;
revoke all on function public.connector_secret_delete(uuid, text)      from public, anon, authenticated;
grant execute on function public.connector_secret_set(uuid, text, jsonb) to service_role;
grant execute on function public.connector_secret_get(uuid, text)        to service_role;
grant execute on function public.connector_secret_delete(uuid, text)     to service_role;

-- Clean up the vault secret when a connector is removed
create or replace function public.trg_org_connectors_delete_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name = 'connector:' || old.org_id::text || ':' || old.connector_id;
  return old;
end $$;
revoke all on function public.trg_org_connectors_delete_secret() from public, anon, authenticated;

drop trigger if exists org_connectors_delete_secret on public.org_connectors;
create trigger org_connectors_delete_secret
  after delete on public.org_connectors
  for each row execute function public.trg_org_connectors_delete_secret();

-- Migrate existing Jira tokens into Vault
do $$
declare r record;
begin
  for r in
    select org_id, connector_id, meta from public.org_connectors
     where connector_id = 'jira' and meta ? 'access_token'
  loop
    perform public.connector_secret_set(
      r.org_id, r.connector_id,
      jsonb_build_object(
        'access_token',  r.meta->>'access_token',
        'refresh_token', r.meta->>'refresh_token',
        'expires_at',    r.meta->>'expires_at',
        'scope',         r.meta->>'scope'
      ));
  end loop;
end $$;

-- Strip token material from every browser-readable row.
-- Entra delegated SPA tokens are discarded: all Microsoft syncs use app-only tokens.
update public.org_connectors
   set meta = meta - 'access_token' - 'refresh_token' - 'id_token'
                   - 'expires_at' - 'expires_in' - 'token_type'
 where meta ?| array['access_token','refresh_token','id_token'];
