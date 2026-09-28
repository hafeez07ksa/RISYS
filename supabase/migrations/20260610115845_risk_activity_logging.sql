-- Log every activity on a risk's related records into risk_audit_log,
-- so the History tab shows controls, evidence, KRIs, loss events,
-- treatment actions, exceptions, reviews, tests, and comments.

create or replace function public.log_risk_activity(
  p_org uuid, p_risk uuid, p_control uuid,
  p_action text, p_note text
) returns void language sql security definer set search_path = public as $$
  insert into public.risk_audit_log (org_id, risk_id, control_id, action, note, performed_by)
  values (p_org, p_risk, p_control, p_action, p_note, auth.uid());
$$;

-- ── Controls (linked via risk_control_mappings) ──────────────────────────
create or replace function public.trg_log_control_mapping() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    select coalesce(control_id || ' — ', '') || name into v_name from risk_controls where id = new.control_id;
    perform log_risk_activity(new.org_id, new.risk_id, new.control_id, 'control_linked', v_name);
    return new;
  else
    select coalesce(control_id || ' — ', '') || name into v_name from risk_controls where id = old.control_id;
    perform log_risk_activity(old.org_id, old.risk_id, old.control_id, 'control_unlinked', v_name);
    return old;
  end if;
end $$;
drop trigger if exists log_control_mapping on public.risk_control_mappings;
create trigger log_control_mapping after insert or delete on public.risk_control_mappings
for each row execute function public.trg_log_control_mapping();

-- Control edits + test logging fan out to every risk the control is mapped to
create or replace function public.trg_log_control_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; v_label text;
begin
  v_label := coalesce(new.control_id || ' — ', '') || new.name;
  for m in select risk_id, org_id from risk_control_mappings where control_id = new.id loop
    if old.effectiveness is distinct from new.effectiveness then
      perform log_risk_activity(m.org_id, m.risk_id, new.id, 'control_updated',
        v_label || ': effectiveness ' || coalesce(old.effectiveness::text,'—') || ' → ' || coalesce(new.effectiveness::text,'—'));
    elsif old.testing_status is distinct from new.testing_status then
      perform log_risk_activity(m.org_id, m.risk_id, new.id, 'control_updated',
        v_label || ': testing status → ' || coalesce(new.testing_status,'—'));
    elsif old.name is distinct from new.name or old.description is distinct from new.description
       or old.control_type is distinct from new.control_type or old.control_frequency is distinct from new.control_frequency
       or old.status is distinct from new.status then
      perform log_risk_activity(m.org_id, m.risk_id, new.id, 'control_updated', v_label || ' edited');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists log_control_change on public.risk_controls;
create trigger log_control_change after update on public.risk_controls
for each row execute function public.trg_log_control_change();

create or replace function public.trg_log_control_test() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; v_name text;
begin
  select coalesce(control_id || ' — ', '') || name into v_name from risk_controls where id = new.control_id;
  for m in select risk_id, org_id from risk_control_mappings where control_id = new.control_id loop
    perform log_risk_activity(m.org_id, m.risk_id, new.control_id, 'control_tested',
      v_name || ': ' || new.test_type || ' test — ' || new.result || coalesce(' (effectiveness ' || new.effectiveness || '/5)', ''));
  end loop;
  return new;
end $$;
drop trigger if exists log_control_test on public.risk_control_tests;
create trigger log_control_test after insert on public.risk_control_tests
for each row execute function public.trg_log_control_test();

-- ── Evidence ──────────────────────────────────────────────────────────────
create or replace function public.trg_log_evidence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_risk_activity(new.org_id, new.risk_id, new.control_id, 'evidence_added',
      new.title || ' (' || coalesce(new.evidence_type,'Document') || ')' || coalesce(' — file: ' || new.file_name, ''));
    return new;
  elsif tg_op = 'UPDATE' then
    if old.is_approved is distinct from new.is_approved and new.is_approved then
      perform log_risk_activity(new.org_id, new.risk_id, new.control_id, 'evidence_approved', new.title);
    end if;
    return new;
  else
    perform log_risk_activity(old.org_id, old.risk_id, old.control_id, 'evidence_removed', old.title);
    return old;
  end if;
end $$;
drop trigger if exists log_evidence on public.risk_evidence;
create trigger log_evidence after insert or update or delete on public.risk_evidence
for each row execute function public.trg_log_evidence();

