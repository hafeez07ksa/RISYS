-- ============================================================
-- RISYS — Risk tolerance gate
--
-- Adds the one thing that turns a risk register into a system:
-- a tolerance rule that is evaluated automatically every time a
-- residual score changes, and that creates work when it fails.
--
-- Everything here is additive. No table or column is dropped.
-- Run this in your Supabase SQL editor after 001_initial_schema.sql.
-- ============================================================

-- ============================================================
-- 1. risks — the three-part statement, and the gate verdict
-- ============================================================

-- Cause / Event / Impact. The cause is what you fix, the event is what
-- you prevent, the impact is what you size. Stored separately so each
-- part can be pointed at; risk_statement is kept for back-compat and
-- holds the rendered sentence.
alter table risks add column if not exists cause             text;
alter table risks add column if not exists event             text;
alter table risks add column if not exists impact_statement  text;

-- The gate verdict. Written by the gate, never typed by a user.
alter table risks add column if not exists tolerance_status   text default 'not_evaluated';  -- within | breached | not_evaluated
alter table risks add column if not exists gate_failed_rules  jsonb default '[]'::jsonb;     -- [{ label, expected, actual }]
alter table risks add column if not exists gate_evaluated_at  timestamptz;
alter table risks add column if not exists breach_since       timestamptz;                   -- powers "days in breach"
alter table risks add column if not exists treatment_due_at   timestamptz;                   -- the SLA clock the gate starts

create index if not exists risks_tolerance_status_idx on risks (org_id, tolerance_status);

-- ============================================================
-- 2. risk_control_mappings — coverage belongs on the LINK
--
-- A control can be well designed, operating effectively, and still be
-- completely irrelevant to a risk because its coverage excludes the
-- asset. That gap is the risk. It cannot be inferred from the control.
-- ============================================================

alter table risk_control_mappings add column if not exists coverage      text default 'full';  -- full | partial | none
alter table risk_control_mappings add column if not exists coverage_note text;                 -- 'SaaS apps only - excludes VPN'
alter table risk_control_mappings add column if not exists reduces       text default 'both';  -- likelihood | impact | both

-- ============================================================
-- 3. risk_matrix_config — the band comes from a lookup, not the product
--
-- L x I produces gaps (25 cells, 15 distinct values) and treats the
-- diagonal as equal: L=5 x I=1 and L=1 x I=5 both score 5, but they
-- need completely different responses. Storing the band per cell lets
-- a tenant say "impact matters more than likelihood to us" without
-- touching the arithmetic.
-- ============================================================

create table if not exists risk_matrix_config (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null references organizations(id) on delete cascade,
  version           int  not null default 1,
  dimensions        int  not null default 5,
  cells             jsonb not null,              -- [{ l, i, score, band }]
  likelihood_scale  jsonb not null,              -- [{ value, label, definition }]
  impact_scale      jsonb not null,              -- [{ value, label, definition }]
  is_active         boolean not null default true,
  created_at        timestamptz default now(),
  unique(org_id, version)
);

create index if not exists risk_matrix_config_active_idx on risk_matrix_config (org_id, is_active);

-- ============================================================
-- 4. risk_score_history — append-only, never updated
--
-- Every likelihood or impact change needs an immutable row: who, when,
-- old value, new value, justification. This is the first thing an
-- external auditor asks for. Scores are appended, never overwritten,
-- and each row records the matrix version it was scored under so
-- historical scores stay interpretable after a matrix migration.
-- ============================================================

create table if not exists risk_score_history (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  risk_id         uuid not null references risks(id) on delete cascade,
  score_type      text not null,                 -- inherent | residual
  likelihood      int  not null,
  impact          int  not null,
  score           int  not null,
  band            text not null,                 -- low | medium | high | critical
  matrix_version  int  not null default 1,
  justification   text,
  prev_score      int,                           -- for the delta, null on first assessment
  assessed_by     uuid references auth.users(id),
  assessed_at     timestamptz default now()
);

