-- B10: one role model. Final role set:
--   owner, admin, risk_manager, compliance_officer, member, auditor, viewer
-- Helper functions classify those roles into the tiers the policies use.

create or replace function public.is_contributor(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(my_role(p_org) in ('member','compliance_officer'), false);
$$;

create or replace function public.is_org_readonly(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(my_role(p_org) in ('viewer','auditor'), false);
$$;

create or replace function public.is_compliance_writer(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(my_role(p_org) in ('admin','owner','risk_manager','compliance_officer'), false);
$$;

revoke execute on function public.is_contributor(uuid) from public, anon;
revoke execute on function public.is_org_readonly(uuid) from public, anon;
revoke execute on function public.is_compliance_writer(uuid) from public, anon;
grant execute on function public.is_contributor(uuid) to authenticated;
grant execute on function public.is_org_readonly(uuid) to authenticated;
grant execute on function public.is_compliance_writer(uuid) to authenticated;

-- Only the seven known roles may ever be stored.
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check
  check (role in ('owner','admin','risk_manager','compliance_officer','member','auditor','viewer'));

alter table public.org_invitations drop constraint if exists org_invitations_role_check;
alter table public.org_invitations add constraint org_invitations_role_check
  check (role in ('admin','risk_manager','compliance_officer','member','auditor','viewer'));;
