-- An unassigned request made the assignee check NULL, which let any member act on it.
create or replace function public.dsr_can_act(r public.data_subject_requests)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(is_compliance_writer(r.org_id), false) or coalesce(r.assigned_to = auth.uid(), false);
$$;
revoke all on function public.dsr_can_act(public.data_subject_requests) from public, anon, authenticated;
