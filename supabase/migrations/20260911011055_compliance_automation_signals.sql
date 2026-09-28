-- ═══════════════════════════════════════════════════════════════════════════
--  Compliance automation layer
--  Closes the gap between the findings engine and the compliance engine.
--  Until now a finding carried a free-text control reference that no query
--  ever joined on. These tables make the link a real key.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Signal catalogue (global, not per-org) ──────────────────────────────
create table if not exists compliance_signals (
  signal_key      text primary key,
  connector_id    text not null,
  name            text not null,
  description     text,
  method          text not null default 'aggregate',
  finding_type    text,
  unit            text not null default 'ratio',
  pass_threshold  numeric,
  partial_threshold numeric,
  higher_is_better boolean not null default true,
  requires_license text,
  is_active       boolean not null default true,
  created_at      timestamptz default now()
);

comment on table compliance_signals is
  'Catalogue of automated measurements RISYS can compute from connector data. One row per distinct measurement, not per control.';
comment on column compliance_signals.finding_type is
  'The findings-engine finding id this signal aggregates, where one exists (e.g. no_mfa). Null for signals with no per-subject finding.';
comment on column compliance_signals.requires_license is
  'Tenant capability required for this signal to return data at all, e.g. entra_id_p1. Null means no licence gate.';

-- ── 2. Signal → requirement map (global seed, org may extend) ──────────────
create table if not exists signal_requirement_map (
  id            uuid primary key default gen_random_uuid(),
  signal_key    text not null references compliance_signals(signal_key) on delete cascade,
  framework     text not null,
  requirement_id text not null,
  weight        numeric not null default 1,
  org_id        uuid references organizations(id) on delete cascade,
  note          text,
  created_at    timestamptz default now()
);

create unique index if not exists signal_requirement_map_uniq
  on signal_requirement_map (signal_key, framework, requirement_id, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists signal_requirement_map_req_idx
  on signal_requirement_map (framework, requirement_id);

comment on table signal_requirement_map is
  'Many-to-many: one signal can evidence several requirements, one requirement can need several signals. org_id null = platform default, non-null = org override.';

-- ── 3. Computed results, per org ───────────────────────────────────────────
create table if not exists org_signal_results (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  signal_key   text not null references compliance_signals(signal_key) on delete cascade,
  status       text not null check (status in ('pass','fail','partial','unknown','not_applicable')),
  value        numeric,
  numerator    integer,
  denominator  integer,
  summary      text,
  details      jsonb default '{}'::jsonb,
  computed_at  timestamptz not null default now(),
  stale_after  timestamptz,
  unique (org_id, signal_key)
);

create index if not exists org_signal_results_org_idx on org_signal_results (org_id);

comment on table org_signal_results is
  'Latest computed state of each signal for each org. Written by the connector sync functions, read by the compliance scorer.';

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
alter table compliance_signals      enable row level security;
alter table signal_requirement_map  enable row level security;
alter table org_signal_results      enable row level security;

drop policy if exists "authenticated can read signal catalogue" on compliance_signals;
create policy "authenticated can read signal catalogue"
  on compliance_signals for select to authenticated using (true);

drop policy if exists "authenticated can read signal map" on signal_requirement_map;
create policy "authenticated can read signal map"
  on signal_requirement_map for select to authenticated
  using (
    org_id is null
    or org_id in (select org_id from organization_members where user_id = auth.uid())
  );

drop policy if exists "admins can manage org signal map" on signal_requirement_map;
create policy "admins can manage org signal map"
  on signal_requirement_map for all to authenticated
  using (
    org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role = any (array['risk_manager','admin'])
    )
  );

drop policy if exists "org members can read signal results" on org_signal_results;
create policy "org members can read signal results"
  on org_signal_results for select to authenticated
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));
;
