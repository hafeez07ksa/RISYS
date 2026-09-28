-- Security review follow-up (V7, V8 and the definer view).
--
-- 1. Trigger functions can never be called usefully over REST, but they were
--    EXECUTE-able by anon and authenticated. Revoke from both.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- 2. RPCs that only make sense for a signed-in user: remove anon.
--    Kept for anon on purpose:
--      get_invitation_by_token  — the invite page shows who invited you before you sign in
--      accept_invitation        — checks auth.uid() itself and refuses anon
--      is_* / my_role / user_org_ids / can_write_risk / member_owns_risk /
--      user_collaborates_on / is_collaborator — RLS helpers. Policies that run
--      for an anon request call them; revoking would turn "no rows" into a
--      permission error. They return false / empty for anon.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_invitation','create_organization','revoke_invitation','delete_invitation',
                        'log_audit_event','log_risk_activity','delete_member_account','expire_risk_exceptions',
                        'refresh_org_signals','rotate_ingest_token',
                        'report_board_pack_data','report_ecc_status_data','report_audit_data')
       or p.proname like 'platform\_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- 3. V8 leftovers: pin search_path on every public function that lacks it.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- 4. framework_requirements_v ran with its owner's rights. The table under it
--    is public-read anyway, so run it as the caller.
alter view public.framework_requirements_v set (security_invoker = true);;
