-- Recompute signals whenever a connector scan finishes. A trigger rather than a
-- call inside each connector: one place, and it cannot be forgotten when a new
-- connector is added.
create or replace function public.trg_refresh_signals_after_scan()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.finished_at is not null and (old.finished_at is null or old.status is distinct from new.status) then
    begin
      perform compute_org_signals(new.org_id);
      perform compute_signals_platform(new.org_id);
    exception when others then
      -- A signal that cannot be computed must never fail the scan that produced
      -- the data. Record it and move on.
      raise warning 'refresh signals for % failed: %', new.org_id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists refresh_signals_after_scan on public.connector_scan_runs;
create trigger refresh_signals_after_scan
  after update on public.connector_scan_runs
  for each row execute function public.trg_refresh_signals_after_scan();

-- The internal signals (risk methodology, ECC assessment currency, incident
-- SLAs) change without any connector running, so they are also refreshed daily.
create or replace function public.refresh_all_org_signals()
returns void language plpgsql security definer set search_path to 'public' as $$
declare o record;
begin
  for o in select id from organizations where status = 'active' loop
    begin
      perform compute_org_signals(o.id);
      perform compute_signals_platform(o.id);
    exception when others then
      raise warning 'refresh signals for % failed: %', o.id, sqlerrm;
    end;
  end loop;
end $$;

revoke execute on function public.refresh_all_org_signals() from public, anon, authenticated;

select cron.unschedule('risys-refresh-signals') where exists (select 1 from cron.job where jobname = 'risys-refresh-signals');
select cron.schedule('risys-refresh-signals', '20 2 * * *', $$select public.refresh_all_org_signals()$$);;
