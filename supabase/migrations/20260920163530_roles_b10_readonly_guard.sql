-- Read-only roles (viewer, auditor) may read and comment, and nothing else.
-- Enforced the same way suspension is: a restrictive policy ANDed with every
-- other policy on the table, so no permissive policy can grant around it.
-- Exempt: comment threads and notifications (read-only roles still take part),
-- and the trigger-written log/counter tables.
do $$
declare t text;
  exempt text[] := array[
    'risk_comments','incident_comments','task_comments','notifications',
    'audit_log','risk_audit_log','org_counters',
    'risk_score_history','risk_workflow_history','risk_deletion_log'
  ];
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_policy p on p.polrelid = c.oid and p.polname = 'tenant_active_guard'
     where n.nspname = 'public' and c.relname <> all (exempt)
  loop
    execute format('drop policy if exists tenant_readonly_guard_ins on public.%I', t);
    execute format('drop policy if exists tenant_readonly_guard_upd on public.%I', t);
    execute format('drop policy if exists tenant_readonly_guard_del on public.%I', t);
    execute format('create policy tenant_readonly_guard_ins on public.%I as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id))', t);
    execute format('create policy tenant_readonly_guard_upd on public.%I as restrictive for update to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
    execute format('create policy tenant_readonly_guard_del on public.%I as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
  end loop;
end $$;;
