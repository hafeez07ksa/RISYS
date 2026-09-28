
-- ============================================================
-- risks table
-- ============================================================
create table if not exists risks (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  title            text not null,
  description      text,
  category         text,                        -- e.g. Cybersecurity, Compliance, Operational
  likelihood       integer not null default 3,  -- 1-5
  impact           integer not null default 3,  -- 1-5
  risk_score       integer generated always as (likelihood * impact) stored,
  status           text not null default 'open', -- open|mitigating|accepted|closed
  treatment        text,                         -- accept|mitigate|transfer|avoid
  treatment_notes  text,
  owner_id         uuid references auth.users(id) on delete set null,
  incident_id      uuid references incidents(id) on delete set null,
  framework_ref    text,                         -- e.g. NCA-ECC-1.1, SAMA-CSF-2.3
  due_date         timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- risk_comments
create table if not exists risk_comments (
  id          uuid primary key default uuid_generate_v4(),
  risk_id     uuid not null references risks(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz default now()
);

alter table risks disable row level security;
alter table risk_comments disable row level security;

create trigger risks_updated_at
  before update on risks
  for each row execute function public.set_updated_at();

-- ============================================================
-- entra_signin_logs — store raw Entra ID sign-in events
-- ============================================================
create table if not exists entra_signin_logs (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  event_id        text unique,
  user_email      text,
  user_display    text,
  ip_address      text,
  location        text,
  status          text,       -- success|failure
  failure_reason  text,
  risk_level      text,       -- none|low|medium|high
  mfa_used        boolean,
  app_name        text,
  created_at      timestamptz default now(),
  raw_data        jsonb default '{}'
);

alter table entra_signin_logs disable row level security;
;
