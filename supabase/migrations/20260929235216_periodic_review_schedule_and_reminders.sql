-- ── Periodic review machinery ────────────────────────────────────────────────
--
-- ECC asks for 24 things to be "periodically reviewed" (the X-Y-4 controls and
-- their governance equivalents). RISYS already captured each review as
-- evidence with a next review date, and a compliant control lapsed to Partial
-- in the browser once that date passed. What was missing:
--
--   • a catalogue of which requirements ARE periodic reviews, so a control that
--     has never been reviewed shows up as a gap instead of being invisible;
--   • one place that answers "what is due, what is overdue, who owns it" —
--     v_review_schedule;
--   • reminders before the date, not a lapse after it — send_review_reminders(),
--     run daily by pg_cron at 08:00 Riyadh time.
--
-- The schedule also lists every other requirement with a next review date on
-- record (approved documents, attestations), so nothing with a date is missed.
-- Dates are judged in Asia/Riyadh.

-- ── Catalogue ────────────────────────────────────────────────────────────────
create table if not exists public.periodic_review_requirements (
  framework       text not null,
  requirement_id  text not null,
  title           text not null,
  default_months  int  not null default 12 check (default_months in (1, 3, 6, 12)),
  primary key (framework, requirement_id)
);

comment on table public.periodic_review_requirements is
  'Requirements that are themselves a periodic review. Mirrors the review-cycle definitions in src/data/eccEvidenceRequirements.js and eccManualRequirements.js.';

insert into public.periodic_review_requirements (framework, requirement_id, title) values
  ('NCA ECC', '1-1-3',  'Strategy reviewed at planned intervals'),
  ('NCA ECC', '1-3-4',  'Policies reviewed and updated at planned intervals'),
  ('NCA ECC', '1-4-2',  'Roles reviewed and updated at planned intervals'),
  ('NCA ECC', '1-5-4',  'Risk methodology reviewed and updated'),
  ('NCA ECC', '1-6-4',  'Project cybersecurity requirements periodically reviewed'),
  ('NCA ECC', '1-9-6',  'Personnel requirements periodically reviewed'),
  ('NCA ECC', '1-10-5', 'Awareness implementation periodically reviewed'),
  ('NCA ECC', '2-1-6',  'Asset requirements periodically reviewed'),
  ('NCA ECC', '2-3-4',  'System protection implementation reviewed'),
  ('NCA ECC', '2-4-4',  'Email protection implementation reviewed'),
  ('NCA ECC', '2-5-4',  'Network implementation periodically reviewed'),
  ('NCA ECC', '2-6-4',  'Mobile implementation periodically reviewed'),
  ('NCA ECC', '2-7-3',  'Data protection implementation reviewed'),
  ('NCA ECC', '2-8-4',  'Cryptography implementation reviewed'),
  ('NCA ECC', '2-9-4',  'Backup implementation periodically reviewed'),
  ('NCA ECC', '2-10-4', 'Vulnerability implementation reviewed'),
  ('NCA ECC', '2-11-4', 'Penetration testing implementation reviewed'),
  ('NCA ECC', '2-12-4', 'Logging implementation periodically reviewed'),
  ('NCA ECC', '2-13-4', 'Incident implementation periodically reviewed'),
  ('NCA ECC', '2-14-4', 'Physical security requirements periodically reviewed'),
  ('NCA ECC', '2-15-4', 'Web application requirements reviewed'),
  ('NCA ECC', '3-1-4',  'BCM requirements periodically reviewed'),
  ('NCA ECC', '4-1-4',  'Third-party requirements periodically reviewed'),
  ('NCA ECC', '4-2-4',  'Cloud requirements periodically reviewed')
on conflict (framework, requirement_id) do update set title = excluded.title;

alter table public.periodic_review_requirements enable row level security;
drop policy if exists "anyone signed in can read the review catalogue" on public.periodic_review_requirements;
create policy "anyone signed in can read the review catalogue" on public.periodic_review_requirements
  for select to authenticated using (true);
revoke all on public.periodic_review_requirements from anon, authenticated;
grant select on public.periodic_review_requirements to authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────
create or replace view public.v_review_schedule
with (security_invoker = true) as
with today as (
  select (now() at time zone 'Asia/Riyadh')::date as d
),
ev as (
  select distinct on (org_id, framework, requirement_id)
         org_id, framework, requirement_id, answers, next_review_date, submitted_at, submitted_by
    from public.compliance_evidence
   order by org_id, framework, requirement_id, submitted_at desc
),
dated as (
  select org_id, framework, requirement_id from public.compliance_statuses where review_due_at is not null
  union
  select org_id, framework, requirement_id from ev where next_review_date is not null
),
scope as (
  select o.id as org_id, p.framework, p.requirement_id, p.title, p.default_months, true as is_review_control
    from public.organizations o
   cross join public.periodic_review_requirements p
  union all
  select d.org_id, d.framework, d.requirement_id, null, null, false
    from dated d
   where not exists (select 1 from public.periodic_review_requirements p
                      where p.framework = d.framework and p.requirement_id = d.requirement_id)
),
joined as (
  select s.*, cs.status, cs.review_due_at, ev.answers, ev.next_review_date, ev.submitted_at,
         coalesce(cs.review_due_at, ev.next_review_date) as due_date,
         case when (ev.answers ->> 'owner') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (ev.answers ->> 'owner')::uuid end as owner_candidate,
         (select max(x)::date from unnest(array[ev.answers ->> 'reviewed_on', ev.answers ->> 'review_date',
                                                ev.answers ->> 'approved_on']) as x
           where x ~ '^\d{4}-\d{2}-\d{2}$') as last_reviewed_on
    from scope s
    left join public.compliance_statuses cs
      on cs.org_id = s.org_id and cs.framework = s.framework and cs.requirement_id = s.requirement_id
    left join ev
      on ev.org_id = s.org_id and ev.framework = s.framework and ev.requirement_id = s.requirement_id
)
select
  j.org_id,
  j.framework,
  j.requirement_id,
  j.is_review_control,
  j.title,
  j.status,
  j.last_reviewed_on,
  nullif(j.answers ->> 'frequency', '')                                     as frequency,
  coalesce(case j.answers ->> 'frequency'
             when 'Monthly' then 1 when 'Quarterly' then 3
             when 'Semi-annual' then 6 when 'Annual' then 12 end,
           j.default_months)                                                as cycle_months,
  case when exists (select 1 from public.organization_members m
                     where m.org_id = j.org_id and m.user_id = j.owner_candidate)
       then j.owner_candidate end                                           as owner_id,
  j.due_date,
  j.due_date - t.d                                                          as days_until_due,
  case
    when j.due_date is null and j.submitted_at is null then 'never_reviewed'
    when j.due_date is null                            then 'unscheduled'
    when j.due_date < t.d                              then 'overdue'
    when j.due_date <= t.d + 30                        then 'due_soon'
    else 'scheduled'
  end                                                                       as state,
  j.submitted_at                                                            as last_submitted_at
