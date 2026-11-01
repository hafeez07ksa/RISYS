-- ============================================================
-- Policy Management (2 of 2): attestation campaigns and policy reviews
--
-- Who must attest is decided by the policy's audiences: everyone, a role, a
-- RISYS group, a business unit (with its sub-units) or an Entra department
-- (members whose sign-in email matches an Entra user in that department).
--
-- Attestation is a signed-in act: accept_attestation() takes no user id, it
-- uses the caller, and it stores the hash of the exact version accepted.
-- This release covers RISYS members. Employees with no RISYS account wait
-- for the attest-only role (open decision in the design).
--
-- policy_daily() (05:10 Riyadh) sends reminders, adds new members to open
-- campaigns, starts annual re-attestation, reminds owners of policy reviews
-- and expires exceptions.
-- ============================================================

create table if not exists public.policy_audiences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  policy_id   uuid not null references public.policies(id) on delete cascade,
  kind        text not null check (kind in ('everyone', 'role', 'group', 'business_unit', 'entra_department')),
  ref         text,
  created_at  timestamptz not null default now(),
  constraint policy_audiences_ref check ((kind = 'everyone') = (ref is null)),
  constraint policy_audiences_key unique nulls not distinct (policy_id, kind, ref)
);

create table if not exists public.attestation_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  ref                text not null,
  policy_id          uuid not null references public.policies(id) on delete cascade,
  policy_version_id  uuid not null references public.policy_versions(id) on delete restrict,
  trigger_kind       text not null check (trigger_kind in ('publish', 'annual', 'new_member', 'manual')),
  due_on             date not null,
  status             text not null default 'open' check (status in ('open', 'closed')),
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  closed_at          timestamptz,
  constraint attestation_campaigns_ref_key unique (org_id, ref)
);

create table if not exists public.attestations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid not null references public.attestation_campaigns(id) on delete cascade,
  policy_id          uuid not null references public.policies(id) on delete cascade,
  policy_version_id  uuid not null references public.policy_versions(id) on delete restrict,
  user_id            uuid not null references auth.users(id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending', 'accepted', 'excused')),
  accepted_at        timestamptz,
  version_sha256     text,
  excused_by         uuid references auth.users(id) on delete set null,
  excused_reason     text,
  reminders_sent     integer not null default 0,
  last_reminded_at   timestamptz,
  created_at         timestamptz not null default now(),
  constraint attestations_key unique (campaign_id, user_id)
);

create index if not exists attestations_user_idx on public.attestations (org_id, user_id, status);
create index if not exists attestation_campaigns_policy_idx on public.attestation_campaigns (policy_id, status);

create table if not exists public.policy_review_reminders (
  policy_id  uuid not null references public.policies(id) on delete cascade,
  due_on     date not null,
  stage      text not null check (stage in ('due_30', 'due_7', 'overdue')),
  sent_at    timestamptz not null default now(),
  primary key (policy_id, due_on, stage)
);

create or replace function public.policy_audiences_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from policies where id = new.policy_id and org_id = new.org_id) then
    raise exception 'Policy belongs to another workspace';
  end if;
  if new.kind = 'role' and new.ref not in ('owner', 'admin', 'risk_manager', 'compliance_officer', 'member', 'auditor', 'viewer') then
    raise exception 'Unknown role %', new.ref;
  end if;
  if new.kind = 'group' and not exists (select 1 from org_groups where id::text = new.ref and org_id = new.org_id) then
    raise exception 'Unknown group';
  end if;
  if new.kind = 'business_unit' and not exists (select 1 from business_units where id::text = new.ref and org_id = new.org_id) then
    raise exception 'Unknown business unit';
  end if;
  return new;
end $$;

drop trigger if exists policy_audiences_guard on public.policy_audiences;
create trigger policy_audiences_guard before insert or update on public.policy_audiences
  for each row execute function public.policy_audiences_guard();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.policy_audiences enable row level security;
alter table public.attestation_campaigns enable row level security;
alter table public.attestations enable row level security;
alter table public.policy_review_reminders enable row level security;

