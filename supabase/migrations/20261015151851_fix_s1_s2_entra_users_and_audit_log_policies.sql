-- S1: remove permissive policy that granted every role full access to all tenants' directory users.
-- Service role bypasses RLS, so edge functions are unaffected; members keep "org members can read entra_users".
drop policy if exists "service role full access entra_users" on public.entra_users;

-- S2: audit history becomes read-only for members. Rows are written by SECURITY DEFINER triggers/functions.
drop policy if exists "org_audit" on public.risk_audit_log;
drop policy if exists "org_audit_insert" on public.risk_audit_log;
create policy risk_audit_log_select on public.risk_audit_log
  for select to authenticated using (public.is_org_member(org_id));;
