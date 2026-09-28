-- ============================================================
-- Sentrix — Multi-tenancy Schema
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- organizations
-- One row per tenant. Isolated by RLS policies.
-- ============================================================
create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  industry    text,
  size        text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- organization_members
-- Maps users to organizations with roles.
-- ============================================================
create table if not exists organization_members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer',
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz default now(),
  unique(org_id, user_id)
);

-- ============================================================
-- org_connectors
-- Tracks which platforms each org has connected via OAuth.
-- ============================================================
create table if not exists org_connectors (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  connector_id  text not null,   -- e.g. 'google', 'slack', 'jira'
  status        text not null default 'active',   -- active | revoked | error
  connected_at  timestamptz default now(),
  last_synced   timestamptz,
  meta          jsonb default '{}',   -- stores OAuth tokens (encrypt in prod!)
  unique(org_id, connector_id)
);

-- ============================================================
-- Row Level Security
-- Each table is locked down so users can only see their org's data.
-- ============================================================

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table org_connectors enable row level security;

-- Helper: returns the org IDs the current user belongs to
-- Note: Supabase doesn't allow writing to the auth schema directly.
-- The helper function lives in public schema as public.user_org_ids()
create or replace function public.user_org_ids()
returns setof uuid language sql security definer as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- organizations: members can read their own org
create policy "org_select" on organizations
  for select using (id in (select auth.user_org_ids()));

-- organizations: any authenticated user can insert (for org creation)
create policy "org_insert" on organizations
  for insert with check (auth.uid() is not null);

-- organizations: only admins can update
create policy "org_update" on organizations
  for update using (
    exists (
      select 1 from organization_members
      where org_id = id and user_id = auth.uid() and role = 'admin'
    )
  );

-- organization_members: members can read their own org's members
create policy "members_select" on organization_members
  for select using (org_id in (select auth.user_org_ids()));

-- organization_members: any authenticated user can insert (for self-join on org creation)
create policy "members_insert" on organization_members
  for insert with check (auth.uid() is not null);

-- organization_members: only admins can update/delete
create policy "members_update" on organization_members
  for update using (
    exists (
      select 1 from organization_members m2
      where m2.org_id = org_id and m2.user_id = auth.uid() and m2.role = 'admin'
    )
  );

-- org_connectors: members can read their org's connectors
create policy "connectors_select" on org_connectors
  for select using (org_id in (select auth.user_org_ids()));

-- org_connectors: members can insert/upsert connectors for their org
create policy "connectors_insert" on org_connectors
  for insert with check (org_id in (select auth.user_org_ids()));

-- org_connectors: members can update (e.g. refresh tokens)
create policy "connectors_update" on org_connectors
  for update using (org_id in (select auth.user_org_ids()));

-- org_connectors: members can delete (disconnect)
create policy "connectors_delete" on org_connectors
  for delete using (org_id in (select auth.user_org_ids()));

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orgs_updated_at
  before update on organizations
  for each row execute function set_updated_at();
