// m365-security — Microsoft 365 data-exposure findings for one organisation.
//
// Data sources (each reported separately in connector_scan_runs.sources):
//   forwarding  Mailbox forwarding and inbox rules that send mail outside the
//               organisation.  GET /users/{id}/mailboxSettings
//                              GET /users/{id}/mailFolders/inbox/messageRules
//               permissions: MailboxSettings.Read, Mail.Read (application)
//   guests      Guest accounts in the directory that nobody has reviewed.
//               GET /users?$filter=userType eq 'Guest'
//               permission: User.Read.All (Directory.Read.All also works)
//   consent     Third-party applications that hold high-risk permissions over
//               mail, files and the directory.
//               GET /oauth2PermissionGrants, GET /servicePrincipals
//               permission: Directory.Read.All
//   dns         SPF, DKIM and DMARC on the tenant's verified mail domains,
//               resolved over DNS-over-HTTPS. No Microsoft permission needed
//               beyond reading the domain list.
//
// Callers: an org admin (manual scan) or the scan dispatcher (scheduled).
//
// Findings are never deleted. A finding whose source completed this scan and
// which was not reported again is resolved (status='resolved', resolved_at
// set), so "we fixed that in March" survives as history instead of vanishing.
//
// Replaces the 2026-06 scanner, which:
//   • deleted every finding it did not see again, losing all history (B11);
//   • had no run record, so a scan that failed halfway looked like a clean one;
//   • detected the organisation's own domain with a `!d.includes(...) === false`
//     expression that always picked the first domain it saw, so mail forwarded
//     between two of the tenant's own domains was reported as leaving the
//     organisation and forwarding to a real external address on a second domain
//     was missed (B2). Verified domains now come from /organization;
//   • fetched mailbox settings and inbox rules one user after another — two
//     round-trips per user in sequence, which on a few hundred mailboxes ran
//     past the edge-function wall clock and left a partial scan reported as
//     success (B4). Reads now run through $batch, 20 requests per call, with a
//     concurrency limit, a time budget and a cursor so an unfinished pass
//     continues on the next scan;
//   • duplicated the SharePoint connector's site sharing check with a
//     `sharingCapability` field Graph does not return on /sites. Site and file
//     exposure belongs to sharepoint-security, which reads it properly.
import {
  adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgAccess, serveWithCors } from '../_shared/auth.ts'
import {
  GRAPH, graphGetAll, Json, mapLimit, SourceError, SourceResult, sourceFailure,
} from '../_shared/graph.ts'

const CONNECTOR = 'm365'
const TIME_BUDGET_MS = 100_000     // stay well inside the edge-function wall clock
const BATCH_SIZE = 20              // Graph $batch accepts 20 requests per call
const BATCH_CONCURRENCY = 4        // $batch calls in flight at once
const MAX_MAILBOXES = 2_000        // mailboxes examined per scan; the rest continue next scan
const MAX_GRANTS = 2_000
const DOH = 'https://cloudflare-dns.com/dns-query'   // DNS over HTTPS (RFC 8484 JSON)
const MAX_DNS_DOMAINS = 50
// Selectors Microsoft 365 publishes for DKIM. A tenant that signs with its own
// selectors will show as unsigned here; the finding says so rather than
// asserting the domain is unprotected.
const M365_DKIM_SELECTORS = ['selector1', 'selector2']

// NCA ECC-2:2024 and SDAIA PDPL control references, verified against the
// nca_ecc and sdaia_pdpl tables. Primary control first; joined with ' | '.
const ECC = {
  data:        'NCA ECC 2-7-2 · Data and Information Protection',
  email:       'NCA ECC 2-4-2 · Email Protection',
  emailFilter: 'NCA ECC 2-4-3-5 · Email Security Protocols (SPF, DKIM, DMARC)',
  authz:       'NCA ECC 2-2-3-3 · User Authorization (need-to-know, least privilege)',
  review:      'NCA ECC 2-2-3-5 · Periodic Review of Identities and Access Rights',
  iam:         'NCA ECC 2-2-2 · Identity and Access Management',
  thirdPty:    'NCA ECC 4-1-3-1 · Third-Party Cybersecurity Risk Assessment',
}
const PDPL = {
  security:   'SDAIA PDPL-IR Art. 23 · Information Security',
  disclosure: 'SDAIA PDPL-IR Art. 20 · Disclosure of Personal Data',
  transfer:   'SDAIA PDPL-TR Art. 2 · Transfer of Personal Data outside the Kingdom',
}
const CONTROL = {
  // Mail leaving the organisation is a disclosure and, to a foreign provider, a transfer.
  forwarding: [ECC.email, ECC.data, PDPL.disclosure, PDPL.transfer].join(' | '),
  dns:        [ECC.emailFilter, ECC.email].join(' | '),
  guests:     [ECC.review, ECC.authz, PDPL.security].join(' | '),
  consent:    [ECC.authz, ECC.data, ECC.thirdPty, PDPL.security].join(' | '),
  consentDir: [ECC.iam, ECC.authz, ECC.thirdPty].join(' | '),
}

