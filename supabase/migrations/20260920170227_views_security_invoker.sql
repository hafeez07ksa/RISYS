-- Both views are tenant-scoped, and a view runs as its owner by default, which
-- means RLS on the tables underneath is bypassed: any signed-in user could read
-- every organisation's rows by leaving the org_id filter off. security_invoker
-- makes them obey the caller's policies like every other tenant table.
alter view public.v_requirement_automation set (security_invoker = true);
alter view public.v_finding_status set (security_invoker = true);;
