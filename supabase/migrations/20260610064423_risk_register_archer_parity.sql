-- ============================================================
-- RISK REGISTER — ARCHER GRC PARITY MIGRATION
-- Adds: auto record IDs, treatment/remediation plans, exception
-- requests (risk acceptance w/ expiry), periodic reviews,
-- workflow history, control tests, notifications, DB-level
-- field audit trail.
-- ============================================================

-- ── 1. Org-scoped reference counters (RISK-0001 etc.) ────────
create table if not exists org_counters (
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  value integer not null default 0,
  primary key (org_id, key)
);

create or replace function next_ref(p_org uuid, p_prefix text)
returns text language plpgsql as $$
declare v int;
begin
  insert into org_counters (org_id, key, value) values (p_org, p_prefix, 1)
  on conflict (org_id, key) do update set value = org_counters.value + 1
  returning value into v;
  return p_prefix || '-' || lpad(v::text, 4, '0');
end $$;

-- ── 2. Auto-ID triggers for existing tables ──────────────────
create or replace function set_risk_ref() returns trigger language plpgsql as $$
begin
  if new.risk_id is null or new.risk_id = '' then
    new.risk_id := next_ref(new.org_id, 'RISK');
  end if;
  return new;
end $$;
drop trigger if exists trg_risk_ref on risks;
create trigger trg_risk_ref before insert on risks for each row execute function set_risk_ref();

create or replace function set_control_ref() returns trigger language plpgsql as $$
begin
  if new.control_id is null or new.control_id = '' then
    new.control_id := next_ref(new.org_id, 'CTL');
  end if;
  return new;
end $$;
drop trigger if exists trg_control_ref on risk_controls;
create trigger trg_control_ref before insert on risk_controls for each row execute function set_control_ref();

create or replace function set_kri_ref() returns trigger language plpgsql as $$
begin
  if new.kri_id is null or new.kri_id = '' then
    new.kri_id := next_ref(new.org_id, 'KRI');
  end if;
  return new;
end $$;
drop trigger if exists trg_kri_ref on risk_kris;
create trigger trg_kri_ref before insert on risk_kris for each row execute function set_kri_ref();

create or replace function set_loss_ref() returns trigger language plpgsql as $$
begin
  if new.event_id is null or new.event_id = '' then
    new.event_id := next_ref(new.org_id, 'LE');
  end if;
  return new;
end $$;
drop trigger if exists trg_loss_ref on risk_loss_events;
create trigger trg_loss_ref before insert on risk_loss_events for each row execute function set_loss_ref();

-- ── 3. Extra governance columns on risks ─────────────────────
alter table risks
  add column if not exists identified_date date default current_date,
  add column if not exists source text,                  -- e.g. RCSA, Audit Finding, Incident, Manual
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text;

