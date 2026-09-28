-- Only refresh_org_signals is meant to be callable from the browser; it checks
-- membership first. The pieces it is built from, and the trigger function, are
-- internal and must not be reachable through /rest/v1/rpc at all (V7 class).
revoke execute on function public.compute_org_signals(uuid) from public, anon, authenticated;
revoke execute on function public.compute_signals_platform(uuid) from public, anon, authenticated;
revoke execute on function public.record_signal(uuid, text, text, numeric, int, int, text, jsonb, int) from public, anon, authenticated;
revoke execute on function public.grade_signal(text, numeric) from public, anon, authenticated;
revoke execute on function public.trg_refresh_signals_after_scan() from public, anon, authenticated;
revoke execute on function public.refresh_all_org_signals() from public, anon, authenticated;

-- ...and refresh_org_signals stays available to signed-in users only.
revoke execute on function public.refresh_org_signals(uuid) from public, anon;
grant execute on function public.refresh_org_signals(uuid) to authenticated;;