-- ── KRIs ──────────────────────────────────────────────────────────────────
create or replace function public.trg_log_kri() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_risk_activity(new.org_id, new.risk_id, null, 'kri_added', coalesce(new.kri_id || ' — ', '') || new.name);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.current_value is distinct from new.current_value or old.rag_status is distinct from new.rag_status then
      perform log_risk_activity(new.org_id, new.risk_id, null, 'kri_updated',
        coalesce(new.kri_id || ' — ', '') || new.name || ': value ' || coalesce(old.current_value::text,'—') || ' → ' || coalesce(new.current_value::text,'—')
        || case when old.rag_status is distinct from new.rag_status then ' (' || coalesce(new.rag_status,'—') || ')' else '' end);
    end if;
    return new;
  else
    perform log_risk_activity(old.org_id, old.risk_id, null, 'kri_removed', coalesce(old.kri_id || ' — ', '') || old.name);
    return old;
  end if;
end $$;
drop trigger if exists log_kri on public.risk_kris;
create trigger log_kri after insert or update or delete on public.risk_kris
for each row execute function public.trg_log_kri();

-- ── Loss events ───────────────────────────────────────────────────────────
create or replace function public.trg_log_loss_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_risk_activity(new.org_id, new.risk_id, null, 'loss_event_added',
      coalesce(new.event_id || ' — ', '') || new.title || coalesce(' (' || new.currency || ' ' || new.gross_loss || ' gross)', ''));
    return new;
  else
    perform log_risk_activity(old.org_id, old.risk_id, null, 'loss_event_removed', coalesce(old.event_id || ' — ', '') || old.title);
    return old;
  end if;
end $$;
drop trigger if exists log_loss_event on public.risk_loss_events;
create trigger log_loss_event after insert or delete on public.risk_loss_events
for each row execute function public.trg_log_loss_event();

-- ── Treatment actions + progress updates ─────────────────────────────────
create or replace function public.trg_log_treatment_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_risk_activity(new.org_id, new.risk_id, null, 'action_created',
      coalesce(new.action_ref || ' — ', '') || new.title || ' (' || new.action_type || ')');
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform log_risk_activity(new.org_id, new.risk_id, null, 'action_updated',
        coalesce(new.action_ref || ' — ', '') || new.title || ': ' || replace(old.status,'_',' ') || ' → ' || replace(new.status,'_',' '));
    end if;
    return new;
  else
    perform log_risk_activity(old.org_id, old.risk_id, null, 'action_removed', coalesce(old.action_ref || ' — ', '') || old.title);
    return old;
  end if;
end $$;
drop trigger if exists log_treatment_action on public.risk_treatment_actions;
create trigger log_treatment_action after insert or update or delete on public.risk_treatment_actions
for each row execute function public.trg_log_treatment_action();

create or replace function public.trg_log_treatment_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_risk uuid; v_title text;
begin
  select risk_id, coalesce(action_ref || ' — ', '') || title into v_risk, v_title
  from risk_treatment_actions where id = new.action_id;
  perform log_risk_activity(new.org_id, v_risk, null, 'action_progress',
    v_title || ': ' || new.percent_complete || '% complete' || coalesce(' — "' || nullif(new.comment,'') || '"', ''));
  return new;
end $$;
drop trigger if exists log_treatment_update on public.risk_treatment_updates;
create trigger log_treatment_update after insert on public.risk_treatment_updates
for each row execute function public.trg_log_treatment_update();

-- ── Exceptions ────────────────────────────────────────────────────────────
create or replace function public.trg_log_exception() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_risk_activity(new.org_id, new.risk_id, null, 'exception_requested',
      coalesce(new.exception_ref || ' — ', '') || 'risk acceptance requested' || coalesce(', expires ' || to_char(new.expires_at, 'DD Mon YYYY'), ''));
  elsif old.status is distinct from new.status then
    perform log_risk_activity(new.org_id, new.risk_id, null, 'exception_' || new.status,
      coalesce(new.exception_ref || ' — ', '') || 'exception ' || new.status || coalesce(': "' || nullif(new.decision_comment,'') || '"', ''));
  end if;
  return new;
end $$;
drop trigger if exists log_exception on public.risk_exceptions;
create trigger log_exception after insert or update on public.risk_exceptions
for each row execute function public.trg_log_exception();

-- ── Periodic reviews ──────────────────────────────────────────────────────
create or replace function public.trg_log_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_risk_activity(new.org_id, new.risk_id, null, 'review_completed',
    'Outcome: ' || replace(new.outcome,'_',' ') || coalesce(', next review ' || to_char(new.next_review_date, 'DD Mon YYYY'), ''));
  return new;
end $$;
drop trigger if exists log_review on public.risk_reviews;
create trigger log_review after insert on public.risk_reviews
for each row execute function public.trg_log_review();

-- ── Comments ──────────────────────────────────────────────────────────────
create or replace function public.trg_log_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_risk_activity(new.org_id, new.risk_id, null, 'comment_added',
    left(new.content, 120) || case when length(new.content) > 120 then '…' else '' end);
  return new;
end $$;
drop trigger if exists log_comment on public.risk_comments;
create trigger log_comment after insert on public.risk_comments
for each row execute function public.trg_log_comment();;
