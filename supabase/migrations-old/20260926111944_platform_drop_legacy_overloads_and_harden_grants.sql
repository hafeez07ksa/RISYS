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
