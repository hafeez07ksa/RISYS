-- Permanently delete an invitation (admin-only). Distinct from revoke,
-- which keeps the row as a record. Delete removes it entirely so the
-- email can be cleanly re-invited and the list stays tidy.
create or replace function public.delete_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from org_invitations where id = p_id;
  if v_org is null then raise exception 'Invitation not found'; end if;
  if not is_org_admin(v_org) then raise exception 'Only admins can delete invitations'; end if;
  delete from org_invitations where id = p_id;
end $$;

revoke execute on function public.delete_invitation(uuid) from anon, public;
grant execute on function public.delete_invitation(uuid) to authenticated;;
