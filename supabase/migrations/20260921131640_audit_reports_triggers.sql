-- ── Housekeeping triggers ────────────────────────────────────────────────────

create or replace function public.audit_touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['audit_engagements','audit_scope_items','audit_evidence_requests','audit_findings'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.audit_touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- Engagement refs: AUD-0001, AUD-0002 … per organisation.
create or replace function public.audit_engagement_set_ref()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.ref is null then new.ref := next_ref(new.org_id, 'AUD'); end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger audit_engagements_ref before insert on public.audit_engagements
  for each row execute function public.audit_engagement_set_ref();

-- Finding refs: AUD-0003-F01, numbered within their engagement.
create or replace function public.audit_finding_set_ref()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v int; v_eng text;
begin
  if new.ref is null then
    insert into org_counters (org_id, key, value) values (new.org_id, 'AF:' || new.engagement_id, 1)
    on conflict (org_id, key) do update set value = org_counters.value + 1
    returning value into v;
    select ref into v_eng from audit_engagements where id = new.engagement_id;
    new.ref := coalesce(v_eng, 'AUD') || '-F' || lpad(v::text, 2, '0');
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger audit_findings_ref before insert on public.audit_findings
  for each row execute function public.audit_finding_set_ref();

create or replace function public.audit_request_set_creator()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger audit_evidence_requests_creator before insert on public.audit_evidence_requests
  for each row execute function public.audit_request_set_creator();

create or replace function public.audit_file_set_uploader()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.uploaded_by := auth.uid();
  return new;
end $$;
create trigger audit_evidence_files_uploader before insert on public.audit_evidence_files
  for each row execute function public.audit_file_set_uploader();

-- ── Lifecycle rules ──────────────────────────────────────────────────────────

-- Engagement: stamp closure.
create or replace function public.audit_engagement_lifecycle()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then new.closed_at := now(); end if;
  if new.status <> 'closed' then new.closed_at := null; end if;
  return new;
end $$;
create trigger audit_engagements_lifecycle before update on public.audit_engagements
  for each row execute function public.audit_engagement_lifecycle();

-- Scope item: whoever records a result is the tester; whoever signs off is
-- the reviewer, and the four-eyes constraint refuses a self-review.
create or replace function public.audit_scope_item_lifecycle()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.result is distinct from old.result or new.result_notes is distinct from old.result_notes
     or new.sample_size is distinct from old.sample_size or new.exceptions_found is distinct from old.exceptions_found then
    if new.result = 'not_tested' then
      new.tested_by := null; new.tested_at := null;
    else
      new.tested_by := auth.uid(); new.tested_at := now();
    end if;
    -- A changed result needs a fresh review.
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  if new.reviewed_by is not null and old.reviewed_by is null then
    if new.result = 'not_tested' then raise exception 'A test must be performed before it can be reviewed'; end if;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger audit_scope_items_lifecycle before update on public.audit_scope_items
  for each row execute function public.audit_scope_item_lifecycle();

-- Evidence request: the person asked may only answer it.
create or replace function public.audit_request_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_audit_writer(new.org_id) then
    if (new.title, new.description, new.requested_from, new.due_date, new.scope_item_id, new.engagement_id,
        new.review_note, new.reviewed_by, new.reviewed_at, new.created_by)
       is distinct from
       (old.title, old.description, old.requested_from, old.due_date, old.scope_item_id, old.engagement_id,
        old.review_note, old.reviewed_by, old.reviewed_at, old.created_by) then
      raise exception 'You can answer this evidence request, but not change it';
    end if;
    if new.status is distinct from old.status and not (old.status in ('open','rejected') and new.status = 'submitted') then
      raise exception 'You can submit evidence; only the auditor can accept or reject it';
    end if;
  end if;
  if new.status = 'submitted' and old.status is distinct from 'submitted' then new.submitted_at := now(); end if;
  if new.status in ('accepted','rejected') and old.status is distinct from new.status then
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger audit_evidence_requests_guard before update on public.audit_evidence_requests
  for each row execute function public.audit_request_guard();

-- Finding: the response owner writes the response and moves remediation;
-- only an auditor raises, validates or closes.
create or replace function public.audit_finding_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_audit_writer(new.org_id) then
    if (new.title, new.rating, new.condition, new.criteria, new.cause, new.effect, new.recommendation,
        new.framework, new.requirement_id, new.response_owner, new.due_date, new.scope_item_id,
        new.engagement_id, new.risk_id, new.validated_by, new.validated_at)
       is distinct from
       (old.title, old.rating, old.condition, old.criteria, old.cause, old.effect, old.recommendation,
        old.framework, old.requirement_id, old.response_owner, old.due_date, old.scope_item_id,
        old.engagement_id, old.risk_id, old.validated_by, old.validated_at) then
      raise exception 'You can respond to this finding and track remediation, but not change the finding itself';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'open'                 and new.status = 'in_remediation') or
         (old.status = 'in_remediation'       and new.status = 'ready_for_validation') or
         (old.status = 'ready_for_validation' and new.status = 'in_remediation')) then
      raise exception 'Only the auditor can validate or close a finding';
    end if;
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.validated_by := auth.uid(); new.validated_at := now(); new.closed_at := now();
  end if;
  if new.status not in ('closed','risk_accepted') then new.closed_at := null; end if;
  if new.status = 'risk_accepted' and old.status is distinct from 'risk_accepted' then new.closed_at := now(); end if;
  return new;
end $$;
create trigger audit_findings_guard before update on public.audit_findings
  for each row execute function public.audit_finding_guard();

-- Report archive: only the presentation record changes after generation.
create or replace function public.report_runs_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if (new.report_type, new.title, new.period_label, new.period_start, new.period_end, new.engagement_id,
      new.snapshot, new.file_path, new.file_size, new.sha256, new.generated_by, new.generated_at, new.org_id)
     is distinct from
     (old.report_type, old.title, old.period_label, old.period_start, old.period_end, old.engagement_id,
      old.snapshot, old.file_path, old.file_size, old.sha256, old.generated_by, old.generated_at, old.org_id) then
    raise exception 'A generated report is an archived record and cannot be changed; generate a new one instead';
  end if;
  if new.status in ('presented','submitted') and old.status = 'generated' and new.presented_at is null then
    new.presented_at := now();
  end if;
  return new;
end $$;
create trigger report_runs_guard before update on public.report_runs
  for each row execute function public.report_runs_guard();

revoke execute on function public.audit_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_engagement_set_ref() from public, anon, authenticated;
revoke execute on function public.audit_finding_set_ref() from public, anon, authenticated;
revoke execute on function public.audit_request_set_creator() from public, anon, authenticated;
revoke execute on function public.audit_file_set_uploader() from public, anon, authenticated;
revoke execute on function public.audit_engagement_lifecycle() from public, anon, authenticated;
revoke execute on function public.audit_scope_item_lifecycle() from public, anon, authenticated;
revoke execute on function public.audit_request_guard() from public, anon, authenticated;
revoke execute on function public.audit_finding_guard() from public, anon, authenticated;
revoke execute on function public.report_runs_guard() from public, anon, authenticated;;
