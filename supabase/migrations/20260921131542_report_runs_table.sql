-- ── Board and regulator reports ──────────────────────────────────────────────
--
-- Every generated report is archived: the PDF in the private `reports` bucket,
-- the exact data it was built from in `snapshot`, and a SHA-256 of the file.
-- That is what lets an organisation show a regulator precisely what the board
-- was told on a given date. Rows are never deleted, and only the presentation
-- fields can change after generation (guarded by trigger below).
create table public.report_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  report_type   text not null check (report_type in ('board_pack','ecc_status','audit_report')),
  title         text not null,
  period_label  text,
  period_start  date,
  period_end    date,
  engagement_id uuid references public.audit_engagements(id) on delete set null,
  snapshot      jsonb not null default '{}'::jsonb,
  file_path     text,
  file_size     integer,
  sha256        text,
  status        text not null default 'generated'
                check (status in ('generated','presented','submitted')),
  presented_at  timestamptz,
  presented_to  text,
  notes         text,
  generated_by  uuid references public.profiles(id) on delete set null,
  generated_at  timestamptz not null default now(),
  constraint report_runs_audit_needs_engagement check (report_type <> 'audit_report' or engagement_id is not null)
);
create index report_runs_org_idx on public.report_runs (org_id, generated_at desc);
create index report_runs_type_idx on public.report_runs (org_id, report_type);;
