-- ============================================================
-- Privacy management under the PDPL (build step 2, P1 items 2.1–2.4).
--
-- Anchored on the PDPL Implementing Regulation (IR):
--   Art. 3   data subject requests: act within 30 days, one extension of up
--            to 30 days with advance notice, verify identity first, record
--            every request (oral ones too), refuse only for a stated reason.
--   Art. 24  personal-data breach: notify the competent authority (SDAIA)
--            within 72 hours of becoming aware, late information with a
--            reason, keep a copy of what was sent, document corrective
--            measures, notify affected data subjects without undue delay.
--   Art. 25  impact assessment: required for sensitive data, linking data
--            sets from different sources, continuous large-scale processing
--            of people lacking capacity or continuous monitoring, and new
--            technology; minimum contents; reassess when it shows harm.
--   Art. 33  records of processing activities: minimum contents; kept for
--            the processing period plus five years.
--
-- Objects
--   privacy_settings            controller and DPO (Art. 33 contents), per workspace
--   processing_activities  ROP  the record of processing (RoPA)
--   data_subject_requests  DSR  the request register with its clock
--   personal_data_breaches PDB  a personal-data breach on an incident, 72-hour clock
--   privacy_assessments    PIA  Art. 25 impact assessments, four-eyes approval
--   privacy_reminders           de-duplication of clock reminders
--   privacy_tick()              every 15 minutes: breach and request reminders
--   my_work()                   gains dsr_due, breach_notify, dpia_approval
--
-- Rules live here, not in the UI: clocks are set by the database, status
-- changes go through RPCs, requests and breaches cannot be deleted, a
-- processing record cannot be deleted until five years after it ended, an
-- assessor never approves their own assessment.
--
-- Follow-ups applied after this file: 20261108221147 (dsr_can_act NULL fix)
-- and 20261108221344 (delete exemption only while the console deletes a
-- suspended workspace). This file is kept as it was applied.
--
-- Reading: privacy records name real people, so data subject requests and
-- breaches are visible to compliance writers and auditors, and to the person
-- who logged or is assigned the record. Processing activities and impact
-- assessments describe processing, not people, and are visible to members.
-- ============================================================

