-- ── Platform audit log ───────────────────────────────────────────────────────
-- Every action taken in the platform console is recorded here. The console can
-- destroy a whole tenant and the people in it, so "who did what, when, and why"
-- must survive the thing it was done to: org_name and target_email are stored
-- as text, not as foreign keys, so the row still reads correctly after the
-- company and its accounts are gone.
create table if not exists platform_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  org_id       uuid,
  org_name     text,
  target_user_id uuid,
  target_email text,
  reason       text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx on platform_audit_log (created_at desc);
create index if not exists platform_audit_log_org_idx     on platform_audit_log (org_id, created_at desc);
create index if not exists platform_audit_log_action_idx  on platform_audit_log (action, created_at desc);

alter table platform_audit_log enable row level security;

-- Readable only by platform staff, and only through the API's anon/auth roles.
drop policy if exists platform_audit_log_read on platform_audit_log;
create policy platform_audit_log_read on platform_audit_log
  for select using (is_platform_admin());

-- No insert/update/delete policies: rows are written only by SECURITY DEFINER
-- functions, never directly by a client.

-- The log is append-only even for the service role, so a console action cannot
-- be taken and then quietly erased.
create or replace function platform_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'platform_audit_log is append-only';
end $$;

drop trigger if exists platform_audit_log_no_change on platform_audit_log;
create trigger platform_audit_log_no_change
  before update or delete on platform_audit_log
  for each row execute function platform_audit_log_immutable();

-- ── Tenant lifecycle columns ────────────────────────────────────────────────
-- Suspension is now a recorded decision with a reason and a timestamp, not just
-- a status flag, because deletion depends on it.
alter table organizations add column if not exists suspended_at      timestamptz;
alter table organizations add column if not exists suspension_reason text;
alter table organizations add column if not exists notes             text;
alter table organizations add column if not exists primary_contact   text;

comment on column organizations.notes is 'Internal account notes, visible only in the platform console.';
comment on column organizations.primary_contact is 'Client-side commercial or technical contact, for platform staff.';

-- ── Writer used by every platform RPC ───────────────────────────────────────
create or replace function platform_log(
  p_action text, p_org uuid default null, p_org_name text default null,
  p_target_user uuid default null, p_target_email text default null,
  p_reason text default null, p_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_email text;
begin
  select email into v_email from profiles where id = auth.uid();
  insert into platform_audit_log (actor_id, actor_email, action, org_id, org_name,
                                  target_user_id, target_email, reason, meta)
  values (auth.uid(), v_email, p_action, p_org,
          coalesce(p_org_name, (select name from organizations where id = p_org)),
          p_target_user, p_target_email, nullif(trim(coalesce(p_reason,'')), ''), coalesce(p_meta,'{}'::jsonb));
end $$;

revoke all on function platform_log(text, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;;
