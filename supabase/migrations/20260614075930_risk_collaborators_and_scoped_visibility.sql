-- ════════════════════════════════════════════════════════════════════
-- COLLABORATORS + scoped visibility
--   * managers/admins see ALL risks
--   * members see only risks they own, created, are assigned to,
--     or collaborate on
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.risk_collaborators (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  risk_id uuid not null references public.risks(id) on delete cascade,
  user_id uuid not null,
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (risk_id, user_id)
);
create index if not exists idx_risk_collab_risk on public.risk_collaborators(risk_id);
create index if not exists idx_risk_collab_user on public.risk_collaborators(user_id);

-- Enforce max 10 collaborators per risk
create or replace function public.check_collaborator_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from risk_collaborators where risk_id = new.risk_id) >= 10 then
    raise exception 'A risk can have at most 10 collaborators';
  end if;
  return new;
end $$;
drop trigger if exists collaborator_limit on public.risk_collaborators;
create trigger collaborator_limit before insert on public.risk_collaborators
for each row execute function public.check_collaborator_limit();

-- Notify a user when added as collaborator
create or replace function public.notify_collaborator_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_risk record;
begin
  if new.user_id = auth.uid() then return new; end if;
  select coalesce(full_name, email) into v_actor from profiles where id = auth.uid();
  select risk_id as ref, title from risks where id = new.risk_id into v_risk;
  insert into notifications (org_id, user_id, type, title, body, link)
  values (new.org_id, new.user_id, 'info', 'Added as collaborator',
          coalesce(v_risk.ref || ' — ', '') || coalesce(v_risk.title, 'a risk') ||
            coalesce(' · by ' || v_actor, ''),
          '/app/risks/' || new.risk_id);
  return new;
end $$;
drop trigger if exists notify_collaborator_added on public.risk_collaborators;
create trigger notify_collaborator_added after insert on public.risk_collaborators
for each row execute function public.notify_collaborator_added();

-- ── Helper: is the caller a collaborator on a risk ──
create or replace function public.is_collaborator(p_risk uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from risk_collaborators c
                 where c.risk_id = p_risk and c.user_id = auth.uid());
$$;

-- ── Update member_owns_risk to include collaborators (write access) ──
create or replace function public.member_owns_risk(p_risk uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from risks r where r.id = p_risk
    and (r.owner_id = auth.uid() or r.created_by = auth.uid() or r.assigned_to = auth.uid()))
  or exists (select 1 from risk_collaborators c where c.risk_id = p_risk and c.user_id = auth.uid());
$$;

-- ── SCOPED VISIBILITY: replace the blanket member SELECT on risks ──
-- Managers/admins: all org risks. Members/viewers: only risks they have a
-- relationship to (own / created / assigned / collaborator).
drop policy if exists risks_select on public.risks;
create policy risks_select on public.risks for select to authenticated
  using (
    is_risk_manager_or_admin(org_id)
    or owner_id = auth.uid()
    or created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from risk_collaborators c where c.risk_id = risks.id and c.user_id = auth.uid())
  );

-- can_write_risk: members may write if owner/creator/assignee OR collaborator
create or replace function public.can_write_risk(p_org uuid, p_owner uuid, p_created_by uuid, p_assigned uuid default null, p_risk uuid default null)
returns boolean language sql security definer stable set search_path = public as $$
  select case my_role(p_org)
    when 'admin' then true when 'owner' then true when 'risk_manager' then true
    when 'member' then (auth.uid() = p_owner or auth.uid() = p_created_by or auth.uid() = p_assigned
                        or (p_risk is not null and is_collaborator(p_risk)))
    else false end;
$$;

drop policy if exists risks_update on public.risks;
create policy risks_update on public.risks for update to authenticated
  using (can_write_risk(org_id, owner_id, created_by, assigned_to, id))
  with check (can_write_risk(org_id, owner_id, created_by, assigned_to, id));

-- ── RLS on risk_collaborators ──
alter table public.risk_collaborators enable row level security;
-- read: anyone who can see the parent risk
create policy risk_collaborators_select on public.risk_collaborators for select to authenticated
  using (is_org_member(org_id));
-- write: managers/admins, or a member who owns/created/assigned the risk
create policy risk_collaborators_write on public.risk_collaborators for all to authenticated
  using (
    is_risk_manager_or_admin(org_id)
    or exists (select 1 from risks r where r.id = risk_collaborators.risk_id
               and (r.owner_id = auth.uid() or r.created_by = auth.uid() or r.assigned_to = auth.uid()))
  )
  with check (
    is_risk_manager_or_admin(org_id)
    or exists (select 1 from risks r where r.id = risk_collaborators.risk_id
               and (r.owner_id = auth.uid() or r.created_by = auth.uid() or r.assigned_to = auth.uid()))
  );;