// Delegated/application scopes that give an app broad reach over tenant data.
// Anything matching is worth a human deciding it was intentional.
const HIGH_RISK_SCOPES = [
  'mail.read', 'mail.readwrite', 'mail.send', 'mail.readbasic',
  'files.read.all', 'files.readwrite.all', 'sites.read.all', 'sites.readwrite.all',
  'sites.fullcontrol.all', 'user.read.all', 'user.readwrite.all',
  'directory.read.all', 'directory.readwrite.all', 'group.readwrite.all',
  'mailboxsettings.readwrite', 'application.readwrite.all', 'rolemanagement.readwrite.directory',
]
const DIRECTORY_WRITE_SCOPES = new Set([
  'directory.readwrite.all', 'application.readwrite.all',
  'rolemanagement.readwrite.directory', 'user.readwrite.all', 'group.readwrite.all',
])
// Microsoft's own applications are not the third-party risk this looks for.
// Publisher name alone is not enough: plenty of first-party service principals
// ("SharePoint Online Web Client Extensibility" and friends) carry no publisher
// at all, so the owning tenant is the reliable signal.
const MICROSOFT_PUBLISHER = /^(microsoft|microsoft services|microsoft corporation)$/i
const MICROSOFT_TENANTS = new Set([
  'f8cdef31-a31e-4b4a-93e4-5f571e91255a',   // Microsoft Services
  '72f988bf-86f1-41af-91ab-2d7cd011db47',   // Microsoft Corporation
])

