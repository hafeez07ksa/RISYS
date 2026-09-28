-- Bring m365_findings up to the shape every other connector's findings use:
-- a lifecycle (open → resolved, never deleted), a source per data source, and
-- a link back to the Microsoft portal page that shows the problem.
alter table public.m365_findings
  add column if not exists source        text not null default 'exchange',
  add column if not exists status         text not null default 'open',
  add column if not exists first_seen_at  timestamptz not null default now(),
  add column if not exists last_seen_at   timestamptz not null default now(),
  add column if not exists resolved_at    timestamptz,
  add column if not exists subject_url    text,
  add column if not exists source_url     text,
  add column if not exists incident_id    uuid references public.incidents(id) on delete set null,
  add column if not exists created_at     timestamptz default now(),
  add column if not exists updated_at     timestamptz default now();

alter table public.m365_findings alter column synced_at drop not null;

-- Existing rows predate the source column; their category is the old scope name.
update public.m365_findings set source = category where source = 'exchange' and category <> 'exchange';

create index if not exists m365_findings_status_idx  on public.m365_findings (org_id, status);
create index if not exists m365_findings_subject_idx on public.m365_findings (org_id, subject_id);
create index if not exists m365_findings_source_idx  on public.m365_findings (org_id, source);

alter table public.m365_findings drop constraint if exists m365_findings_status_check;
alter table public.m365_findings add constraint m365_findings_status_check
  check (status in ('open','resolved'));;