create index if not exists risk_score_history_risk_idx on risk_score_history (risk_id, assessed_at desc);

-- ============================================================
-- 5. risk_tolerances — appetite is direction, tolerance is the line
--
-- Appetite is a board-level statement per category and stays prose.
-- Tolerance is the operational boundary and must be an EVALUABLE rule,
-- because the gate has to read it. max_accept_band is the authority
-- ceiling: the band above which Accept is disabled, not hidden.
-- ============================================================

create table if not exists risk_tolerances (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references organizations(id) on delete cascade,
  category           text not null,
  appetite           text default 'Cautious',
  appetite_statement text,
  rules              jsonb not null default '[]'::jsonb,   -- [{ metric, operator, value, label }]
  max_accept_band    text not null default 'medium',       -- low | medium | high | critical
  treatment_sla_days int  not null default 10,             -- days to an approved plan once breached
  escalate_to        text,                                 -- 'Cybersecurity Steering Committee'
  updated_by         uuid references auth.users(id),
  updated_at         timestamptz default now(),
  created_at         timestamptz default now(),
  unique(org_id, category)
);

-- ============================================================
-- Row Level Security
--
-- Predicates are written against organization_members directly rather
-- than the user_org_ids() helper, because 001 creates it in `public`
-- but its own policies call it as `auth.` — this avoids the ambiguity.
-- ============================================================

alter table risk_matrix_config enable row level security;
alter table risk_score_history enable row level security;
alter table risk_tolerances    enable row level security;

do $policies$
begin
  -- risk_matrix_config
  if not exists (select 1 from pg_policies where tablename = 'risk_matrix_config' and policyname = 'matrix_select') then
    create policy "matrix_select" on risk_matrix_config for select
      using (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'risk_matrix_config' and policyname = 'matrix_write') then
    create policy "matrix_write" on risk_matrix_config for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner','risk_manager')))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner','risk_manager')));
  end if;

  -- risk_score_history: readable by the org, insert-only for members.
  -- Deliberately no update or delete policy — the history is immutable.
  if not exists (select 1 from pg_policies where tablename = 'risk_score_history' and policyname = 'score_history_select') then
    create policy "score_history_select" on risk_score_history for select
      using (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'risk_score_history' and policyname = 'score_history_insert') then
    create policy "score_history_insert" on risk_score_history for insert
      with check (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;

  -- risk_tolerances
  if not exists (select 1 from pg_policies where tablename = 'risk_tolerances' and policyname = 'tolerances_select') then
    create policy "tolerances_select" on risk_tolerances for select
      using (org_id in (select org_id from organization_members where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'risk_tolerances' and policyname = 'tolerances_write') then
    create policy "tolerances_write" on risk_tolerances for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner','risk_manager')))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid() and role in ('admin','owner','risk_manager')));
  end if;
end
$policies$;

-- ============================================================
-- 6. Seed — every existing org gets a matrix and a tolerance set
--
-- The seeded 5x5 reproduces the thresholds the app hardcoded before
-- this migration (>=20 critical, >=12 high, >=6 medium), so nothing
-- re-bands on the day it is applied.
-- ============================================================

insert into risk_matrix_config (org_id, version, dimensions, cells, likelihood_scale, impact_scale, is_active)
select
  o.id, 1, 5,
  (select jsonb_agg(jsonb_build_object(
     'l', l, 'i', i, 'score', l * i,
     'band', case when l * i >= 20 then 'critical'
                  when l * i >= 12 then 'high'
                  when l * i >= 6  then 'medium'
                  else 'low' end))
   from generate_series(1,5) l, generate_series(1,5) i),
  '[{"value":1,"label":"Rare","definition":"Less than once in 5 years"},
    {"value":2,"label":"Unlikely","definition":"Once in 2 to 5 years"},
    {"value":3,"label":"Possible","definition":"Roughly annually"},
    {"value":4,"label":"Likely","definition":"Several times a year"},
    {"value":5,"label":"Almost Certain","definition":"Monthly or continuous"}]'::jsonb,
  '[{"value":1,"label":"Insignificant","definition":"Under 50K SAR / internal observation only / under 1 hour degradation"},
    {"value":2,"label":"Minor","definition":"50K to 500K SAR / internal finding, tracked / short degradation, one team"},
    {"value":3,"label":"Moderate","definition":"500K to 2M SAR / reportable, corrective plan required / half-day outage, one service"},
    {"value":4,"label":"Major","definition":"2M to 10M SAR / mandatory regulator notification / multi-service outage"},
    {"value":5,"label":"Catastrophic","definition":"Over 10M SAR / licence at risk, enforcement action / multi-day outage, public services"}]'::jsonb,
  true