serveWithCors(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = adminClient()
  let runId: string | null = null
  const started = Date.now()
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started)

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const { user, trigger } = await requireOrgAccess(req, supabase, org_id)

    const { data: conn } = await supabase
      .from('org_connectors').select('meta')
      .eq('org_id', org_id).eq('connector_id', 'entra').eq('status', 'active').maybeSingle()
    if (!conn) throw new HttpError(400, 'Microsoft Entra ID is not connected. Connect it from Settings first.')

    // Which sources the admin left switched on, if they narrowed them.
    const saved: string[] = Array.isArray(conn.meta?.m365_scopes) ? conn.meta.m365_scopes : []
    const enabled = new Set<string>(
      saved.length ? saved.map(normaliseScope).filter(Boolean) as string[] : ['forwarding', 'guests', 'consent', 'dns'],
    )

    const { data: run } = await supabase.from('connector_scan_runs').insert({
      org_id, connector_id: CONNECTOR, trigger, triggered_by: user?.id ?? null,
    }).select('id').single()
    runId = run?.id ?? null

    const token = await getMicrosoftAppToken(conn.meta?.tenant_id)
    const now = new Date().toISOString()
    const sources: Record<string, SourceResult> = {}
    const warnings: string[] = []
    const findings: Json[] = []
    const completed = new Set<string>()   // sources that saw their whole estate this scan

    // The organisation's own domains, read from the tenant rather than guessed
    // from the first user (B2). Without this list nothing can be called
    // external, so the forwarding source reports a permission problem instead
    // of inventing findings.
    const orgDomains = new Set<string>()
    let mailDomains: string[] = []
    try {
      const orgs = await graphGetAll(`${GRAPH}/organization?$select=verifiedDomains`, token, { maxPages: 1 })
      const verified = orgs[0]?.verifiedDomains ?? []
      for (const d of verified) if (d?.name) orgDomains.add(String(d.name).toLowerCase())
      // Only domains that actually carry mail are worth an SPF/DKIM/DMARC check,
      // and *.onmicrosoft.com is Microsoft's, not the organisation's to fix.
      mailDomains = verified
        .filter((d: Json) => (d.capabilities ?? '').includes('Email') && !String(d.name).toLowerCase().endsWith('.onmicrosoft.com'))
        .map((d: Json) => String(d.name).toLowerCase())
        .slice(0, MAX_DNS_DOMAINS)
    } catch (e) {
      warnings.push(`Verified domains: ${(e as Error).message}`)
    }

    // ── 1. Forwarding out of the organisation ────────────────────────────────
    let mailStats = { mailboxes: 0, checked: 0 }
    if (!enabled.has('forwarding')) {
      sources.forwarding = { state: 'skipped', detail: 'Turned off in the connector settings.' }
    } else if (orgDomains.size === 0) {
      sources.forwarding = {
        state: 'error',
        detail: 'Could not read the tenant\'s verified domains, so an address cannot be told apart from an internal one. Check the app has Organization.Read.All or Directory.Read.All with admin consent.',
      }
      warnings.push(`Forwarding: ${sources.forwarding.detail}`)
    } else {
      try {
        const res = await scanForwarding({ supabase, orgId: org_id, token, orgDomains, now, timeLeft })
        findings.push(...res.findings)
        mailStats = { mailboxes: res.mailboxes, checked: res.checked }
        if (res.complete) {
          completed.add('forwarding')
          sources.forwarding = { state: 'ok', count: res.findings.length }
        } else {
          sources.forwarding = {
            state: 'partial', count: res.findings.length,
            detail: `Checked ${res.checked} of ${res.mailboxes} mailboxes in this scan. The rest continue automatically on the next scan.`,
          }
        }
      } catch (e) {
        sources.forwarding = sourceFailure(e, 'MailboxSettings.Read and Mail.Read (Microsoft Graph, application)')
        warnings.push(`Forwarding: ${sources.forwarding.detail}`)
      }
    }

    // ── 2. Guest accounts ────────────────────────────────────────────────────
    if (!enabled.has('guests')) {
      sources.guests = { state: 'skipped', detail: 'Turned off in the connector settings.' }
    } else {
      try {
        const res = await scanGuests(org_id, token, now)
        findings.push(...res.findings)
        completed.add('guests')
        sources.guests = res.signInKnown
          ? { state: 'ok', count: res.findings.length }
          : {
              state: 'partial', count: res.findings.length,
              detail: 'Guest last sign-in needs Microsoft Entra ID P1, so age since invitation is used instead of inactivity.',
            }
      } catch (e) {
        sources.guests = sourceFailure(e, 'User.Read.All (Microsoft Graph, application)')
        warnings.push(`Guests: ${sources.guests.detail}`)
      }
    }

    // ── 3. Third-party application consent ───────────────────────────────────
    if (!enabled.has('consent')) {
      sources.consent = { state: 'skipped', detail: 'Turned off in the connector settings.' }
    } else {
      try {
        const res = await scanConsent(org_id, token, now)
        findings.push(...res.findings)
        if (res.complete) completed.add('consent')
        sources.consent = res.complete
          ? { state: 'ok', count: res.findings.length }
          : { state: 'partial', count: res.findings.length, detail: `Read the first ${MAX_GRANTS} consent grants.` }
      } catch (e) {
        sources.consent = sourceFailure(e, 'Directory.Read.All (Microsoft Graph, application)')
        warnings.push(`App consent: ${sources.consent.detail}`)
      }
    }

    // ── 4. Mail domain DNS records ─────────────────────────────────────
    let dnsDomains = 0
    if (!enabled.has('dns')) {
      sources.dns = { state: 'skipped', detail: 'Turned off in the connector settings.' }
    } else if (mailDomains.length === 0) {
      // A tenant whose only domain is *.onmicrosoft.com has no DNS of its own
      // to fix — Microsoft publishes those records. That is nothing to check,
      // not a failure, so it must not drag the scan to "partial".
      sources.dns = {
        state: 'skipped',
        detail: 'The tenant has no custom mail domain. Only *.onmicrosoft.com is verified, and Microsoft publishes its SPF, DKIM and DMARC records.',
      }
    } else {
      try {
        const res = await scanDns(org_id, mailDomains, now)
        findings.push(...res.findings)
        dnsDomains = res.domains
        completed.add('dns')
        sources.dns = { state: 'ok', count: res.findings.length, detail: `Checked ${res.domains} mail domain${res.domains === 1 ? '' : 's'}.` }
      } catch (e) {
        sources.dns = { state: 'error', detail: (e as Error)?.message ?? String(e) }
        warnings.push(`DNS: ${sources.dns.detail}`)
      }
    }

    // ── Persist, then resolve what is no longer reported ─────────────────────
    await upsertFindings(supabase, findings)
    for (const src of completed) {
      const seen = new Set(findings.filter(f => f.source === src).map(f => f.finding_id))
      const { data: open } = await supabase.from('m365_findings')
        .select('finding_id').eq('org_id', org_id).eq('status', 'open').eq('source', src)
      const gone = (open ?? []).map((r: Json) => r.finding_id).filter((id: string) => !seen.has(id))
      await resolveFindings(supabase, org_id, gone, now)
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const { data: openRows } = await supabase.from('m365_findings')
      .select('category, severity').eq('org_id', org_id).eq('status', 'open')
    const byCategory: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    for (const r of openRows ?? []) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
    }
    const counts = {
      open: byCategory,
      open_total: (openRows ?? []).length,
      severity: bySeverity,
      mailboxes: { total: mailStats.mailboxes, scanned: mailStats.checked },
      // The signal engine divides by this to score SPF/DKIM/DMARC coverage.
      dns: { domains: dnsDomains },
    }

    const states = Object.values(sources).map(s => s.state)
    const hardFail = states.filter(s => s === 'error' || s === 'no_permission').length
    const okish = states.filter(s => s === 'ok' || s === 'partial').length
    const status = okish === 0 ? 'failed' : hardFail > 0 ? 'partial' : 'success'

    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status, finished_at: new Date().toISOString(), sources, counts, warnings,
      }).eq('id', runId)
    }
    await supabase.from('org_connectors').update({ last_synced: new Date().toISOString() })
      .eq('org_id', org_id).eq('connector_id', 'entra')
    if (warnings.length) console.warn('[m365-security] warnings', JSON.stringify(warnings))

    return json({
      run_id: runId, status, sources, counts, warnings,
      // Kept for older clients.
      findings_upserted: counts.open_total,
      breakdown: {
        exchange: byCategory.external_forwarding ?? 0,
        guests: byCategory.guest_access ?? 0,
        consent: (byCategory.app_consent ?? 0) + (byCategory.app_privilege ?? 0),
        dns: byCategory.mail_dns ?? 0,
      },
    })
  } catch (err) {
    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status: 'failed', finished_at: new Date().toISOString(),
        error: (err as Error)?.message ?? String(err),
      }).eq('id', runId)
    }
    return errorResponse(err, 'm365-security')
  }
})

