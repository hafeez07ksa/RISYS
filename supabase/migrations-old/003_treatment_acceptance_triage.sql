-- ============================================================
-- RISYS — Treatment decision, acceptance authority, finding triage
--
-- Steps 2 and 9 of the risk process, and the acceptance branch:
--
--   * finding_triage          — every finding is triaged by a human into
--                               attach / create / close-with-reason
--   * risk_treatment_options  — all four options recorded, rejected ones
--                               with their reasons
--   * risk_treatment_plans    — linked plans with horizons and a target
--                               residual score; tasks hang off them
--   * risk_authority_holders  — who holds CISO / committee / board
--                               authority, so acceptance can be signed at
--                               the level the band requires
--
-- Everything is additive. Run after 002_risk_gate.sql.
-- ============================================================

-- ── Acceptance authority ─────────────────────────────────────
-- The risk-owner tier needs no row: owning the risk confers it.
create table if not exists risk_authority_holders (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  tier        text not null check (tier in ('ciso', 'committee', 'board')),
  user_id     uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at  timestamptz default now(),
  unique (org_id, tier, user_id)
);

-- An acceptance above tolerance is an exception, and the record says so.
alter table risk_exceptions add column if not exists exception_type      text default 'acceptance';  -- acceptance | exception
alter table risk_exceptions add column if not exists required_authority  text;                        -- risk_owner | ciso | committee | board
alter table risk_exceptions add column if not exists decided_authority   text;                        -- the tier the approver signed under
alter table risk_exceptions add column if not exists band_at_request     text;
alter table risk_exceptions add column if not exists residual_at_request int;
alter table risk_exceptions add column if not exists review_frequency    text;                        -- exceptions default to Monthly

-- ── Treatment decision ───────────────────────────────────────
create table if not exists risk_treatment_options (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  risk_id          uuid not null references risks(id) on delete cascade,
  option           text not null check (option in ('avoid', 'reduce', 'transfer', 'accept')),
  assessment       text,
  decision         text not null default 'pending'
                   check (decision in ('pending', 'selected', 'rejected', 'not_available')),
  horizon          text check (horizon in ('immediate', 'long_term')),
  rejection_reason text,
  decided_by       uuid references auth.users(id),
  decided_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (risk_id, option),
  -- A rejected option without its reason is exactly what an auditor flags.
  check (decision not in ('rejected', 'not_available') or coalesce(trim(rejection_reason), '') <> '')
);

create sequence if not exists risk_plan_ref_seq;

create table if not exists risk_treatment_plans (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null references organizations(id) on delete cascade,
  risk_id           uuid not null references risks(id) on delete cascade,
  plan_ref          text not null default ('MIT-' || lpad(nextval('risk_plan_ref_seq')::text, 4, '0')),
  option            text not null check (option in ('avoid', 'reduce', 'transfer')),
  title             text not null,
  horizon           text check (horizon in ('immediate', 'long_term')),
  target_likelihood int check (target_likelihood between 1 and 5),
  target_impact     int check (target_impact between 1 and 5),
  owner_id          uuid references auth.users(id),
  due_date          date,
  status            text not null default 'planned'
                    check (status in ('planned', 'approved', 'in_progress', 'complete', 'cancelled')),
  approved_by       uuid references auth.users(id),
  approved_at       timestamptz,
  created_by        uuid references auth.users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists risk_treatment_plans_risk_idx on risk_treatment_plans (risk_id);

-- Tasks belong to a plan, and each says what it moves.
alter table risk_treatment_actions add column if not exists plan_id uuid references risk_treatment_plans(id) on delete set null;
alter table risk_treatment_actions add column if not exists moves   text;  -- likelihood | impact | both | none

-- ── Finding triage ───────────────────────────────────────────
create table if not exists finding_triage (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  finding_key   text not null,
  connector_id  text,
  finding_title text,
  severity      text,
  subject_id    text,
  subject_name  text,
  control_ref   text,
  disposition   text not null check (disposition in ('created', 'attached', 'closed')),
  reason_code   text,
  note          text,
  risk_id       uuid references risks(id) on delete set null,
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz default now(),
  unique (org_id, finding_key),
  -- Closing a finding without a reason code is not allowed, ever.
  check (disposition <> 'closed' or reason_code is not null)
);

create index if not exists finding_triage_risk_idx on finding_triage (risk_id);

-- ── Row Level Security ───────────────────────────────────────
alter table risk_authority_holders enable row level security;
alter table risk_treatment_options enable row level security;
alter table risk_treatment_plans   enable row level security;
alter table finding_triage         enable row level security;

do $policies$
begin
  -- Authority holders: readable by the org, assigned by admins only.
  if not exists (select 1 from pg_policies where tablename = 'risk_authority_holders' and policyname = 'authority_select') then
    create policy "authority_select" on risk_authority_holders for select
      using (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'risk_authority_holders' and policyname = 'authority_write') then
    create policy "authority_write" on risk_authority_holders for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner')))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner')));
  end if;

  -- Treatment options and plans: members of the org.
  if not exists (select 1 from pg_policies where tablename = 'risk_treatment_options' and policyname = 'treatment_options_all') then
    create policy "treatment_options_all" on risk_treatment_options for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid()))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'risk_treatment_plans' and policyname = 'treatment_plans_all') then
    create policy "treatment_plans_all" on risk_treatment_plans for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid()))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;

  -- Triage: members of the org.
  if not exists (select 1 from pg_policies where tablename = 'finding_triage' and policyname = 'finding_triage_all') then
    create policy "finding_triage_all" on finding_triage for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid()))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
end
$policies$;
