-- ERM step 6 (P1) — Enterprise Risk Management
--
--   6.1  Raise a risk and triage it   risk_submissions (SUB-), submit / update /
--                                     withdraw / triage RPCs. Accepting creates a
--                                     draft risk in the register for its owner.
--   6.2  Assessment deadline          risks.assessment_due_at / assessed_at, set by
--                                     the database when a risk is admitted
--                                     (default 30 days, per-workspace setting),
--                                     extendable by a risk manager with a reason.
--   6.3  Acceptance governance        risk_exceptions gains a purpose, a decision
--                                     due date, an optional management review and
--                                     conditions. Requests, reviews and decisions
--                                     go through RPCs that enforce the authority
--                                     ladder, independence and term limits.
--   6.4  Waiting on you               my_work kinds for triage, clarification,
--                                     assessments due and acceptance decisions.
--
--   erm_daily() (cron risys-erm-daily, 02:25 UTC) expires acceptances, sends the
--   assessment, decision and expiry reminders, and nudges a stale triage queue.
--
-- Clients only SELECT the new table and the acceptance table; every write is an
-- RPC. Separate migration: risk_register_policy_tidy (drops the legacy
-- member-wide write policies on the risk child tables).

-- ── 0. Helpers ───────────────────────────────────────────────────────────────

-- Band for a score, mirroring bandForScore() in src/lib/matrix.js: the most
-- severe band whose lowest cell score the score reaches, from the workspace's
-- active matrix; the shipped thresholds when there is none.
create or replace function public.risk_score_band(p_org uuid, p_score int)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_cells jsonb; b text; f int;
begin
  if p_score is null or p_score <= 0 then return null; end if;
  select cells into v_cells from risk_matrix_config
   where org_id = p_org and is_active order by version desc limit 1;
  if v_cells is null or jsonb_typeof(v_cells) <> 'array' or jsonb_array_length(v_cells) = 0 then
    return case when p_score >= 20 then 'critical' when p_score >= 12 then 'high'
                when p_score >= 6 then 'medium' else 'low' end;
  end if;
  foreach b in array array['critical', 'high', 'medium', 'low'] loop
    select min((c ->> 'score')::int) into f from jsonb_array_elements(v_cells) c where c ->> 'band' = b;
    if f is not null and p_score >= f then return b; end if;
  end loop;
  return 'low';
end $$;
revoke all on function public.risk_score_band(uuid, int) from public, anon;
grant execute on function public.risk_score_band(uuid, int) to authenticated;

-- The score acceptance is judged on: residual once scored, else inherent.
create or replace function public.risk_current_score(r public.risks)
returns int language sql immutable set search_path = public as $$
  select case when r.residual_likelihood is not null and r.residual_impact is not null
              then r.residual_likelihood * r.residual_impact
              else r.inherent_likelihood * r.inherent_impact end;
$$;
revoke all on function public.risk_current_score(public.risks) from public, anon, authenticated;

-- Notifications for ERM. Never to the actor, only to members of the workspace.
create or replace function public.erm_notify(p_org uuid, p_users uuid[], p_title text, p_body text, p_link text)
returns integer language plpgsql security definer set search_path = public as $$
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
revoke all on function public.erm_notify(uuid, uuid[], text, text, text) from public, anon, authenticated;