// Older settings pages wrote the scope names 'exchange' and 'sharepoint'.
function normaliseScope(s: string): string | null {
  const v = String(s || '').toLowerCase()
  if (v === 'exchange' || v === 'forwarding') return 'forwarding'
  if (v === 'guests') return 'guests'
  if (v === 'consent' || v === 'apps') return 'consent'
  if (v === 'dns') return 'dns'
  return null   // 'sharepoint' belongs to the SharePoint connector now
}

// ── Persistence ───────────────────────────────────────────────────────────────

function baseRow(orgId: string, now: string) {
  return {
    org_id: orgId, status: 'open', resolved_at: null,
    last_seen_at: now, updated_at: now, synced_at: now,
  }
}

// deno-lint-ignore no-explicit-any
async function upsertFindings(supabase: any, rows: Json[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('m365_findings')
      .upsert(rows.slice(i, i + 500), { onConflict: 'org_id,finding_id' })
    if (error) throw new Error(`Saving findings failed: ${error.message}`)
  }
}

// deno-lint-ignore no-explicit-any
async function resolveFindings(supabase: any, orgId: string, ids: string[], now: string) {
  for (let i = 0; i < ids.length; i += 200) {
    await supabase.from('m365_findings')
      .update({ status: 'resolved', resolved_at: now, updated_at: now })
      .eq('org_id', orgId).eq('status', 'open').in('finding_id', ids.slice(i, i + 200))
  }
}

// ── Graph $batch ──────────────────────────────────────────────────────────────

interface BatchRequest { id: string; url: string }
interface BatchReply { id: string; status: number; body: Json }

/**
 * Runs up to BATCH_SIZE GETs in one Graph round-trip, several batches at a
 * time. This is the B4 fix: the old scanner made two sequential calls per
 * mailbox, so the wall clock, not the tenant, decided how much got scanned.
 *
 * A 429 on the envelope is retried by fetchWithRetry; a 429 on an individual
 * reply is retried once as its own batch. Per-request failures are returned
 * rather than thrown — one unlicensed mailbox must not end the scan.
 */
async function graphBatch(requests: BatchRequest[], token: string): Promise<Map<string, BatchReply>> {
  const out = new Map<string, BatchReply>()
  const chunks: BatchRequest[][] = []
  for (let i = 0; i < requests.length; i += BATCH_SIZE) chunks.push(requests.slice(i, i + BATCH_SIZE))

  await mapLimit(chunks, BATCH_CONCURRENCY, async (chunk) => {
    const replies = await postBatch(chunk, token)
    const throttled: BatchRequest[] = []
    for (const r of replies) {
      if (r.status === 429) throttled.push(chunk.find(c => c.id === r.id)!)
      else out.set(r.id, r)
    }
    if (throttled.length) {
      await new Promise(res => setTimeout(res, 2_000))
      for (const r of await postBatch(throttled, token)) out.set(r.id, r)
    }
  })
  return out
}

// fetchWithRetry only issues GETs, so the batch POST is made here with the
// same retry semantics for 429 and 5xx.
async function postBatch(chunk: BatchRequest[], token: string): Promise<BatchReply[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${GRAPH}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: chunk.map(c => ({ id: c.id, method: 'GET', url: c.url })) }),
    })
    if (r.status === 429 || r.status >= 500) {
      const retryAfter = Number(r.headers.get('Retry-After'))
      await r.body?.cancel()
      if (attempt === 3) throw new SourceError('error', `/$batch returned ${r.status}`, r.status)
      await new Promise(res2 => setTimeout(res2, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** attempt))
      continue
    }
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      const code = body?.error?.code ?? ''
      const state = r.status === 401 || r.status === 403 ? 'no_permission' : 'error'
      throw new SourceError(state, `/$batch returned ${r.status} ${code}`.trim(), r.status)
    }
    const data = await r.json()
    return (data.responses ?? []) as BatchReply[]
  }
  throw new SourceError('error', '/$batch could not be reached')
}

// ── 1. Forwarding ─────────────────────────────────────────────────────────────

interface ForwardCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  orgId: string
  token: string
  orgDomains: Set<string>
  now: string
  timeLeft: () => number
}

function domainOf(address: string): string | null {
  const at = String(address || '').lastIndexOf('@')
  return at < 0 ? null : String(address).slice(at + 1).toLowerCase().trim() || null
}

/** External means: a real address whose domain is not one of ours (B2). */
function isExternalAddress(address: string, orgDomains: Set<string>): boolean {
  const d = domainOf(address)
  return !!d && !orgDomains.has(d)
}

