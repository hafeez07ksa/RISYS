-- The scheduler used to rely on scan-dispatcher having verify_jwt = false, which
-- a redeploy from anywhere other than the CLI silently resets to true. When that
-- happens the gateway rejects the pg_net call and every tenant's scheduled scans
-- stop, with nothing in the product to show for it. Sending the publishable
-- (anon) key as the bearer satisfies the gateway either way; the real
-- authentication remains the internal secret the function checks itself.
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmeWpmbWxocXV5eGd3cmVrc3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDg0MDMsImV4cCI6MjA5NjM4NDQwM30.ArwlTMMB-Nyy-S7I8MlySBaAcI0wXdNb0mkqew3dbks',
  'risys_anon_key',
  'Publishable Supabase key, sent as the bearer on internal scheduler calls so the API gateway accepts them.')
where not exists (select 1 from vault.secrets where name = 'risys_anon_key');

create or replace function public.dispatch_connector_scans()
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_secret text;
  v_url    text;
  v_anon   text;
begin
  if not exists (
    select 1 from public.connector_schedules where enabled and next_run_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'risys_scheduler_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'risys_project_url';
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'risys_anon_key';
  if v_secret is null or v_url is null then
    raise warning 'dispatch_connector_scans: scheduler secrets missing';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/scan-dispatcher',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-risys-internal', v_secret)
               || case when v_anon is null then '{}'::jsonb
                       else jsonb_build_object('Authorization', 'Bearer ' || v_anon) end,
    timeout_milliseconds := 120000
  );
end;
$function$;;
