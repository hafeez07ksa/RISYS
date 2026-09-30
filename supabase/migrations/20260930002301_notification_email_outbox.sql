-- ── Email for in-app notifications ───────────────────────────────────────────
--
-- Every notification RISYS raises (review reminders, risk workflow, tasks,
-- audit requests and findings) can now also reach the person by email.
--
--   • notification_email_prefs — one switch per person per workspace. No row
--     means email is on; people turn it off from the notification bell.
--   • notification_email_queue — an outbox. A trigger on notifications adds a
--     row; nothing is sent from inside the transaction that created the
--     notification, so a slow or failing mail provider never blocks the app.
--   • dispatch_notification_emails() — every two minutes, if anything is
--     waiting, pg_cron wakes send-email with the internal scheduler secret
--     (the same mechanism as the connector scan dispatcher).
--
-- send-email claims rows with claim_notification_emails(), groups them per
-- person into one message, and writes every attempt to email_log. Recipient
-- and content always come from the notification row; the browser never names
-- either.

create table if not exists public.notification_email_prefs (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  email_enabled  boolean not null default true,
  updated_at     timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.notification_email_prefs enable row level security;

drop policy if exists "people manage their own email preference" on public.notification_email_prefs;
create policy "people manage their own email preference" on public.notification_email_prefs
  for all to authenticated
  using (user_id = auth.uid() and is_org_member(org_id))
  with check (user_id = auth.uid() and is_org_member(org_id));

drop policy if exists tenant_active_guard on public.notification_email_prefs;
create policy tenant_active_guard on public.notification_email_prefs
  as restrictive for all
  using ((org_id is null) or is_org_active(org_id))
  with check ((org_id is null) or is_org_active(org_id));

revoke all on public.notification_email_prefs from anon;
grant select, insert, update on public.notification_email_prefs to authenticated;

create table if not exists public.notification_email_queue (
  id               bigint generated always as identity primary key,
  notification_id  uuid not null unique references public.notifications(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts         int  not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  sent_at          timestamptz
);

create index if not exists notification_email_queue_pending_idx
  on public.notification_email_queue (status, created_at) where status in ('pending', 'sending');

-- Service role only: the send-email function reads and updates it.
alter table public.notification_email_queue enable row level security;
revoke all on public.notification_email_queue from anon, authenticated;

create or replace function public.trg_enqueue_notification_email()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.user_id is null or new.org_id is null then return new; end if;
  if exists (select 1 from notification_email_prefs p
              where p.org_id = new.org_id and p.user_id = new.user_id and not p.email_enabled) then
    return new;
  end if;
  begin
    insert into notification_email_queue (notification_id, org_id, user_id)
    values (new.id, new.org_id, new.user_id)
    on conflict (notification_id) do nothing;
  exception when others then
    -- Email is a courtesy copy. It must never stop the notification itself.
    raise warning 'notification email not queued for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists notification_email_enqueue on public.notifications;
create trigger notification_email_enqueue
  after insert on public.notifications
  for each row execute function public.trg_enqueue_notification_email();

revoke execute on function public.trg_enqueue_notification_email() from public, anon, authenticated;

-- Claim a batch. A row stuck in 'sending' for 15 minutes (function timed out)
-- is retried; after 3 attempts it is left as failed.
create or replace function public.claim_notification_emails(p_limit int default 100)
returns setof public.notification_email_queue
language plpgsql security definer set search_path to 'public' as $$
begin
  update notification_email_queue
     set status = 'failed', last_error = coalesce(last_error, 'Gave up after 3 attempts')
   where status = 'sending' and claimed_at < now() - interval '15 minutes' and attempts >= 3;

  return query
  update notification_email_queue q
     set status = 'sending', claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from notification_email_queue
      where status = 'pending'
         or (status = 'sending' and claimed_at < now() - interval '15 minutes' and attempts < 3)
      order by created_at
      limit greatest(1, least(p_limit, 500))
      for update skip locked)
  returning q.*;
end $$;

revoke execute on function public.claim_notification_emails(int) from public, anon, authenticated;
grant  execute on function public.claim_notification_emails(int) to service_role;

create or replace function public.dispatch_notification_emails()
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_secret text;
  v_url    text;
  v_anon   text;
begin
  if not exists (
    select 1 from public.notification_email_queue
     where status = 'pending'
        or (status = 'sending' and claimed_at < now() - interval '15 minutes' and attempts < 3)
  ) then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'risys_scheduler_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'risys_project_url';
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'risys_anon_key';
  if v_secret is null or v_url is null then
    raise warning 'dispatch_notification_emails: scheduler secrets missing';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/send-email',
    body    := '{"template":"notifications"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-risys-internal', v_secret)
               || case when v_anon is null then '{}'::jsonb
                       else jsonb_build_object('Authorization', 'Bearer ' || v_anon) end,
    timeout_milliseconds := 120000
  );
end $$;

revoke execute on function public.dispatch_notification_emails() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'risys-notification-emails';
select cron.schedule('risys-notification-emails', '*/2 * * * *', $cron$ select public.dispatch_notification_emails() $cron$);
