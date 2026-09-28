
-- ============================================================
-- incidents table
-- ============================================================
create table if not exists incidents (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  connector_id    text not null default 'manual',   -- 'jira', 'manual', etc.
  external_id     text,                              -- Jira issue key e.g. PROJ-123
  external_url    text,                              -- link back to Jira issue
  title           text not null,
  description     text,
  severity        text not null default 'medium',    -- critical|high|medium|low|informational
  status          text not null default 'open',      -- open|in_progress|resolved|closed
  assignee        text,
  reporter        text,
  source_type     text,                              -- Jira issue type e.g. Bug, Incident, Task
  raw_data        jsonb default '{}',                -- full raw payload from source
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  resolved_at     timestamptz,
  unique(org_id, connector_id, external_id)
);

-- ============================================================
-- connector_mappings table
-- Admin configures how Jira issue types map to Sentrix severity
-- ============================================================
create table if not exists connector_mappings (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  connector_id    text not null,
  mapping_type    text not null default 'issue_type_to_severity',
  source_value    text not null,    -- e.g. Jira issue type: 'Bug', 'Incident', 'Task'
  target_value    text not null,    -- e.g. Sentrix severity: 'high', 'medium'
  created_at      timestamptz default now(),
  unique(org_id, connector_id, mapping_type, source_value)
);

-- RLS
alter table incidents disable row level security;
alter table connector_mappings disable row level security;

-- updated_at triggers
create trigger incidents_updated_at
  before update on incidents
  for each row execute function public.set_updated_at();
;
