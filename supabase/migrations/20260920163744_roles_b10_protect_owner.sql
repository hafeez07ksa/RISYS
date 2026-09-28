-- The owner's membership row is not an admin's to edit or delete. Only the
-- owner themselves may change or leave it (leaving is still their own act).
alter policy members_update on public.organization_members
  using (is_org_admin(org_id) and (role <> 'owner' or user_id = auth.uid()));

alter policy members_delete on public.organization_members
  using ((is_org_admin(org_id) and (role <> 'owner' or user_id = auth.uid())) or user_id = auth.uid());

-- ...and nobody is promoted into a second owner from the UI.
alter policy members_update on public.organization_members
  using (is_org_admin(org_id) and (role <> 'owner' or user_id = auth.uid()))
  with check (role <> 'owner' or user_id = auth.uid());;
