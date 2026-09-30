# 30 September 2026 (second batch) — email notifications, Arabic backlog

## Database — already applied

| Version | Name | What it does |
|---|---|---|
| 20260930002301 | notification_email_outbox | `notification_email_prefs` (one switch per person per workspace; no row = on), `notification_email_queue` (outbox, service role only), trigger on `notifications` that queues a copy, `claim_notification_emails()`, `dispatch_notification_emails()` and the pg_cron job `risys-notification-emails` (every 2 minutes) |

Do not run it again with `db push`.

## How email notifications work

1. Anything that creates a notification (review reminders, risk workflow,
   tasks, audit requests and findings) also queues an email, unless the person
   has turned email off.
2. Every 2 minutes pg_cron checks the queue. If something is waiting it calls
   `send-email` with the internal scheduler secret (same Vault secrets as the
   connector scan dispatcher).
3. `send-email` groups the waiting items per person into **one** message, so
   24 review reminders on the same morning arrive as one email, not 24.
4. Not emailed: notifications already read in the app, anything older than 24
   hours, people no longer in the workspace, suspended workspaces, and anyone
   who has had 20 notification emails in the last hour (they still see it in
   the app). Failures are retried up to 3 times.
5. Every email is recorded in `email_log`, visible to admins in
   Settings → Notifications.

**Security.** Recipient and content come only from the notification row; the
browser never names either. Everything is HTML-escaped, and the only link in
the email is an in-app path on `APP_URL`. Note: any workspace member can create
a notification for a colleague (existing `notif_insert_org` policy), so a
member could put their own wording in an email to a colleague in the same
workspace. It cannot link outside RISYS or reach anyone outside the
workspace. Tightening that policy is a separate change.

Emails are English only for now.

## To do by hand

**Deploy `send-email`** — until you do, queued emails wait (nothing is lost;
anything older than 24 hours when the new function first runs is skipped):

    supabase functions deploy send-email

## Front end

- `src/components/layout/Topbar.jsx` — "Email me these notifications" switch at
  the bottom of the notification bell (everyone, not just admins).
- `src/features/settings/NotificationSettings.jsx` — replaces the "coming soon"
  placeholder: the same switch, plus the last 50 emails sent from the
  workspace with their result.
- `src/hooks/useRisks.js` — `useEmailPreference()`.

## Arabic

`src/locales/ar.json` — the 466 missing strings translated (audit module
forms, control form, reports, incidents, invitations, tasks, settings, and the
new email screens). `npm run check:i18n` reports 2571 / 2571 (100%).

The checker only sees literal `tx('…')` strings. Text built at runtime
(values from the database, statuses passed through `labelFor`) and English
typed directly into JSX without `tx()` are not counted, so a few English
fragments may still appear in Arabic mode.
