-- risys.risk_methodology counted any non-null tolerance_status as "passed
-- through the tolerance gate". The gate writes 'not_evaluated' when it cannot
-- evaluate a risk (no residual score, no tolerance configured for the
-- category), so the signal reported 6/6 on a register where one risk had
-- actually been evaluated. Only 'within' and 'breached' mean the gate ran.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.compute_org_signals(uuid)'::regprocedure);
  if position('tolerance_status is not null' in d) = 0 then
    raise exception 'compute_org_signals no longer contains the expected expression; fix by hand';
  end if;
  d := replace(d, 'tolerance_status is not null', 'tolerance_status in (''within'', ''breached'')');
  execute d;
end $$;

revoke execute on function public.compute_org_signals(uuid) from public, anon, authenticated;
select public.refresh_all_org_signals();;
