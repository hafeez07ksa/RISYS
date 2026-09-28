
-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  entity_title text,
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "org members read own org audit log"
  on public.audit_log for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = audit_log.org_id
        and m.user_id = auth.uid()
    )
  );

create policy "service role inserts audit log"
  on public.audit_log for insert
  with check (auth.role() = 'service_role');

create index if not exists audit_log_org_created  on public.audit_log (org_id, created_at desc);
create index if not exists audit_log_entity       on public.audit_log (org_id, entity_type, entity_id);
create index if not exists audit_log_actor        on public.audit_log (org_id, actor_id);

-- ── Client-callable helper ────────────────────────────────────────────────────
create or replace function public.log_audit_event(
  p_org_id       uuid,
  p_action       text,
  p_entity_type  text  default null,
  p_entity_id    uuid  default null,
  p_entity_title text  default null,
  p_meta         jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_name text;
  v_row_id     uuid;
begin
  if not exists (
    select 1 from organization_members
    where org_id = p_org_id and user_id = v_actor_id
  ) then
    raise exception 'Not a member of this organisation';
  end if;

  select coalesce(full_name, email, v_actor_id::text)
  into v_actor_name
  from profiles
  where id = v_actor_id;

  insert into audit_log (
    org_id, actor_id, actor_name,
    action, entity_type, entity_id, entity_title, meta
  ) values (
    p_org_id, v_actor_id, v_actor_name,
    p_action, p_entity_type, p_entity_id, p_entity_title, p_meta
  )
  returning id into v_row_id;

  return v_row_id;
end;
$$;
;
