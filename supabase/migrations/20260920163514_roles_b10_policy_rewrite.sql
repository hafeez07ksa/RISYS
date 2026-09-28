-- Contributor tier: 'member' checks become is_contributor() so a
-- compliance officer can work the risks they own, like a member can.
do $$
declare r record; q text; w text;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') like '%my_role(org_id) = ''member''%'
         or coalesce(with_check,'') like '%my_role(org_id) = ''member''%')
  loop
    q := replace(coalesce(r.qual,''),       '(my_role(org_id) = ''member''::text)', 'is_contributor(org_id)');
    w := replace(coalesce(r.with_check,''), '(my_role(org_id) = ''member''::text)', 'is_contributor(org_id)');
    if r.qual is null then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, w);
    elsif r.with_check is null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, q, w);
    end if;
  end loop;
end $$;

-- Creating a risk: contributors and above.
alter policy risks_insert on public.risks
  with check (is_org_member(org_id) and my_role(org_id) = any (array['admin','owner','risk_manager','compliance_officer','member']));

-- Compliance work belongs to the compliance writer tier, not just risk managers.
alter policy "managers and admins can manage compliance statuses" on public.compliance_statuses
  using (is_compliance_writer(org_id)) with check (is_compliance_writer(org_id));

alter policy "managers and admins can manage mappings" on public.control_framework_mappings
  using (is_compliance_writer(org_id)) with check (is_compliance_writer(org_id));

alter policy compliance_evidence_insert on public.compliance_evidence
  with check (is_compliance_writer(org_id));

-- Evidence: drop the two permissive any-member policies that let any member of
-- the org edit or delete any evidence row. risk_evidence_select /
-- risk_evidence_write already cover read and role-scoped write.
drop policy if exists org_evidence on public.risk_evidence;
drop policy if exists org_evidence_insert on public.risk_evidence;;
