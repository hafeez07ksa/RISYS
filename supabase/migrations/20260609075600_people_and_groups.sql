
-- ============================================================
-- groups / departments
-- ============================================================
create table if not exists org_groups (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  color       text default '#895353',
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(org_id, name)
);

-- ============================================================
-- group members
-- ============================================================
create table if not exists org_group_members (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references org_groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  added_at    timestamptz default now(),
  unique(group_id, user_id)
);

-- ============================================================
-- invitations
-- ============================================================
create table if not exists org_invitations (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'viewer',
  invited_by  uuid references auth.users(id),
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  status      text not null default 'pending',  -- pending|accepted|expired
  expires_at  timestamptz default now() + interval '7 days',
  created_at  timestamptz default now(),
  unique(org_id, email)
);

-- Add group_id to organization_members
alter table organization_members add column if not exists group_id uuid references org_groups(id) on delete set null;
alter table organization_members add column if not exists title text;
alter table organization_members add column if not exists last_active timestamptz;

-- RLS off for now (consistent with rest of app)
alter table org_groups disable row level security;
alter table org_group_members disable row level security;
alter table org_invitations disable row level security;

-- updated_at trigger for groups
create trigger org_groups_updated_at
  before update on org_groups
  for each row execute function public.set_updated_at();
;
