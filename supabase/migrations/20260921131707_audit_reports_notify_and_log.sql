-- ── Notifications and the audit trail ────────────────────────────────────────

create or replace function public.audit_actor_name()
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(full_name, email, 'Someone') from profiles where id = auth.uid();
$$;
revoke execute on function public.audit_actor_name() from public, anon, authenticated;

create or replace function public.audit_notify(p_org uuid, p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path to 'public' as $$
  insert into notifications (org_id, user_id, type, title, body, link)
  select p_org, p_user, p_type, p_title, p_body, p_link
   where p_user is not null and p_user is distinct from auth.uid();
$$;
revoke execute on function public.audit_notify(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.audit_log_write(p_org uuid, p_action text, p_type text, p_id uuid, p_title text, p_meta jsonb)
returns void language sql security definer set search_path to 'public' as $$
  insert into audit_log (org_id, actor_id, actor_name, action, entity_type, entity_id, entity_title, meta)
  values (p_org, auth.uid(), audit_actor_name(), p_action, p_type, p_id, p_title, coalesce(p_meta, '{}'::jsonb));
$$;
revoke execute on function public.audit_log_write(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Engagements
create or replace function public.trg_audit_engagement_events()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform audit_log_write(new.org_id, 'audit.engagement.created', 'audit_engagement', new.id,
      new.ref || ' ' || new.title, jsonb_build_object('type', new.audit_type, 'framework', new.framework));
    perform audit_notify(new.org_id, new.lead_auditor_id, 'info', 'You are leading an audit',
      new.ref || ' — ' || new.title, '/app/audits/' || new.id);
  elsif new.status is distinct from old.status then
    perform audit_log_write(new.org_id, 'audit.engagement.' || new.status, 'audit_engagement', new.id,
      new.ref || ' ' || new.title, jsonb_build_object('from', old.status, 'to', new.status, 'opinion', new.opinion));
  end if;
  return new;
end $$;
create trigger audit_engagements_events after insert or update on public.audit_engagements
  for each row execute function public.trg_audit_engagement_events();

-- Evidence requests
create or replace function public.trg_audit_request_events()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_eng record;
begin
  select ref, title into v_eng from audit_engagements where id = new.engagement_id;
  if tg_op = 'INSERT' then
    perform audit_notify(new.org_id, new.requested_from, 'warning', 'Evidence requested for ' || v_eng.ref,
      new.title || coalesce(' — due ' || to_char(new.due_date, 'DD Mon YYYY'), ''),
      '/app/audits/' || new.engagement_id || '?tab=requests');
  elsif new.status is distinct from old.status then
    if new.status = 'submitted' then
      perform audit_notify(new.org_id, new.created_by, 'info', 'Evidence submitted for ' || v_eng.ref,
        new.title, '/app/audits/' || new.engagement_id || '?tab=requests');
    elsif new.status in ('accepted','rejected') then
      perform audit_notify(new.org_id, new.requested_from, case when new.status = 'accepted' then 'success' else 'warning' end,
        'Evidence ' || new.status || ' — ' || v_eng.ref, new.title || coalesce(': ' || new.review_note, ''),
        '/app/audits/' || new.engagement_id || '?tab=requests');
    end if;
    perform audit_log_write(new.org_id, 'audit.evidence.' || new.status, 'audit_evidence_request', new.id,
      new.title, jsonb_build_object('engagement', v_eng.ref));
  end if;
  return new;
end $$;
create trigger audit_evidence_requests_events after insert or update on public.audit_evidence_requests
  for each row execute function public.trg_audit_request_events();

-- Findings
create or replace function public.trg_audit_finding_events()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_lead uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.response_owner is not distinct from old.response_owner then
    return new;
  end if;
  select lead_auditor_id into v_lead from audit_engagements where id = new.engagement_id;
  if new.status = 'open' and (tg_op = 'INSERT' or old.status = 'draft' or new.response_owner is distinct from old.response_owner) then
    perform audit_notify(new.org_id, new.response_owner, 'warning', 'Audit finding assigned to you — ' || new.ref,
      new.title || coalesce(' — response due ' || to_char(new.due_date, 'DD Mon YYYY'), ''),
      '/app/audits/' || new.engagement_id || '?tab=findings');
  elsif new.status = 'ready_for_validation' then
    perform audit_notify(new.org_id, v_lead, 'info', 'Finding ready for validation — ' || new.ref,
      new.title, '/app/audits/' || new.engagement_id || '?tab=findings');
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform audit_log_write(new.org_id, 'audit.finding.' || new.status, 'audit_finding', new.id,
      new.ref || ' ' || new.title,
      jsonb_build_object('rating', new.rating, 'from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status));
  end if;
  return new;
end $$;
create trigger audit_findings_events after insert or update on public.audit_findings
  for each row execute function public.trg_audit_finding_events();

-- Reports
create or replace function public.trg_report_run_events()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform audit_log_write(new.org_id, 'report.generated', 'report', new.id, new.title,
      jsonb_build_object('type', new.report_type, 'period', new.period_label, 'sha256', new.sha256));
  elsif new.status is distinct from old.status then
    perform audit_log_write(new.org_id, 'report.' || new.status, 'report', new.id, new.title,
      jsonb_build_object('to', new.presented_to));
  end if;
  return new;
end $$;
create trigger report_runs_events after insert or update on public.report_runs
  for each row execute function public.trg_report_run_events();

revoke execute on function public.trg_audit_engagement_events() from public, anon, authenticated;
revoke execute on function public.trg_audit_request_events() from public, anon, authenticated;
revoke execute on function public.trg_audit_finding_events() from public, anon, authenticated;
revoke execute on function public.trg_report_run_events() from public, anon, authenticated;;
