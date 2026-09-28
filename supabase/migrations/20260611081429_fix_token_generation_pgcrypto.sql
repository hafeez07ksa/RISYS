create extension if not exists pgcrypto with schema extensions;

-- Token default on the table
alter table public.org_invitations
  alter column token set default encode(extensions.gen_random_bytes(24), 'hex');

-- Recreate create_invitation with extensions in scope
create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns public.org_invitations
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_inv public.org_invitations;
begin
  if not is_org_admin(p_org) then raise exception 'Only admins can invite members'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address: %', v_email; end if;
  if p_role not in ('admin','risk_manager','member','viewer') then raise exception 'Invalid role: %', p_role; end if;
  if exists (select 1 from organization_members m join profiles p on p.id = m.user_id
             where m.org_id = p_org and lower(p.email) = v_email) then
    raise exception '% is already a member of this organization', v_email;
  end if;

  insert into org_invitations (org_id, email, role, invited_by, status, token, expires_at)
  values (p_org, v_email, p_role, auth.uid(), 'pending', encode(gen_random_bytes(24),'hex'), now() + interval '7 days')
  on conflict (org_id, lower(email)) do update
    set role = excluded.role, invited_by = excluded.invited_by, status = 'pending',
        token = excluded.token, expires_at = excluded.expires_at, created_at = now()
  returning * into v_inv;
  return v_inv;
end $$;

-- Sanity check: generate one token right now
select encode(extensions.gen_random_bytes(24), 'hex') as sample_token;;