async function scanForwarding(ctx: ForwardCtx) {
  const { supabase, orgId, token, orgDomains, now, timeLeft } = ctx
  const findings: Json[] = []

  const users = await graphGetAll(
    `${GRAPH}/users?$select=id,userPrincipalName,displayName,mail,accountEnabled,userType&$top=999`,
    token, { maxPages: 20 },
  )
  // Disabled accounts and guests do not have mailboxes worth reading.
  const mailboxes = users.filter((u: Json) => u.accountEnabled && u.userType !== 'Guest')

  // Continue where the last scan stopped, so a large tenant is covered across
  // several scans instead of always re-reading the same first N mailboxes.
  const { data: cursorRow } = await supabase.from('connector_cursors')
    .select('meta').eq('org_id', orgId).eq('connector_id', CONNECTOR).eq('cursor_key', 'mailboxes').maybeSingle()
  const lastId: string | null = cursorRow?.meta?.last_user_id ?? null
  const startAt = lastId ? Math.max(0, mailboxes.findIndex((u: Json) => u.id === lastId) + 1) : 0
  const ordered = [...mailboxes.slice(startAt), ...mailboxes.slice(0, startAt)]

  const budget = Math.min(MAX_MAILBOXES, ordered.length)
  const slice = ordered.slice(0, budget)

  // Mailbox settings first: one $batch per 20 mailboxes.
  const settingsReplies = await graphBatch(
    slice.map((u: Json) => ({ id: u.id, url: `/users/${u.id}/mailboxSettings` })), token,
  )
  let checked = 0
  const withMailbox: Json[] = []
  for (const u of slice) {
    const reply = settingsReplies.get(u.id)
    if (!reply) continue
    // 404 / MailboxNotEnabledForRESTAPI: the account has no Exchange mailbox.
    if (reply.status >= 400) continue
    checked++
    withMailbox.push(u)
    const fwd = reply.body?.forwardingSmtpAddress
    if (fwd && isExternalAddress(stripSmtp(fwd), orgDomains)) {
      findings.push(forwardingFinding(orgId, u, stripSmtp(fwd), null, now))
    }
  }

  // Inbox rules for the mailboxes that exist, if there is time left.
  if (timeLeft() > 20_000 && withMailbox.length) {
    const ruleReplies = await graphBatch(
      withMailbox.map((u: Json) => ({ id: u.id, url: `/users/${u.id}/mailFolders/inbox/messageRules` })), token,
    )
    for (const u of withMailbox) {
      const reply = ruleReplies.get(u.id)
      if (!reply || reply.status >= 400) continue
      for (const rule of reply.body?.value ?? []) {
        if (rule.isEnabled === false) continue
        const targets = [
          ...(rule.actions?.forwardTo ?? []),
          ...(rule.actions?.forwardAsAttachmentTo ?? []),
          ...(rule.actions?.redirectTo ?? []),
        ].map((r: Json) => String(r?.emailAddress?.address ?? '')).filter(Boolean)
        const external = [...new Set(targets.filter(a => isExternalAddress(a, orgDomains)))]
        if (external.length) findings.push(forwardingFinding(orgId, u, external.join(', '), rule, now))
      }
    }
  }

  // Remember where to resume.
  const lastChecked = slice[slice.length - 1]
  if (lastChecked) {
    await supabase.from('connector_cursors').upsert({
      org_id: orgId, connector_id: CONNECTOR, cursor_key: 'mailboxes',
      initial_done: budget >= ordered.length,
      meta: { last_user_id: budget >= ordered.length ? null : lastChecked.id, mailboxes: mailboxes.length },
      updated_at: now,
    }, { onConflict: 'org_id,connector_id,cursor_key' })
  }

  return { findings, mailboxes: mailboxes.length, checked, complete: budget >= ordered.length }
}

const stripSmtp = (v: string) => String(v).replace(/^smtp:/i, '').trim()

function forwardingFinding(orgId: string, u: Json, target: string, rule: Json | null, now: string): Json {
  const who = u.displayName || u.userPrincipalName
  const ruleName = rule ? (rule.displayName || 'Unnamed rule') : null
  return {
    ...baseRow(orgId, now),
    finding_id: rule ? `forwarding:rule:${u.id}:${rule.id}` : `forwarding:mailbox:${u.id}`,
    source: 'forwarding', category: 'external_forwarding', severity: 'critical',
    title: rule
      ? `Inbox rule forwards mail outside the organisation — ${who}`
      : `Mailbox forwards all mail outside the organisation — ${who}`,
    description: rule
      ? `${who} has an active inbox rule ("${ruleName}") that forwards or redirects messages to ${target}. Rules like this are the usual way a compromised mailbox keeps leaking after the password is changed, and they are invisible to the person whose mailbox it is.`
      : `${who} has mailbox-level forwarding to ${target}. Every message the mailbox receives is copied to that address, which is outside your verified domains.`,
    control: CONTROL.forwarding,
    recommendation: rule
      ? 'Confirm with the mailbox owner that they created this rule. If they did not, delete the rule, reset the password, revoke the sign-in sessions and review the sign-in logs for the account. Block auto-forwarding to external recipients in the Exchange outbound spam filter policy.'
      : 'Confirm the forwarding was requested and approved. If not, clear the forwarding address, reset the password and review the account\'s sign-in history. Set the Exchange outbound spam filter policy to block automatic external forwarding.',
    subject_id: u.userPrincipalName, subject_name: who,
    subject_email: u.mail || u.userPrincipalName,
    subject_url: null,
    source_url: `https://admin.exchange.microsoft.com/#/mailboxes`,
    // No message content, and no recipient list beyond the domains involved:
    // edge-function logs and finding rows are not a place for personal data.
    raw_data: {
      userId: u.id,
      via: rule ? 'inbox_rule' : 'mailbox_setting',
      ruleId: rule?.id ?? null,
      ruleName,
      targetDomains: [...new Set(target.split(',').map(t => domainOf(t)).filter(Boolean))],
    },
  }
}

// ── 2. Guests ─────────────────────────────────────────────────────────────────

