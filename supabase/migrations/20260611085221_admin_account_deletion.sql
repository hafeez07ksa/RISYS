-- ── Keep profiles as a historical record even after the login is deleted ──
-- Drop the cascade FK to auth.users: deleting a login must NOT erase the
-- name/email that audit trails and risk histories point to.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'f'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ── Admin-only permanent account deletion ─────────────────────────────────
-- Rules enforced here, not in the UI:
--   * caller must be an admin of the target's organization
--   * no self-deletion, even for admins (prevents accidental lockout)
--   * the last admin of an org can never be deleted (existing trigger)
--   * multi-tenant safe: the login is only destroyed when the user
--     belongs to NO other organization; otherwise only this org's
--     membership is removed
create or replace function public.delete_member_account(p_member_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_other_orgs int;
  v_name text;
begin
  select m.*, p.full_name, p.email into v_m
  from organization_members m
  left join profiles p on p.id = m.user_id
  where m.id = p_member_id;

  if not found then raise exception 'Member not found'; end if;
  if not is_org_admin(v_m.org_id) then
    raise exception 'Only organization admins can delete accounts';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'You cannot delete your own account. Ask another admin.';
  end if;

  v_name := coalesce(v_m.full_name, v_m.email, 'this user');

  -- Remove membership in THIS org (protect_last_admin trigger guards here)
  delete from organization_members where id = p_member_id;

  -- Revoke any open invitations for this email in this org
  update org_invitations set status = 'revoked'
  where org_id = v_m.org_id and lower(email) = lower(coalesce(v_m.email, '')) and status = 'pending';

  -- Clean up their unread notifications in this org
  delete from notifications where org_id = v_m.org_id and user_id = v_m.user_id;

  select count(*) into v_other_orgs from organization_members where user_id = v_m.user_id;

  if v_other_orgs = 0 then
    -- No other workspace uses this login → destroy it permanently.
    -- Sessions/refresh tokens cascade in the auth schema, logging them out everywhere.
    delete from auth.users where id = v_m.user_id;
    -- Keep the profile as a tombstone so history stays attributed.
    update profiles set deleted_at = now() where id = v_m.user_id;
    return json_build_object('removed_from_org', true, 'account_deleted', true, 'name', v_name);
  else
    return json_build_object('removed_from_org', true, 'account_deleted', false, 'name', v_name,
      'note', 'User still belongs to other organizations; their login remains active there.');
  end if;
end $$;

-- Tighten: only authenticated users may even attempt it
revoke execute on function public.delete_member_account(uuid) from anon, public;
grant execute on function public.delete_member_account(uuid) to authenticated;;
