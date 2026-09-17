-- ============================================================
-- conn_01 — Connector finding lifecycle, scan history, schedules
--
-- 1. defender_findings keeps history: rows are resolved, never deleted,
--    so a fixed posture gap or a closed alert stays on record, and a
--    finding that comes back is reopened instead of recreated.
-- 2. connector_scan_runs records every scan (manual or scheduled) with
--    what each data source returned, so "0 alerts" can never hide
--    "alerts could not be read".
-- 3. connector_schedules holds per-tenant automatic scan settings.
-- 4. v_finding_status lets triage/risk pages see whether a linked
--    finding is still open.
-- ============================================================

-- 1. Finding lifecycle ---------------------------------------------------
alter table public.defender_findings
  add column if not exists status        text        not null default 'open',
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at  timestamptz not null default now(),
  add column if not exists resolved_at   timestamptz,
  add column if not exists source_url    text,
  add column if not exists incident_id   uuid references public.incidents(id) on delete set null;

do $$ begin
  alter table public.defender_findings
    add constraint defender_findings_status_chk check (status in ('open', 'resolved'));
exception when duplicate_object then null; end $$;

update public.defender_findings set first_seen_at = created_at, last_seen_at = updated_at;

create index if not exists defender_findings_status_idx on public.defender_findings (org_id, status);

-- 2. Scan history --------------------------------------------------------
create table if not exists public.connector_scan_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  connector_id  text not null,
  trigger       text not null default 'manual' check (trigger in ('manual', 'scheduled')),
  triggered_by  uuid references auth.users(id) on delete set null,
  status        text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- per data source: { "<source>": { "state": "ok|not_licensed|no_permission|error", "detail": "..." } }
  sources       jsonb not null default '{}'::jsonb,
  counts        jsonb not null default '{}'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  error         text
);

create index if not exists connector_scan_runs_org_idx
  on public.connector_scan_runs (org_id, connector_id, started_at desc);

alter table public.connector_scan_runs enable row level security;

-- Members can read their org's scan history. Only the service role writes.
drop policy if exists scan_runs_member_read on public.connector_scan_runs;
create policy scan_runs_member_read on public.connector_scan_runs
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists tenant_active_guard on public.connector_scan_runs;
create policy tenant_active_guard on public.connector_scan_runs
  as restrictive for all to public
  using (org_id is null or public.is_org_active(org_id))
  with check (org_id is null or public.is_org_active(org_id));

-- 3. Schedules -----------------------------------------------------------
create table if not exists public.connector_schedules (
  org_id           uuid not null references public.organizations(id) on delete cascade,
  connector_id     text not null,
  enabled          boolean not null default true,
  interval_minutes integer not null default 360 check (interval_minutes between 60 and 10080),
  next_run_at      timestamptz not null default now(),
  last_run_at      timestamptz,
  last_status      text,
  consecutive_failures integer not null default 0,
  updated_by       uuid references auth.users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (org_id, connector_id)
);

create index if not exists connector_schedules_due_idx
  on public.connector_schedules (next_run_at) where enabled;

alter table public.connector_schedules enable row level security;

drop policy if exists schedules_member_read on public.connector_schedules;
create policy schedules_member_read on public.connector_schedules
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists schedules_admin_insert on public.connector_schedules;
create policy schedules_admin_insert on public.connector_schedules
  for insert to authenticated with check (public.is_org_admin(org_id));

drop policy if exists schedules_admin_update on public.connector_schedules;
create policy schedules_admin_update on public.connector_schedules
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

drop policy if exists schedules_admin_delete on public.connector_schedules;
create policy schedules_admin_delete on public.connector_schedules
  for delete to authenticated using (public.is_org_admin(org_id));

drop policy if exists tenant_active_guard on public.connector_schedules;
create policy tenant_active_guard on public.connector_schedules
  as restrictive for all to public
  using (org_id is null or public.is_org_active(org_id))
  with check (org_id is null or public.is_org_active(org_id));

-- 4. Finding status for triage / risk pages ------------------------------
-- finding_triage.finding_key is "<connector>:<finding_id>".
create or replace view public.v_finding_status
with (security_invoker = true) as
  select org_id,
         'defender:' || finding_id as finding_key,
         status, resolved_at, last_seen_at
    from public.defender_findings;

grant select on public.v_finding_status to authenticated;
