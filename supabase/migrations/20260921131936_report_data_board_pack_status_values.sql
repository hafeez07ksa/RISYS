-- Match the status values the app actually writes: treatment plans close as
-- 'complete' (lib/treatment.js PLAN_STATUSES) and an active exception is
-- 'approved' (expire_risk_exceptions).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.report_board_pack_data(uuid,date,date)'::regprocedure);
  d := replace(d, $q$status not in ('completed','cancelled','rejected')$q$, $q$status not in ('complete','cancelled')$q$);
  d := replace(d, $q$e.status in ('approved', 'active', 'granted')$q$, $q$e.status = 'approved'$q$);
  if position('completed' in d) > 0 or position('granted' in d) > 0 then
    raise exception 'status replacement did not apply';
  end if;
  execute d;
end $$;
revoke execute on function public.report_board_pack_data(uuid, date, date) from public, anon;
grant execute on function public.report_board_pack_data(uuid, date, date) to authenticated;;
