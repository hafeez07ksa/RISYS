-- "Assign to" — the person handed the risk to work on it (distinct from owner,
-- who is whoever raised it). Nullable; a risk can be unassigned.
alter table public.risks add column if not exists assigned_to uuid;

-- Notify the assignee when a risk is assigned/reassigned to them
create or replace function public.notify_risk_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to <> auth.uid() then
    select coalesce(full_name, email) into v_actor from profiles where id = auth.uid();
    insert into notifications (org_id, user_id, type, title, body, link)
    values (new.org_id, new.assigned_to, 'info',
            'Risk assigned to you',
            coalesce(new.risk_id || ' — ', '') || new.title ||
              coalesce(' · assigned by ' || v_actor, ''),
            '/app/risks/' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_risk_assignment on public.risks;
create trigger notify_risk_assignment after insert or update of assigned_to on public.risks
for each row execute function public.notify_risk_assignment();

-- A member may now write a risk they OWN or are ASSIGNED to (or created).
create or replace function public.member_owns_risk(p_risk uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from risks r where r.id = p_risk
    and (r.owner_id = auth.uid() or r.created_by = auth.uid() or r.assigned_to = auth.uid()));
$$;

create or replace function public.can_write_risk(p_org uuid, p_owner uuid, p_created_by uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select case my_role(p_org)
    when 'admin' then true when 'owner' then true when 'risk_manager' then true
    when 'member' then (auth.uid() = p_owner or auth.uid() = p_created_by
                        or exists (select 1 from risks r where r.owner_id = p_owner
                                   and r.created_by = p_created_by and r.assigned_to = auth.uid()))
    else false end;
$$;;
