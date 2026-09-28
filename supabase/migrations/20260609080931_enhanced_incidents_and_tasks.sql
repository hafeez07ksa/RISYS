
-- ============================================================
-- incident_comments
-- ============================================================
create table if not exists incident_comments (
  id           uuid primary key default uuid_generate_v4(),
  incident_id  uuid not null references incidents(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  content      text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Add fields to incidents
alter table incidents
  add column if not exists assigned_to    uuid references auth.users(id) on delete set null,
  add column if not exists due_at         timestamptz,
  add column if not exists sla_breached   boolean default false,
  add column if not exists priority       text default 'medium';

-- ============================================================
-- tasks
-- ============================================================
create table if not exists tasks (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id) on delete cascade,
  title        text not null,
  description  text,
  status       text not null default 'todo',      -- todo|in_progress|done|cancelled
  priority     text not null default 'medium',    -- critical|high|medium|low
  assigned_to  uuid references auth.users(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  incident_id  uuid references incidents(id) on delete set null,
  due_at       timestamptz,
  reminder_at  timestamptz,
  completed_at timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- task_comments
create table if not exists task_comments (
  id        uuid primary key default uuid_generate_v4(),
  task_id   uuid not null references tasks(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  content   text not null,
  created_at timestamptz default now()
);

-- RLS off (consistent with rest of app)
alter table incident_comments disable row level security;
alter table tasks disable row level security;
alter table task_comments disable row level security;

-- updated_at triggers
create trigger incident_comments_updated_at
  before update on incident_comments
  for each row execute function public.set_updated_at();

create trigger tasks_updated_at
  before update on tasks
  for each row execute function public.set_updated_at();

-- SLA config: store per-org SLA hours per severity
create table if not exists sla_config (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  severity    text not null,
  hours       integer not null,
  created_at  timestamptz default now(),
  unique(org_id, severity)
);

alter table sla_config disable row level security;

-- Default SLA values for existing orgs
insert into sla_config (org_id, severity, hours)
select id, 'critical', 4 from organizations
union all
select id, 'high', 24 from organizations
union all
select id, 'medium', 72 from organizations
union all
select id, 'low', 168 from organizations
union all
select id, 'informational', 720 from organizations
on conflict (org_id, severity) do nothing;
;
