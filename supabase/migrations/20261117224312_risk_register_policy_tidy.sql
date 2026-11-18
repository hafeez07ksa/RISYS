-- Risk register: remove the legacy member-wide write policies.
--
-- Early migrations created policies such as org_all / org_kris / org_controls
-- that let ANY member of the workspace (viewers included) insert, update and
-- delete rows. Later migrations added proper role-based policies beside them
-- but never dropped the old ones, and permissive policies combine with OR, so
-- the old ones still won. Through the API a viewer could, for example, approve
-- a risk acceptance or delete workflow history.
--
-- After this migration:
--   risk_exceptions        SELECT only; every change goes through the
--                          request / review / decide RPCs (ERM migration).
--   risk_workflow_history  SELECT, and INSERT by a risk manager or the risk's
--                          owner/creator/assignee/collaborator. Append-only.
--   risk_treatment_options / risk_treatment_plans
--                          SELECT for members; writes by a risk manager or a
--                          contributor working on their own risk.
--   risk_reviews, risk_control_tests, risk_kris, risk_loss_events,
--   risk_treatment_actions, risk_treatment_updates, risk_control_mappings,
--   risk_controls          keep their existing role-based policies only.
--   risk_controls          a contributor may still add a control to the
--                          library (it is mapped to their risk next).

-- risk_exceptions: read-only for clients.
drop policy if exists org_all on public.risk_exceptions;
drop policy if exists risk_exceptions_insert on public.risk_exceptions;
drop policy if exists risk_exceptions_update on public.risk_exceptions;
drop policy if exists risk_exceptions_delete on public.risk_exceptions;
revoke insert, update, delete on public.risk_exceptions from authenticated, anon;

-- Duplicates of a proper role-based write policy.
drop policy if exists org_all on public.risk_reviews;
drop policy if exists org_all on public.risk_control_tests;
drop policy if exists org_all on public.risk_treatment_actions;
drop policy if exists org_all on public.risk_treatment_updates;
drop policy if exists org_kris on public.risk_kris;
drop policy if exists org_kris_insert on public.risk_kris;
drop policy if exists org_loss_events on public.risk_loss_events;
drop policy if exists org_loss_events_insert on public.risk_loss_events;
drop policy if exists org_mappings on public.risk_control_mappings;
drop policy if exists org_mappings_insert on public.risk_control_mappings;
drop policy if exists org_controls on public.risk_controls;
drop policy if exists org_controls_insert on public.risk_controls;
drop policy if exists risk_controls_insert on public.risk_controls;
create policy risk_controls_insert on public.risk_controls for insert to authenticated
  with check (is_risk_manager_or_admin(org_id) or is_contributor(org_id));

-- Workflow history: append-only.
drop policy if exists org_all on public.risk_workflow_history;
drop policy if exists risk_workflow_history_select on public.risk_workflow_history;
drop policy if exists risk_workflow_history_insert on public.risk_workflow_history;
create policy risk_workflow_history_select on public.risk_workflow_history for select to authenticated
  using (is_org_member(org_id));
create policy risk_workflow_history_insert on public.risk_workflow_history for insert to authenticated
  with check (is_risk_manager_or_admin(org_id) or (is_contributor(org_id) and member_owns_risk(risk_id)));
revoke update, delete on public.risk_workflow_history from authenticated, anon;

-- Treatment options and plans: same rule as the other risk child tables.
drop policy if exists treatment_options_all on public.risk_treatment_options;
drop policy if exists risk_treatment_options_select on public.risk_treatment_options;
drop policy if exists risk_treatment_options_write on public.risk_treatment_options;
create policy risk_treatment_options_select on public.risk_treatment_options for select to authenticated
  using (is_org_member(org_id));
create policy risk_treatment_options_write on public.risk_treatment_options for all to authenticated
  using (is_risk_manager_or_admin(org_id) or (is_contributor(org_id) and member_owns_risk(risk_id)))
  with check (is_risk_manager_or_admin(org_id) or (is_contributor(org_id) and member_owns_risk(risk_id)));

drop policy if exists treatment_plans_all on public.risk_treatment_plans;
drop policy if exists risk_treatment_plans_select on public.risk_treatment_plans;
drop policy if exists risk_treatment_plans_write on public.risk_treatment_plans;
create policy risk_treatment_plans_select on public.risk_treatment_plans for select to authenticated
  using (is_org_member(org_id));
create policy risk_treatment_plans_write on public.risk_treatment_plans for all to authenticated
  using (is_risk_manager_or_admin(org_id) or (is_contributor(org_id) and member_owns_risk(risk_id)))
  with check (is_risk_manager_or_admin(org_id) or (is_contributor(org_id) and member_owns_risk(risk_id)));

-- The tenant guards, in case any of these tables predates them.
do $$
declare t text;
begin
  foreach t in array array['risk_workflow_history', 'risk_treatment_options', 'risk_treatment_plans'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_active_guard') then
      execute format('create policy tenant_active_guard on public.%I as restrictive for all to authenticated using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_readonly_guard_ins') then
      execute format('create policy tenant_readonly_guard_ins on public.%I as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id))', t);
      execute format('create policy tenant_readonly_guard_upd on public.%I as restrictive for update to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
      execute format('create policy tenant_readonly_guard_del on public.%I as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
    end if;
  end loop;
end $$;
