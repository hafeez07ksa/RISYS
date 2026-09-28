create or replace function public.my_role(p_org uuid)
returns text language sql security definer stable set search_path = public as $$
  select m.role from organization_members m
  join organizations o on o.id = m.org_id
  where m.org_id = p_org and m.user_id = auth.uid() and o.status = 'active'
  limit 1;
$$;

create or replace function public.is_risk_manager_or_admin(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select my_role(p_org) in ('admin','owner','risk_manager');
$$;

create or replace function public.member_owns_risk(p_risk uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from risks r where r.id = p_risk
    and (r.owner_id = auth.uid() or r.created_by = auth.uid()));
$$;

create or replace function public.can_write_risk(p_org uuid, p_owner uuid, p_created_by uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select case my_role(p_org)
    when 'admin' then true when 'owner' then true when 'risk_manager' then true
    when 'member' then (auth.uid() = p_owner or auth.uid() = p_created_by)
    else false end;
$$;

drop policy if exists risks_member_all on public.risks;
create policy risks_select on public.risks for select to authenticated using (is_org_member(org_id));
create policy risks_insert on public.risks for insert to authenticated
  with check (is_org_member(org_id) and my_role(org_id) in ('admin','owner','risk_manager','member'));
create policy risks_update on public.risks for update to authenticated
  using (can_write_risk(org_id, owner_id, created_by))
  with check (can_write_risk(org_id, owner_id, created_by));
create policy risks_delete on public.risks for delete to authenticated
  using (is_risk_manager_or_admin(org_id));

do $$
declare t text;
  direct_tables text[] := array['risk_control_mappings','risk_evidence','risk_kris','risk_loss_events','risk_treatment_actions','risk_reviews'];
begin
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format($f$create policy %1$I_select on public.%1$I for select to authenticated using (is_org_member(org_id))$f$, t);
    execute format($f$create policy %1$I_write on public.%1$I for all to authenticated
      using (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and member_owns_risk(%1$I.risk_id)))
      with check (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and member_owns_risk(%1$I.risk_id)))$f$, t);
  end loop;
end $$;

alter table public.risk_controls enable row level security;
drop policy if exists risk_controls_member_all on public.risk_controls;
drop policy if exists risk_controls_select on public.risk_controls;
drop policy if exists risk_controls_write on public.risk_controls;
create policy risk_controls_select on public.risk_controls for select to authenticated using (is_org_member(org_id));
create policy risk_controls_write on public.risk_controls for all to authenticated
  using (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and exists (
         select 1 from risk_control_mappings m where m.control_id = risk_controls.id and member_owns_risk(m.risk_id))))
  with check (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and exists (
         select 1 from risk_control_mappings m where m.control_id = risk_controls.id and member_owns_risk(m.risk_id))));

alter table public.risk_control_tests enable row level security;
drop policy if exists risk_control_tests_member_all on public.risk_control_tests;
drop policy if exists risk_control_tests_select on public.risk_control_tests;
drop policy if exists risk_control_tests_write on public.risk_control_tests;
create policy risk_control_tests_select on public.risk_control_tests for select to authenticated using (is_org_member(org_id));
create policy risk_control_tests_write on public.risk_control_tests for all to authenticated
  using (is_risk_manager_or_admin(org_id)) with check (is_risk_manager_or_admin(org_id));

alter table public.risk_treatment_updates enable row level security;
drop policy if exists risk_treatment_updates_member_all on public.risk_treatment_updates;
drop policy if exists risk_treatment_updates_select on public.risk_treatment_updates;
drop policy if exists risk_treatment_updates_write on public.risk_treatment_updates;
create policy risk_treatment_updates_select on public.risk_treatment_updates for select to authenticated using (is_org_member(org_id));
create policy risk_treatment_updates_write on public.risk_treatment_updates for all to authenticated
  using (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and exists (
         select 1 from risk_treatment_actions a where a.id = risk_treatment_updates.action_id and member_owns_risk(a.risk_id))))
  with check (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and exists (
         select 1 from risk_treatment_actions a where a.id = risk_treatment_updates.action_id and member_owns_risk(a.risk_id))));

alter table public.risk_exceptions enable row level security;
drop policy if exists risk_exceptions_member_all on public.risk_exceptions;
drop policy if exists risk_exceptions_select on public.risk_exceptions;
drop policy if exists risk_exceptions_write on public.risk_exceptions;
create policy risk_exceptions_select on public.risk_exceptions for select to authenticated using (is_org_member(org_id));
create policy risk_exceptions_insert on public.risk_exceptions for insert to authenticated
  with check (is_risk_manager_or_admin(org_id) or (my_role(org_id)='member' and member_owns_risk(risk_id)));
create policy risk_exceptions_update on public.risk_exceptions for update to authenticated
  using (is_risk_manager_or_admin(org_id)) with check (is_risk_manager_or_admin(org_id));
create policy risk_exceptions_delete on public.risk_exceptions for delete to authenticated
  using (is_risk_manager_or_admin(org_id));

drop policy if exists risk_comments_member_all on public.risk_comments;
drop policy if exists risk_comments_select on public.risk_comments;
drop policy if exists risk_comments_insert on public.risk_comments;
create policy risk_comments_select on public.risk_comments for select to authenticated using (is_org_member(org_id));
create policy risk_comments_insert on public.risk_comments for insert to authenticated
  with check (is_org_member(org_id) and user_id = auth.uid());
create policy risk_comments_delete on public.risk_comments for delete to authenticated
  using (is_org_admin(org_id) or user_id = auth.uid());;