-- ── 4. Treatment actions (Archer: Remediation Plans) ─────────
create table if not exists risk_treatment_actions (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  risk_id uuid not null references risks(id) on delete cascade,
  action_ref text,
  title text not null,
  description text,
  action_type text default 'Remediation',               -- Remediation | Mitigation | Corrective | Improvement
  owner_id uuid references auth.users(id),
  priority text default 'medium',                        -- low | medium | high | critical
  status text default 'planned',                         -- planned | in_progress | under_review | completed | cancelled
  percent_complete integer default 0 check (percent_complete between 0 and 100),
  start_date date,
  target_date date,
  completed_at timestamptz,
  estimated_cost numeric,
  currency text default 'SAR',
  expected_likelihood integer check (expected_likelihood between 1 and 5),
  expected_impact integer check (expected_impact between 1 and 5),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_action_ref() returns trigger language plpgsql as $$
begin
  if new.action_ref is null or new.action_ref = '' then
    new.action_ref := next_ref(new.org_id, 'TRT');
  end if;
  return new;
end $$;
drop trigger if exists trg_action_ref on risk_treatment_actions;
create trigger trg_action_ref before insert on risk_treatment_actions for each row execute function set_action_ref();

-- Status updates on a treatment action (Archer: Remediation Plan Status Update)
create table if not exists risk_treatment_updates (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  action_id uuid not null references risk_treatment_actions(id) on delete cascade,
  percent_complete integer check (percent_complete between 0 and 100),
  status text,
  comment text,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ── 5. Exception requests (Archer: Accept Risk → Exception) ──
create table if not exists risk_exceptions (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  risk_id uuid not null references risks(id) on delete cascade,
  exception_ref text,
  justification text not null,
  compensating_controls text,
  requested_by uuid references auth.users(id),
  approver_id uuid references auth.users(id),
  status text default 'pending',                         -- pending | approved | rejected | expired | revoked
  decision_comment text,
  decided_at timestamptz,
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_exception_ref() returns trigger language plpgsql as $$
begin
  if new.exception_ref is null or new.exception_ref = '' then
    new.exception_ref := next_ref(new.org_id, 'EXC');
  end if;
  return new;
end $$;
drop trigger if exists trg_exception_ref on risk_exceptions;
create trigger trg_exception_ref before insert on risk_exceptions for each row execute function set_exception_ref();

-- Auto-expiry: flips approved exceptions past expiry to 'expired'
-- and reopens accepted risks. Called via RPC from the app.
create or replace function expire_risk_exceptions(p_org uuid)
returns integer language plpgsql security definer as $$
declare n integer;
begin
  with expired as (
    update risk_exceptions
       set status = 'expired', updated_at = now()
     where org_id = p_org and status = 'approved'
       and expires_at is not null and expires_at < now()
     returning risk_id
  )
  update risks r
     set status = 'open', updated_at = now()
    from expired e
   where r.id = e.risk_id and r.status = 'accepted';
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 6. Periodic reviews / recertification ────────────────────
create table if not exists risk_reviews (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  risk_id uuid not null references risks(id) on delete cascade,
  reviewed_by uuid references auth.users(id),
  outcome text default 'no_change',                      -- no_change | updated | escalated | closure_recommended
  notes text,
  next_review_date date,
  created_at timestamptz default now()
);

-- ── 7. Workflow history (Archer: advanced workflow audit) ────
create table if not exists risk_workflow_history (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  risk_id uuid not null references risks(id) on delete cascade,
  from_state text,
  to_state text,
  action text,                                           -- submitted | approved | rejected | closed | reopened | reassigned
  comment text,
  performed_by uuid references auth.users(id),
  performed_at timestamptz default now()
);

-- ── 8. Control tests (design + operating effectiveness) ──────
create table if not exists risk_control_tests (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  control_id uuid not null references risk_controls(id) on delete cascade,
  test_type text default 'Operating',                    -- Design | Operating
  test_date date default current_date,
  tested_by uuid references auth.users(id),
  result text default 'Pass',                            -- Pass | Fail | Partial
  effectiveness integer check (effectiveness between 1 and 5),
  notes text,
  created_at timestamptz default now()
);

-- Keep parent control's testing status in sync with latest test
create or replace function sync_control_test() returns trigger language plpgsql as $$
begin
  update risk_controls
     set testing_status = new.result,
         last_tested_at = new.test_date,
         effectiveness  = coalesce(new.effectiveness, effectiveness),
         updated_at     = now()
   where id = new.control_id;
  return new;
end $$;
drop trigger if exists trg_sync_control_test on risk_control_tests;
create trigger trg_sync_control_test after insert on risk_control_tests for each row execute function sync_control_test();

-- ── 9. In-app notifications ───────────────────────────────────
create table if not exists notifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text default 'info',                              -- assignment | workflow | review_due | exception | info
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_notifications_user on notifications (user_id, read_at, created_at desc);

-- ── 10. DB-level field audit trail on risks ───────────────────
create or replace function audit_risk_changes() returns trigger language plpgsql security definer as $$
declare
  col text;
  oldv text; newv text;
  tracked text[] := array['title','description','risk_statement','category','subcategory','risk_type',
    'business_unit','status','treatment','treatment_notes','owner_id','reviewer_id','approver_id',
    'inherent_likelihood','inherent_impact','residual_likelihood','residual_impact',
    'risk_appetite','risk_direction','review_frequency','review_date','workflow_state','source'];
begin
  if tg_op = 'INSERT' then
    insert into risk_audit_log (org_id, risk_id, action, performed_by, note)
    values (new.org_id, new.id, 'created', new.created_by, 'Risk "' || new.title || '" created (' || coalesce(new.risk_id,'') || ')');
    return new;
  end if;
  foreach col in array tracked loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into oldv, newv using old, new;
    if oldv is distinct from newv then
      insert into risk_audit_log (org_id, risk_id, action, field_name, old_value, new_value, performed_by)
      values (new.org_id, new.id, 'field_changed', col, oldv, newv, auth.uid());
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_audit_risks on risks;
create trigger trg_audit_risks after insert or update on risks for each row execute function audit_risk_changes();

-- ── 11. updated_at maintenance ────────────────────────────────
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_touch_treatment on risk_treatment_actions;
create trigger trg_touch_treatment before update on risk_treatment_actions for each row execute function touch_updated_at();
drop trigger if exists trg_touch_exceptions on risk_exceptions;
create trigger trg_touch_exceptions before update on risk_exceptions for each row execute function touch_updated_at();

-- ── 12. RLS (matches existing org-membership pattern) ─────────
alter table org_counters enable row level security;
alter table risk_treatment_actions enable row level security;
alter table risk_treatment_updates enable row level security;
alter table risk_exceptions enable row level security;
alter table risk_reviews enable row level security;
alter table risk_workflow_history enable row level security;
alter table risk_control_tests enable row level security;
alter table notifications enable row level security;

do $$
declare t text;
begin
  foreach t in array array['risk_treatment_actions','risk_treatment_updates','risk_exceptions',
                           'risk_reviews','risk_workflow_history','risk_control_tests'] loop
    execute format('drop policy if exists org_all on %I', t);
    execute format($p$create policy org_all on %I for all
      using (org_id in (select org_id from organization_members where user_id = auth.uid()))
      with check (org_id in (select org_id from organization_members where user_id = auth.uid()))$p$, t);
  end loop;
end $$;

drop policy if exists org_counters_all on org_counters;
create policy org_counters_all on org_counters for all
  using (org_id in (select org_id from organization_members where user_id = auth.uid()))
  with check (org_id in (select org_id from organization_members where user_id = auth.uid()));

drop policy if exists notif_own on notifications;
create policy notif_own on notifications for select
  using (user_id = auth.uid());
drop policy if exists notif_update_own on notifications;
create policy notif_update_own on notifications for update
  using (user_id = auth.uid());
drop policy if exists notif_insert_org on notifications;
create policy notif_insert_org on notifications for insert
  with check (org_id in (select org_id from organization_members where user_id = auth.uid()));

-- ── 13. Helpful indexes ───────────────────────────────────────
create index if not exists idx_treatment_risk on risk_treatment_actions (risk_id);
create index if not exists idx_exceptions_risk on risk_exceptions (risk_id);
create index if not exists idx_reviews_risk on risk_reviews (risk_id);
create index if not exists idx_wf_history_risk on risk_workflow_history (risk_id);
create index if not exists idx_control_tests_control on risk_control_tests (control_id);
create index if not exists idx_risks_org_review on risks (org_id, review_date);;
