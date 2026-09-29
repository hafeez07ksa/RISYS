-- ── Outbound email log ──────────────────────────────────────────────────────
-- Every message RISYS sends is recorded here: what was sent, to whom, by whom,
-- and what the provider said. Three reasons this exists rather than trusting
-- the provider's dashboard:
--   * an admin asking "did the invite go out?" must be answerable inside RISYS;
--   * invitations carry an activation link, so "sent at 14:02 to this address"
--     is part of the access-control trail an auditor will ask for;
--   * it is the record that stops a resend loop hammering the same address.
-- The message body is deliberately NOT stored: invitation mail contains a
-- single-use credential, and keeping a copy would turn this table into one.
create table if not exists email_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete cascade,
  template     text not null,
  to_email     text not null,
  subject      text,
  status       text not null default 'sent' check (status in ('sent', 'failed')),
  provider     text not null default 'resend',
  provider_id  text,
  error        text,
  invitation_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists email_log_org_idx      on email_log (org_id, created_at desc);
create index if not exists email_log_to_idx       on email_log (lower(to_email), created_at desc);
create index if not exists email_log_template_idx on email_log (template, created_at desc);

alter table email_log enable row level security;

-- Workspace admins see their own organisation's mail; platform staff see all.
drop policy if exists email_log_read on email_log;
create policy email_log_read on email_log
  for select using (
    is_platform_admin()
    or exists (
      select 1 from organization_members m
      where m.org_id = email_log.org_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'owner')
    )
  );

-- Rows are written only by the send-email function (service role). No insert,
-- update or delete policy exists, so the log cannot be edited from a client.

comment on table email_log is 'Record of outbound email. Bodies are never stored: invitation mail carries a single-use activation link.';
