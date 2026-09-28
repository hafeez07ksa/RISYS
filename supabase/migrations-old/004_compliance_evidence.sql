-- ============================================================
-- RISYS — Evidenced compliance for manual ECC controls
--
-- A manual-evidence control has no connector behind it: the only way to
-- show it is met is to hold the artefacts an assessor asks for. This adds
-- somewhere to put them, keyed to the framework requirement itself.
--
--   * compliance_evidence      — one row per Comply, append-only, holding the
--                                checklist answers and the files behind them
--   * compliance_statuses      — gains review_due_at and evidence_id, so a
--                                compliant status knows what proves it and
--                                when it goes stale
--   * compliance-evidence      — a PRIVATE storage bucket, read through
--                                signed links, isolated per organisation
--
-- Everything is additive. Run after 003_treatment_acceptance_triage.sql.
-- ============================================================

create table if not exists compliance_evidence (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  framework        text not null,
  requirement_id   text not null,
  answers          jsonb not null default '{}'::jsonb,   -- checklist answers by field key
  files            jsonb not null default '{}'::jsonb,   -- { fieldKey: [{ path, name, size, type, uploaded_at }] }
  next_review_date date,
  submitted_by     uuid references auth.users(id),
  submitted_at     timestamptz default now()
);

create index if not exists compliance_evidence_req_idx
  on compliance_evidence (org_id, framework, requirement_id, submitted_at desc);

-- The status learns what proves it and when that proof expires. Past
-- review_due_at the app reads a compliant control as Partial.
alter table compliance_statuses add column if not exists review_due_at date;
alter table compliance_statuses add column if not exists evidence_id   uuid references compliance_evidence(id) on delete set null;

-- ============================================================
-- Row Level Security — append-only history
-- Members read their organisation's evidence; risk managers and admins
-- submit it. No update or delete policy: a submission is a record.
-- ============================================================

alter table compliance_evidence enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where tablename = 'compliance_evidence' and policyname = 'compliance_evidence_select') then
    create policy "compliance_evidence_select" on compliance_evidence for select
      using (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'compliance_evidence' and policyname = 'compliance_evidence_insert') then
    create policy "compliance_evidence_insert" on compliance_evidence for insert
      with check (org_id in (select org_id from organization_members
                             where user_id = auth.uid() and role in ('admin','owner','risk_manager')));
  end if;
end
$policies$;

-- ============================================================
-- Storage — private bucket, first path segment is the org id
-- Paths are written as <org_id>/<framework>/<requirement_id>/<file>.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('compliance-evidence', 'compliance-evidence', false)
on conflict (id) do nothing;

do $storage$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'compliance_evidence_read') then
    create policy "compliance_evidence_read" on storage.objects for select
      using (bucket_id = 'compliance-evidence'
             and (storage.foldername(name))[1] in
                 (select org_id::text from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'compliance_evidence_upload') then
    create policy "compliance_evidence_upload" on storage.objects for insert
      with check (bucket_id = 'compliance-evidence'
                  and (storage.foldername(name))[1] in
                      (select org_id::text from organization_members
                       where user_id = auth.uid() and role in ('admin','owner','risk_manager')));
  end if;
end
$storage$;