from organizations o
on conflict (org_id, version) do nothing;

-- Tolerance defaults. Cyber, compliance and privacy are held to a
-- tighter line than the rest, and cannot be accepted above Medium.
insert into risk_tolerances (org_id, category, appetite, appetite_statement, rules, max_accept_band, treatment_sla_days, escalate_to)
select o.id, c.category, c.appetite, c.statement, c.rules::jsonb, c.max_band, c.sla, c.escalate
from organizations o
cross join (values
  ('Cybersecurity', 'Averse', 'Low appetite for cyber risk on internet-facing assets.',
   '[{"metric":"residual_score","operator":"<=","value":8,"label":"Residual score at or below 8"},
     {"metric":"failed_control_tests","operator":"==","value":0,"label":"No failing control tests"}]',
   'medium', 10, 'Cybersecurity Steering Committee'),
  ('Compliance & Regulatory', 'Averse', 'No appetite for known regulatory non-compliance.',
   '[{"metric":"residual_score","operator":"<=","value":8,"label":"Residual score at or below 8"}]',
   'medium', 10, 'Compliance Committee'),
  ('Data Privacy', 'Averse', 'No appetite for risks that could trigger an SDAIA breach notification.',
   '[{"metric":"residual_score","operator":"<=","value":8,"label":"Residual score at or below 8"},
     {"metric":"uncovered_controls","operator":"==","value":0,"label":"No linked control with a coverage gap"}]',
   'medium', 10, 'Data Protection Officer'),
  ('Third Party / Vendor', 'Cautious', 'Measured appetite for third-party risk where contracts carry security obligations.',
   '[{"metric":"residual_score","operator":"<=","value":10,"label":"Residual score at or below 10"}]',
   'high', 15, 'Procurement & Risk Committee'),
  ('Business Continuity', 'Cautious', 'Limited appetite for disruption to public-facing services.',
   '[{"metric":"residual_score","operator":"<=","value":10,"label":"Residual score at or below 10"}]',
   'high', 15, 'Executive Risk Committee'),
  ('Operational', 'Cautious', 'Moderate appetite where controls are demonstrably operating.',
   '[{"metric":"residual_score","operator":"<=","value":12,"label":"Residual score at or below 12"}]',
   'high', 20, 'Executive Risk Committee'),
  ('Technology / IT', 'Cautious', 'Moderate appetite outside internet-facing systems.',
   '[{"metric":"residual_score","operator":"<=","value":12,"label":"Residual score at or below 12"}]',
   'high', 20, 'Executive Risk Committee'),
  ('Physical Security', 'Cautious', 'Moderate appetite outside restricted areas.',
   '[{"metric":"residual_score","operator":"<=","value":12,"label":"Residual score at or below 12"}]',
   'high', 20, 'Executive Risk Committee'),
  ('Financial', 'Cautious', 'Appetite bounded by the annual loss threshold set by the board.',
   '[{"metric":"residual_score","operator":"<=","value":12,"label":"Residual score at or below 12"}]',
   'high', 20, 'Audit Committee'),
  ('Legal', 'Averse', 'Low appetite for unresolved legal exposure.',
   '[{"metric":"residual_score","operator":"<=","value":10,"label":"Residual score at or below 10"}]',
   'medium', 15, 'General Counsel'),
  ('Reputational', 'Cautious', 'Low appetite for risks with public or media visibility.',
   '[{"metric":"residual_score","operator":"<=","value":10,"label":"Residual score at or below 10"}]',
   'high', 15, 'Executive Risk Committee'),
  ('People & HR', 'Open', 'Higher appetite where controls are administrative and reversible.',
   '[{"metric":"residual_score","operator":"<=","value":12,"label":"Residual score at or below 12"}]',
   'high', 20, 'Executive Risk Committee'),
  ('Strategic', 'Open', 'Deliberate appetite for strategic risk taken with board visibility.',
   '[{"metric":"residual_score","operator":"<=","value":15,"label":"Residual score at or below 15"}]',
   'critical', 30, 'Board')
) as c(category, appetite, statement, rules, max_band, sla, escalate)
on conflict (org_id, category) do nothing;

