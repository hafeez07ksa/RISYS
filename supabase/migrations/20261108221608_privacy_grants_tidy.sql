-- Advisor follow-up: the privacy read helper is not callable without signing in.
revoke all on function public.can_read_privacy(uuid) from public, anon;
grant execute on function public.can_read_privacy(uuid) to authenticated;
revoke all on function public.policy_cycle_label(int) from anon;
