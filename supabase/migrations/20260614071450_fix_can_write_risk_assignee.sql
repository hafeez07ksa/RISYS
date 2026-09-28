-- Cleaner: pass assigned_to into the check directly from the row.
create or replace function public.can_write_risk(p_org uuid, p_owner uuid, p_created_by uuid, p_assigned uuid default null)
returns boolean language sql security definer stable set search_path = public as $$
  select case my_role(p_org)
    when 'admin' then true when 'owner' then true when 'risk_manager' then true
    when 'member' then (auth.uid() = p_owner or auth.uid() = p_created_by or auth.uid() = p_assigned)
    else false end;
$$;

-- Repoint the risks update policy to pass assigned_to
drop policy if exists risks_update on public.risks;
create policy risks_update on public.risks for update to authenticated
  using (can_write_risk(org_id, owner_id, created_by, assigned_to))
  with check (can_write_risk(org_id, owner_id, created_by, assigned_to));;