const STALE_GUEST_DAYS = 90

async function scanGuests(orgId: string, token: string, now: string) {
  const findings: Json[] = []
  let signInKnown = true
  let guests: Json[]
  try {
    guests = await graphGetAll(
      `${GRAPH}/users?$filter=${encodeURIComponent("userType eq 'Guest'")}&$select=id,userPrincipalName,displayName,mail,createdDateTime,accountEnabled,externalUserState,externalUserStateChangeDateTime,signInActivity&$top=999`,
      token, { maxPages: 20, headers: { ConsistencyLevel: 'eventual' } },
    )
  } catch (e) {
    // signInActivity needs Entra ID P1; without it Graph refuses the whole query.
    if (!(e instanceof SourceError) || e.state === 'no_permission') {
      signInKnown = false
      guests = await graphGetAll(
        `${GRAPH}/users?$filter=${encodeURIComponent("userType eq 'Guest'")}&$select=id,userPrincipalName,displayName,mail,createdDateTime,accountEnabled,externalUserState,externalUserStateChangeDateTime&$top=999`,
        token, { maxPages: 20, headers: { ConsistencyLevel: 'eventual' } },
      )
    } else throw e
  }
  if (guests.some((g: Json) => g.signInActivity === undefined)) signInKnown = false

  for (const g of guests) {
    const who = g.displayName || g.userPrincipalName
    const created = g.createdDateTime ? new Date(g.createdDateTime) : null
    const lastSignIn = g.signInActivity?.lastSignInDateTime ? new Date(g.signInActivity.lastSignInDateTime) : null
    const ageDays = created ? Math.floor((Date.now() - created.getTime()) / 86_400_000) : null
    const idleDays = lastSignIn ? Math.floor((Date.now() - lastSignIn.getTime()) / 86_400_000) : null
    const pending = String(g.externalUserState ?? '').toLowerCase() === 'pendingacceptance'

    // An invitation nobody accepted is an open door that was never walked through.
    if (pending && ageDays !== null && ageDays > 30) {
      findings.push({
        ...baseRow(orgId, now),
        finding_id: `guest:pending:${g.id}`, source: 'guests', category: 'guest_access', severity: 'info',
        title: `Guest invitation never accepted — ${who}`,
        description: `${who} was invited ${ageDays} days ago and has never accepted. The account exists in your directory and can still be added to groups and sites.`,
        control: CONTROL.guests,
        recommendation: 'Remove the guest account if the collaboration did not go ahead, or re-send the invitation if it did.',
        subject_id: g.userPrincipalName, subject_name: who, subject_email: g.mail ?? null,
        subject_url: null,
        source_url: `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${g.id}`,
        raw_data: { guestId: g.id, ageDays, externalUserState: g.externalUserState ?? null, domain: domainOf(g.mail ?? g.userPrincipalName ?? '') },
      })
      continue
    }

    const stale = signInKnown
      ? (idleDays === null ? (ageDays ?? 0) > STALE_GUEST_DAYS : idleDays > STALE_GUEST_DAYS)
      : (ageDays ?? 0) > STALE_GUEST_DAYS
    if (!stale) continue

    const basis = signInKnown
      ? (idleDays === null
          ? `has never signed in since being invited ${ageDays} days ago`
          : `last signed in ${idleDays} days ago`)
      : `has been a guest for ${ageDays} days (last sign-in is not available without Entra ID P1, so this counts from the invitation)`
    findings.push({
      ...baseRow(orgId, now),
      finding_id: `guest:stale:${g.id}`, source: 'guests', category: 'guest_access',
      severity: (idleDays ?? ageDays ?? 0) > 180 ? 'warning' : 'info',
      title: `Guest account not reviewed — ${who}`,
      description: `${who} ${basis}, and still holds whatever group and site access they were given. Guest access that nobody re-approves is how a finished project keeps its door open.`,
      control: CONTROL.guests,
      recommendation: 'Confirm with the sponsoring team that this guest still needs access. Remove the account if not. Set up an access review (Entra ID Governance) or Microsoft 365 group expiration so guest membership is re-approved on a cycle instead of by exception.',
      subject_id: g.userPrincipalName, subject_name: who, subject_email: g.mail ?? null,
      subject_url: null,
      source_url: `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${g.id}`,
      raw_data: { guestId: g.id, ageDays, idleDays, signInKnown, enabled: g.accountEnabled ?? null, domain: domainOf(g.mail ?? g.userPrincipalName ?? '') },
    })
  }
  return { findings, signInKnown }
}

// ── 3. Third-party application consent ────────────────────────────────────────

