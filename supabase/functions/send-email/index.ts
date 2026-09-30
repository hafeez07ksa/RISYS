// ── send-email ───────────────────────────────────────────────────────────────
// Sends the transactional mail RISYS owns:
//   • invitation   — called by a workspace admin from the browser;
//   • notifications — called every two minutes by pg_cron (via pg_net) with the
//     internal scheduler secret; sends the queued copies of in-app
//     notifications (see dispatch_notification_emails()).
//
// The important design decision is that this function takes an *invitation id*,
// never a recipient or a message body. It re-reads the invitation server-side
// and checks that the caller administers that organisation. If the browser
// could name the recipient and the text, any signed-in user would have a mail
// relay that sends from risysgrc.com with our DKIM signature on it — which is
// exactly the thing SPF and DKIM exist to prevent.
//
// The activation link is rebuilt here from the stored token, so the link that
// is emailed cannot be substituted by the caller either.
//
// Secrets: RESEND_API_KEY. Optional: MAIL_FROM, MAIL_REPLY_TO, APP_URL.

import {
  json, errorResponse, adminClient, serveWithCors, requireOrgRole, isUuid, isInternalCall,
} from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM     = Deno.env.get('MAIL_FROM')     ?? 'RISYS <no-reply@risysgrc.com>'
const MAIL_REPLY_TO = Deno.env.get('MAIL_REPLY_TO') ?? 'support@risysgrc.com'
const APP_URL       = (Deno.env.get('APP_URL') ?? 'https://app.risysgrc.com').replace(/\/+$/, '')

// Resend is behind this one function so swapping provider (to SES in a Gulf
// region, say) is a change here and an env var, not a change to the callers.
async function sendViaResend(to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM, to: [to], subject, html, text, reply_to: MAIL_REPLY_TO,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.message ?? body?.error?.message ?? `Provider returned ${res.status}`)
  }
  return body?.id as string | undefined
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Plain, single-column HTML. No images, no external CSS, no tracking pixel:
 * this lands in corporate mailboxes that strip most of that, and a message
 * about a security tool should not be loading remote content. */
function invitationEmail(opts: {
  orgName: string; inviterName: string; link: string; role: string; expiresAt: string;
}) {
  const { orgName, inviterName, link, role, expiresAt } = opts
  const expires = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const roleLabel = role === 'admin' ? 'an administrator' : `a ${role}`

  const subject = `${inviterName} has invited you to ${orgName} on RISYS`

  const text = [
    `${inviterName} has invited you to join ${orgName} on RISYS as ${roleLabel}.`,
    '',
    'Open this link to set your password and sign in:',
    link,
    '',
    `The link works once and expires on ${expires}.`,
    '',
    'RISYS is the governance, risk and compliance platform used by your organisation.',
    'If you were not expecting this invitation, you can ignore this message — the link is tied to your email address and does nothing until it is opened.',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f6eeec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#292021;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e9dad7;border-radius:12px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0 0 18px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#5D0F0F;">RISYS</p>
      <p style="margin:0 0 14px;font-size:17px;font-weight:600;line-height:1.4;">
        ${escape(inviterName)} has invited you to ${escape(orgName)}
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#4d3e3e;">
        You have been added as ${escape(roleLabel)}. Open the link below to set your own password and sign in.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escape(link)}" style="display:inline-block;padding:11px 20px;background:#5D0F0F;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="margin:0 0 20px;font-size:12.5px;line-height:1.6;color:#97817d;">
        The link works once and expires on ${escape(expires)}. If the button does not work, copy this address into your browser:<br>
        <span style="word-break:break-all;color:#4d3e3e;">${escape(link)}</span>
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid #e9dad7;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#97817d;">
        RISYS is the governance, risk and compliance platform used by your organisation.
        If you were not expecting this invitation you can ignore this message — the link is tied
        to your email address and does nothing until it is opened.
      </p>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}

// ── Notification copies ───────────────────────────────────────────────────────
//
// Recipient and content come only from the notification row. Anything the row
// holds is escaped, and the only link is an in-app path on APP_URL, so a
// notification cannot turn this function into a relay for arbitrary mail.

const MAX_PER_HOUR = 20          // per recipient; the rest stay in the app
const STALE_AFTER_MS = 24 * 3600_000
const MAX_ITEMS_SHOWN = 15

