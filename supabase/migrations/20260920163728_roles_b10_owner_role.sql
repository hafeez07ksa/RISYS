-- Whoever creates the organisation holds `owner`: the same powers as an admin,
-- but an admin cannot demote or remove them.
create or replace function public.create_organization(p_name text, p_industry text default null, p_size text default null, p_title text default null)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_org organizations; v_slug text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Organization name is required'; end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || floor(extract(epoch from now()))::text;

  insert into organizations (name, slug, industry, size)
  values (trim(p_name), v_slug, p_industry, p_size)
  returning * into v_org;

  insert into organization_members (org_id, user_id, role, title, joined_at)
  values (v_org.id, auth.uid(), 'owner', p_title, now());

  return row_to_json(v_org);
end $function$;

-- Backfill: the first admin of every existing org becomes its owner.
update organization_members m set role = 'owner'
 where m.role = 'admin'
   and not exists (select 1 from organization_members o where o.org_id = m.org_id and o.role = 'owner')
   and m.id = (select id from organization_members x where x.org_id = m.org_id and x.role = 'admin'
                order by joined_at asc nulls last limit 1);;