from joined j cross join today t;

grant select on public.v_review_schedule to authenticated;
revoke all on public.v_review_schedule from anon;

-- ── Reminders ────────────────────────────────────────────────────────────────
-- One row per reminder sent, so each stage goes out once per due date. A new
-- review sets a new due date and re-arms the reminders.
create table if not exists public.review_reminders (
  org_id          uuid not null references public.organizations(id) on delete cascade,
  framework       text not null,
  requirement_id  text not null,
  due_date        date not null,
  stage           text not null check (stage in ('due_30', 'due_7', 'overdue')),
  recipients      int  not null default 0,
  sent_at         timestamptz not null default now(),
  primary key (org_id, framework, requirement_id, due_date, stage)
);

alter table public.review_reminders enable row level security;
drop policy if exists "org members can read review reminders" on public.review_reminders;
create policy "org members can read review reminders" on public.review_reminders
  for select to authenticated using (is_org_member(org_id));
drop policy if exists tenant_active_guard on public.review_reminders;
create policy tenant_active_guard on public.review_reminders
  as restrictive for all
  using ((org_id is null) or is_org_active(org_id))
  with check ((org_id is null) or is_org_active(org_id));
revoke all on public.review_reminders from anon, authenticated;
grant select on public.review_reminders to authenticated;

create or replace function public.send_review_reminders()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r          record;
  v_stage    text;
  v_rank     int;
  v_title    text;
  v_body     text;
  v_link     text;
  v_n        int;
  v_sent     int := 0;
  v_notes    int := 0;
begin
  for r in
    select s.*
      from v_review_schedule s
      join organizations o on o.id = s.org_id and o.status = 'active'
     where s.days_until_due is not null and s.days_until_due <= 30
  loop
    v_stage := case when r.days_until_due < 0 then 'overdue'
                    when r.days_until_due <= 7 then 'due_7'
                    else 'due_30' end;
    v_rank  := case v_stage when 'overdue' then 3 when 'due_7' then 2 else 1 end;

    -- Already told them this, or something more urgent, for this due date.
    continue when exists (
      select 1 from review_reminders x
       where x.org_id = r.org_id and x.framework = r.framework and x.requirement_id = r.requirement_id
         and x.due_date = r.due_date
         and (case x.stage when 'overdue' then 3 when 'due_7' then 2 else 1 end) >= v_rank);

    v_title := case v_stage
      when 'overdue' then format('Review overdue: %s', r.requirement_id)
      else format('Review due in %s days: %s', r.days_until_due, r.requirement_id) end;
    v_body := coalesce(r.title, 'Evidence review') || '. '
      || case v_stage
           when 'overdue' then format('It was due on %s', to_char(r.due_date, 'DD Mon YYYY'))
                               || case when r.status = 'compliant'
                                       then '; the control now counts as Partial until the review is recorded.'
                                       else '.' end
           else format('Due on %s. Record the review with its evidence before then.', to_char(r.due_date, 'DD Mon YYYY'))
         end;
    v_link := '/app/compliance/' || replace(r.framework, ' ', '%20') || '/' || r.requirement_id;

    -- The owner on record; otherwise everyone who can record compliance.
    insert into notifications (org_id, user_id, type, title, body, link)
    select r.org_id, m.user_id, 'workflow', v_title, v_body, v_link
      from organization_members m
     where m.org_id = r.org_id
       and case when r.owner_id is not null then m.user_id = r.owner_id
                else m.role in ('admin', 'owner', 'risk_manager', 'compliance_officer') end;
    get diagnostics v_n = row_count;

    insert into review_reminders (org_id, framework, requirement_id, due_date, stage, recipients)
    values (r.org_id, r.framework, r.requirement_id, r.due_date, v_stage, v_n)
    on conflict do nothing;

    v_sent  := v_sent + 1;
    v_notes := v_notes + v_n;
  end loop;

  return jsonb_build_object('reminders', v_sent, 'notifications', v_notes, 'ran_at', now());
end $$;

revoke execute on function public.send_review_reminders() from public, anon, authenticated;
grant  execute on function public.send_review_reminders() to service_role;

-- Daily at 05:00 UTC = 08:00 Riyadh.
select cron.unschedule(jobid) from cron.job where jobname = 'risys-review-reminders';
select cron.schedule('risys-review-reminders', '0 5 * * *', $cron$ select public.send_review_reminders() $cron$);
