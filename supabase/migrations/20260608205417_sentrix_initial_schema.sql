
create extension if not exists "uuid-ossp";

create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  industry    text,
  size        text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists organization_members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer',
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz default now(),
  unique(org_id, user_id)
);

create table if not exists org_connectors (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  connector_id  text not null,
  status        text not null default 'active',
  connected_at  timestamptz default now(),
  last_synced   timestamptz,
  meta          jsonb default '{}',
  unique(org_id, connector_id)
);

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table org_connectors enable row level security;

-- Helper in public schema (Supabase doesn't allow writing to auth schema)
create or replace function public.user_org_ids()
returns setof uuid language sql security definer as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

create policy "org_select" on organizations
  for select using (id in (select public.user_org_ids()));

create policy "org_insert" on organizations
  for insert with check (auth.uid() is not null);

create policy "org_update" on organizations
  for update using (
    exists (
      select 1 from organization_members
      where org_id = id and user_id = auth.uid() and role = 'admin'
    )
  );

create policy "members_select" on organization_members
  for select using (org_id in (select public.user_org_ids()));

create policy "members_insert" on organization_members
  for insert with check (auth.uid() is not null);

create policy "members_update" on organization_members
  for update using (
    exists (
      select 1 from organization_members m2
      where m2.org_id = org_id and m2.user_id = auth.uid() and m2.role = 'admin'
    )
  );

create policy "connectors_select" on org_connectors
  for select using (org_id in (select public.user_org_ids()));

create policy "connectors_insert" on org_connectors
  for insert with check (org_id in (select public.user_org_ids()));

create policy "connectors_update" on org_connectors
  for update using (org_id in (select public.user_org_ids()));

create policy "connectors_delete" on org_connectors
  for delete using (org_id in (select public.user_org_ids()));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orgs_updated_at
  before update on organizations
  for each row execute function public.set_updated_at();
;