-- Who triages raised risks and manages the register: owner, admin, risk manager.
create or replace function public.risk_managers(p_org uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select user_id from organization_members where org_id = p_org and role in ('owner', 'admin', 'risk_manager');
$$;
revoke all on function public.risk_managers(uuid) from public, anon, authenticated;

create or replace function public.erm_writable(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_active(p_org) or is_org_readonly(p_org) then
    raise exception 'This workspace is read-only';
  end if;
end $$;
revoke all on function public.erm_writable(uuid) from public, anon, authenticated;

-- ── 1. Settings ──────────────────────────────────────────────────────────────
create table if not exists public.risk_settings (
  org_id                    uuid primary key references public.organizations(id) on delete cascade,
  assessment_sla_days       int  not null default 30 check (assessment_sla_days between 5 and 180),
  acceptance_decision_days  int  not null default 14 check (acceptance_decision_days between 3 and 60),
  updated_by                uuid,
  updated_at                timestamptz not null default now()
);
alter table public.risk_settings enable row level security;
drop policy if exists risk_settings_select on public.risk_settings;
create policy risk_settings_select on public.risk_settings for select to authenticated using (is_org_member(org_id));
revoke all on public.risk_settings from anon;
revoke insert, update, delete on public.risk_settings from authenticated;
grant select on public.risk_settings to authenticated;

create or replace function public.risk_sla_days(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select assessment_sla_days from risk_settings where org_id = p_org), 30);
$$;
revoke all on function public.risk_sla_days(uuid) from public, anon, authenticated;

create or replace function public.set_risk_settings(p_org uuid, p_assessment_days int, p_decision_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_risk_manager_or_admin(p_org) then raise exception 'Only a risk manager or admin can change risk settings'; end if;
  perform erm_writable(p_org);
  if p_assessment_days is null or p_assessment_days not between 5 and 180 then
    raise exception 'The assessment deadline must be between 5 and 180 days';
  end if;
  if p_decision_days is null or p_decision_days not between 3 and 60 then
    raise exception 'The acceptance decision deadline must be between 3 and 60 days';
  end if;
  insert into risk_settings (org_id, assessment_sla_days, acceptance_decision_days, updated_by, updated_at)
  values (p_org, p_assessment_days, p_decision_days, auth.uid(), now())
  on conflict (org_id) do update set assessment_sla_days = excluded.assessment_sla_days,
     acceptance_decision_days = excluded.acceptance_decision_days, updated_by = auth.uid(), updated_at = now();
  perform audit_log_write(p_org, 'risk_settings.updated', 'organization', p_org, null,
    jsonb_build_object('assessment_sla_days', p_assessment_days, 'acceptance_decision_days', p_decision_days));
end $$;

-- ── 2. Assessment deadline on risks ──────────────────────────────────────────
alter table public.risks add column if not exists assessment_due_at timestamptz;
alter table public.risks add column if not exists assessed_at timestamptz;

-- Set by the database only. Admission (draft → registered) starts the clock;
-- the first move into a scored state stops it; returning to draft clears it.
-- Client updates to these two columns are ignored. extend_risk_assessment()
-- is the one way to move the date, flagged through a transaction-local setting.
create or replace function public.risks_assessment_clock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_scored text[] := array['assessed', 'treatment_required', 'under_treatment', 'accepted', 'monitored', 'closed'];
begin
  if tg_op = 'INSERT' then
    new.assessment_due_at := case when new.workflow_state = 'registered'
                                  then now() + make_interval(days => risk_sla_days(new.org_id)) end;
    new.assessed_at := case when new.workflow_state = any (v_scored) then now() end;
    return new;
  end if;
  if coalesce(current_setting('risys.assessment_clock', true), '') = 'rpc' then return new; end if;
  new.assessment_due_at := old.assessment_due_at;
  new.assessed_at := old.assessed_at;
  if new.workflow_state is distinct from old.workflow_state then
    if new.workflow_state = 'registered' and coalesce(old.workflow_state, 'draft') = 'draft' then
      new.assessment_due_at := now() + make_interval(days => risk_sla_days(new.org_id));
      new.assessed_at := null;
    elsif new.workflow_state = 'draft' then
      new.assessment_due_at := null;
      new.assessed_at := null;
    elsif new.workflow_state = any (v_scored) and new.assessed_at is null then
      new.assessed_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_risks_assessment_clock on public.risks;
create trigger trg_risks_assessment_clock before insert or update on public.risks
  for each row execute function public.risks_assessment_clock();

-- Existing risks: registered ones get their clock from admission; scored ones
-- count as assessed when they last changed.
select set_config('risys.assessment_clock', 'rpc', false);
update public.risks
   set assessment_due_at = coalesce(approved_at, created_at, now()) + make_interval(days => risk_sla_days(org_id))
 where workflow_state = 'registered' and assessment_due_at is null;
update public.risks
   set assessed_at = coalesce(gate_evaluated_at, updated_at, created_at)
 where workflow_state in ('assessed', 'treatment_required', 'under_treatment', 'accepted', 'monitored', 'closed')
   and assessed_at is null;
select set_config('risys.assessment_clock', '', false);

create or replace function public.extend_risk_assessment(p_risk uuid, p_due date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r risks; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_old date;
begin
  select * into r from risks where id = p_risk for update;
  if not found or not is_org_member(r.org_id) then raise exception 'Risk not found'; end if;
  if not is_risk_manager_or_admin(r.org_id) then raise exception 'Only a risk manager or admin can move an assessment deadline'; end if;
  perform erm_writable(r.org_id);
  if r.workflow_state <> 'registered' or r.assessment_due_at is null then
    raise exception 'Only a registered risk that is waiting for its assessment has a deadline to move';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Give the reason for the new date (at least 10 characters)'; end if;
  v_old := (r.assessment_due_at at time zone 'Asia/Riyadh')::date;
  if p_due is null or p_due <= greatest(v_old, v_today) then raise exception 'The new date must be later than the current deadline and today'; end if;
  if p_due > v_today + 90 then raise exception 'A deadline can be moved at most 90 days ahead'; end if;
  perform set_config('risys.assessment_clock', 'rpc', true);
  update risks set assessment_due_at = ((p_due + 1)::timestamp at time zone 'Asia/Riyadh') - interval '1 second'
   where id = p_risk;
  perform set_config('risys.assessment_clock', '', true);
  perform log_risk_activity(r.org_id, r.id, null, 'assessment_extended',
    format('Assessment deadline moved from %s to %s: %s', to_char(v_old, 'DD Mon YYYY'), to_char(p_due, 'DD Mon YYYY'), btrim(p_reason)));
  perform audit_log_write(r.org_id, 'risk.assessment_extended', 'risk', r.id, r.risk_id,
    jsonb_build_object('from', v_old, 'to', p_due, 'reason', btrim(p_reason)));
  perform erm_notify(r.org_id, array[r.owner_id],
    format('%s: assessment now due %s', r.risk_id, to_char(p_due, 'DD Mon YYYY')), btrim(p_reason), '/app/risks/' || r.id);
end $$;

-- ── 3. Raise a risk: submissions and triage ─────────────────────────────────
create table if not exists public.risk_submissions (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  ref                         text,
  title                       text not null check (char_length(btrim(title)) between 5 and 200),
  description                 text not null check (char_length(btrim(description)) >= 20),
  business_unit_id            uuid references public.business_units(id) on delete set null,
  source                      text not null default 'self_reported'
                              check (source in ('self_reported', 'incident', 'observation', 'audit',
                                                'customer_feedback', 'external_assessment', 'other')),
  category                    text,
  root_cause                  text,
  consequences                text,
  existing_controls           text,
  mitigation_ideas            text,
  likelihood                  smallint check (likelihood between 1 and 5),
  impact                      smallint check (impact between 1 and 5),
  urgent                      boolean not null default false,
  status                      text not null default 'submitted'
                              check (status in ('submitted', 'needs_clarification', 'accepted', 'declined', 'withdrawn')),
  submitted_by                uuid not null,
  submitted_at                timestamptz not null default now(),
  clarification_request       text,
  clarification_requested_at  timestamptz,
  clarification_response      text,
  clarification_count         int not null default 0,
  reviewer_id                 uuid,
  reviewed_at                 timestamptz,
  decision_note               text,
  risk_id                     uuid references public.risks(id) on delete set null,
  updated_at                  timestamptz not null default now(),
  unique (org_id, ref)
);
create index if not exists risk_submissions_org_status on public.risk_submissions (org_id, status);
create index if not exists risk_submissions_submitter on public.risk_submissions (submitted_by);

create or replace function public.risk_submissions_ref()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.ref is null or new.ref = '') then new.ref := next_ref(new.org_id, 'SUB'); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_risk_submissions_ref on public.risk_submissions;
create trigger trg_risk_submissions_ref before insert or update on public.risk_submissions
  for each row execute function public.risk_submissions_ref();

alter table public.risk_submissions enable row level security;
-- The person who raised it, the people who triage, and auditors.
drop policy if exists risk_submissions_select on public.risk_submissions;
create policy risk_submissions_select on public.risk_submissions for select to authenticated
  using (is_org_member(org_id) and (submitted_by = auth.uid() or is_risk_manager_or_admin(org_id) or my_role(org_id) = 'auditor'));
do $$
begin
  execute 'drop policy if exists tenant_active_guard on public.risk_submissions';
  execute 'create policy tenant_active_guard on public.risk_submissions as restrictive for all to authenticated using (org_id is null or is_org_active(org_id)) with check (org_id is null or is_org_active(org_id))';
end $$;
revoke all on public.risk_submissions from anon;
revoke insert, update, delete on public.risk_submissions from authenticated;
grant select on public.risk_submissions to authenticated;

create or replace function public.risk_submission_apply(s inout public.risk_submissions, p jsonb)
language plpgsql set search_path = public as $$
begin
  if p ? 'title'             then s.title := btrim(p ->> 'title'); end if;
  if p ? 'description'       then s.description := btrim(p ->> 'description'); end if;
  if p ? 'business_unit_id'  then s.business_unit_id := nullif(p ->> 'business_unit_id', '')::uuid; end if;
  if p ? 'source'            then s.source := coalesce(nullif(p ->> 'source', ''), 'self_reported'); end if;
  if p ? 'category'          then s.category := nullif(btrim(p ->> 'category'), ''); end if;
  if p ? 'root_cause'        then s.root_cause := nullif(btrim(p ->> 'root_cause'), ''); end if;
  if p ? 'consequences'      then s.consequences := nullif(btrim(p ->> 'consequences'), ''); end if;
  if p ? 'existing_controls' then s.existing_controls := nullif(btrim(p ->> 'existing_controls'), ''); end if;
  if p ? 'mitigation_ideas'  then s.mitigation_ideas := nullif(btrim(p ->> 'mitigation_ideas'), ''); end if;
  if p ? 'likelihood'        then s.likelihood := nullif(p ->> 'likelihood', '')::smallint; end if;
  if p ? 'impact'            then s.impact := nullif(p ->> 'impact', '')::smallint; end if;
  if p ? 'urgent'            then s.urgent := coalesce((p ->> 'urgent')::boolean, false); end if;
  if char_length(coalesce(s.title, '')) < 5 then raise exception 'Give the risk a short title (at least 5 characters)'; end if;
  if char_length(coalesce(s.description, '')) < 20 then raise exception 'Describe what could happen (at least 20 characters)'; end if;
  if s.business_unit_id is not null and not exists
     (select 1 from business_units b where b.id = s.business_unit_id and b.org_id = s.org_id) then
    raise exception 'Choose a business unit from this workspace';
  end if;
end $$;
revoke all on function public.risk_submission_apply(public.risk_submissions, jsonb) from public, anon, authenticated;

-- Every role except viewer may raise a risk.
create or replace function public.submit_risk(p_org uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare s risk_submissions;
begin
  if not is_org_member(p_org) then raise exception 'Not a member of this workspace'; end if;
  if coalesce(my_role(p_org), 'viewer') = 'viewer' then raise exception 'Viewers cannot raise risks'; end if;
  perform erm_writable(p_org);
  s.org_id := p_org; s.submitted_by := auth.uid(); s.source := 'self_reported'; s.urgent := false;
  s := risk_submission_apply(s, coalesce(p_data, '{}'::jsonb));
  insert into risk_submissions (org_id, title, description, business_unit_id, source, category, root_cause,
                                consequences, existing_controls, mitigation_ideas, likelihood, impact, urgent, submitted_by)
  values (s.org_id, s.title, s.description, s.business_unit_id, s.source, s.category, s.root_cause,
          s.consequences, s.existing_controls, s.mitigation_ideas, s.likelihood, s.impact, s.urgent, s.submitted_by)
  returning * into s;
  perform erm_notify(p_org, array(select risk_managers(p_org)),
    format('%sRisk raised for triage: %s', case when s.urgent then 'Urgent · ' else '' end, s.ref),
    s.title, '/app/risks/intake/' || s.id);
  perform audit_log_write(p_org, 'risk_submission.submitted', 'risk_submission', s.id, s.ref,
    jsonb_build_object('urgent', s.urgent));
  return s.id;
end $$;

-- The person who raised it edits while it is open; answering a clarification
-- request sends it back to the triage queue.
create or replace function public.update_risk_submission(p_id uuid, p_data jsonb, p_response text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s risk_submissions; v_was text;
begin
  select * into s from risk_submissions where id = p_id for update;
  if not found or not is_org_member(s.org_id) then raise exception 'Submission not found'; end if;
  if s.submitted_by <> auth.uid() then raise exception 'Only the person who raised this risk can change it'; end if;
  perform erm_writable(s.org_id);
  if s.status not in ('submitted', 'needs_clarification') then raise exception 'This submission has already been decided'; end if;
  v_was := s.status;
  s := risk_submission_apply(s, coalesce(p_data, '{}'::jsonb));
  if v_was = 'needs_clarification' then
    if char_length(btrim(coalesce(p_response, ''))) < 5 then raise exception 'Answer the question the reviewer asked'; end if;
    s.clarification_response := btrim(p_response);
    s.status := 'submitted';
  end if;
  update risk_submissions set title = s.title, description = s.description, business_unit_id = s.business_unit_id,
         source = s.source, category = s.category, root_cause = s.root_cause, consequences = s.consequences,
         existing_controls = s.existing_controls, mitigation_ideas = s.mitigation_ideas, likelihood = s.likelihood,
         impact = s.impact, urgent = s.urgent, status = s.status, clarification_response = s.clarification_response
   where id = p_id;
  if v_was = 'needs_clarification' then
    perform erm_notify(s.org_id, case when s.reviewer_id is not null then array[s.reviewer_id] else array(select risk_managers(s.org_id)) end,
      format('%s answered: back in the triage queue', s.ref), btrim(p_response), '/app/risks/intake/' || s.id);
    perform audit_log_write(s.org_id, 'risk_submission.clarified', 'risk_submission', s.id, s.ref, '{}'::jsonb);
  end if;
end $$;

create or replace function public.withdraw_risk_submission(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s risk_submissions;
begin
  select * into s from risk_submissions where id = p_id for update;
  if not found or not is_org_member(s.org_id) then raise exception 'Submission not found'; end if;
  if s.submitted_by <> auth.uid() then raise exception 'Only the person who raised this risk can withdraw it'; end if;
  perform erm_writable(s.org_id);
  if s.status not in ('submitted', 'needs_clarification') then raise exception 'This submission has already been decided'; end if;
  update risk_submissions set status = 'withdrawn', decision_note = nullif(btrim(coalesce(p_reason, '')), ''), reviewed_at = now()
   where id = p_id;
  perform audit_log_write(s.org_id, 'risk_submission.withdrawn', 'risk_submission', s.id, s.ref, '{}'::jsonb);
end $$;

-- Triage: ask for clarification, decline, or accept into the register as a
-- draft risk for a named owner. The person who raised it never triages it.
create or replace function public.triage_risk_submission(
  p_id uuid, p_action text, p_note text default null, p_owner uuid default null,
  p_title text default null, p_category text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s risk_submissions; v_risk uuid; v_bu text; v_ref text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into s from risk_submissions where id = p_id for update;
  if not found or not is_org_member(s.org_id) then raise exception 'Submission not found'; end if;
  if not is_risk_manager_or_admin(s.org_id) then raise exception 'Only a risk manager or admin can triage raised risks'; end if;
  perform erm_writable(s.org_id);
  if s.submitted_by = auth.uid() then raise exception 'You raised this risk, so another risk manager has to triage it'; end if;

  if p_action = 'clarify' then
    if s.status <> 'submitted' then raise exception 'Only a submission waiting in the queue can be sent back with a question'; end if;
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'Ask the question you need answered (at least 10 characters)'; end if;
    update risk_submissions set status = 'needs_clarification', clarification_request = v_note,
           clarification_requested_at = now(), clarification_response = null,
           clarification_count = clarification_count + 1, reviewer_id = auth.uid()
     where id = p_id;
    perform erm_notify(s.org_id, array[s.submitted_by], format('%s: a question about the risk you raised', s.ref),
      v_note, '/app/risks/intake/' || s.id);
    perform audit_log_write(s.org_id, 'risk_submission.clarification_requested', 'risk_submission', s.id, s.ref, '{}'::jsonb);
    return null;
  end if;

  if s.status not in ('submitted', 'needs_clarification') then raise exception 'This submission has already been decided'; end if;

  if p_action = 'decline' then
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'Say why it is declined (at least 10 characters)'; end if;
    update risk_submissions set status = 'declined', decision_note = v_note, reviewer_id = auth.uid(), reviewed_at = now()
     where id = p_id;
    perform erm_notify(s.org_id, array[s.submitted_by], format('%s was not added to the register', s.ref),
      v_note, '/app/risks/intake/' || s.id);
    perform audit_log_write(s.org_id, 'risk_submission.declined', 'risk_submission', s.id, s.ref, '{}'::jsonb);
    return null;
  end if;

  if p_action <> 'accept' then raise exception 'Unknown triage action %', p_action; end if;
  if p_owner is null or not exists (select 1 from organization_members m
      where m.org_id = s.org_id and m.user_id = p_owner and m.role <> 'viewer') then
    raise exception 'Choose a risk owner from this workspace (viewers cannot own risks)';
  end if;
  select name into v_bu from business_units where id = s.business_unit_id;

  insert into risks (org_id, title, description, category, business_unit, cause, impact_statement,
                     likelihood, impact, inherent_likelihood, inherent_impact,
                     status, workflow_state, owner_id, created_by, source, source_entity_name, identified_date)
  values (s.org_id, coalesce(nullif(btrim(coalesce(p_title, '')), ''), s.title), s.description,
          coalesce(nullif(btrim(coalesce(p_category, '')), ''), s.category), v_bu, s.root_cause, s.consequences,
          coalesce(s.likelihood, 3), coalesce(s.impact, 3), s.likelihood, s.impact,
          'open', 'draft', p_owner, auth.uid(), 'Risk submission', s.ref,
          (s.submitted_at at time zone 'Asia/Riyadh')::date)
  returning id, risk_id into v_risk, v_ref;

  insert into risk_workflow_history (org_id, risk_id, from_state, to_state, action, comment, performed_by)
  values (s.org_id, v_risk, null, 'draft', 'created',
          format('Raised through %s and accepted at triage%s', s.ref, coalesce(': ' || v_note, '.')), auth.uid());

  update risk_submissions set status = 'accepted', risk_id = v_risk, decision_note = v_note,
         reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_id;

  perform erm_notify(s.org_id, array[s.submitted_by], format('%s accepted as %s', s.ref, v_ref),
    'The risk you raised is now in the register as a draft.', '/app/risks/intake/' || s.id);
  perform erm_notify(s.org_id, array[p_owner], format('You own a new risk: %s', v_ref),
    coalesce(nullif(btrim(coalesce(p_title, '')), ''), s.title), '/app/risks/' || v_risk);
  perform audit_log_write(s.org_id, 'risk_submission.accepted', 'risk_submission', s.id, s.ref,
    jsonb_build_object('risk', v_ref, 'owner', p_owner));
  return v_risk;
end $$;

-- ── 4. Acceptance governance on risk_exceptions ─────────────────────────────
alter table public.risk_exceptions add column if not exists purpose text;
alter table public.risk_exceptions add column if not exists decision_due_on date;
alter table public.risk_exceptions add column if not exists conditions text;
alter table public.risk_exceptions add column if not exists decided_by uuid;
alter table public.risk_exceptions add column if not exists management_review_required boolean not null default false;
alter table public.risk_exceptions add column if not exists management_reviewer_id uuid;
alter table public.risk_exceptions add column if not exists management_review_outcome text;
alter table public.risk_exceptions add column if not exists management_review_note text;
alter table public.risk_exceptions add column if not exists management_reviewed_at timestamptz;
alter table public.risk_exceptions add column if not exists revoked_by uuid;
alter table public.risk_exceptions add column if not exists revoked_at timestamptz;
alter table public.risk_exceptions add column if not exists revoke_reason text;

alter table public.risk_exceptions drop constraint if exists risk_exceptions_purpose_check;
alter table public.risk_exceptions add constraint risk_exceptions_purpose_check check (purpose is null or purpose in (
  'within_tolerance', 'low_impact_or_likelihood', 'cost_exceeds_benefit', 'strategic_justification',
  'accepted_by_external_party', 'business_process_dependency', 'mitigation_in_progress',
  'residual_after_mitigation', 'temporary_pending_action'));
alter table public.risk_exceptions drop constraint if exists risk_exceptions_status_check;
alter table public.risk_exceptions add constraint risk_exceptions_status_check
  check (status in ('pending', 'approved', 'rejected', 'revoked', 'expired'));
alter table public.risk_exceptions drop constraint if exists risk_exceptions_review_outcome_check;
alter table public.risk_exceptions add constraint risk_exceptions_review_outcome_check
  check (management_review_outcome is null or management_review_outcome in ('endorsed', 'objected'));

-- Readable by approvers and management reviewers even when the risk is not
-- theirs: they cannot decide what they cannot see.
create or replace function public.user_decides_on_risk(p_risk uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from risk_exceptions e
                  where e.risk_id = p_risk and e.status in ('pending', 'approved')
                    and (e.approver_id = auth.uid() or e.management_reviewer_id = auth.uid()));
$$;
revoke all on function public.user_decides_on_risk(uuid) from public, anon;
grant execute on function public.user_decides_on_risk(uuid) to authenticated;

drop policy if exists risks_select on public.risks;
create policy risks_select on public.risks for select to authenticated
  using (is_risk_manager_or_admin(org_id) or owner_id = auth.uid() or created_by = auth.uid()
         or assigned_to = auth.uid() or user_collaborates_on(id) or user_decides_on_risk(id));

-- What an acceptance of this risk needs, from the database's own reading of
-- the score and the gate: the band's authority, raised to the Steering
-- Committee when the risk is outside tolerance (then it is an exception).
create or replace function public.risk_acceptance_terms(p_risk uuid)
returns table (band text, score int, acceptance_type text, required_authority text)
language plpgsql stable security definer set search_path = public as $$
declare r risks; v_score int; v_band text; v_req text; v_type text;
begin
  select * into r from risks where id = p_risk;
  if not found or not is_org_member(r.org_id) then raise exception 'Risk not found'; end if;
  v_score := risk_current_score(r);
  v_band := coalesce(risk_score_band(r.org_id, v_score), 'low');
  v_type := case when r.tolerance_status = 'breached' then 'exception' else 'acceptance' end;
  v_req := coalesce(authority_for_rating(v_band), 'risk_owner');
  if v_type = 'exception' and authority_rank(v_req) < authority_rank('committee') then v_req := 'committee'; end if;
  return query select v_band, v_score, v_type, v_req;
end $$;
revoke all on function public.risk_acceptance_terms(uuid) from public, anon;
grant execute on function public.risk_acceptance_terms(uuid) to authenticated;

create or replace function public.request_risk_acceptance(p_risk uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r risks; t record; v_id uuid; me uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_purpose text := nullif(p_data ->> 'purpose', '');
  v_just text := btrim(coalesce(p_data ->> 'justification', ''));
  v_comp text := nullif(btrim(coalesce(p_data ->> 'compensating_controls', '')), '');
  v_approver uuid := nullif(p_data ->> 'approver_id', '')::uuid;
  v_expires date := nullif(p_data ->> 'expires_on', '')::date;
  v_decide date := nullif(p_data ->> 'decision_due_on', '')::date;
  v_review boolean := coalesce((p_data ->> 'management_review')::boolean, false);
  v_reviewer uuid := nullif(p_data ->> 'management_reviewer_id', '')::uuid;
  v_freq text := nullif(p_data ->> 'review_frequency', '');
  v_max int;
begin
  select * into r from risks where id = p_risk for update;
  if not found or not is_org_member(r.org_id) then raise exception 'Risk not found'; end if;
  if not (is_risk_manager_or_admin(r.org_id) or (is_contributor(r.org_id) and member_owns_risk(r.id))) then
    raise exception 'Only the risk owner or a risk manager can request acceptance';
  end if;
  perform erm_writable(r.org_id);
  if r.workflow_state in ('draft', 'registered') then raise exception 'Score the risk before requesting acceptance'; end if;
  if r.workflow_state = 'closed' then raise exception 'This risk is closed'; end if;
  if exists (select 1 from risk_exceptions e where e.risk_id = r.id and e.status in ('pending', 'approved')) then
    raise exception 'An acceptance for this risk is already pending or active';
  end if;
  select * into t from risk_acceptance_terms(r.id);

  if v_purpose is null then raise exception 'Choose the purpose of the acceptance'; end if;
  if t.acceptance_type = 'exception' and v_purpose = 'within_tolerance' then
    raise exception 'This risk is outside tolerance, so "within tolerance" cannot be the purpose';
  end if;
  if char_length(v_just) < 20 then raise exception 'Give the rationale: why retaining this risk is justified (at least 20 characters)'; end if;
  if t.acceptance_type = 'exception' and char_length(coalesce(v_comp, '')) < 10 then
    raise exception 'An exception above tolerance needs its compensating controls on record';
  end if;

  -- Term limits: interim purposes and critical risks 6 months; exceptions 12; otherwise 24.
  v_max := case when v_purpose in ('mitigation_in_progress', 'temporary_pending_action') or t.band = 'critical' then 183
                when t.acceptance_type = 'exception' then 366 else 731 end;
  if v_expires is null or v_expires <= v_today then raise exception 'An acceptance is time-bound: set an expiry date in the future'; end if;
  if v_expires > v_today + v_max then
    raise exception 'This acceptance can run for at most % months', case v_max when 183 then 6 when 366 then 12 else 24 end;
  end if;

  if v_approver is null then raise exception 'Choose an approver'; end if;
  if authority_rank(user_authority(r.org_id, v_approver, r.owner_id)) < authority_rank(t.required_authority) then
    raise exception 'The approver needs % authority or above', replace(t.required_authority, '_', ' ');
  end if;
  if v_approver = me and not (t.required_authority = 'risk_owner' and r.owner_id = me) then
    raise exception 'You cannot approve your own request: choose someone else with the authority';
  end if;

  v_decide := coalesce(v_decide, v_today + coalesce((select acceptance_decision_days from risk_settings where org_id = r.org_id), 14));
  if v_decide < v_today or v_decide > v_today + 60 then raise exception 'The decision due date must be within the next 60 days'; end if;

  if v_review then
    if v_reviewer is null then raise exception 'Choose who carries out the management review'; end if;
    if v_reviewer in (me, v_approver) then raise exception 'The management reviewer must be someone other than the requester and the approver'; end if;
    if not exists (select 1 from organization_members m where m.org_id = r.org_id and m.user_id = v_reviewer and m.role <> 'viewer') then
      raise exception 'Choose a management reviewer from this workspace';
    end if;
  else
    v_reviewer := null;
  end if;

  v_freq := coalesce(v_freq, case when t.acceptance_type = 'exception' then 'Monthly' else 'Quarterly' end);
  if v_freq not in ('Monthly', 'Quarterly', 'Semi-Annual', 'Annual') then raise exception 'Unknown review frequency'; end if;

  insert into risk_exceptions (org_id, risk_id, justification, compensating_controls, requested_by, approver_id,
                               status, expires_at, exception_type, required_authority, band_at_request,
                               residual_at_request, review_frequency, purpose, decision_due_on,
                               management_review_required, management_reviewer_id)
  values (r.org_id, r.id, v_just, v_comp, me, v_approver, 'pending',
          ((v_expires + 1)::timestamp at time zone 'Asia/Riyadh') - interval '1 second',
          t.acceptance_type, t.required_authority, t.band, t.score, v_freq, v_purpose, v_decide, v_review, v_reviewer)
  returning id into v_id;

  if v_review then
    perform erm_notify(r.org_id, array[v_reviewer], format('Management review requested: %s', r.risk_id),
      format('Acceptance of "%s" is waiting for your review before %s decides.', r.title,
             coalesce((select full_name from profiles where id = v_approver), 'the approver')),
      '/app/risks/' || r.id || '?tab=treatment');
  end if;
  perform erm_notify(r.org_id, array[v_approver], format('Acceptance to decide: %s', r.risk_id),
    format('%s. Decision due %s.', r.title, to_char(v_decide, 'DD Mon YYYY')), '/app/risks/' || r.id || '?tab=treatment');
  perform audit_log_write(r.org_id, 'risk_acceptance.requested', 'risk', r.id, r.risk_id,
    jsonb_build_object('type', t.acceptance_type, 'purpose', v_purpose, 'required', t.required_authority, 'expires', v_expires));
  return v_id;
end $$;

create or replace function public.review_risk_acceptance(p_id uuid, p_outcome text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e risk_exceptions; r risks;
begin
  select * into e from risk_exceptions where id = p_id for update;
  if not found or not is_org_member(e.org_id) then raise exception 'Acceptance not found'; end if;
  perform erm_writable(e.org_id);
  if e.status <> 'pending' or not e.management_review_required then raise exception 'This acceptance is not waiting for a management review'; end if;
  if e.management_reviewed_at is not null then raise exception 'The management review is already recorded'; end if;
  if e.management_reviewer_id is distinct from auth.uid() then raise exception 'Only the named management reviewer can record this review'; end if;
  if p_outcome not in ('endorsed', 'objected') then raise exception 'Endorse or object'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Record the basis of your review (at least 10 characters)'; end if;
  update risk_exceptions set management_review_outcome = p_outcome, management_review_note = btrim(p_note),
         management_reviewed_at = now()
   where id = p_id;
  select * into r from risks where id = e.risk_id;
  perform log_risk_activity(e.org_id, e.risk_id, null, 'acceptance_' || p_outcome,
    format('%s — management review %s: %s', e.exception_ref, p_outcome, btrim(p_note)));
  perform erm_notify(e.org_id, array[e.approver_id, e.requested_by],
    format('Management review %s: %s', p_outcome, r.risk_id), btrim(p_note), '/app/risks/' || e.risk_id || '?tab=treatment');
  perform audit_log_write(e.org_id, 'risk_acceptance.' || p_outcome, 'risk', e.risk_id, r.risk_id,
    jsonb_build_object('acceptance', e.exception_ref));
end $$;

create or replace function public.decide_risk_acceptance(p_id uuid, p_decision text, p_comment text, p_conditions text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e risk_exceptions; r risks; me uuid := auth.uid(); v_mine text; v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into e from risk_exceptions where id = p_id for update;
  if not found or not is_org_member(e.org_id) then raise exception 'Acceptance not found'; end if;
  perform erm_writable(e.org_id);
  select * into r from risks where id = e.risk_id for update;
  v_mine := user_authority(e.org_id, me, r.owner_id);

  if p_decision = 'revoked' then
    if e.status <> 'approved' then raise exception 'Only an approved acceptance can be revoked'; end if;
    if authority_rank(v_mine) < authority_rank(e.required_authority) and not is_risk_manager_or_admin(e.org_id) then
      raise exception 'Revoking needs % authority, or a risk manager', replace(e.required_authority, '_', ' ');
    end if;
    if char_length(coalesce(v_comment, '')) < 10 then raise exception 'Say why the acceptance is being revoked (at least 10 characters)'; end if;
    update risk_exceptions set status = 'revoked', revoked_by = me, revoked_at = now(), revoke_reason = v_comment,
           decision_comment = coalesce(decision_comment, v_comment)
     where id = p_id;
    if r.workflow_state = 'accepted' then
      update risks set workflow_state = 'assessed', status = 'open', updated_at = now() where id = r.id;
      insert into risk_workflow_history (org_id, risk_id, from_state, to_state, action, comment, performed_by)
      values (r.org_id, r.id, 'accepted', 'assessed', 'acceptance_revoked', v_comment, me);
    end if;
    perform erm_notify(e.org_id, array[e.requested_by, r.owner_id], format('Acceptance revoked: %s', r.risk_id),
      v_comment, '/app/risks/' || r.id || '?tab=treatment');
    perform audit_log_write(e.org_id, 'risk_acceptance.revoked', 'risk', r.id, r.risk_id,
      jsonb_build_object('acceptance', e.exception_ref, 'reason', v_comment));
    return;
  end if;

  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision %', p_decision; end if;
  if e.status <> 'pending' then raise exception 'This acceptance has already been decided'; end if;
  if e.management_review_required and e.management_reviewed_at is null then
    raise exception 'This acceptance is waiting for its management review';
  end if;
  if authority_rank(v_mine) < authority_rank(e.required_authority) then
    raise exception 'Deciding this acceptance needs % authority or above', replace(e.required_authority, '_', ' ');
  end if;
  if e.requested_by = me and not (e.required_authority = 'risk_owner' and r.owner_id = me) then
    raise exception 'You raised this request, so someone else with the authority has to decide it';
  end if;
  if p_decision = 'rejected' and char_length(coalesce(v_comment, '')) < 10 then
    raise exception 'Give the reason for rejecting (at least 10 characters)';
  end if;
  if p_decision = 'approved' and e.management_review_outcome = 'objected' and char_length(coalesce(v_comment, '')) < 20 then
    raise exception 'Management objected: record why you approve anyway (at least 20 characters)';
  end if;
  if p_decision = 'approved' and e.expires_at <= now() then raise exception 'The requested expiry has passed; ask for a new request'; end if;

  update risk_exceptions
     set status = p_decision, decided_by = me, decided_at = now(), decided_authority = v_mine,
         decision_comment = v_comment,
         conditions = case when p_decision = 'approved' then nullif(btrim(coalesce(p_conditions, '')), '') end,
         granted_at = case when p_decision = 'approved' then now() end
   where id = p_id;

  if p_decision = 'approved' then
    update risks set status = 'accepted', treatment = 'accept', workflow_state = 'accepted', updated_at = now() where id = r.id;
    if r.workflow_state is distinct from 'accepted' then
      insert into risk_workflow_history (org_id, risk_id, from_state, to_state, action, comment, performed_by)
      values (r.org_id, r.id, r.workflow_state, 'accepted', 'acceptance_approved', v_comment, me);
    end if;
  end if;
  perform erm_notify(e.org_id, array[e.requested_by, r.owner_id],
    format('Acceptance %s: %s', p_decision, r.risk_id), coalesce(v_comment, r.title), '/app/risks/' || r.id || '?tab=treatment');
  perform audit_log_write(e.org_id, 'risk_acceptance.' || p_decision, 'risk', r.id, r.risk_id,
    jsonb_build_object('acceptance', e.exception_ref, 'authority', v_mine, 'conditions', nullif(btrim(coalesce(p_conditions, '')), '')));
end $$;

-- Expiry. Approved acceptances past their date expire and put the risk back in
-- front of the gate. Shared by the daily job and the register's on-load call.
create or replace function public.risk_acceptances_expire(p_org uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare e record; n int := 0;
begin
  for e in select x.*, r.workflow_state as risk_state, r.risk_id as risk_ref, r.owner_id as risk_owner
             from risk_exceptions x join risks r on r.id = x.risk_id
            where x.status = 'approved' and x.expires_at is not null and x.expires_at < now()
              and (p_org is null or x.org_id = p_org)
            for update of x loop
    update risk_exceptions set status = 'expired' where id = e.id;
    if e.risk_state = 'accepted' then
      update risks set workflow_state = 'assessed', status = 'open', updated_at = now() where id = e.risk_id;
      insert into risk_workflow_history (org_id, risk_id, from_state, to_state, action, comment, performed_by)
      values (e.org_id, e.risk_id, 'accepted', 'assessed', 'acceptance_expired',
              format('%s expired on %s', e.exception_ref, to_char(e.expires_at at time zone 'Asia/Riyadh', 'DD Mon YYYY')), null);
    end if;
    perform erm_notify(e.org_id, array[e.requested_by, e.risk_owner], format('Acceptance expired: %s', e.risk_ref),
      'The risk is back in front of the tolerance gate. Re-assess it or request a new acceptance.',
      '/app/risks/' || e.risk_id || '?tab=treatment');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.risk_acceptances_expire(uuid) from public, anon, authenticated;

create or replace function public.expire_risk_exceptions(p_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not is_org_member(p_org) then raise exception 'Not a member of this organisation'; end if;
  return risk_acceptances_expire(p_org);
end $$;

-- ── 5. Daily job: expiry and reminders ──────────────────────────────────────
create table if not exists public.erm_reminders (
  subject_id uuid not null,
  stage      text not null,
  sent_at    timestamptz not null default now(),
  primary key (subject_id, stage)
);
alter table public.erm_reminders enable row level security;
revoke all on public.erm_reminders from authenticated, anon;

create or replace function public.erm_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_due date; v_stage text;
        n_exp int; n_ass int := 0; n_dec int := 0; n_end int := 0; n_tri int := 0;
begin
  n_exp := risk_acceptances_expire(null);

  -- Assessments: 7 days before, on the day, and weekly once overdue.
  for r in select * from risks where workflow_state = 'registered' and assessment_due_at is not null loop
    v_due := (r.assessment_due_at at time zone 'Asia/Riyadh')::date;
    v_stage := case when v_today > v_due then 'overdue:' || v_due || ':' || ((v_today - v_due - 1) / 7)
                    when v_today = v_due then 'd0:' || v_due
                    when v_due - v_today <= 7 then 'd7:' || v_due end;
    continue when v_stage is null;
    insert into erm_reminders (subject_id, stage) values (r.id, 'assess:' || v_stage) on conflict do nothing;
    continue when not found;
    perform erm_notify(r.org_id,
      case when r.owner_id is not null then array[r.owner_id] else array(select risk_managers(r.org_id)) end,
      case when v_today > v_due then format('Overdue: assess %s', r.risk_id)
           when v_today = v_due then format('%s must be assessed today', r.risk_id)
           else format('%s must be assessed by %s', r.risk_id, to_char(v_due, 'DD Mon YYYY')) end,
      r.title, '/app/risks/' || r.id);
    n_ass := n_ass + 1;
  end loop;

  -- Acceptance decisions past their due date (once per due date).
  for r in select x.*, k.risk_id as risk_ref from risk_exceptions x join risks k on k.id = x.risk_id
            where x.status = 'pending' and x.decision_due_on is not null and x.decision_due_on < v_today loop
    insert into erm_reminders (subject_id, stage) values (r.id, 'decide:' || r.decision_due_on) on conflict do nothing;
    continue when not found;
    perform erm_notify(r.org_id,
      case when r.management_review_required and r.management_reviewed_at is null
           then array[r.management_reviewer_id, r.requested_by] else array[r.approver_id, r.requested_by] end,
      format('Acceptance decision overdue: %s', r.risk_ref),
      format('The decision was due %s.', to_char(r.decision_due_on, 'DD Mon YYYY')), '/app/risks/' || r.risk_id || '?tab=treatment');
    n_dec := n_dec + 1;
  end loop;

  -- Approved acceptances ending within 30 and 7 days.
  for r in select x.*, k.risk_id as risk_ref, k.owner_id as risk_owner from risk_exceptions x join risks k on k.id = x.risk_id
            where x.status = 'approved' and x.expires_at is not null
              and (x.expires_at at time zone 'Asia/Riyadh')::date - v_today between 0 and 30 loop
    v_due := (r.expires_at at time zone 'Asia/Riyadh')::date;
    v_stage := case when v_due - v_today <= 7 then 'd7' else 'd30' end;
    insert into erm_reminders (subject_id, stage) values (r.id, 'expiry:' || v_stage || ':' || v_due) on conflict do nothing;
    continue when not found;
    perform erm_notify(r.org_id, array[r.risk_owner, r.requested_by],
      format('Acceptance of %s ends %s', r.risk_ref, to_char(v_due, 'DD Mon YYYY')),
      'Re-assess the risk, or request a new acceptance before it ends.', '/app/risks/' || r.risk_id || '?tab=treatment');
    n_end := n_end + 1;
  end loop;

  -- Triage queue: anything waiting more than 5 days, once.
  for r in select * from risk_submissions where status = 'submitted' and submitted_at < now() - interval '5 days' loop
    insert into erm_reminders (subject_id, stage) values (r.id, 'triage:stale:' || (r.submitted_at::date)) on conflict do nothing;
    continue when not found;
    perform erm_notify(r.org_id, array(select risk_managers(r.org_id)) , format('Still waiting for triage: %s', r.ref),
      r.title, '/app/risks/intake/' || r.id);
    n_tri := n_tri + 1;
  end loop;

  return jsonb_build_object('expired', n_exp, 'assessment_reminders', n_ass, 'decision_reminders', n_dec,
                            'expiry_reminders', n_end, 'triage_reminders', n_tri, 'ran_at', now());
end $$;
revoke all on function public.erm_daily() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'risys-erm-daily') then
    perform cron.unschedule('risys-erm-daily');
  end if;
  perform cron.schedule('risys-erm-daily', '25 2 * * *', $job$ select public.erm_daily() $job$);
end $$;

-- ── 6. Waiting on you: ERM kinds ─────────────────────────────────────────────
create or replace function public.my_work(p_org uuid)
returns table(kind text, item_id uuid, ref text, title text, detail text, due_on date, since timestamptz, href text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Riyadh')::date; v_writer boolean; v_rm boolean;
begin
  if me is null or not is_org_member(p_org) then return; end if;
  v_writer := is_compliance_writer(p_org);
  v_rm := is_risk_manager_or_admin(p_org);
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
  return query
    select 'dsr_due'::text, d.id, d.ref, initcap(replace(d.request_type, '_', ' ')) || ' request', d.requester_name,
           coalesce(d.extended_due_on, d.due_on), d.received_at, '/app/privacy/requests/' || d.id
      from data_subject_requests d
     where d.org_id = p_org and d.status in ('received', 'in_progress')
       and (d.assigned_to = me or (d.assigned_to is null and v_writer))
       and coalesce(d.extended_due_on, d.due_on) <= v_today + 7;
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

  -- ERM
  if v_rm then
    return query
      select 'risk_triage'::text, s.id, s.ref, s.title, case when s.urgent then 'Marked urgent' end,
             null::date, s.submitted_at, '/app/risks/intake/' || s.id
        from risk_submissions s
       where s.org_id = p_org and s.status = 'submitted' and s.submitted_by is distinct from me;
  end if;
  return query
    select 'risk_clarify'::text, s.id, s.ref, s.title, null::text,
           null::date, s.clarification_requested_at, '/app/risks/intake/' || s.id
      from risk_submissions s
     where s.org_id = p_org and s.status = 'needs_clarification' and s.submitted_by = me;
  return query
    select 'risk_assessment'::text, r.id, r.risk_id, r.title, null::text,
           (r.assessment_due_at at time zone 'Asia/Riyadh')::date, r.approved_at, '/app/risks/' || r.id
      from risks r
     where r.org_id = p_org and r.workflow_state = 'registered' and r.owner_id = me
       and r.assessment_due_at is not null and (r.assessment_due_at at time zone 'Asia/Riyadh')::date <= v_today + 7;
  return query
    select 'acceptance_review'::text, x.id, r.risk_id, r.title, x.exception_ref,
           x.decision_due_on, x.created_at, '/app/risks/' || r.id || '?tab=treatment'
      from risk_exceptions x join risks r on r.id = x.risk_id
     where x.org_id = p_org and x.status = 'pending' and x.management_review_required
       and x.management_reviewed_at is null and x.management_reviewer_id = me;
  return query
    select 'acceptance_decision'::text, x.id, r.risk_id, r.title,
           initcap(coalesce(x.band_at_request, '')) || case when x.exception_type = 'exception' then ' · exception' else '' end,
           x.decision_due_on, x.created_at, '/app/risks/' || r.id || '?tab=treatment'
      from risk_exceptions x join risks r on r.id = x.risk_id
     where x.org_id = p_org and x.status = 'pending'
       and (not x.management_review_required or x.management_reviewed_at is not null)
       and (x.requested_by is distinct from me or (x.required_authority = 'risk_owner' and r.owner_id = me))
       and authority_rank(user_authority(p_org, me, r.owner_id)) >= authority_rank(x.required_authority);
end $$;
revoke execute on function public.my_work(uuid) from public, anon;
grant execute on function public.my_work(uuid) to authenticated;

-- ── 7. Grants on the RPCs ────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'set_risk_settings(uuid, int, int)', 'extend_risk_assessment(uuid, date, text)',
    'submit_risk(uuid, jsonb)', 'update_risk_submission(uuid, jsonb, text)', 'withdraw_risk_submission(uuid, text)',
    'triage_risk_submission(uuid, text, text, uuid, text, text)',
    'request_risk_acceptance(uuid, jsonb)', 'review_risk_acceptance(uuid, text, text)',
    'decide_risk_acceptance(uuid, text, text, text)', 'expire_risk_exceptions(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.risks_assessment_clock() from public, anon, authenticated;
revoke all on function public.risk_submissions_ref() from public, anon, authenticated;
revoke all on function public.erm_writable(uuid) from public, anon, authenticated;
