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

// ── Email layout ──────────────────────────────────────────────────────────────
//
// One layout for everything RISYS sends. Table-based, inline styles only,
// 600px — the shape Outlook, Gmail and Apple Mail all render the same. The only
// image is the RISYS mark, served from APP_URL; when a client blocks images the
// wordmark beside it still reads "RISYS", so nothing depends on it loading.
// No tracking pixel and no other remote content.

const LOGO_URL = `${APP_URL}/email/risys-mark-light.png`
const C = {
  page: '#f3eeed', card: '#ffffff', ink: '#1f1718', text: '#3d3233', muted: '#8b7b79',
  line: '#ece3e1', band: '#1f1718', crimson: '#5d0f0f', rose: '#f6ecea',
}
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const SERIF = `Georgia,'Times New Roman',serif`

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border-radius:8px;background:${C.crimson};">
      <a href="${escape(href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escape(label)}</a>
    </td></tr></table>`
}

function layout(opts: { preheader: string; orgName: string; body: string; footer: string }) {
  const { preheader, orgName, body, footer } = opts
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>RISYS</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <!-- Header band -->
        <tr><td style="background:${C.band};border-radius:14px 14px 0 0;padding:20px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" style="padding-right:12px;">
                  <img src="${LOGO_URL}" width="28" height="29" alt="" style="display:block;border:0;outline:none;width:28px;height:29px;">
                </td>
                <td valign="middle" style="font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:0.22em;color:#f6eeec;">RISYS</td>
              </tr></table>
            </td>
            <td valign="middle" align="right" style="font-family:${FONT};font-size:12px;color:#b9a9a6;">${escape(orgName)}</td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:${C.card};border-left:1px solid ${C.line};border-right:1px solid ${C.line};padding:32px 28px 28px;">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:${C.card};border:1px solid ${C.line};border-top:1px solid ${C.line};border-radius:0 0 14px 14px;padding:18px 28px 22px;">
          <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.65;color:${C.muted};">${footer}</p>
        </td></tr>

        <tr><td align="center" style="padding:18px 8px 0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${C.muted};">
          RISYS &middot; Governance, risk and compliance &middot; <a href="${escape(APP_URL)}" style="color:${C.muted};text-decoration:underline;">${escape(APP_URL.replace(/^https?:\/\//, ''))}</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function invitationEmail(opts: {
  orgName: string; inviterName: string; link: string; role: string; expiresAt: string;
}) {
  const { orgName, inviterName, link, role, expiresAt } = opts
  const expires = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const roleLabel = role === 'admin' ? 'an administrator' : `a ${role.replace(/_/g, ' ')}`

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

  const body = `
    <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.crimson};">Invitation</p>
    <h1 style="margin:0 0 14px;font-family:${SERIF};font-size:24px;font-weight:400;line-height:1.3;color:${C.ink};">
      ${escape(inviterName)} has invited you to ${escape(orgName)}
    </h1>
    <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text};">
      You have been added as ${escape(roleLabel)}. Set your own password to sign in — nobody else, including the person who invited you, ever sees it.
    </p>
    ${button(link, 'Accept invitation')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
      <tr><td style="background:${C.rose};border-radius:10px;padding:14px 16px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.text};">
        The link works once and expires on <strong>${escape(expires)}</strong>. If the button does not work, copy this address into your browser:<br>
        <span style="word-break:break-all;color:${C.crimson};">${escape(link)}</span>
      </td></tr>
    </table>`

  const footer = `RISYS is the governance, risk and compliance platform used by ${escape(orgName)}. If you were not expecting this invitation you can ignore this message — the link is tied to your email address and does nothing until it is opened.`

  return { subject, html: layout({ preheader: `Join ${orgName} on RISYS — the link expires on ${expires}.`, orgName, body, footer }), text }
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

// What kind of record a notification points at, from its in-app link.
function kindOf(link: string | null): string {
  const l = String(link ?? '')
  if (l.startsWith('/app/tasks')) return 'Task'
  if (l.startsWith('/app/risks')) return 'Risk'
  if (l.startsWith('/app/audits')) return 'Audit'
  if (l.startsWith('/app/compliance')) return 'Compliance'
  if (l.startsWith('/app/incidents')) return 'Incident'
  if (l.startsWith('/app/findings')) return 'Finding'
  return 'Update'
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

  const pill = (n: Note) =>
    `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${C.rose};font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.04em;color:${C.crimson};">${escape(kindOf(n.link))}</span>`

  let body: string
  if (single) {
    const n = notes[0]
    body = `
      <p style="margin:0 0 14px;">${pill(n)}</p>
      <h1 style="margin:0 0 12px;font-family:${SERIF};font-size:23px;font-weight:400;line-height:1.3;color:${C.ink};">${escape(n.title)}</h1>
      ${n.body ? `<p style="margin:0 0 26px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text};">${escape(n.body)}</p>` : '<div style="height:14px;"></div>'}
      ${button(appLink(n.link), 'Open in RISYS')}`
  } else {
    const rows = shown.map((n, i) => `
      <tr><td style="padding:16px 0;${i ? `border-top:1px solid ${C.line};` : ''}">
        <p style="margin:0 0 8px;">${pill(n)}</p>
        <p style="margin:0 0 5px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.4;color:${C.ink};">${escape(n.title)}</p>
        ${n.body ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.text};">${escape(n.body)}</p>` : ''}
        <a href="${escape(appLink(n.link))}" style="font-family:${FONT};font-size:13px;font-weight:600;color:${C.crimson};text-decoration:none;">Open &rarr;</a>
      </td></tr>`).join('')
    body = `
      <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.crimson};">Your updates</p>
      <h1 style="margin:0 0 8px;font-family:${SERIF};font-size:23px;font-weight:400;line-height:1.3;color:${C.ink};">${notes.length} things need your attention</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${rows}</table>
      ${more > 0 ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13.5px;color:${C.text};">…and ${more} more waiting in RISYS.</p>` : ''}
      <div style="height:22px;"></div>
      ${button(`${APP_URL}/app`, 'Open RISYS')}`
  }

  const footer = `You receive this because you are a member of <strong style="color:${C.text};font-weight:600;">${escape(orgName)}</strong> on RISYS. To stop these emails, open the notification bell in RISYS and turn off &ldquo;Email me these notifications&rdquo;.`
  const preheader = single ? (notes[0].body || notes[0].title) : notes.slice(0, 3).map(n => n.title).join(' · ')

  return { subject, html: layout({ preheader, orgName, body, footer }), text }
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
