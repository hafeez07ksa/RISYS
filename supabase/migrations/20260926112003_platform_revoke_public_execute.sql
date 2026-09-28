-- Newly created functions carry a default EXECUTE grant to PUBLIC, which anon
-- inherits; revoking from anon alone leaves that grant in place.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'platform\_%' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.sig <> 'platform_log(text,uuid,text,uuid,text,text,jsonb)'
       and f.sig not like 'platform_audit_log_immutable%' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;;