drop policy if exists policy_audiences_select on public.policy_audiences;
create policy policy_audiences_select on public.policy_audiences for select to authenticated using (is_org_member(org_id));
drop policy if exists policy_audiences_insert on public.policy_audiences;
create policy policy_audiences_insert on public.policy_audiences for insert to authenticated
  with check (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));
drop policy if exists policy_audiences_delete on public.policy_audiences;
create policy policy_audiences_delete on public.policy_audiences for delete to authenticated
  using (is_compliance_writer(org_id) or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid()));

drop policy if exists attestation_campaigns_select on public.attestation_campaigns;
create policy attestation_campaigns_select on public.attestation_campaigns for select to authenticated using (is_org_member(org_id));

-- People see their own attestations; the policy owner, compliance writers and auditors see all.
drop policy if exists attestations_select on public.attestations;
create policy attestations_select on public.attestations for select to authenticated
  using (is_org_member(org_id) and (user_id = auth.uid() or is_compliance_writer(org_id) or my_role(org_id) = 'auditor'
         or exists (select 1 from policies p where p.id = policy_id and p.owner_id = auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['policy_audiences', 'attestation_campaigns', 'attestations'] loop
    execute format('drop policy if exists tenant_active_guard on public.%I', t);
    execute format('create policy tenant_active_guard on public.%I as restrictive for all to authenticated using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id))', t);
  end loop;
  execute 'drop policy if exists tenant_readonly_guard_ins on public.policy_audiences';
  execute 'create policy tenant_readonly_guard_ins on public.policy_audiences as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id))';
  execute 'drop policy if exists tenant_readonly_guard_del on public.policy_audiences';
  execute 'create policy tenant_readonly_guard_del on public.policy_audiences as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id))';
end $$;

grant select, insert, delete on public.policy_audiences to authenticated;
grant select on public.attestation_campaigns, public.attestations to authenticated;
revoke insert, update, delete on public.attestation_campaigns, public.attestations from authenticated, anon;
revoke all on public.policy_review_reminders from authenticated, anon;

-- ── Who must attest ───────────────────────────────────────────────────────────
create or replace function public.policy_audience_members(p_policy uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive p as (select id, org_id from policies where id = p_policy),
  units as (
    select b.id from business_units b, policy_audiences a, p
     where a.policy_id = p.id and a.kind = 'business_unit' and b.id::text = a.ref and b.org_id = p.org_id
    union
    select c.id from business_units c join units u on c.parent_id = u.id
  )
  select distinct m.user_id
    from organization_members m join p on m.org_id = p.org_id
   where exists (select 1 from policy_audiences a where a.policy_id = p.id and (
           a.kind = 'everyone'
        or (a.kind = 'role' and m.role = a.ref)
        or (a.kind = 'group' and (m.group_id::text = a.ref
              or exists (select 1 from org_group_members g where g.group_id::text = a.ref and g.user_id = m.user_id)))
        or (a.kind = 'business_unit' and m.business_unit_id in (select id from units))
        or (a.kind = 'entra_department' and exists (
              select 1 from profiles pr join entra_users e on lower(e.mail) = lower(pr.email) or lower(e.user_principal_name) = lower(pr.email)
               where pr.id = m.user_id and e.org_id = p.org_id and lower(btrim(e.department)) = lower(btrim(a.ref))))));
$$;

-- Start a campaign for the published version (system, or the owner / a compliance writer).
create or replace function public.start_attestation_campaign(p_policy uuid, p_trigger text default 'manual', p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare p policies; v_id uuid; v_ref text; v_n int;
  v_system boolean := coalesce(current_setting('risys.policy_system', true), '') = 'on';
  v_due date := coalesce(p_due, ((now() at time zone 'Asia/Riyadh')::date + 14));
begin
  select * into p from policies where id = p_policy;
  if not found then raise exception 'Policy not found'; end if;
  if not v_system and not (is_org_member(p.org_id) and (is_compliance_writer(p.org_id) or p.owner_id = auth.uid())) then
    raise exception 'Only the owner or a compliance writer can start an attestation campaign';
  end if;
  if p.status <> 'published' or p.current_version_id is null then raise exception 'Only a published policy can be attested'; end if;
  if not exists (select 1 from policy_audiences where policy_id = p.id) then raise exception 'Set who must attest (the audience) first'; end if;
  if v_due <= (now() at time zone 'Asia/Riyadh')::date then raise exception 'The due date must be in the future'; end if;

  -- One open campaign per policy: the new one replaces the old.
  update attestation_campaigns set status = 'closed', closed_at = now() where policy_id = p.id and status = 'open';

  v_ref := next_ref(p.org_id, 'ATT');
  insert into attestation_campaigns (org_id, ref, policy_id, policy_version_id, trigger_kind, due_on, created_by)
  values (p.org_id, v_ref, p.id, p.current_version_id, p_trigger, v_due, auth.uid())
  returning id into v_id;

  insert into attestations (org_id, campaign_id, policy_id, policy_version_id, user_id)
  select p.org_id, v_id, p.id, p.current_version_id, u from policy_audience_members(p.id) u
  on conflict do nothing;
  get diagnostics v_n = row_count;

  insert into notifications (org_id, user_id, type, title, body, link)
  select a.org_id, a.user_id, 'workflow', format('Policy to read and accept: %s', p.ref),
         format('%s. Please read it and confirm by %s.', p.title, to_char(v_due, 'DD Mon YYYY')),
         '/app/my-policies/' || a.id
    from attestations a where a.campaign_id = v_id;

  perform audit_log_write(p.org_id, 'policy.campaign_started', 'policy', p.id, v_ref,
    jsonb_build_object('trigger', p_trigger, 'people', v_n, 'due_on', v_due));
  return v_id;
end $$;

-- Publishing starts the campaign when the policy has an audience. It fires on
-- policies (not versions) because publish_policy_version() sets the policy's
-- current version after it marks the version published.
create or replace function public.policies_after_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.current_version_id is distinct from old.current_version_id
     and exists (select 1 from policy_audiences where policy_id = new.id) then
    perform set_config('risys.policy_system', 'on', true);
    perform start_attestation_campaign(new.id, 'publish', null);
  end if;
  return null;
end $$;

drop trigger if exists policy_versions_after_publish on public.policy_versions;
drop function if exists public.policy_versions_after_publish();
drop trigger if exists policies_after_publish on public.policies;
create trigger policies_after_publish after update of current_version_id on public.policies
  for each row execute function public.policies_after_publish();

-- Retiring a policy closes its campaigns.
create or replace function public.policies_after_retire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'retired' and old.status <> 'retired' then
    update attestation_campaigns set status = 'closed', closed_at = now() where policy_id = new.id and status = 'open';
  end if;
  return null;
end $$;

drop trigger if exists policies_after_retire on public.policies;
create trigger policies_after_retire after update of status on public.policies
  for each row execute function public.policies_after_retire();

-- The signed-in person accepts the exact version they were shown.
create or replace function public.accept_attestation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a attestations; v policy_versions; c attestation_campaigns;
begin
  select * into a from attestations where id = p_id for update;
  if not found or a.user_id <> auth.uid() then raise exception 'Attestation not found'; end if;
  if a.status <> 'pending' then raise exception 'Already recorded'; end if;
  select * into c from attestation_campaigns where id = a.campaign_id;
  select * into v from policy_versions where id = a.policy_version_id;
  if v.status <> 'published' then raise exception 'A newer version of this policy replaced the one in this request'; end if;
  update attestations set status = 'accepted', accepted_at = now(), version_sha256 = v.sha256 where id = p_id;
  perform audit_log_write(a.org_id, 'policy.attested', 'policy', a.policy_id, c.ref,
    jsonb_build_object('version_id', v.id, 'sha256', v.sha256));
  return jsonb_build_object('accepted_at', now(), 'sha256', v.sha256);
end $$;

create or replace function public.excuse_attestation(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a attestations;
begin
  select * into a from attestations where id = p_id for update;
  if not found or not is_org_member(a.org_id) then raise exception 'Attestation not found'; end if;
  if not (is_compliance_writer(a.org_id) or exists (select 1 from policies p where p.id = a.policy_id and p.owner_id = auth.uid())) then
    raise exception 'Only the owner or a compliance writer can excuse someone';
  end if;
  if a.status <> 'pending' then raise exception 'Only a pending attestation can be excused'; end if;
  if length(coalesce(btrim(p_reason), '')) < 5 then raise exception 'Give a reason'; end if;
  update attestations set status = 'excused', excused_by = auth.uid(), excused_reason = btrim(p_reason) where id = p_id;
  perform audit_log_write(a.org_id, 'policy.attestation_excused', 'policy', a.policy_id, null, jsonb_build_object('user', a.user_id, 'reason', btrim(p_reason)));
end $$;

-- Remind the people who have not yet accepted, now (owner or compliance writer).
create or replace function public.remind_attestation_campaign(p_campaign uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c attestation_campaigns; p policies; v_n int;
begin
  select * into c from attestation_campaigns where id = p_campaign;
  select * into p from policies where id = c.policy_id;
  if not found or not is_org_member(c.org_id) then raise exception 'Campaign not found'; end if;
  if not (is_compliance_writer(c.org_id) or p.owner_id = auth.uid()) then raise exception 'Only the owner or a compliance writer can send reminders'; end if;
  if c.status <> 'open' then raise exception 'The campaign is closed'; end if;
  with due as (
    update attestations set reminders_sent = reminders_sent + 1, last_reminded_at = now()
     where campaign_id = c.id and status = 'pending' and (last_reminded_at is null or last_reminded_at < now() - interval '20 hours')
     returning *
  )
  insert into notifications (org_id, user_id, type, title, body, link)
  select d.org_id, d.user_id, 'workflow', format('Reminder: please accept %s', p.ref),
         format('%s. Due %s.', p.title, to_char(c.due_on, 'DD Mon YYYY')), '/app/my-policies/' || d.id
    from due d;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── Attestation rate per policy (latest campaign of the current version) ─────
create or replace view public.v_policy_attestation
with (security_invoker = true) as
  select c.org_id, c.policy_id, c.id as campaign_id, c.ref, c.policy_version_id, c.due_on, c.status, c.trigger_kind, c.created_at,
         count(a.*) filter (where a.status <> 'excused') as expected,
         count(a.*) filter (where a.status = 'accepted') as accepted,
         count(a.*) filter (where a.status = 'pending') as pending,
         count(a.*) filter (where a.status = 'excused') as excused,
         case when count(a.*) filter (where a.status <> 'excused') = 0 then null
              else round(100.0 * count(a.*) filter (where a.status = 'accepted') / count(a.*) filter (where a.status <> 'excused')) end as rate
    from attestation_campaigns c left join attestations a on a.campaign_id = c.id
   group by c.id;

grant select on public.v_policy_attestation to authenticated;

-- ── Daily job ─────────────────────────────────────────────────────────────────
create or replace function public.policy_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_rem int := 0; v_added int := 0; v_annual int := 0; v_reviews int := 0; v_closed int := 0;
  r record; v_exc jsonb; r_n int;
begin
  perform set_config('risys.policy_system', 'on', true);

  -- 1. Reminders 7 days and 1 day before the due date, and once the day after.
  with due as (
    update attestations a set reminders_sent = a.reminders_sent + 1, last_reminded_at = now()
      from attestation_campaigns c
     where c.id = a.campaign_id and c.status = 'open' and a.status = 'pending'
       and ((c.due_on - v_today = 7 and a.reminders_sent = 0)
         or (c.due_on - v_today = 1 and a.reminders_sent <= 1)
         or (v_today - c.due_on = 1 and a.reminders_sent <= 2))
    returning a.*, c.due_on
  )
  insert into notifications (org_id, user_id, type, title, body, link)
  select d.org_id, d.user_id, 'workflow',
         case when d.due_on < v_today then format('Overdue: please accept %s', p.ref) else format('Reminder: please accept %s', p.ref) end,
         format('%s. Due %s.', p.title, to_char(d.due_on, 'DD Mon YYYY')), '/app/my-policies/' || d.id
    from due d join policies p on p.id = d.policy_id;
  get diagnostics v_rem = row_count;

  -- 2. New members in an audience join the open campaign of the current version.
  for r in select c.* from attestation_campaigns c join policies p on p.id = c.policy_id
            where c.status = 'open' and c.policy_version_id = p.current_version_id loop
    with added as (
      insert into attestations (org_id, campaign_id, policy_id, policy_version_id, user_id)
      select r.org_id, r.id, r.policy_id, r.policy_version_id, u from policy_audience_members(r.policy_id) u
       where not exists (select 1 from attestations x where x.policy_version_id = r.policy_version_id and x.user_id = u and x.status = 'accepted')
      on conflict do nothing
      returning *
    )
    insert into notifications (org_id, user_id, type, title, body, link)
    select a.org_id, a.user_id, 'workflow', 'Policy to read and accept', 'A policy applies to you. Please read it and confirm.', '/app/my-policies/' || a.id
      from added a;
    get diagnostics r_n = row_count;
    v_added := v_added + r_n;
  end loop;

  -- 3. Close campaigns 30 days after their due date.
  update attestation_campaigns set status = 'closed', closed_at = now() where status = 'open' and due_on < v_today - 30;
  get diagnostics v_closed = row_count;

  -- 4. Annual re-attestation: a published policy with no campaign in the last 12 months.
  for r in select p.* from policies p
            where p.status = 'published' and exists (select 1 from policy_audiences a where a.policy_id = p.id)
              and not exists (select 1 from attestation_campaigns c where c.policy_id = p.id and c.created_at > now() - interval '12 months')
              and p.last_published_at < now() - interval '12 months' loop
    perform start_attestation_campaign(r.id, 'annual', v_today + 30);
    v_annual := v_annual + 1;
  end loop;

  -- 5. Policy reviews: owner reminded 30 and 7 days before, and when overdue.
  for r in select p.*, (p.next_review_on - v_today) as days,
                  case when p.next_review_on < v_today then 'overdue' when p.next_review_on - v_today <= 7 then 'due_7' else 'due_30' end as stage
             from policies p join organizations o on o.id = p.org_id and o.status = 'active'
            where p.status = 'published' and p.next_review_on is not null and p.next_review_on - v_today <= 30 loop
    continue when exists (select 1 from policy_review_reminders x where x.policy_id = r.id and x.due_on = r.next_review_on
                            and (case x.stage when 'overdue' then 3 when 'due_7' then 2 else 1 end)
                             >= (case r.stage when 'overdue' then 3 when 'due_7' then 2 else 1 end));
    insert into notifications (org_id, user_id, type, title, body, link)
    values (r.org_id, r.owner_id, 'workflow',
            case r.stage when 'overdue' then format('Policy review overdue: %s', r.ref) else format('Policy review due in %s days: %s', r.days, r.ref) end,
            r.title || case r.stage when 'overdue' then '. The controls it evidences now count as Partial until a reviewed version is published.'
                                    else '. Review it and publish a new version (or confirm it unchanged) before ' || to_char(r.next_review_on, 'DD Mon YYYY') || '.' end,
            '/app/policies/' || r.id);
    insert into policy_review_reminders (policy_id, due_on, stage) values (r.id, r.next_review_on, r.stage) on conflict do nothing;
    v_reviews := v_reviews + 1;
  end loop;

  perform set_config('risys.policy_system', 'off', true);

  v_exc := expire_exceptions();
  return jsonb_build_object('reminders', v_rem, 'added', v_added, 'closed', v_closed, 'annual', v_annual,
                            'reviews', v_reviews, 'exceptions', v_exc, 'ran_at', now());
end $$;

do $$
declare f text;
begin
  foreach f in array array['start_attestation_campaign(uuid, text, date)', 'accept_attestation(uuid)',
                           'excuse_attestation(uuid, text)', 'remind_attestation_campaign(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.policy_daily() from public, anon, authenticated;
revoke all on function public.policy_audience_members(uuid) from public, anon, authenticated;

-- 05:10 Riyadh = 02:10 UTC.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'risys-policy-daily') then
    perform cron.unschedule('risys-policy-daily');
  end if;
  perform cron.schedule('risys-policy-daily', '10 2 * * *', $job$ select public.policy_daily() $job$);
end $$;
