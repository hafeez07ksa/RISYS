# Database changes applied on 30 September 2026 — periodic review machinery

This migration is already applied to the RISYS project (`cfyjfmlhquyxgwrekswe`)
and is in `supabase/migrations/` under the version Supabase recorded. Do not
run it again with `db push`.

| Version | Name | What it does |
|---|---|---|
| 20260929235216 | periodic_review_schedule_and_reminders | `periodic_review_requirements` (the 24 ECC controls that are themselves a periodic review), `v_review_schedule` (security_invoker: owner, cycle, last reviewed, next due and state for each, plus every other requirement with a review date on record), `review_reminders` (one row per reminder sent), `send_review_reminders()` and the pg_cron job `risys-review-reminders` (daily 05:00 UTC = 08:00 Riyadh) |

## How it works

- **Where the dates come from.** Nothing new to fill in. A review is recorded
  as evidence on its control, as before: the form already asks for the owner,
  the frequency, the date of the review and the next review date.
  `v_review_schedule` reads the latest evidence and `compliance_statuses`.
- **States** (dates judged in Asia/Riyadh): `overdue` · `due_soon` (≤ 30 days) ·
  `scheduled` · `unscheduled` (evidence but no next date) · `never_reviewed`.
- **Reminders** go to the owner on record if they are still a member,
  otherwise to everyone who can record compliance (admin, owner, risk manager,
  compliance officer). Three stages per due date — 30 days, 7 days, overdue —
  each sent once; a run that finds an item already overdue sends only the
  overdue reminder. Recording the next review sets a new date and re-arms them.
  They appear in the in-app notification bell (type `workflow`); email is part
  of the "email beyond invites" backlog item.
- **Lapse is unchanged:** a compliant control still counts as Partial once its
  review date passes, in the app and in reports.

Tested in a rolled-back transaction: a review due in 4 days and one 11 days
overdue each produced one notification with the right link; a second run sent
nothing.

## Keep in step

The catalogue mirrors the review-cycle definitions in
`src/data/eccEvidenceRequirements.js` (`reviewCycle`) and
`src/data/eccManualRequirements.js` (1-6-4, 2-14-4). Adding a review control
there means adding its row to `periodic_review_requirements`.

1-8-1 and 2-2-4 also say "periodically reviewed" but are classified automated
in RISYS (measured by signals with interim evidence), so they are not in the
calendar.

## Front end

- `src/features/compliance/ReviewCalendarPage.jsx` — new page at
  `/app/compliance/reviews`: overdue / due in 30 days / not yet reviewed /
  scheduled, with owner, cycle, last and next review. A row opens the control.
- `src/features/compliance/CompliancePage.jsx` — a one-line "Review calendar"
  entry above the frameworks with what needs attention.
- `src/hooks/useCompliance.js` — `useReviewSchedule`, `summariseReviews`,
  `sortReviewRows`, `REVIEW_STATES`.
- `src/router/routes.jsx`, `src/components/layout/Topbar.jsx` — route and
  breadcrumb.
- `src/locales/ar.json` — the new strings and the 24 review titles.

## To do by hand

Nothing. No edge function changed.
