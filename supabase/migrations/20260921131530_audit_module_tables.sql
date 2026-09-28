-- ── Audit management ─────────────────────────────────────────────────────────
--
-- An engagement is one audit: an internal audit, an external audit, a
-- regulator's review or a self-assessment. It has a scope (the requirements and
-- controls being tested), a workpaper per scope item (how it was tested and the
-- result), evidence requests to control owners, and findings written in the
-- standard condition / criteria / cause / effect / recommendation form with a
-- management response and a remediation lifecycle.
--
-- Independence: the auditor role writes audit records and nothing else. It
-- still cannot touch the risk register or the control library — raising a
-- finding as a risk is done by someone with risk.create.

-- Who may plan, test and raise findings.
create or replace function public.is_audit_writer(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(my_role(p_org) in ('owner','admin','risk_manager','compliance_officer','auditor'), false);
$$;

-- Who may generate and archive board and regulator reports.
create or replace function public.can_generate_reports(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(my_role(p_org) in ('owner','admin','risk_manager','compliance_officer','auditor'), false);
$$;

revoke execute on function public.is_audit_writer(uuid) from public, anon;
revoke execute on function public.can_generate_reports(uuid) from public, anon;
grant execute on function public.is_audit_writer(uuid) to authenticated;
grant execute on function public.can_generate_reports(uuid) to authenticated;

create table public.audit_engagements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  ref             text,
  title           text not null,
  audit_type      text not null default 'internal'
                  check (audit_type in ('internal','external','regulatory','self_assessment')),
  framework       text,
  objective       text,
  scope_summary   text,
  methodology     text,
  period_start    date,
  period_end      date,
  planned_start   date,
  planned_end     date,
  status          text not null default 'planned'
                  check (status in ('planned','fieldwork','reporting','closed','cancelled')),
  lead_auditor_id uuid references public.profiles(id) on delete set null,
  opinion         text check (opinion in ('effective','partially_effective','ineffective')),
  opinion_summary text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint audit_engagements_period check (period_end is null or period_start is null or period_end >= period_start),
  constraint audit_engagements_plan   check (planned_end is null or planned_start is null or planned_end >= planned_start),
  -- An engagement cannot be closed without saying what it concluded.
  constraint audit_engagements_closed_needs_opinion check (status <> 'closed' or opinion is not null)
);
create unique index audit_engagements_ref_uq on public.audit_engagements (org_id, ref);
create index audit_engagements_org_idx on public.audit_engagements (org_id, status);

create table public.audit_scope_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  engagement_id    uuid not null references public.audit_engagements(id) on delete cascade,
  framework        text,
  requirement_id   text,
  control_id       uuid references public.risk_controls(id) on delete set null,
  title            text not null,
  test_procedure   text,
  population_size  integer check (population_size is null or population_size >= 0),
  sample_size      integer check (sample_size is null or sample_size >= 0),
  exceptions_found integer check (exceptions_found is null or exceptions_found >= 0),
  result           text not null default 'not_tested'
                   check (result in ('not_tested','effective','partially_effective','ineffective','not_applicable')),
  result_notes     text,
  tested_by        uuid references public.profiles(id) on delete set null,
  tested_at        timestamptz,
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Four-eyes: whoever reviews a test did not perform it.
  constraint audit_scope_items_four_eyes check (reviewed_by is null or tested_by is null or reviewed_by <> tested_by),
  constraint audit_scope_items_sample    check (sample_size is null or population_size is null or sample_size <= population_size),
  constraint audit_scope_items_target    check (requirement_id is not null or control_id is not null or title is not null)
);
create index audit_scope_items_eng_idx on public.audit_scope_items (engagement_id, sort_order);
create index audit_scope_items_org_idx on public.audit_scope_items (org_id);

create table public.audit_evidence_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  engagement_id  uuid not null references public.audit_engagements(id) on delete cascade,
  scope_item_id  uuid references public.audit_scope_items(id) on delete set null,
  title          text not null,
  description    text,
  requested_from uuid references public.profiles(id) on delete set null,
  due_date       date,
  status         text not null default 'open'
                 check (status in ('open','submitted','accepted','rejected')),
  response_note  text,
  review_note    text,
  submitted_at   timestamptz,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index audit_evidence_requests_eng_idx on public.audit_evidence_requests (engagement_id, status);
create index audit_evidence_requests_assignee_idx on public.audit_evidence_requests (org_id, requested_from, status);

create table public.audit_evidence_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  engagement_id uuid not null references public.audit_engagements(id) on delete cascade,
  request_id    uuid references public.audit_evidence_requests(id) on delete cascade,
  scope_item_id uuid references public.audit_scope_items(id) on delete set null,
  file_path     text not null,
  file_name     text not null,
  file_size     integer,
  sha256        text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index audit_evidence_files_eng_idx on public.audit_evidence_files (engagement_id);
create index audit_evidence_files_req_idx on public.audit_evidence_files (request_id);

create table public.audit_findings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  engagement_id       uuid not null references public.audit_engagements(id) on delete cascade,
  scope_item_id       uuid references public.audit_scope_items(id) on delete set null,
  ref                 text,
  title               text not null,
  rating              text not null default 'medium'
                      check (rating in ('high','medium','low','observation')),
  condition           text,       -- what we found
  criteria            text,       -- what should be the case
  cause               text,       -- why it happened
  effect              text,       -- the risk or impact
  recommendation      text,
  framework           text,
  requirement_id      text,
  management_response text,
  response_owner      uuid references public.profiles(id) on delete set null,
  action_plan         text,
  due_date            date,
  status              text not null default 'draft'
                      check (status in ('draft','open','in_remediation','ready_for_validation','closed','risk_accepted')),
  risk_id             uuid references public.risks(id) on delete set null,
  validated_by        uuid references public.profiles(id) on delete set null,
  validated_at        timestamptz,
  closed_at           timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A finding that is formally raised must say what was found and what to do.
  constraint audit_findings_complete check (status = 'draft' or (condition is not null and recommendation is not null))
);
create unique index audit_findings_ref_uq on public.audit_findings (org_id, ref);
create index audit_findings_eng_idx on public.audit_findings (engagement_id);
create index audit_findings_owner_idx on public.audit_findings (org_id, response_owner, status);
create index audit_findings_status_idx on public.audit_findings (org_id, status);;