async function scanConsent(orgId: string, token: string, now: string) {
  const findings: Json[] = []
  const grants = await graphGetAll(
    `${GRAPH}/oauth2PermissionGrants?$top=999`, token, { maxPages: 20 },
  )
  const complete = grants.length < MAX_GRANTS

  // Group the delegated scopes by the app they were granted to.
  const byClient = new Map<string, { scopes: Set<string>; tenantWide: boolean; users: number }>()
  for (const g of grants.slice(0, MAX_GRANTS)) {
    const id = String(g.clientId ?? '')
    if (!id) continue
    const entry = byClient.get(id) ?? { scopes: new Set<string>(), tenantWide: false, users: 0 }
    for (const s of String(g.scope ?? '').split(/\s+/).filter(Boolean)) entry.scopes.add(s.toLowerCase())
    if (String(g.consentType ?? '').toLowerCase() === 'allprincipals') entry.tenantWide = true
    else entry.users++
    byClient.set(id, entry)
  }
  if (byClient.size === 0) return { findings, complete }

  // Names, publishers and app-role (application permission) assignments.
  const ids = [...byClient.keys()]
  const spReplies = await graphBatch(
    ids.map(id => ({ id, url: `/servicePrincipals/${id}?$select=id,appId,displayName,publisherName,verifiedPublisher,appOwnerOrganizationId,servicePrincipalType,signInAudience` })),
    token,
  )

  for (const [clientId, entry] of byClient) {
    const sp = spReplies.get(clientId)
    if (!sp || sp.status >= 400) continue
    const app = sp.body
    const publisher = app.verifiedPublisher?.displayName || app.publisherName || null
    if (publisher && MICROSOFT_PUBLISHER.test(publisher)) continue
    if (MICROSOFT_TENANTS.has(String(app.appOwnerOrganizationId ?? '').toLowerCase())) continue
    if (String(app.servicePrincipalType ?? '') === 'ManagedIdentity') continue

    const risky = [...entry.scopes].filter(s => HIGH_RISK_SCOPES.includes(s))
    if (!risky.length) continue

    const dirWrite = risky.filter(s => DIRECTORY_WRITE_SCOPES.has(s))
    const name = app.displayName || clientId
    const unverified = !app.verifiedPublisher?.displayName
    const reach = entry.tenantWide
      ? 'every user in the organisation'
      : `${entry.users} user${entry.users === 1 ? '' : 's'} who consented individually`

    findings.push({
      ...baseRow(orgId, now),
      finding_id: `consent:${clientId}`,
      source: 'consent',
      category: dirWrite.length ? 'app_privilege' : 'app_consent',
      severity: dirWrite.length ? 'critical' : entry.tenantWide ? 'warning' : 'info',
      title: dirWrite.length
        ? `Third-party app can change the directory — "${name}"`
        : `Third-party app can read organisation data — "${name}"`,
      description: `"${name}"${publisher ? ` (published by ${publisher})` : ''} holds ${risky.join(', ')} on behalf of ${reach}.${dirWrite.length ? ` ${dirWrite.join(', ')} lets it create or modify accounts, apps or role assignments — effectively administrative access without an administrator.` : ''}${unverified ? ' The publisher is not verified by Microsoft.' : ''} An app's consent survives the departure of whoever granted it.`,
      control: dirWrite.length ? CONTROL.consentDir : CONTROL.consent,
      recommendation: 'Confirm the application is one your organisation chose and that its permissions match what it does. Revoke the grant in Entra ID → Enterprise applications → Permissions if not. Turn off user consent for unverified publishers and route requests through the admin consent workflow, and record the app in your third-party register with a risk assessment (NCA ECC 4-1-3-1).',
      subject_id: clientId, subject_name: name, subject_email: null,
      subject_url: null,
      source_url: `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/${clientId}/appId/${app.appId ?? ''}`,
      raw_data: {
        clientId, appId: app.appId ?? null, publisher,
        verifiedPublisher: !!app.verifiedPublisher?.displayName,
        tenantWide: entry.tenantWide, consentingUsers: entry.users,
        riskyScopes: risky, directoryWriteScopes: dirWrite,
      },
    })
  }
  return { findings, complete }
}

// ── 4. Mail domain DNS ────────────────────────────────────────────────────────
//
// SPF, DKIM and DMARC are the three records that decide whether someone else
// can send mail as your domain. They are published in DNS, not in Microsoft
// 365, so they are read over DNS-over-HTTPS rather than through Graph.

interface DnsAnswer { name: string; type: number; data: string }

async function dnsQuery(name: string, type: 'TXT' | 'CNAME'): Promise<DnsAnswer[]> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/dns-json' } })
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel()
      await new Promise(r => setTimeout(r, 400 * 2 ** attempt))
      continue
    }
    if (!res.ok) { await res.body?.cancel(); return [] }
    const data = await res.json()
    return (data.Answer ?? []) as DnsAnswer[]
  }
  return []
}

// DNS TXT strings arrive quoted and, when long, split into several chunks.
const txtValue = (a: DnsAnswer) => String(a.data ?? '').replace(/"\s*"/g, '').replace(/^"|"$/g, '')

