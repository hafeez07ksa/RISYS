-- ── Task notifications and reminders, from the database ──────────────────────
--
-- Before: the browser notified an assignee only when the task was created for
-- someone else, reassigning notified nobody, and the Reminder field on a task
-- was stored but never acted on.
--
-- Now, all in the database so it cannot be skipped by a client:
--   • Creating a task notifies the assignee — including yourself, as a record
--     in your bell and mailbox of what you took on.
--   • Reassigning a task notifies the new assignee.
--   • At the reminder time, the assignee is reminded (send_task_reminders,
--     every minute). Changing the reminder time re-arms it; done and
--     cancelled tasks are never reminded.
-- Each of these reaches email through the notification outbox.

alter table public.tasks add column if not exists reminded_at timestamptz;

-- Reminders already in the past when this ships are not sent retroactively.
update public.tasks set reminded_at = now()
 where reminder_at is not null and reminder_at <= now() and reminded_at is null;

create or replace function public.task_due_text(p_due timestamptz)
returns text language sql stable set search_path to 'public' as $$
  select case when p_due is null then ''
              else ', due ' || to_char(p_due at time zone 'Asia/Riyadh', 'DD Mon YYYY HH24:MI') end;
$$;

create or replace function public.trg_task_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_name  text;
  v_self  boolean;
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if new.status in ('done', 'cancelled') then return new; end if;

  v_self := new.assigned_to = v_actor;
  select coalesce(nullif(full_name, ''), email, 'A colleague') into v_name from profiles where id = v_actor;

  insert into notifications (org_id, user_id, type, title, body, link)
  values (
    new.org_id, new.assigned_to, 'workflow',
    case when v_self then 'Task on your list: ' || new.title
         else 'Task assigned: ' || new.title end,
    case when v_self
         then format('A record of the task you took on. %s priority%s.', initcap(coalesce(new.priority, 'medium')), task_due_text(new.due_at))
         else format('%s assigned you this %s-priority task%s.', coalesce(v_name, 'A colleague'), coalesce(new.priority, 'medium'), task_due_text(new.due_at)) end
      || case when new.reminder_at is not null and new.reminder_at > now()
              then ' You will be reminded on ' || to_char(new.reminder_at at time zone 'Asia/Riyadh', 'DD Mon YYYY HH24:MI') || '.'
              else '' end,
    '/app/tasks/' || new.id);
  return new;
exception when others then
  -- A notification must never stop the task being saved.
  raise warning 'task notification failed for %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists task_notify on public.tasks;
create trigger task_notify
  after insert or update of assigned_to on public.tasks
  for each row execute function public.trg_task_notify();

-- A new reminder time re-arms the reminder.
create or replace function public.trg_task_rearm_reminder()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.reminder_at is distinct from old.reminder_at then new.reminded_at := null; end if;
  return new;
end $$;

drop trigger if exists task_rearm_reminder on public.tasks;
create trigger task_rearm_reminder
  before update of reminder_at on public.tasks
  for each row execute function public.trg_task_rearm_reminder();

revoke execute on function public.trg_task_notify() from public, anon, authenticated;
revoke execute on function public.trg_task_rearm_reminder() from public, anon, authenticated;

create or replace function public.send_task_reminders()
returns int language plpgsql security definer set search_path to 'public' as $$
declare r record; v_n int := 0;
begin
  for r in
    update tasks t
       set reminded_at = now()
      from organizations o
     where o.id = t.org_id and o.status = 'active'
       and t.reminder_at is not null and t.reminder_at <= now()
       and t.reminded_at is null
       and t.assigned_to is not null
       and coalesce(t.status, 'todo') not in ('done', 'cancelled')
    returning t.*
  loop
    insert into notifications (org_id, user_id, type, title, body, link)
    values (r.org_id, r.assigned_to, 'workflow',
            'Reminder: ' || r.title,
            case when r.due_at is null then 'This task is still open.'
                 when r.due_at < now() then 'This task is past its due date' || replace(task_due_text(r.due_at), ', due', ' of') || '.'
                 else 'This task is still open' || task_due_text(r.due_at) || '.' end,
            '/app/tasks/' || r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public.send_task_reminders() from public, anon, authenticated;
grant  execute on function public.send_task_reminders() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'risys-task-reminders';
select cron.schedule('risys-task-reminders', '* * * * *', $cron$ select public.send_task_reminders() $cron$);
