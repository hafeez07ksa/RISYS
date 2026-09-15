-- V2/V3: per-tenant ingest credentials. Only a SHA-256 hash is stored.
-- Applied to project cfyjfmlhquyxgwrekswe on 2026-09-15.
-- (issue_ingest_token / rotate_ingest_token are superseded by sec_05.)

create table if not exists public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  connector_id text not null,
  token_hash   text not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  unique (org_id, connector_id)
);
alter table public.ingest_tokens enable row level security;
-- No policies on purpose: service role only.
revoke all on public.ingest_tokens from anon, authenticated;

create or replace function public.issue_ingest_token(p_org uuid, p_connector text, p_actor uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := 'rsk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_connector not in ('jira', 'entra') then
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
  return public.issue_ingest_token(p_org, p_connector, auth.uid());
end $$;
revoke all on function public.rotate_ingest_token(uuid, text) from public, anon;
grant execute on function public.rotate_ingest_token(uuid, text) to authenticated;