-- ── 0. Who may read and write privacy records ────────────────────────────────
create or replace function public.can_read_privacy(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_compliance_writer(p_org) or coalesce(my_role(p_org) = 'auditor', false);
$$;
grant execute on function public.can_read_privacy(uuid) to authenticated;

-- Compliance writers of a workspace (recipients of privacy clock reminders).
create or replace function public.privacy_officers(p_org uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from organization_members m
   where m.org_id = p_org and m.role in ('owner', 'admin', 'risk_manager', 'compliance_officer');
$$;
revoke all on function public.privacy_officers(uuid) from public, anon, authenticated;

create or replace function public.privacy_notify(p_org uuid, p_users uuid[], p_title text, p_body text, p_link text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (org_id, user_id, type, title, body, link)
  select distinct p_org, u, 'workflow', p_title, p_body, p_link
    from unnest(p_users) u
   where u is not null and u is distinct from auth.uid()
     and exists (select 1 from organization_members m where m.org_id = p_org and m.user_id = u);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.privacy_notify(uuid, uuid[], text, text, text) from public, anon, authenticated;

-- ── 1. Controller and DPO ────────────────────────────────────────────────────
create table if not exists public.privacy_settings (
  org_id              uuid primary key references public.organizations(id) on delete cascade,
  controller_name     text check (length(controller_name) <= 200),
  controller_contact  text check (length(controller_contact) <= 300),
  dpo_user_id         uuid references auth.users(id) on delete set null,
  dpo_name            text check (length(dpo_name) <= 200),
  dpo_contact         text check (length(dpo_contact) <= 300),
  sdaia_contact       text check (length(sdaia_contact) <= 300),
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);

-- ── 2. Records of processing (Art. 33) ───────────────────────────────────────
create table if not exists public.processing_activities (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  ref                    text not null,
  name                   text not null check (length(btrim(name)) between 3 and 200),
  description            text,
  purpose                text,
  lawful_basis           text check (lawful_basis in ('consent', 'contract', 'legal_obligation', 'vital_interest',
                                                      'public_interest', 'legitimate_interest')),
  owner_id               uuid not null references auth.users(id) on delete restrict,
  business_unit_id       uuid references public.business_units(id) on delete set null,
  systems                text,
  data_categories        text[] not null default '{}',
  data_subjects          text[] not null default '{}',
  recipients             text[] not null default '{}',
  retention              text,
  transfers_outside_ksa  boolean not null default false,
  transfer_countries     text,
  transfer_safeguard     text,
  security_measures      text,
  -- Art. 25(1) triggers. Any one makes an impact assessment mandatory.
  sensitive_data         boolean not null default false,
  links_sources          boolean not null default false,
  large_scale_monitoring boolean not null default false,
  new_technology         boolean not null default false,
  assessment_required    boolean generated always as (sensitive_data or links_sources or large_scale_monitoring or new_technology) stored,
  status                 text not null default 'active' check (status in ('active', 'ended')),
  ended_on               date,
  retain_until           date generated always as ((ended_on + interval '5 years')::date) stored,
  next_review_on         date,
  created_by             uuid references auth.users(id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint processing_activities_ref_key unique (org_id, ref),
  constraint processing_activities_end check ((status = 'ended') = (ended_on is not null))
);
create index if not exists processing_activities_org_idx on public.processing_activities (org_id, status);

create or replace function public.processing_activities_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Deleting a whole workspace (platform console) and foreign-key actions
  -- (a user or business unit removed) are not edits.
  if tg_op = 'DELETE' and is_platform_admin() then return old; end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'DELETE' then
    if old.retain_until is null or old.retain_until > (now() at time zone 'Asia/Riyadh')::date then
      raise exception 'A processing record is kept for the processing period plus five years (PDPL-IR Art. 33); end it instead';
    end if;
    if not is_org_admin(old.org_id) then raise exception 'Only an administrator can delete an expired processing record'; end if;
    return old;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.ref := next_ref(new.org_id, 'ROP');
    new.created_by := coalesce(auth.uid(), new.created_by);
  elsif new.org_id <> old.org_id or new.ref <> old.ref then
    raise exception 'A processing record cannot move workspace or change its reference';
  end if;
  if new.business_unit_id is not null and not exists (select 1 from business_units where id = new.business_unit_id and org_id = new.org_id) then
    raise exception 'The business unit belongs to another workspace';
  end if;
  if not exists (select 1 from organization_members where org_id = new.org_id and user_id = new.owner_id) then
    raise exception 'The owner must be a member of this workspace';
  end if;
  if new.transfers_outside_ksa and coalesce(btrim(new.transfer_countries), '') = '' then
    raise exception 'Name the countries personal data is transferred to';
  end if;
  return new;
end $$;
drop trigger if exists processing_activities_guard on public.processing_activities;
create trigger processing_activities_guard before insert or update or delete on public.processing_activities
  for each row execute function public.processing_activities_guard();

-- ── 3. Data subject requests (Art. 3) ────────────────────────────────────────
create table if not exists public.data_subject_requests (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  ref                    text not null,
  request_type           text not null check (request_type in ('information', 'access', 'copy', 'correction', 'destruction', 'withdraw_consent', 'other')),
  channel                text not null check (channel in ('email', 'web', 'phone', 'in_person', 'letter', 'other')),
  requester_name         text not null check (length(btrim(requester_name)) between 2 and 200),
  requester_contact      text check (length(requester_contact) <= 300),
  on_behalf              boolean not null default false,
  on_behalf_relationship text check (length(on_behalf_relationship) <= 200),
  details                text not null check (length(btrim(details)) >= 10),
  activity_id            uuid references public.processing_activities(id) on delete set null,
  assigned_to            uuid references auth.users(id) on delete set null,
  received_at            timestamptz not null default now(),
  due_on                 date not null,
  extended_due_on        date,
  extension_reason       text,
  extension_notified_at  timestamptz,
  identity_verified_at   timestamptz,
  identity_method        text,
  identity_verified_by   uuid references auth.users(id) on delete set null,
  status                 text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'refused', 'withdrawn')),
  outcome_summary        text,
  refusal_reason         text check (refusal_reason in ('repetitive', 'manifestly_unfounded', 'disproportionate')),
  requester_informed_at  timestamptz,
  closed_at              timestamptz,
  closed_by              uuid references auth.users(id) on delete set null,
  created_by             uuid references auth.users(id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint data_subject_requests_ref_key unique (org_id, ref)
);
create index if not exists dsr_org_idx on public.data_subject_requests (org_id, status, due_on);

create or replace function public.data_subject_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_system boolean := coalesce(current_setting('risys.privacy_system', true), '') = 'on';
begin
  if tg_op = 'DELETE' and is_platform_admin() then return old; end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'DELETE' then
    raise exception 'Every data subject request is kept on record (PDPL-IR Art. 3(1)(d))';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.ref := next_ref(new.org_id, 'DSR');
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.received_at > now() + interval '5 minutes' then raise exception 'A request cannot be received in the future'; end if;
    if new.received_at < now() - interval '60 days' then raise exception 'Log a request within 60 days of receiving it'; end if;
    -- The clock: 30 days from receipt, in Riyadh.
    new.due_on := (new.received_at at time zone 'Asia/Riyadh')::date + 30;
    if not v_system then
      new.status := 'received'; new.extended_due_on := null; new.extension_reason := null; new.extension_notified_at := null;
      new.identity_verified_at := null; new.identity_method := null; new.identity_verified_by := null;
      new.outcome_summary := null; new.refusal_reason := null; new.requester_informed_at := null;
      new.closed_at := null; new.closed_by := null;
    end if;
  else
    if new.org_id <> old.org_id or new.ref <> old.ref or new.received_at <> old.received_at or new.due_on <> old.due_on
       or new.created_by is distinct from old.created_by then
      raise exception 'The reference, receipt time and clock of a request cannot change';
    end if;
    if not v_system and (new.status, new.extended_due_on, new.extension_reason, new.extension_notified_at,
                         new.identity_verified_at, new.identity_method, new.identity_verified_by,
                         new.outcome_summary, new.refusal_reason, new.requester_informed_at, new.closed_at, new.closed_by)
       is distinct from (old.status, old.extended_due_on, old.extension_reason, old.extension_notified_at,
                         old.identity_verified_at, old.identity_method, old.identity_verified_by,
                         old.outcome_summary, old.refusal_reason, old.requester_informed_at, old.closed_at, old.closed_by) then
      raise exception 'Identity checks, extensions and closing go through their own steps';
    end if;
    if not v_system and old.status in ('completed', 'refused', 'withdrawn') then
      raise exception 'A closed request cannot change';
    end if;
  end if;
  if new.assigned_to is not null and not exists (select 1 from organization_members where org_id = new.org_id and user_id = new.assigned_to) then
    raise exception 'The assignee must be a member of this workspace';
  end if;
  if new.activity_id is not null and not exists (select 1 from processing_activities where id = new.activity_id and org_id = new.org_id) then
    raise exception 'The processing activity belongs to another workspace';
  end if;
  if new.on_behalf and coalesce(btrim(new.on_behalf_relationship), '') = '' then
    raise exception 'Say how the requester acts for the data subject (for example legal guardian)';
  end if;
  return new;
end $$;
drop trigger if exists data_subject_requests_guard on public.data_subject_requests;
create trigger data_subject_requests_guard before insert or update or delete on public.data_subject_requests
  for each row execute function public.data_subject_requests_guard();

create or replace function public.dsr_can_act(r public.data_subject_requests)
returns boolean language sql stable security definer set search_path = public as $$
  select is_compliance_writer(r.org_id) or r.assigned_to = auth.uid();
$$;

create or replace function public.verify_dsr_identity(p_id uuid, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare r data_subject_requests;
begin
  select * into r from data_subject_requests where id = p_id for update;
  if not found or not is_org_member(r.org_id) then raise exception 'Request not found'; end if;
  if not dsr_can_act(r) then raise exception 'Only the assignee or a compliance writer can work this request'; end if;
  if r.status <> 'received' then raise exception 'Identity is checked once, before work starts'; end if;
  if length(coalesce(btrim(p_method), '')) < 10 then raise exception 'Say how identity was verified (at least 10 characters)'; end if;
  perform set_config('risys.privacy_system', 'on', true);
  update data_subject_requests
     set identity_verified_at = now(), identity_method = btrim(p_method), identity_verified_by = auth.uid(),
         status = 'in_progress', assigned_to = coalesce(assigned_to, auth.uid())
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(r.org_id, 'dsr.identity_verified', 'data_subject_request', r.id, r.ref, '{}'::jsonb);
end $$;

create or replace function public.extend_dsr(p_id uuid, p_reason text, p_notified_at timestamptz)
returns date language plpgsql security definer set search_path = public as $$
declare r data_subject_requests; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_new date;
begin
  select * into r from data_subject_requests where id = p_id for update;
  if not found or not is_org_member(r.org_id) then raise exception 'Request not found'; end if;
  if not dsr_can_act(r) then raise exception 'Only the assignee or a compliance writer can work this request'; end if;
  if r.status not in ('received', 'in_progress') then raise exception 'Request % is closed', r.ref; end if;
  if r.extended_due_on is not null then raise exception 'A request can be extended once, by up to 30 days'; end if;
  if v_today > r.due_on then raise exception 'The extension must be decided before the 30 days run out (%)', to_char(r.due_on, 'DD Mon YYYY'); end if;
  if length(coalesce(btrim(p_reason), '')) < 20 then
    raise exception 'Give the reason for the extension (disproportionate effort or several requests), at least 20 characters';
  end if;
  if p_notified_at is null or p_notified_at > now() + interval '5 minutes' or p_notified_at < r.received_at then
    raise exception 'Record when the requester was told about the extension: it must be notified in advance';
  end if;
  v_new := r.due_on + 30;
  perform set_config('risys.privacy_system', 'on', true);
  update data_subject_requests set extended_due_on = v_new, extension_reason = btrim(p_reason), extension_notified_at = p_notified_at
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(r.org_id, 'dsr.extended', 'data_subject_request', r.id, r.ref, jsonb_build_object('due_on', v_new));
  return v_new;
end $$;

create or replace function public.close_dsr(p_id uuid, p_outcome text, p_summary text, p_refusal_reason text default null,
                                            p_informed_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare r data_subject_requests;
begin
  select * into r from data_subject_requests where id = p_id for update;
  if not found or not is_org_member(r.org_id) then raise exception 'Request not found'; end if;
  if not dsr_can_act(r) then raise exception 'Only the assignee or a compliance writer can work this request'; end if;
  if r.status not in ('received', 'in_progress') then raise exception 'Request % is already closed', r.ref; end if;
  if p_outcome not in ('completed', 'refused', 'withdrawn') then raise exception 'Close as completed, refused or withdrawn'; end if;
  if p_outcome = 'completed' and r.identity_verified_at is null then
    raise exception 'Verify the requester''s identity before acting on the request (PDPL-IR Art. 3(1)(c))';
  end if;
  if p_outcome = 'refused' and coalesce(p_refusal_reason, '') not in ('repetitive', 'manifestly_unfounded', 'disproportionate') then
    raise exception 'A request may be refused only when it is repetitive, manifestly unfounded or needs disproportionate effort';
  end if;
  if length(coalesce(btrim(p_summary), '')) < (case p_outcome when 'refused' then 20 else 10 end) then
    raise exception 'Describe what was done or why it was refused';
  end if;
  if p_outcome in ('completed', 'refused') and (p_informed_at is null or p_informed_at > now() + interval '5 minutes' or p_informed_at < r.received_at) then
    raise exception 'Record when the requester was told the outcome';
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  update data_subject_requests
     set status = p_outcome, outcome_summary = btrim(p_summary),
         refusal_reason = case when p_outcome = 'refused' then p_refusal_reason end,
         requester_informed_at = p_informed_at, closed_at = now(), closed_by = auth.uid()
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(r.org_id, 'dsr.' || p_outcome, 'data_subject_request', r.id, r.ref,
    jsonb_build_object('on_time', (now() at time zone 'Asia/Riyadh')::date <= coalesce(r.extended_due_on, r.due_on)));
end $$;

-- ── 4. Personal-data breaches (Art. 24) ──────────────────────────────────────
create table if not exists public.personal_data_breaches (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  ref                      text not null,
  incident_id              uuid not null unique references public.incidents(id) on delete cascade,
  aware_at                 timestamptz not null,
  occurred_at              timestamptz,
  sdaia_due_at             timestamptz not null,
  description              text,
  data_categories          text[] not null default '{}',
  subjects_affected        integer check (subjects_affected >= 0),
  subjects_estimated       boolean not null default false,
  risks                    text,
  measures                 text,
  notifiable               text not null default 'pending' check (notifiable in ('pending', 'notifiable', 'not_notifiable')),
  not_notifiable_reason    text,
  assessed_by              uuid references auth.users(id) on delete set null,
  assessed_at              timestamptz,
  sdaia_notified_at        timestamptz,
  sdaia_reference          text,
  sdaia_report             jsonb,
  sdaia_late_reason        text,
  sdaia_notified_by        uuid references auth.users(id) on delete set null,
  subjects_notified_at     timestamptz,
  subjects_notice          text,
  subjects_not_required    text,
  corrective_actions       text,
  status                   text not null default 'open' check (status in ('open', 'closed')),
  closed_at                timestamptz,
  closed_by                uuid references auth.users(id) on delete set null,
  created_by               uuid references auth.users(id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint personal_data_breaches_ref_key unique (org_id, ref)
);
create index if not exists pdb_org_idx on public.personal_data_breaches (org_id, status, sdaia_due_at);

create or replace function public.personal_data_breaches_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_system boolean := coalesce(current_setting('risys.privacy_system', true), '') = 'on';
begin
  if tg_op = 'DELETE' and is_platform_admin() then return old; end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'DELETE' then raise exception 'A personal-data breach record cannot be deleted'; end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not v_system then raise exception 'Report a breach with report_personal_data_breach()'; end if;
    new.sdaia_due_at := new.aware_at + interval '72 hours';
    return new;
  end if;
  if new.org_id <> old.org_id or new.ref <> old.ref or new.incident_id <> old.incident_id or new.aware_at <> old.aware_at
     or new.sdaia_due_at <> old.sdaia_due_at or new.created_by is distinct from old.created_by then
    raise exception 'The reference, incident and awareness time of a breach cannot change';
  end if;
  if not v_system and (new.notifiable, new.not_notifiable_reason, new.assessed_by, new.assessed_at,
                       new.sdaia_notified_at, new.sdaia_reference, new.sdaia_report, new.sdaia_late_reason, new.sdaia_notified_by,
                       new.subjects_notified_at, new.subjects_notice, new.subjects_not_required,
                       new.status, new.closed_at, new.closed_by)
     is distinct from (old.notifiable, old.not_notifiable_reason, old.assessed_by, old.assessed_at,
                       old.sdaia_notified_at, old.sdaia_reference, old.sdaia_report, old.sdaia_late_reason, old.sdaia_notified_by,
                       old.subjects_notified_at, old.subjects_notice, old.subjects_not_required,
                       old.status, old.closed_at, old.closed_by) then
    raise exception 'The assessment, notifications and closing of a breach go through their own steps';
  end if;
  if not v_system and old.status = 'closed' then raise exception 'A closed breach cannot change'; end if;
  return new;
end $$;
drop trigger if exists personal_data_breaches_guard on public.personal_data_breaches;
create trigger personal_data_breaches_guard before insert or update or delete on public.personal_data_breaches
  for each row execute function public.personal_data_breaches_guard();

-- Report a breach: on an existing incident, or with a new incident raised for it.
create or replace function public.report_personal_data_breach(
  p_org uuid, p_incident uuid, p_title text, p_aware_at timestamptz, p_description text, p_severity text default 'high')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inc uuid := p_incident; v_id uuid; v_ref text;
begin
  if not is_org_member(p_org) or coalesce(my_role(p_org), '') in ('viewer', 'auditor') then
    raise exception 'Only workspace members can report a breach';
  end if;
  if p_aware_at is null or p_aware_at > now() + interval '5 minutes' then raise exception 'Say when the organisation became aware of the breach'; end if;
  if p_aware_at < now() - interval '1 year' then raise exception 'The awareness time is more than a year ago'; end if;
  if v_inc is not null then
    if not exists (select 1 from incidents where id = v_inc and org_id = p_org) then raise exception 'Incident not found'; end if;
    if exists (select 1 from personal_data_breaches where incident_id = v_inc) then
      raise exception 'This incident is already recorded as a personal-data breach';
    end if;
  else
    if length(coalesce(btrim(p_title), '')) < 3 then raise exception 'Give the breach a short title'; end if;
    if coalesce(p_severity, '') not in ('low', 'medium', 'high', 'critical') then raise exception 'Choose a severity'; end if;
    insert into incidents (org_id, title, description, severity, priority, status, source_type, reporter, assigned_to)
    values (p_org, btrim(p_title), nullif(btrim(p_description), ''), p_severity, p_severity, 'open', 'personal_data_breach',
            audit_actor_name(), auth.uid())
    returning id into v_inc;
  end if;
  v_ref := next_ref(p_org, 'PDB');
  perform set_config('risys.privacy_system', 'on', true);
  insert into personal_data_breaches (org_id, ref, incident_id, aware_at, sdaia_due_at, description, created_by)
  values (p_org, v_ref, v_inc, p_aware_at, p_aware_at + interval '72 hours', nullif(btrim(p_description), ''), auth.uid())
  returning id into v_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform privacy_notify(p_org, array(select privacy_officers(p_org)),
    format('Personal-data breach %s reported', v_ref),
    format('SDAIA must be notified by %s (72 hours from awareness).', to_char((p_aware_at + interval '72 hours') at time zone 'Asia/Riyadh', 'DD Mon YYYY HH24:MI')),
    '/app/privacy/breaches/' || v_id);
  perform audit_log_write(p_org, 'breach.reported', 'personal_data_breach', v_id, v_ref, jsonb_build_object('incident', v_inc));
  return v_id;
end $$;

create or replace function public.assess_personal_data_breach(p_id uuid, p_notifiable boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b personal_data_breaches;
begin
  select * into b from personal_data_breaches where id = p_id for update;
  if not found or not is_org_member(b.org_id) then raise exception 'Breach not found'; end if;
  if not is_compliance_writer(b.org_id) then raise exception 'Only a compliance writer can decide whether a breach is notifiable'; end if;
  if b.status <> 'open' then raise exception 'Breach % is closed', b.ref; end if;
  if b.sdaia_notified_at is not null then raise exception 'SDAIA has already been notified'; end if;
  if not p_notifiable and length(coalesce(btrim(p_reason), '')) < 30 then
    raise exception 'Explain why the breach cannot harm personal data or data subject rights (at least 30 characters)';
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  update personal_data_breaches
     set notifiable = case when p_notifiable then 'notifiable' else 'not_notifiable' end,
         not_notifiable_reason = case when p_notifiable then null else btrim(p_reason) end,
         assessed_by = auth.uid(), assessed_at = now()
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(b.org_id, case when p_notifiable then 'breach.notifiable' else 'breach.not_notifiable' end,
    'personal_data_breach', b.id, b.ref, '{}'::jsonb);
end $$;

create or replace function public.record_sdaia_notification(p_id uuid, p_notified_at timestamptz, p_reference text,
                                                            p_report jsonb default null, p_late_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b personal_data_breaches;
begin
  select * into b from personal_data_breaches where id = p_id for update;
  if not found or not is_org_member(b.org_id) then raise exception 'Breach not found'; end if;
  if not is_compliance_writer(b.org_id) then raise exception 'Only a compliance writer can record the notification'; end if;
  if b.status <> 'open' then raise exception 'Breach % is closed', b.ref; end if;
  if b.sdaia_notified_at is not null then raise exception 'The notification to SDAIA is already recorded'; end if;
  if b.notifiable = 'not_notifiable' then raise exception 'This breach was assessed as not notifiable; change the assessment first'; end if;
  if p_notified_at is null or p_notified_at > now() + interval '5 minutes' or p_notified_at < b.aware_at then
    raise exception 'The notification time must be between awareness and now';
  end if;
  if coalesce(btrim(p_reference), '') = '' and p_report is null then
    raise exception 'Keep a copy of what was sent: attach the report or record SDAIA''s reference (PDPL-IR Art. 24(3))';
  end if;
  if p_notified_at > b.sdaia_due_at and length(coalesce(btrim(p_late_reason), '')) < 20 then
    raise exception 'The notification was after the 72 hours: give the justification for the delay (PDPL-IR Art. 24(2))';
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  update personal_data_breaches
     set notifiable = 'notifiable', assessed_by = coalesce(assessed_by, auth.uid()), assessed_at = coalesce(assessed_at, now()),
         sdaia_notified_at = p_notified_at, sdaia_reference = nullif(btrim(p_reference), ''), sdaia_report = p_report,
         sdaia_late_reason = case when p_notified_at > b.sdaia_due_at then btrim(p_late_reason) end,
         sdaia_notified_by = auth.uid()
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(b.org_id, 'breach.sdaia_notified', 'personal_data_breach', b.id, b.ref,
    jsonb_build_object('on_time', p_notified_at <= b.sdaia_due_at, 'hours', round(extract(epoch from p_notified_at - b.aware_at) / 3600.0, 1)));
end $$;

create or replace function public.record_breach_subject_notice(p_id uuid, p_notified_at timestamptz, p_notice text, p_not_required text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b personal_data_breaches;
begin
  select * into b from personal_data_breaches where id = p_id for update;
  if not found or not is_org_member(b.org_id) then raise exception 'Breach not found'; end if;
  if not is_compliance_writer(b.org_id) then raise exception 'Only a compliance writer can record the notice to data subjects'; end if;
  if b.status <> 'open' then raise exception 'Breach % is closed', b.ref; end if;
  if p_notified_at is null then
    if length(coalesce(btrim(p_not_required), '')) < 30 then
      raise exception 'Explain why data subjects need not be told (at least 30 characters)';
    end if;
  else
    if p_notified_at > now() + interval '5 minutes' or p_notified_at < b.aware_at then
      raise exception 'The notice time must be between awareness and now';
    end if;
    if length(coalesce(btrim(p_notice), '')) < 30 then
      raise exception 'Keep the notice sent: the breach, the risks, the measures taken, your contact details and advice to them';
    end if;
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  update personal_data_breaches
     set subjects_notified_at = p_notified_at,
         subjects_notice = case when p_notified_at is null then null else btrim(p_notice) end,
         subjects_not_required = case when p_notified_at is null then btrim(p_not_required) end
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(b.org_id, 'breach.subjects_notice', 'personal_data_breach', b.id, b.ref,
    jsonb_build_object('notified', p_notified_at is not null));
end $$;

create or replace function public.close_personal_data_breach(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b personal_data_breaches;
begin
  select * into b from personal_data_breaches where id = p_id for update;
  if not found or not is_org_member(b.org_id) then raise exception 'Breach not found'; end if;
  if not is_compliance_writer(b.org_id) then raise exception 'Only a compliance writer can close a breach'; end if;
  if b.status <> 'open' then raise exception 'Breach % is already closed', b.ref; end if;
  if b.notifiable = 'pending' then raise exception 'Decide whether the breach is notifiable first'; end if;
  if b.notifiable = 'notifiable' and b.sdaia_notified_at is null then raise exception 'Record the notification to SDAIA first'; end if;
  if b.notifiable = 'notifiable' and b.subjects_notified_at is null and b.subjects_not_required is null then
    raise exception 'Record the notice to data subjects, or why it is not needed';
  end if;
  if length(coalesce(btrim(b.corrective_actions), '')) < 20 then
    raise exception 'Document the corrective measures taken before closing (PDPL-IR Art. 24(3))';
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  update personal_data_breaches set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(b.org_id, 'breach.closed', 'personal_data_breach', b.id, b.ref, '{}'::jsonb);
end $$;

-- ── 5. Impact assessments (Art. 25) ──────────────────────────────────────────
create table if not exists public.privacy_assessments (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  ref                    text not null,
  version_no             integer not null default 1 check (version_no >= 1),
  previous_id            uuid references public.privacy_assessments(id) on delete set null,
  title                  text not null check (length(btrim(title)) between 3 and 200),
  activity_id            uuid references public.processing_activities(id) on delete set null,
  sensitive_data         boolean not null default false,
  links_sources          boolean not null default false,
  large_scale_monitoring boolean not null default false,
  new_technology         boolean not null default false,
  purpose_legal_basis    text,
  data_description       text,
  scope                  text,
  context                text,
  necessity              text,
  impact                 text,
  measures               text,
  suitability            text,
  processors_informed    boolean not null default false,
  inherent_rating        text check (inherent_rating in ('low', 'medium', 'high', 'critical')),
  residual_rating        text check (residual_rating in ('low', 'medium', 'high', 'critical')),
  status                 text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'superseded')),
  assessor_id            uuid not null references auth.users(id) on delete restrict default auth.uid(),
  submitted_by           uuid references auth.users(id) on delete set null,
  submitted_at           timestamptz,
  returned_by            uuid references auth.users(id) on delete set null,
  returned_at            timestamptz,
  return_reason          text,
  approved_by            uuid references auth.users(id) on delete set null,
  approved_at            timestamptz,
  approval_note          text,
  reassess_by            date,
  risk_id                uuid references public.risks(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists privacy_assessments_ref_key on public.privacy_assessments (org_id, ref, version_no);
create index if not exists privacy_assessments_org_idx on public.privacy_assessments (org_id, status);

create or replace function public.privacy_assessments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_system boolean := coalesce(current_setting('risys.privacy_system', true), '') = 'on';
begin
  if tg_op = 'DELETE' and is_platform_admin() then return old; end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.version_no > 1 or not (old.assessor_id = auth.uid() or is_org_admin(old.org_id)) then
      raise exception 'Only a first draft can be deleted, by its assessor or an administrator';
    end if;
    return old;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not v_system then
      new.ref := next_ref(new.org_id, 'PIA'); new.version_no := 1; new.previous_id := null;
      new.status := 'draft'; new.assessor_id := coalesce(auth.uid(), new.assessor_id);
      new.submitted_by := null; new.submitted_at := null; new.returned_by := null; new.returned_at := null; new.return_reason := null;
      new.approved_by := null; new.approved_at := null; new.approval_note := null; new.reassess_by := null; new.risk_id := null;
    end if;
  else
    if new.org_id <> old.org_id or new.ref <> old.ref or new.version_no <> old.version_no or new.assessor_id <> old.assessor_id then
      raise exception 'The reference, version and assessor of an assessment cannot change';
    end if;
    if not v_system then
      if old.status not in ('draft', 'returned') then raise exception 'Only a draft or returned assessment can be edited'; end if;
      if (new.status, new.submitted_by, new.submitted_at, new.returned_by, new.returned_at, new.return_reason,
          new.approved_by, new.approved_at, new.approval_note, new.reassess_by, new.risk_id, new.previous_id)
         is distinct from (old.status, old.submitted_by, old.submitted_at, old.returned_by, old.returned_at, old.return_reason,
          old.approved_by, old.approved_at, old.approval_note, old.reassess_by, old.risk_id, old.previous_id) then
        raise exception 'An assessment is submitted, returned and approved through its own steps';
      end if;
    end if;
  end if;
  if new.activity_id is not null and not exists (select 1 from processing_activities where id = new.activity_id and org_id = new.org_id) then
    raise exception 'The processing activity belongs to another workspace';
  end if;
  return new;
end $$;
drop trigger if exists privacy_assessments_guard on public.privacy_assessments;
create trigger privacy_assessments_guard before insert or update or delete on public.privacy_assessments
  for each row execute function public.privacy_assessments_guard();

create or replace function public.submit_privacy_assessment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a privacy_assessments; v_missing text[];
begin
  select * into a from privacy_assessments where id = p_id for update;
  if not found or not is_org_member(a.org_id) then raise exception 'Assessment not found'; end if;
  if not (a.assessor_id = auth.uid() or is_compliance_writer(a.org_id)) then raise exception 'Only the assessor or a compliance writer can submit'; end if;
  if a.status not in ('draft', 'returned') then raise exception 'Only a draft or returned assessment can be submitted'; end if;
  select array_agg(label) into v_missing from (values
    ('purpose and legal basis', a.purpose_legal_basis), ('nature, types and sources of the data', a.data_description),
    ('scope', a.scope), ('context', a.context), ('necessity and proportionality', a.necessity),
    ('impact on data subjects', a.impact), ('measures to limit the risks', a.measures), ('suitability of the measures', a.suitability)
  ) x(label, v) where length(coalesce(btrim(v), '')) < 20;
  if v_missing is not null then
    raise exception 'PDPL-IR Art. 25(2) asks for at least: %', array_to_string(v_missing, ', ');
  end if;
  if a.inherent_rating is null or a.residual_rating is null then raise exception 'Rate the risk before and after the measures'; end if;
  perform set_config('risys.privacy_system', 'on', true);
  update privacy_assessments set status = 'in_review', submitted_by = auth.uid(), submitted_at = now(),
         returned_by = null, returned_at = null, return_reason = null
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform privacy_notify(a.org_id, array(select u from privacy_officers(a.org_id) u where u is distinct from a.assessor_id),
    format('Impact assessment %s v%s to approve', a.ref, a.version_no), a.title, '/app/privacy/assessments/' || a.id);
  perform audit_log_write(a.org_id, 'pia.submitted', 'privacy_assessment', a.id, a.ref || ' v' || a.version_no, '{}'::jsonb);
end $$;

create or replace function public.return_privacy_assessment(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a privacy_assessments;
begin
  select * into a from privacy_assessments where id = p_id for update;
  if not found or not is_org_member(a.org_id) then raise exception 'Assessment not found'; end if;
  if not is_compliance_writer(a.org_id) then raise exception 'Only a compliance writer can return an assessment'; end if;
  if a.status <> 'in_review' then raise exception 'Only an assessment in review can be returned'; end if;
  if length(coalesce(btrim(p_reason), '')) < 10 then raise exception 'Say what needs to change (at least 10 characters)'; end if;
  perform set_config('risys.privacy_system', 'on', true);
  update privacy_assessments set status = 'returned', returned_by = auth.uid(), returned_at = now(), return_reason = btrim(p_reason)
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform privacy_notify(a.org_id, array[a.assessor_id], format('Impact assessment %s returned', a.ref), btrim(p_reason),
    '/app/privacy/assessments/' || a.id);
  perform audit_log_write(a.org_id, 'pia.returned', 'privacy_assessment', a.id, a.ref || ' v' || a.version_no, '{}'::jsonb);
end $$;

-- Four eyes: a compliance writer who neither wrote nor submitted it. A high or
-- critical residual rating means the processing may harm data subjects
-- (Art. 25(4)): a draft risk goes into the register and the assessment must
-- be repeated within six months.
create or replace function public.approve_privacy_assessment(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a privacy_assessments; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_risk uuid; v_harm boolean;
        v_lik int; v_imp int; act processing_activities;
begin
  select * into a from privacy_assessments where id = p_id for update;
  if not found or not is_org_member(a.org_id) then raise exception 'Assessment not found'; end if;
  if a.status <> 'in_review' then raise exception 'Only an assessment in review can be approved'; end if;
  if not is_compliance_writer(a.org_id) then raise exception 'Only a compliance writer can approve an impact assessment'; end if;
  if auth.uid() in (a.assessor_id, a.submitted_by) then raise exception 'You cannot approve an assessment you wrote or submitted'; end if;
  v_harm := a.residual_rating in ('high', 'critical');
  if v_harm and length(coalesce(btrim(p_note), '')) < 20 then
    raise exception 'The residual risk is %: record what the approval depends on (at least 20 characters)', a.residual_rating;
  end if;

  if v_harm then
    select * into act from processing_activities where id = a.activity_id;
    v_lik := case a.residual_rating when 'critical' then 4 else 3 end;
    v_imp := case a.residual_rating when 'critical' then 5 else 4 end;
    insert into risks (org_id, title, description, category, subcategory, cause, event, impact_statement, risk_statement,
                       likelihood, impact, inherent_likelihood, inherent_impact, status, workflow_state, owner_id,
                       created_by, source, framework_ref, identified_date)
    values (a.org_id, left('Privacy harm: ' || a.title, 200),
            format('Raised by impact assessment %s v%s, approved with a %s residual risk.', a.ref, a.version_no, a.residual_rating),
            'Data Privacy', 'Subject Rights',
            left(coalesce(a.context, a.scope, a.title), 1000), 'processing harms the privacy or rights of data subjects',
            left(coalesce(a.impact, 'harm to data subjects and regulatory action under the PDPL'), 1000),
            format('Because of %s, there is a risk that processing harms data subjects, resulting in %s.',
                   lower(left(coalesce(act.name, a.title), 200)), 'regulatory action under the PDPL'),
            v_lik, v_imp, v_lik, v_imp, 'open', 'draft', coalesce(act.owner_id, a.assessor_id),
            auth.uid(), 'Privacy impact assessment', 'SDAIA PDPL-IR Art. 25', v_today)
    returning id into v_risk;
  end if;

  perform set_config('risys.privacy_system', 'on', true);
  update privacy_assessments set status = 'superseded' where id = a.previous_id and status = 'approved';
  update privacy_assessments
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), approval_note = nullif(btrim(p_note), ''),
         reassess_by = (v_today + make_interval(months => case when v_harm then 6 else 12 end))::date,
         risk_id = v_risk
   where id = p_id;
  perform set_config('risys.privacy_system', 'off', true);

  perform privacy_notify(a.org_id, array[a.assessor_id], format('Impact assessment %s approved', a.ref),
    case when v_harm then 'Approved with a high residual risk: a draft risk was added to the register.' else a.title end,
    '/app/privacy/assessments/' || a.id);
  perform audit_log_write(a.org_id, 'pia.approved', 'privacy_assessment', a.id, a.ref || ' v' || a.version_no,
    jsonb_build_object('residual', a.residual_rating, 'risk', v_risk));
  return jsonb_build_object('risk_id', v_risk, 'reassess_by', (v_today + make_interval(months => case when v_harm then 6 else 12 end))::date);
end $$;

-- Reassess: a new draft version, copied from the approved one.
create or replace function public.reassess_privacy_assessment(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a privacy_assessments; v_id uuid;
begin
  select * into a from privacy_assessments where id = p_id;
  if not found or not is_org_member(a.org_id) then raise exception 'Assessment not found'; end if;
  if a.status <> 'approved' then raise exception 'Only the approved assessment can be reassessed'; end if;
  if not (is_compliance_writer(a.org_id) or a.assessor_id = auth.uid()) then raise exception 'Only the assessor or a compliance writer can reassess'; end if;
  if exists (select 1 from privacy_assessments where org_id = a.org_id and ref = a.ref and status in ('draft', 'in_review', 'returned')) then
    raise exception 'A new version of % is already in progress', a.ref;
  end if;
  perform set_config('risys.privacy_system', 'on', true);
  insert into privacy_assessments (org_id, ref, version_no, previous_id, title, activity_id, sensitive_data, links_sources,
    large_scale_monitoring, new_technology, purpose_legal_basis, data_description, scope, context, necessity, impact,
    measures, suitability, processors_informed, inherent_rating, residual_rating, status, assessor_id)
  select org_id, ref, (select max(version_no) + 1 from privacy_assessments x where x.org_id = a.org_id and x.ref = a.ref), id,
         title, activity_id, sensitive_data, links_sources, large_scale_monitoring, new_technology, purpose_legal_basis,
         data_description, scope, context, necessity, impact, measures, suitability, processors_informed,
         inherent_rating, residual_rating, 'draft', auth.uid()
    from privacy_assessments where id = p_id
  returning id into v_id;
  perform set_config('risys.privacy_system', 'off', true);
  perform audit_log_write(a.org_id, 'pia.reassessed', 'privacy_assessment', v_id, a.ref, '{}'::jsonb);
  return v_id;
end $$;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
alter table public.privacy_settings enable row level security;
alter table public.processing_activities enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.personal_data_breaches enable row level security;
alter table public.privacy_assessments enable row level security;

drop policy if exists privacy_settings_select on public.privacy_settings;
create policy privacy_settings_select on public.privacy_settings for select to authenticated using (is_org_member(org_id));
drop policy if exists privacy_settings_insert on public.privacy_settings;
create policy privacy_settings_insert on public.privacy_settings for insert to authenticated with check (is_compliance_writer(org_id));
drop policy if exists privacy_settings_update on public.privacy_settings;
create policy privacy_settings_update on public.privacy_settings for update to authenticated
  using (is_compliance_writer(org_id)) with check (is_compliance_writer(org_id));

drop policy if exists processing_activities_select on public.processing_activities;
create policy processing_activities_select on public.processing_activities for select to authenticated using (is_org_member(org_id));
drop policy if exists processing_activities_insert on public.processing_activities;
create policy processing_activities_insert on public.processing_activities for insert to authenticated with check (is_compliance_writer(org_id));
drop policy if exists processing_activities_update on public.processing_activities;
create policy processing_activities_update on public.processing_activities for update to authenticated
  using (is_compliance_writer(org_id) or owner_id = auth.uid()) with check (is_compliance_writer(org_id) or owner_id = auth.uid());
drop policy if exists processing_activities_delete on public.processing_activities;
create policy processing_activities_delete on public.processing_activities for delete to authenticated using (is_org_admin(org_id));

drop policy if exists dsr_select on public.data_subject_requests;
create policy dsr_select on public.data_subject_requests for select to authenticated
  using (is_org_member(org_id) and (can_read_privacy(org_id) or assigned_to = auth.uid() or created_by = auth.uid()));
drop policy if exists dsr_insert on public.data_subject_requests;
create policy dsr_insert on public.data_subject_requests for insert to authenticated
  with check (is_org_member(org_id) and coalesce(my_role(org_id), '') not in ('viewer', 'auditor'));
drop policy if exists dsr_update on public.data_subject_requests;
create policy dsr_update on public.data_subject_requests for update to authenticated
  using (is_compliance_writer(org_id) or assigned_to = auth.uid()) with check (is_compliance_writer(org_id) or assigned_to = auth.uid());

drop policy if exists pdb_select on public.personal_data_breaches;
create policy pdb_select on public.personal_data_breaches for select to authenticated
  using (is_org_member(org_id) and (can_read_privacy(org_id) or created_by = auth.uid()));
drop policy if exists pdb_update on public.personal_data_breaches;
create policy pdb_update on public.personal_data_breaches for update to authenticated
  using (is_compliance_writer(org_id)) with check (is_compliance_writer(org_id));

drop policy if exists pia_select on public.privacy_assessments;
create policy pia_select on public.privacy_assessments for select to authenticated using (is_org_member(org_id));
drop policy if exists pia_insert on public.privacy_assessments;
create policy pia_insert on public.privacy_assessments for insert to authenticated
  with check (is_compliance_writer(org_id) or is_contributor(org_id));
drop policy if exists pia_update on public.privacy_assessments;
create policy pia_update on public.privacy_assessments for update to authenticated
  using (is_compliance_writer(org_id) or assessor_id = auth.uid()) with check (is_compliance_writer(org_id) or assessor_id = auth.uid());
drop policy if exists pia_delete on public.privacy_assessments;
create policy pia_delete on public.privacy_assessments for delete to authenticated using (assessor_id = auth.uid() or is_org_admin(org_id));

do $$
declare t text;
begin
  foreach t in array array['privacy_settings', 'processing_activities', 'data_subject_requests', 'personal_data_breaches', 'privacy_assessments'] loop
    execute format('drop policy if exists tenant_active_guard on public.%I', t);
    execute format('create policy tenant_active_guard on public.%I as restrictive for all to authenticated using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_ins on public.%I', t);
    execute format('create policy tenant_readonly_guard_ins on public.%I as restrictive for insert to authenticated with check (org_id is null or not is_org_readonly(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_upd on public.%I', t);
    execute format('create policy tenant_readonly_guard_upd on public.%I as restrictive for update to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
    execute format('drop policy if exists tenant_readonly_guard_del on public.%I', t);
    execute format('create policy tenant_readonly_guard_del on public.%I as restrictive for delete to authenticated using (org_id is null or not is_org_readonly(org_id))', t);
  end loop;
end $$;

grant select, insert, update on public.privacy_settings to authenticated;
grant select, insert, update, delete on public.processing_activities to authenticated;
grant select, insert, update on public.data_subject_requests to authenticated;
revoke delete on public.data_subject_requests from authenticated, anon;
grant select, update on public.personal_data_breaches to authenticated;
revoke insert, delete on public.personal_data_breaches from authenticated, anon;
grant select, insert, update, delete on public.privacy_assessments to authenticated;

-- ── 7. Reminders on the clocks ───────────────────────────────────────────────
create table if not exists public.privacy_reminders (
  subject_id  uuid not null,
  stage       text not null,
  sent_at     timestamptz not null default now(),
  primary key (subject_id, stage)
);
alter table public.privacy_reminders enable row level security;
revoke all on public.privacy_reminders from authenticated, anon;

-- Every 15 minutes. Breaches: at 24, 48 and 66 hours after awareness and when
-- the 72 hours pass, until SDAIA is notified or the breach is assessed as not
-- notifiable. Requests: 7 and 2 days before the due date and once overdue.
create or replace function public.privacy_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_b int := 0; v_d int := 0; v_stage text; v_due date;
begin
  for r in select * from personal_data_breaches
            where status = 'open' and sdaia_notified_at is null and notifiable <> 'not_notifiable' loop
    v_stage := case when now() >= r.sdaia_due_at then 'overdue'
                    when now() >= r.aware_at + interval '66 hours' then 'h66'
                    when now() >= r.aware_at + interval '48 hours' then 'h48'
                    when now() >= r.aware_at + interval '24 hours' then 'h24' end;
    continue when v_stage is null;
    insert into privacy_reminders (subject_id, stage) values (r.id, v_stage) on conflict do nothing;
    continue when not found;
    perform privacy_notify(r.org_id, array(select privacy_officers(r.org_id)) || r.created_by,
      case v_stage when 'overdue' then format('Overdue: SDAIA not yet notified of %s', r.ref)
                   else format('%s: SDAIA must be notified within %s hours', r.ref,
                               greatest(0, ceil(extract(epoch from r.sdaia_due_at - now()) / 3600))::int) end,
      format('Deadline %s (72 hours from awareness).', to_char(r.sdaia_due_at at time zone 'Asia/Riyadh', 'DD Mon YYYY HH24:MI')),
      '/app/privacy/breaches/' || r.id);
    v_b := v_b + 1;
  end loop;

  for r in select * from data_subject_requests where status in ('received', 'in_progress') loop
    v_due := coalesce(r.extended_due_on, r.due_on);
    v_stage := case when v_today > v_due then 'overdue:' || v_due
                    when v_due - v_today <= 2 then 'd2:' || v_due
                    when v_due - v_today <= 7 then 'd7:' || v_due end;
    continue when v_stage is null;
    insert into privacy_reminders (subject_id, stage) values (r.id, v_stage) on conflict do nothing;
    continue when not found;
    perform privacy_notify(r.org_id,
      case when r.assigned_to is not null then array[r.assigned_to] else array(select privacy_officers(r.org_id)) end,
      case when v_today > v_due then format('Overdue: data subject request %s', r.ref)
           else format('Data subject request %s due in %s days', r.ref, v_due - v_today) end,
      format('Due %s (PDPL-IR Art. 3).', to_char(v_due, 'DD Mon YYYY')), '/app/privacy/requests/' || r.id);
    v_d := v_d + 1;
  end loop;
  return jsonb_build_object('breach_reminders', v_b, 'request_reminders', v_d, 'ran_at', now());
end $$;
revoke all on function public.privacy_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'risys-privacy-tick') then
    perform cron.unschedule('risys-privacy-tick');
  end if;
  perform cron.schedule('risys-privacy-tick', '*/15 * * * *', $job$ select public.privacy_tick() $job$);
end $$;

-- ── 8. Waiting on you: privacy kinds ─────────────────────────────────────────
create or replace function public.my_work(p_org uuid)
returns table (kind text, item_id uuid, ref text, title text, detail text, due_on date, since timestamptz, href text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Riyadh')::date; v_writer boolean;
begin
  if me is null or not is_org_member(p_org) then return; end if;
  v_writer := is_compliance_writer(p_org);

  return query
    select 'policy_approval'::text, pv.id, p.ref, p.title, format('Version %s', pv.version_no),
           null::date, pv.submitted_at, '/app/policies/' || p.id || '?tab=text'
      from policy_versions pv join policies p on p.id = pv.policy_id
     where pv.org_id = p_org and pv.status = 'in_review'
       and me in (select policy_eligible_approvers(pv.id));

  return query
    select 'attestation'::text, a.id, p.ref, p.title, format('Version %s', pv.version_no),
           c.due_on, a.created_at, '/app/my-policies/' || a.id
      from attestations a
      join attestation_campaigns c on c.id = a.campaign_id
      join policies p on p.id = a.policy_id
      join policy_versions pv on pv.id = a.policy_version_id
     where a.org_id = p_org and a.user_id = me and a.status = 'pending' and c.status = 'open';

  return query
    select 'policy_review'::text, p.id, p.ref, p.title, null::text,
           p.next_review_on, null::timestamptz, '/app/policies/' || p.id
      from policies p
     where p.org_id = p_org and p.owner_id = me and p.status = 'published'
       and p.next_review_on is not null and p.next_review_on <= v_today + 30;

  return query
    select 'exception_decision'::text, e.id, e.ref, e.title, initcap(e.risk_rating) || ' risk',
           null::date, e.requested_at, '/app/exceptions/' || e.id
      from exceptions e
     where e.org_id = p_org and e.status = 'submitted' and e.requested_by is distinct from me
       and authority_rank(user_authority(p_org, me, e.subject_owner_id)) >= authority_rank(e.required_authority);

  if v_writer then
    return query
      select 'evidence_review'::text, i.id, i.ref, i.title, null::text,
             null::date, i.created_at, '/app/evidence/' || i.id
        from evidence_items i
       where i.org_id = p_org and i.review_status = 'pending' and i.added_by is distinct from me;
  end if;

  -- Data subject requests: mine, or unassigned ones for compliance writers. Listed from 7 days before the due date.
  return query
    select 'dsr_due'::text, d.id, d.ref, initcap(replace(d.request_type, '_', ' ')) || ' request', d.requester_name,
           coalesce(d.extended_due_on, d.due_on), d.received_at, '/app/privacy/requests/' || d.id
      from data_subject_requests d
     where d.org_id = p_org and d.status in ('received', 'in_progress')
       and (d.assigned_to = me or (d.assigned_to is null and v_writer))
       and coalesce(d.extended_due_on, d.due_on) <= v_today + 7;

  -- Breaches waiting on SDAIA notification (compliance writers).
  if v_writer then
    return query
      select 'breach_notify'::text, b.id, b.ref, i.title,
             case when now() > b.sdaia_due_at then 'SDAIA deadline passed'
                  else format('SDAIA due in %s h', ceil(extract(epoch from b.sdaia_due_at - now()) / 3600)::int) end,
             (b.sdaia_due_at at time zone 'Asia/Riyadh')::date, b.aware_at, '/app/privacy/breaches/' || b.id
        from personal_data_breaches b join incidents i on i.id = b.incident_id
       where b.org_id = p_org and b.status = 'open' and b.sdaia_notified_at is null and b.notifiable <> 'not_notifiable';

    return query
      select 'dpia_approval'::text, a.id, a.ref, a.title, format('Version %s', a.version_no),
             null::date, a.submitted_at, '/app/privacy/assessments/' || a.id
        from privacy_assessments a
       where a.org_id = p_org and a.status = 'in_review' and me is distinct from a.assessor_id and me is distinct from a.submitted_by;
  end if;
end $$;
revoke execute on function public.my_work(uuid) from public, anon;
grant execute on function public.my_work(uuid) to authenticated;

-- ── 9. Grants on the RPCs; internal helpers stay private ─────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'verify_dsr_identity(uuid, text)', 'extend_dsr(uuid, text, timestamptz)',
    'close_dsr(uuid, text, text, text, timestamptz)',
    'report_personal_data_breach(uuid, uuid, text, timestamptz, text, text)',
    'assess_personal_data_breach(uuid, boolean, text)',
    'record_sdaia_notification(uuid, timestamptz, text, jsonb, text)',
    'record_breach_subject_notice(uuid, timestamptz, text, text)',
    'close_personal_data_breach(uuid)',
    'submit_privacy_assessment(uuid)', 'return_privacy_assessment(uuid, text)',
    'approve_privacy_assessment(uuid, text)', 'reassess_privacy_assessment(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['processing_activities_guard()', 'data_subject_requests_guard()',
                           'personal_data_breaches_guard()', 'privacy_assessments_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on function public.dsr_can_act(public.data_subject_requests) from public, anon, authenticated;
