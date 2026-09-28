-- Adding parameters created overloads, leaving the previous rule-free versions
-- callable over the REST API. The old 2-arg delete had no suspension gate and
-- no reason, so it must not survive.
drop function if exists public.platform_delete_organization(uuid, text);
drop function if exists public.platform_set_org_status(uuid, text);
drop function if exists public.platform_create_organization(text, text, text, integer, integer, text, text);

-- The immutability trigger runs with the caller's search_path otherwise.
create or replace function platform_audit_log_immutable()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  raise exception 'platform_audit_log is append-only';
end $$;

-- Nothing in the console is reachable before signing in. The functions already
-- check is_platform_admin(), but an unauthenticated caller should not even be
-- able to reach the check and learn which functions exist.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'platform\_%'
  loop
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- platform_log is internal: callable only from the SECURITY DEFINER functions
-- above, never from a client.
revoke all on function platform_log(text, uuid, text, uuid, text, text, jsonb) from anon, authenticated;;
