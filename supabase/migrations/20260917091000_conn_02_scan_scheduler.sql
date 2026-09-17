-- ============================================================
-- conn_02 — Scheduled connector scans
--
-- pg_cron runs dispatch_connector_scans() every 15 minutes. If any schedule
-- is due it calls the scan-dispatcher edge function (pg_net) with the internal
-- scheduler secret. The dispatcher claims due schedules, runs the connector
-- scans server-to-server and records the result (with backoff on failure).
--
-- Two Vault secrets:
--   risys_scheduler_secret  random; shared by the database and edge functions
--   risys_project_url       base URL of this Supabase project. Update it if
--                           the project moves (e.g. residency migration).
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Secrets -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'risys_scheduler_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'risys_scheduler_secret', 'Authenticates pg_cron and scan-dispatcher internal calls');
  end if;
  if not exists (select 1 from vault.secrets where name = 'risys_project_url') then
    perform vault.create_secret('https://cfyjfmlhquyxgwrekswe.supabase.co',
      'risys_project_url', 'Base URL used by the scan scheduler');
  end if;
end $$;

-- Read by edge functions (service role only) ---------------------------------
create or replace function public.internal_scheduler_secret()
returns text
language sql stable security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'risys_scheduler_secret' limit 1;
$$;
revoke all on function public.internal_scheduler_secret() from public, anon, authenticated;
grant execute on function public.internal_scheduler_secret() to service_role;

-- Claim due schedules (pushes next_run_at forward so a schedule is never run twice)
create or replace function public.claim_due_scans(p_limit integer, p_connectors text[])
returns table (org_id uuid, connector_id text)
language plpgsql security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.org_id, s.connector_id
      from public.connector_schedules s
      join public.organizations o on o.id = s.org_id and o.status = 'active'
     where s.enabled
       and s.next_run_at <= now()
       and s.connector_id = any (p_connectors)
     order by s.next_run_at
     limit greatest(p_limit, 0)
       for update of s skip locked
  )
  update public.connector_schedules s
     set next_run_at = now() + make_interval(mins => s.interval_minutes)
    from due
   where s.org_id = due.org_id and s.connector_id = due.connector_id
  returning s.org_id, s.connector_id;
end;
$$;
revoke all on function public.claim_due_scans(integer, text[]) from public, anon, authenticated;
grant execute on function public.claim_due_scans(integer, text[]) to service_role;

-- Record the outcome; failures back off exponentially (max 24 h)
create or replace function public.record_scheduled_scan(p_org uuid, p_connector text, p_status text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.connector_schedules
     set last_run_at = now(),
         last_status = p_status,
         consecutive_failures = case when p_status = 'failed' then consecutive_failures + 1 else 0 end,
         next_run_at = case
           when p_status = 'failed' then now() + least(
             make_interval(mins => interval_minutes) * power(2, least(consecutive_failures, 5))::int,
             interval '24 hours')
           else next_run_at end
   where org_id = p_org and connector_id = p_connector;
$$;
revoke all on function public.record_scheduled_scan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_scheduled_scan(uuid, text, text) to service_role;

-- Called by pg_cron ---------------------------------------------------------
create or replace function public.dispatch_connector_scans()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_url    text;
begin
  if not exists (
    select 1 from public.connector_schedules where enabled and next_run_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'risys_scheduler_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'risys_project_url';
  if v_secret is null or v_url is null then
    raise warning 'dispatch_connector_scans: scheduler secrets missing';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/scan-dispatcher',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-risys-internal', v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function public.dispatch_connector_scans() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'risys-dispatch-connector-scans';
select cron.schedule('risys-dispatch-connector-scans', '*/15 * * * *', $$ select public.dispatch_connector_scans(); $$);