async function scanDns(orgId: string, domains: string[], now: string) {
  const findings: Json[] = []

  await mapLimit(domains, 5, async (domain) => {
    const add = (
      key: string, severity: string, title: string, description: string, recommendation: string, raw: Json,
    ) => findings.push({
      ...baseRow(orgId, now),
      finding_id: `dns:${key}:${domain}`, source: 'dns', category: 'mail_dns', severity,
      title, description, control: CONTROL.dns, recommendation,
      subject_id: domain, subject_name: domain, subject_email: null, subject_url: null,
      source_url: `https://admin.microsoft.com/#/Domains`,
      raw_data: { domain, ...raw },
    })

    // ── SPF: which servers may send as this domain ──────────────────────────
    const txt = (await dnsQuery(domain, 'TXT')).map(txtValue)
    const spf = txt.find(v => /^v=spf1\b/i.test(v.trim())) ?? null
    if (!spf) {
      add('spf', 'critical', `No SPF record on ${domain}`,
        `${domain} publishes no SPF record, so no receiving mail server is told which systems may send as this domain. Anyone can send mail that appears to come from your organisation.`,
        'Publish a TXT record at the domain root: "v=spf1 include:spf.protection.outlook.com -all", adding an include for every other service that sends on your behalf. End with -all once the list is complete.',
        { spf: null })
    } else {
      const all = spf.match(/([-~?+])all\b/i)?.[1] ?? null
      const lookups = (spf.match(/\b(include|a|mx|ptr|exists|redirect)[:=]/gi) ?? []).length
      if (all === '?' || all === '+' || all === null) {
        add('spf', 'warning', `SPF on ${domain} does not fail unauthorised senders`,
          `${domain} publishes SPF${all ? ` ending in "${all}all"` : ' with no "all" mechanism'}, which tells receiving servers to accept mail from senders the record does not list. The record exists but enforces nothing.`,
          'Change the record to end in -all (hard fail) once you are sure every legitimate sending service is listed. ~all (soft fail) is a reasonable interim step.',
          { spf, all, lookups })
      } else if (lookups > 10) {
        add('spf', 'warning', `SPF on ${domain} exceeds the DNS lookup limit`,
          `${domain}'s SPF record needs ${lookups} DNS lookups. The limit is 10; beyond it receiving servers stop evaluating and treat the result as a permanent error, so SPF stops protecting the domain.`,
          'Flatten or remove unused include: mechanisms, or use an SPF-flattening service, to bring the record under 10 lookups.',
          { spf, all, lookups })
      }
    }

    // ── DKIM: is outbound mail signed ───────────────────────────────────────
    const selectors: string[] = []
    for (const sel of M365_DKIM_SELECTORS) {
      const cname = await dnsQuery(`${sel}._domainkey.${domain}`, 'CNAME')
      if (cname.length) { selectors.push(sel); continue }
      const dkimTxt = (await dnsQuery(`${sel}._domainkey.${domain}`, 'TXT')).map(txtValue)
      if (dkimTxt.some(v => /v=DKIM1/i.test(v))) selectors.push(sel)
    }
    if (selectors.length === 0) {
      add('dkim', 'warning', `DKIM is not published for ${domain}`,
        `Neither of the Microsoft 365 DKIM selectors (selector1, selector2) is published for ${domain}, so outbound mail carries no signature a receiver can verify. If this domain signs with its own selectors through another provider, DKIM may still be in place — this check only sees the Microsoft ones.`,
        'In the Microsoft 365 Defender portal → Policies & rules → Threat policies → Email authentication settings → DKIM, select the domain and publish the two CNAME records it gives you, then enable signing.',
        { selectors: [], checked: M365_DKIM_SELECTORS })
    } else if (selectors.length < M365_DKIM_SELECTORS.length) {
      add('dkim', 'info', `Only one DKIM selector is published for ${domain}`,
        `${domain} publishes ${selectors.join(', ')} but not the second selector. Microsoft 365 rotates between the two, so signing can break when the key rotates.`,
        'Publish both CNAME records Microsoft 365 gives you for the domain.',
        { selectors, checked: M365_DKIM_SELECTORS })
    }

    // ── DMARC: what receivers should do, and who hears about it ─────────────
    const dmarcTxt = (await dnsQuery(`_dmarc.${domain}`, 'TXT')).map(txtValue)
    const dmarc = dmarcTxt.find(v => /^v=DMARC1\b/i.test(v.trim())) ?? null
    if (!dmarc) {
      add('dmarc', 'critical', `No DMARC record on ${domain}`,
        `${domain} publishes no DMARC record. Receiving servers have no instruction on what to do with mail that fails SPF and DKIM, and your organisation gets no reports of who is sending as you.`,
        'Publish a TXT record at _dmarc.<domain>: "v=DMARC1; p=none; rua=mailto:dmarc@<domain>" to start collecting reports, then raise the policy to quarantine and finally reject once the reports show only legitimate senders.',
        { dmarc: null })
    } else {
      const policy = dmarc.match(/\bp\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? 'none'
      const rua = /\brua\s*=/.test(dmarc)
      if (policy === 'none') {
        add('dmarc', 'warning', `DMARC on ${domain} is monitoring only`,
          `${domain} publishes DMARC with p=none, which asks receiving servers to report on spoofed mail but to deliver it anyway. The domain is observed, not protected.${rua ? '' : ' No reporting address (rua) is set either, so nobody receives the reports.'}`,
          'Review the DMARC aggregate reports until every legitimate sender passes, then raise the policy to p=quarantine and finally p=reject.',
          { dmarc, policy, rua })
      } else if (!rua) {
        add('dmarc', 'info', `DMARC on ${domain} sends no reports`,
          `${domain} enforces DMARC (p=${policy}) but publishes no rua address, so nobody sees which senders are failing — including legitimate services that quietly stop being delivered.`,
          'Add rua=mailto:dmarc@<domain> (or your reporting provider) to the DMARC record.',
          { dmarc, policy, rua })
      }
    }
  })

  return { findings, domains: domains.length }
}
