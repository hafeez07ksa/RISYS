-- Separate ingest tokens per channel so rotating one never breaks another.
-- Applied to project cfyjfmlhquyxgwrekswe on 2026-09-15.

create or replace function public.issue_ingest_token(p_org uuid, p_connector text, p_actor uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := 'rsk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  -- jira      = native Jira webhook (issued by register-jira-webhook)
  -- jira-n8n  = n8n / manual pushes of Jira issues
  -- entra     = ingest-entra-events
  if p_connector not in ('jira', 'jira-n8n', 'entra') then
    raise exception 'Unsupported connector';
  end if;
  insert into public.ingest_tokens (org_id, connector_id, token_hash, created_by)
  values (p_org, p_connector, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_actor)
  on conflict (org_id, connector_id)
  do update set token_hash = excluded.token_hash, created_by = excluded.created_by, created_at = now();
  return v_token;
end $$;
revoke all on function public.issue_ingest_token(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_ingest_token(uuid, text, uuid) to service_role;

-- Admins may only rotate the manually-distributed tokens; the native Jira token
-- is issued exclusively by register-jira-webhook.
create or replace function public.rotate_ingest_token(p_org uuid, p_connector text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Organisation admin access required';
  end if;
  if p_connector not in ('jira-n8n', 'entra') then
    raise exception 'This token cannot be rotated manually';
  end if;
  return public.issue_ingest_token(p_org, p_connector, auth.uid());
end $$;
revoke all on function public.rotate_ingest_token(uuid, text) from public, anon;
grant execute on function public.rotate_ingest_token(uuid, text) to authenticated;