type Note = { id: string; org_id: string; user_id: string; type: string | null; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

function appLink(link: string | null): string {
  const l = String(link ?? '')
  return l.startsWith('/') && !l.startsWith('//') ? `${APP_URL}${l}` : `${APP_URL}/app`
}

function notificationEmail(orgName: string, notes: Note[]) {
  const single = notes.length === 1
  const shown = notes.slice(0, MAX_ITEMS_SHOWN)
  const more = notes.length - shown.length
  const subject = single
    ? `${notes[0].title} — ${orgName}`
    : `${notes.length} updates in ${orgName} on RISYS`

  const text = [
    single ? notes[0].title : `${notes.length} updates in ${orgName}:`,
    '',
    ...shown.flatMap(n => [
      ...(single ? [] : [`• ${n.title}`]),
      ...(n.body ? [single ? n.body : `  ${n.body}`] : []),
      `${single ? '' : '  '}${appLink(n.link)}`,
      '',
    ]),
    ...(more > 0 ? [`…and ${more} more in RISYS: ${APP_URL}/app`, ''] : []),
    `You receive these because you are a member of ${orgName} on RISYS.`,
    'To stop these emails, open the notification bell in RISYS and turn off "Email me".',
  ].join('\n')

  const item = (n: Note) => `
      <tr><td style="padding:14px 0;border-top:1px solid #efe3e1;">
        <p style="margin:0 0 4px;font-size:14.5px;font-weight:600;line-height:1.4;color:#292021;">${escape(n.title)}</p>
        ${n.body ? `<p style="margin:0 0 8px;font-size:13.5px;line-height:1.6;color:#4d3e3e;">${escape(n.body)}</p>` : ''}
        <a href="${escape(appLink(n.link))}" style="font-size:13px;font-weight:600;color:#5D0F0F;text-decoration:none;">Open in RISYS &rarr;</a>
      </td></tr>`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f6eeec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#292021;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;background:#ffffff;border:1px solid #e9dad7;border-radius:12px;">
    <tr><td style="padding:26px 28px 6px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#5D0F0F;">RISYS</p>
      <p style="margin:0 0 6px;font-size:12.5px;color:#97817d;">${escape(orgName)}</p>
      ${single ? '' : `<p style="margin:10px 0 4px;font-size:16px;font-weight:600;">${notes.length} updates for you</p>`}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${shown.map(item).join('')}
      </table>
      ${more > 0 ? `<p style="margin:6px 0 14px;font-size:13px;color:#4d3e3e;">…and ${more} more. <a href="${escape(APP_URL)}/app" style="color:#5D0F0F;">Open RISYS</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:14px 28px 22px;border-top:1px solid #e9dad7;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#97817d;">
        You receive these because you are a member of ${escape(orgName)} on RISYS.
        To stop them, open the notification bell in RISYS and turn off &ldquo;Email me&rdquo;.
      </p>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}

async function sendQueuedNotifications(admin: ReturnType<typeof adminClient>) {
  const { data: claimed, error: claimErr } = await admin.rpc('claim_notification_emails', { p_limit: 200 })
  if (claimErr) throw claimErr
  const rows = (claimed ?? []) as { id: number; notification_id: string; org_id: string; user_id: string; attempts: number }[]
  if (!rows.length) return { claimed: 0, emails: 0, sent: 0, skipped: 0, failed: 0 }

  const { data: notesData, error: notesErr } = await admin
    .from('notifications')
    .select('id, org_id, user_id, type, title, body, link, created_at, read_at')
    .in('id', rows.map(r => r.notification_id))
  if (notesErr) throw notesErr
  const noteById = new Map((notesData ?? []).map((n: Note) => [n.id, n]))

  const mark = async (ids: number[], patch: Record<string, unknown>) => {
    if (ids.length) await admin.from('notification_email_queue').update(patch).in('id', ids)
  }

  // One message per person per workspace per run.
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = `${r.org_id}:${r.user_id}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }

  let emails = 0, sent = 0, skipped = 0, failed = 0
  const now = Date.now()

  for (const group of groups.values()) {
    const { org_id, user_id } = group[0]

    // Already read in the app, or too old to be worth an email.
    const live = group.filter(r => {
      const n = noteById.get(r.notification_id)
      return n && !n.read_at && now - new Date(n.created_at).getTime() < STALE_AFTER_MS
    })
    const dropped = group.filter(r => !live.includes(r))
    await mark(dropped.map(r => r.id), { status: 'skipped', last_error: 'Read in the app or older than 24 hours' })
    skipped += dropped.length
    if (!live.length) continue

    const [{ data: org }, { data: member }, { data: profile }, { data: pref }] = await Promise.all([
      admin.from('organizations').select('name, status').eq('id', org_id).maybeSingle(),
      admin.from('organization_members').select('user_id').eq('org_id', org_id).eq('user_id', user_id).maybeSingle(),
      admin.from('profiles').select('email, deleted_at').eq('id', user_id).maybeSingle(),
      admin.from('notification_email_prefs').select('email_enabled').eq('org_id', org_id).eq('user_id', user_id).maybeSingle(),
    ])

    const reason =
      org?.status !== 'active' ? 'Workspace is not active'
      : !member ? 'No longer a member'
      : !profile?.email || profile.deleted_at ? 'No email address on record'
      : pref && pref.email_enabled === false ? 'Email turned off by the recipient'
      : null
    if (reason) {
      await mark(live.map(r => r.id), { status: 'skipped', last_error: reason })
      skipped += live.length
      continue
    }

    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('template', 'notification')
      .eq('status', 'sent')
      .ilike('to_email', profile!.email)
      .gte('created_at', new Date(now - 3600_000).toISOString())
    if ((count ?? 0) >= MAX_PER_HOUR) {
      await mark(live.map(r => r.id), { status: 'skipped', last_error: 'Hourly email limit reached; shown in the app' })
      skipped += live.length
      continue
    }

    const notes = live.map(r => noteById.get(r.notification_id)!)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const { subject, html, text } = notificationEmail(org!.name ?? 'your workspace', notes)
    emails++

    try {
      const providerId = await sendViaResend(profile!.email, subject, html, text)
      await admin.from('email_log').insert({
        org_id, template: 'notification', to_email: profile!.email, subject,
        status: 'sent', provider: 'resend', provider_id: providerId ?? null,
      })
      await mark(live.map(r => r.id), { status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      sent += live.length
    } catch (sendErr) {
      const message = (sendErr as Error).message.slice(0, 500)
      await admin.from('email_log').insert({
        org_id, template: 'notification', to_email: profile!.email, subject,
        status: 'failed', provider: 'resend', error: message,
      })
      // Back to the queue for the next run, until the third attempt.
      const retry = live.filter(r => r.attempts < 3)
      const giveUp = live.filter(r => r.attempts >= 3)
      await mark(retry.map(r => r.id), { status: 'pending', last_error: message })
      await mark(giveUp.map(r => r.id), { status: 'failed', last_error: message })
      failed += live.length
    }
  }

  return { claimed: rows.length, emails, sent, skipped, failed }
}

serveWithCors(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = adminClient()
  try {
    if (!RESEND_API_KEY) {
      return json({ error: 'Email is not configured on this deployment (RESEND_API_KEY is unset).' }, 503)
    }

    const body = await req.json().catch(() => ({}))
    const template = String(body?.template ?? 'invitation')

    // Scheduled: only the internal scheduler may ask for the queue to be sent.
    if (template === 'notifications') {
      if (!(await isInternalCall(req, admin))) return json({ error: 'Invalid internal credential' }, 401)
      return json({ ok: true, ...(await sendQueuedNotifications(admin)) })
    }

    const invitationId = body?.invitation_id

    if (template !== 'invitation') return json({ error: `Unknown template: ${template}` }, 400)
    if (!isUuid(invitationId)) return json({ error: 'invitation_id is required' }, 400)

    // Read the invitation first so the caller's rights are checked against the
    // organisation it actually belongs to, not one they supplied.
    const { data: inv, error: invErr } = await admin
      .from('org_invitations')
      .select('id, org_id, email, role, token, status, expires_at, invited_by')
      .eq('id', invitationId)
      .maybeSingle()

    if (invErr) throw invErr
    if (!inv) return json({ error: 'Invitation not found' }, 404)
    if (inv.status !== 'pending') return json({ error: 'That invitation is no longer pending' }, 409)
    if (new Date(inv.expires_at) <= new Date()) return json({ error: 'That invitation has expired' }, 409)

    // Workspace admins only, and only for their own organisation.
    const { user } = await requireOrgRole(req, admin, inv.org_id)

    const [{ data: org }, { data: inviter }] = await Promise.all([
      admin.from('organizations').select('name').eq('id', inv.org_id).maybeSingle(),
      admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
    ])

    // Don't re-send the same invitation within a minute: a double click should
    // not put two identical mails in someone's inbox.
    const { data: recent } = await admin
      .from('email_log')
      .select('id, created_at')
      .eq('invitation_id', inv.id)
      .eq('status', 'sent')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1)

    if (recent && recent.length) {
      return json({ ok: true, skipped: 'already_sent', message: 'That invitation was emailed moments ago.' })
    }

    const { subject, html, text } = invitationEmail({
      orgName: org?.name ?? 'your workspace',
      inviterName: inviter?.full_name || inviter?.email || 'A colleague',
      link: `${APP_URL}/invite/${inv.token}`,
      role: inv.role,
      expiresAt: inv.expires_at,
    })

    try {
      const providerId = await sendViaResend(inv.email, subject, html, text)
      await admin.from('email_log').insert({
        org_id: inv.org_id, template: 'invitation', to_email: inv.email, subject,
        status: 'sent', provider: 'resend', provider_id: providerId ?? null,
        invitation_id: inv.id, requested_by: user.id,
      })
      return json({ ok: true, provider_id: providerId ?? null })
    } catch (sendErr) {
      // A failed send is recorded too: the admin needs to know it did not go,
      // and the copy-link fallback in the UI is what they fall back to.
      const message = (sendErr as Error).message
      await admin.from('email_log').insert({
        org_id: inv.org_id, template: 'invitation', to_email: inv.email, subject,
        status: 'failed', provider: 'resend', error: message.slice(0, 500),
        invitation_id: inv.id, requested_by: user.id,
      })
      return json({ error: `The invitation could not be emailed: ${message}` }, 502)
    }
  } catch (err) {
    return errorResponse(err, 'send-email')
  }
})
