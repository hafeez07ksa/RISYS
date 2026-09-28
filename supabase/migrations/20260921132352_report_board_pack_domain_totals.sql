do $$
declare d text; old_q text; new_q text;
begin
  d := pg_get_functiondef('public.report_board_pack_data(uuid,date,date)'::regprocedure);
  old_q := $q$select jsonb_agg(distinct jsonb_build_object('id', domain_id, 'name', domain_name))
        from framework_requirements_v where framework = 'NCA ECC' and domain_id is not null$q$;
  new_q := $q$select jsonb_agg(jsonb_build_object('id', x.domain_id, 'name', x.domain_name, 'mains', x.mains) order by x.domain_id)
        from (select domain_id, domain_name,
                     count(*) filter (where parent_requirement_id is null and requirement_type ilike 'main%') as mains
                from framework_requirements_v where framework = 'NCA ECC' and domain_id is not null
               group by domain_id, domain_name) x$q$;
  if position(old_q in d) = 0 then raise exception 'domains subquery not found'; end if;
  execute replace(d, old_q, new_q);
end $$;
revoke execute on function public.report_board_pack_data(uuid, date, date) from public, anon;
grant execute on function public.report_board_pack_data(uuid, date, date) to authenticated;;
