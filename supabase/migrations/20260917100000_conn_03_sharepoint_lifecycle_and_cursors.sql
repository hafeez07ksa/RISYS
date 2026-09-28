-- ============================================================
-- conn_03 — SharePoint findings lifecycle + incremental scan cursors
--
-- 1. sharepoint_findings gets the same lifecycle as defender_findings:
--    rows are resolved, never deleted.
-- 2. connector_cursors stores Microsoft Graph delta links per drive, so each
--    scan only processes what changed, and a large tenant's first scan can
--    continue across several runs. Service role only (no client policies).
-- 3. v_finding_status covers SharePoint findings too.
-- ============================================================

alter table public.sharepoint_findings
  add column if not exists status        text        not null default 'open',
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at  timestamptz not null default now(),
  add column if not exists resolved_at   timestamptz,
  add column if not exists source_url    text,
  add column if not exists incident_id   uuid references public.incidents(id) on delete set null;

do $$ begin
  alter table public.sharepoint_findings
    add constraint sharepoint_findings_status_chk check (status in ('open', 'resolved'));
exception when duplicate_object then null; end $$;

create index if not exists sharepoint_findings_status_idx on public.sharepoint_findings (org_id, status);
create index if not exists sharepoint_findings_subject_idx on public.sharepoint_findings (org_id, subject_id);

-- Findings from the old scanner used wrong checks and labels; retire them.
update public.sharepoint_findings
   set status = 'resolved', resolved_at = now()
 where status = 'open' and source in ('sharing', 'shared_file', 'permissions');

create table if not exists public.connector_cursors (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  connector_id  text not null,
  cursor_key    text not null,             -- e.g. drive id
  next_link     text,                      -- resume point inside an unfinished pass
  delta_link    text,                      -- where the next incremental pass starts
  initial_done  boolean not null default false,
  meta          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (org_id, connector_id, cursor_key)
);

alter table public.connector_cursors enable row level security;

drop policy if exists tenant_active_guard on public.connector_cursors;
create policy tenant_active_guard on public.connector_cursors
  as restrictive for all to public
  using (org_id is null or public.is_org_active(org_id))
  with check (org_id is null or public.is_org_active(org_id));

create or replace view public.v_finding_status
with (security_invoker = true) as
  select org_id, 'defender:' || finding_id as finding_key, status, resolved_at, last_seen_at
    from public.defender_findings
  union all
  select org_id, 'sharepoint:' || finding_id as finding_key, status, resolved_at, last_seen_at
    from public.sharepoint_findings;

grant select on public.v_finding_status to authenticated;