-- ============================================================
-- 7. Lifecycle vocabulary
--
-- workflow_state keeps its column (so risk_workflow_history and the
-- History tab keep working) but adopts the lifecycle from the process
-- doc:  draft -> registered -> assessed -> treatment_required |
-- monitored -> under_treatment | accepted -> closed.
-- ============================================================

update risks set workflow_state = 'registered' where workflow_state = 'under_review';
update risks set workflow_state = 'assessed'   where workflow_state = 'approved';
-- Any other value the lifecycle does not recognise restarts as a draft,
-- so it is re-admitted by a reviewer rather than guessed at.
update risks set workflow_state = 'draft'
  where workflow_state is null
     or workflow_state not in ('draft','registered','assessed','treatment_required',
                               'under_treatment','accepted','monitored','closed');

-- ============================================================
-- 8. Backfill the score history
--
-- One row per existing risk per score it already carries, so the
-- Scoring tab is not empty on day one and nothing looks unaudited.
-- ============================================================

insert into risk_score_history (org_id, risk_id, score_type, likelihood, impact, score, band, matrix_version, justification, assessed_by, assessed_at)
select r.org_id, r.id, 'inherent',
       coalesce(r.inherent_likelihood, r.likelihood),
       coalesce(r.inherent_impact, r.impact),
       coalesce(r.inherent_likelihood, r.likelihood) * coalesce(r.inherent_impact, r.impact),
       case when coalesce(r.inherent_likelihood, r.likelihood) * coalesce(r.inherent_impact, r.impact) >= 20 then 'critical'
            when coalesce(r.inherent_likelihood, r.likelihood) * coalesce(r.inherent_impact, r.impact) >= 12 then 'high'
            when coalesce(r.inherent_likelihood, r.likelihood) * coalesce(r.inherent_impact, r.impact) >= 6  then 'medium'
            else 'low' end,
       1, 'Migrated from the score held before the gate was introduced.', r.created_by, coalesce(r.created_at, now())
from risks r
where coalesce(r.inherent_likelihood, r.likelihood) is not null
  and coalesce(r.inherent_impact, r.impact) is not null
  and not exists (select 1 from risk_score_history h where h.risk_id = r.id and h.score_type = 'inherent');

insert into risk_score_history (org_id, risk_id, score_type, likelihood, impact, score, band, matrix_version, justification, assessed_by, assessed_at)
select r.org_id, r.id, 'residual', r.residual_likelihood, r.residual_impact,
       r.residual_likelihood * r.residual_impact,
       case when r.residual_likelihood * r.residual_impact >= 20 then 'critical'
            when r.residual_likelihood * r.residual_impact >= 12 then 'high'
            when r.residual_likelihood * r.residual_impact >= 6  then 'medium'
            else 'low' end,
       1, 'Migrated from the score held before the gate was introduced.', r.created_by, coalesce(r.created_at, now())
from risks r
where r.residual_likelihood is not null and r.residual_impact is not null
  and not exists (select 1 from risk_score_history h where h.risk_id = r.id and h.score_type = 'residual');
