-- ============================================================
-- Privacy guard fixes (found by the rolled-back tests, 9 Nov 2026).
--
-- 1. dsr_can_act(): repeated from 20261108221147 so this file stands alone.
-- 2. Deleting privacy records was allowed whenever the caller was platform
--    staff. Platform staff can also be tenant members, so the exemption now
--    holds only while the console deletes a whole suspended workspace
--    (platform_delete_organization).
-- ============================================================

create or replace function public.dsr_can_act(r public.data_subject_requests)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(is_compliance_writer(r.org_id), false) or coalesce(r.assigned_to = auth.uid(), false);
$$;
revoke all on function public.dsr_can_act(public.data_subject_requests) from public, anon, authenticated;

create or replace function public.privacy_org_deleting(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() and exists (select 1 from organizations where id = p_org and status = 'suspended');
$$;
revoke all on function public.privacy_org_deleting(uuid) from public, anon, authenticated;

do $$
declare f text; d text;
begin
  foreach f in array array['processing_activities_guard', 'data_subject_requests_guard',
                           'personal_data_breaches_guard', 'privacy_assessments_guard'] loop
    d := pg_get_functiondef(format('public.%I()', f)::regprocedure);
    d := replace(d, 'if tg_op = ''DELETE'' and is_platform_admin() then', 'if tg_op = ''DELETE'' and privacy_org_deleting(old.org_id) then');
    if position('privacy_org_deleting' in d) = 0 then raise exception 'guard % not rewritten', f; end if;
    execute d;
    execute format('revoke all on function public.%I() from public, anon, authenticated', f);
  end loop;
end $$;
