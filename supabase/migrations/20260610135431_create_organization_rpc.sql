-- Atomic org creation: org + creator-as-admin in one call, safe under RLS
create or replace function public.create_organization(
  p_name text, p_industry text default null, p_size text default null, p_title text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_org organizations; v_slug text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Organization name is required'; end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || floor(extract(epoch from now()))::text;

  insert into organizations (name, slug, industry, size)
  values (trim(p_name), v_slug, p_industry, p_size)
  returning * into v_org;

  insert into organization_members (org_id, user_id, role, title, joined_at)
  values (v_org.id, auth.uid(), 'admin', p_title, now());

  return row_to_json(v_org);
end $$;;
