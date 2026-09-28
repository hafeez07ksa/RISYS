-- A deleted risk must leave a permanent trace. We log to a standalone table
-- (not risk_audit_log, whose rows are FK-tied to the risk and would vanish with it).
create table if not exists public.risk_deletion_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  risk_ref text,
  risk_title text,
  risk_snapshot jsonb,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz not null default now()
);
alter table public.risk_deletion_log enable row level security;
create policy risk_deletion_log_select on public.risk_deletion_log for select to authenticated
  using (is_org_member(org_id));
-- no insert/update/delete policies: only the trigger (security definer) writes here

create or replace function public.log_risk_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  insert into risk_deletion_log (org_id, risk_ref, risk_title, risk_snapshot, deleted_by, deleted_by_name)
  values (old.org_id, old.risk_id, old.title, to_jsonb(old), auth.uid(), v_name);
  return old;
end $$;

drop trigger if exists log_risk_deletion on public.risks;
create trigger log_risk_deletion before delete on public.risks
for each row execute function public.log_risk_deletion();;
