-- The recursion: risks_select referenced risk_collaborators, whose policies
-- (and the planner) re-entered risks. Use a security-definer helper that
-- reads risk_collaborators directly, bypassing RLS, to break the cycle.
create or replace function public.user_collaborates_on(p_risk uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from risk_collaborators c
                 where c.risk_id = p_risk and c.user_id = auth.uid());
$$;

drop policy if exists risks_select on public.risks;
create policy risks_select on public.risks for select to authenticated
  using (
    is_risk_manager_or_admin(org_id)
    or owner_id = auth.uid()
    or created_by = auth.uid()
    or assigned_to = auth.uid()
    or user_collaborates_on(id)
  );

-- Also ensure risk_collaborators SELECT policy doesn't re-enter risks.
-- It currently uses is_org_member(org_id) which is fine (no risks ref),
-- but the WRITE policy references risks — keep that, it's INSERT/UPDATE/DELETE
-- only and won't be hit during a risks SELECT.;
