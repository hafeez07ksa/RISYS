-- ============================================================
-- Hardening for the step 0 and Policy migrations (security advisor, 31 Oct)
--   * trigger functions are not callable through the API
--   * pure helpers get a pinned search_path
--   * helpers that take an id answer only for the caller's own workspace
-- ============================================================

do $$
declare f text;
begin
  foreach f in array array['evidence_items_guard()', 'policy_audiences_guard()', 'policy_children_guard()',
                           'policy_versions_guard()', 'policies_guard()', 'policies_first_draft()',
                           'policies_after_publish()', 'policies_after_retire()', 'business_units_guard()',
                           'exceptions_lifecycle()', 'evidence_links_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.authority_rank(text) set search_path = public;
alter function public.authority_for_rating(text) set search_path = public;
alter function public.policy_required_authority(text) set search_path = public;

-- Tier of a user, only for members asking about their own workspace.
create or replace function public.user_authority(p_org uuid, p_user uuid, p_subject_owner uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select t from (
    select h.tier as t, authority_rank(h.tier) as r from risk_authority_holders h where h.org_id = p_org and h.user_id = p_user
    union all
    select 'risk_owner', 0 where p_subject_owner is not null and p_subject_owner = p_user
  ) x
  where is_org_member(p_org) or auth.uid() is null
  order by r desc limit 1;
$$;

create or replace function public.policy_eligible_approvers(p_version uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with v as (
    select pv.*, p.owner_id, p.criticality, p.org_id as porg from policy_versions pv join policies p on p.id = pv.policy_id
     where pv.id = p_version and (is_org_member(p.org_id) or auth.uid() is null)
  ), cand as (
    select h.user_id from v join risk_authority_holders h on h.org_id = v.porg
     where authority_rank(h.tier) >= authority_rank(policy_required_authority(v.criticality))
    union
    select v.owner_id from v where policy_required_authority(v.criticality) = 'risk_owner'
  )
  select c.user_id from cand c, v
   where c.user_id is not null
     and c.user_id is distinct from v.submitted_by and c.user_id is distinct from v.created_by
     and not exists (select 1 from policy_authors a where a.policy_id = v.policy_id and a.user_id = c.user_id)
     and exists (select 1 from organization_members m where m.org_id = v.porg and m.user_id = c.user_id);
$$;

-- Bookkeeping table for the daily job only; no client access.
drop policy if exists policy_review_reminders_none on public.policy_review_reminders;
create policy policy_review_reminders_none on public.policy_review_reminders for select to authenticated using (false);
