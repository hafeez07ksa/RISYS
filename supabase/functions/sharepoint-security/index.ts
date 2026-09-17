// sharepoint-security — SharePoint and OneDrive exposure for one organisation.
//
// Data sources (each reported separately in connector_scan_runs.sources):
//   tenant   Tenant sharing policy        GET /admin/sharepoint/settings
//            permission: SharePointTenantSettings.Read.All
//   groups   Guests in Microsoft 365 groups and public groups (group-connected sites)
//            permission: Directory.Read.All (or Group.Read.All + GroupMember.Read.All)
//   sharing  "Anyone" links, external shares and org-wide links on files and folders
//            in every document library and OneDrive (delta + item permissions)
//            permission: Sites.Read.All (or Files.Read.All)
//
// Callers: an org admin (manual scan) or the scan dispatcher (scheduled).
//
// Sharing is incremental: a Graph delta link is stored per drive in
// connector_cursors, so each scan only re-checks items that changed. A large
// tenant's first pass continues across several scans (time budget below).
//
// Findings are never deleted: tenant and group findings no longer reported are
// resolved; an item finding is resolved when its item is re-checked and the
// exposure is gone, or the item is deleted.
//
// Replaces the 2026-06 scanner, which read a per-site `sharingCapability` that
// Graph does not return, filtered drive children with an unsupported filter
// (errors were ignored), only looked at top-level files, and read app
// permissions (/sites/{id}/permissions) as if they were guest users.
import {
  adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgAccess,
} from '../_shared/auth.ts'
import {
  fetchWithRetry, GRAPH, graphGet, graphGetAll, Json, mapLimit, SourceError, SourceResult, sourceFailure,
} from '../_shared/graph.ts'

const TIME_BUDGET_MS = 100_000        // stay well inside the edge-function wall clock
const MAX_PERMISSION_CHECKS = 400     // item permission look-ups per scan
const MAX_GROUPS = 500                // groups checked for guests per scan
const CONNECTOR = 'sharepoint'
// A sharing-only change (a new link or invitation) does not surface in a drive's
// delta feed without Sites.FullControl.All. Libraries up to SMALL_LIBRARY_ITEMS
// are therefore walked in full on every scan; larger ones weekly.
const FULL_PASS_DAYS = 7
const SMALL_LIBRARY_ITEMS = 5000

const ECC = {
  data:     'NCA ECC 2-7-2 · Data and Information Protection',
  mfa:      'NCA ECC 2-2-3-2 · Multi-factor Authentication',
  authz:    'NCA ECC 2-2-3-3 · User Authorization (need-to-know, least privilege)',
  review:   'NCA ECC 2-2-3-5 · Periodic Review of Identities and Access Rights',
  iam:      'NCA ECC 2-2-2 · Identity and Access Management',
  byodData: 'NCA ECC 2-6-3-1 · Separation and Encryption of Data on Mobile Devices and BYOD',
  byodUse:  'NCA ECC 2-6-3-2 · Controlled Use of Mobile Devices and BYOD',
}
// Primary control first. An exposed file is a data-protection gap (2-7-2) and a
// need-to-know gap (2-2-3-3); tenant settings map to the control they weaken.
// SDAIA PDPL Implementing Regulation article titles verified against sdaia_pdpl.
const PDPL = {
  security:   'SDAIA PDPL-IR Art. 23 · Information Security',
  disclosure: 'SDAIA PDPL-IR Art. 20 · Disclosure of Personal Data',
}
const withPdpl = (ecc: string, ...pdpl: string[]) => [ecc, ...pdpl].join(' | ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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

    const { data: run } = await supabase.from('connector_scan_runs').insert({
      org_id, connector_id: CONNECTOR, trigger, triggered_by: user?.id ?? null,
    }).select('id').single()
    runId = run?.id ?? null

    const token = await getMicrosoftAppToken(conn.meta?.tenant_id)
    const now = new Date().toISOString()
    const sources: Record<string, SourceResult> = {}
    const warnings: string[] = []

    // Tenant context: verified domains (to tell external recipients apart) and admin URL.
    const orgDomains = new Set<string>()
    try {
      const orgs = await graphGetAll(`${GRAPH}/organization?$select=verifiedDomains`, token, { maxPages: 1 })
      for (const d of orgs[0]?.verifiedDomains ?? []) if (d?.name) orgDomains.add(String(d.name).toLowerCase())
    } catch { /* fall back to #ext# detection only */ }
    let adminCenterUrl: string | null = null
    let rootHost: string | null = null
    try {
      const root = await graphGet(`${GRAPH}/sites/root?$select=webUrl`, token)
      rootHost = new URL(root.webUrl).host
      adminCenterUrl = `https://${rootHost.replace('.sharepoint.com', '-admin.sharepoint.com')}/_layouts/15/online/AdminHome.aspx#/sharing`
    } catch { /* optional */ }

    // ── 1. Tenant sharing policy ─────────────────────────────────────────────
    const fullRunFindings: Json[] = []
    const completeFullSources = new Set<string>()
    try {
      const settings = await graphGet(`${GRAPH}/admin/sharepoint/settings`, token)
      const tf = tenantFindings(org_id, settings, adminCenterUrl, now)
      fullRunFindings.push(...tf)
      completeFullSources.add('tenant')
      sources.tenant = { state: 'ok', count: tf.length }
    } catch (e) {
      sources.tenant = sourceFailure(e, 'SharePointTenantSettings.Read.All (Microsoft Graph, application)')
      warnings.push(`Tenant sharing policy: ${sources.tenant.detail}`)
    }

    // ── 2. Microsoft 365 groups: guests and public groups ────────────────────
    try {
      const groups = await graphGetAll(
        `${GRAPH}/groups?$filter=${encodeURIComponent("groupTypes/any(c:c eq 'Unified')")}&$select=id,displayName,mail,visibility&$top=999`,
        token, { maxPages: 20 },
      )
      const checked = groups.slice(0, MAX_GROUPS)
      const perGroup = await mapLimit(checked, 5, async (g: Json) => {
        const members = await graphGetAll(
          `${GRAPH}/groups/${g.id}/members?$select=id,userType,mail,userPrincipalName&$top=999`, token, { maxPages: 10 },
        )
        const guests = members.filter((m: Json) =>
          m.userType === 'Guest' || String(m.userPrincipalName ?? '').toUpperCase().includes('#EXT#'))
        return { g, guests }
      })
      const flagged = perGroup.filter(x => x.guests.length > 0 || String(x.g.visibility).toLowerCase() === 'public')
      const siteUrls = new Map<string, string>()
      await mapLimit(flagged.slice(0, 100), 5, async ({ g }) => {
        try {
          const s = await graphGet(`${GRAPH}/groups/${g.id}/sites/root?$select=webUrl`, token)
          if (s?.webUrl) siteUrls.set(g.id, s.webUrl)
        } catch { /* group without a site */ }
      })
      for (const { g, guests } of flagged) {
        fullRunFindings.push(...groupFindings(org_id, g, guests, siteUrls.get(g.id) ?? null, now, orgDomains))
      }
      if (groups.length <= MAX_GROUPS) {
        completeFullSources.add('groups')
        sources.groups = { state: 'ok', count: flagged.length }
      } else {
        sources.groups = { state: 'partial', count: flagged.length, detail: `Checked the first ${MAX_GROUPS} of ${groups.length} groups.` }
      }
    } catch (e) {
      sources.groups = sourceFailure(e, 'Directory.Read.All')
      warnings.push(`Groups: ${sources.groups.detail}`)
    }

    // Persist full-run findings and resolve the ones no longer reported.
    await upsertFindings(supabase, fullRunFindings)
    for (const src of completeFullSources) {
      const seen = new Set(fullRunFindings.filter(f => f.source === src).map(f => f.finding_id))
      const { data: open } = await supabase.from('sharepoint_findings')
        .select('finding_id').eq('org_id', org_id).eq('status', 'open').eq('source', src)
      const gone = (open ?? []).map((r: Json) => r.finding_id).filter((id: string) => !seen.has(id))
      await resolveFindings(supabase, org_id, gone, now)
    }

    // ── 3. Sharing links on files and folders (incremental) ─────────────────
    let sharingStats = { drives: 0, drivesDone: 0, itemsChecked: 0 }
    try {
      sharingStats = await scanSharing({ supabase, orgId: org_id, token, orgDomains, now, timeLeft })
      const pending = sharingStats.drives - sharingStats.drivesDone
      sources.sharing = pending > 0
        ? {
            state: 'partial', count: sharingStats.itemsChecked,
            detail: `Checked ${sharingStats.drivesDone} of ${sharingStats.drives} libraries in this scan. The rest continue automatically on the next scan.`,
          }
        : { state: 'ok', count: sharingStats.itemsChecked }
    } catch (e) {
      sources.sharing = sourceFailure(e, 'Sites.Read.All')
      warnings.push(`File sharing: ${sources.sharing.detail}`)
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const { data: openRows } = await supabase.from('sharepoint_findings')
      .select('category').eq('org_id', org_id).eq('status', 'open')
    const byCategory: Record<string, number> = {}
    for (const r of openRows ?? []) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
    const counts = {
      open: byCategory,
      open_total: (openRows ?? []).length,
      libraries: { total: sharingStats.drives, scanned: sharingStats.drivesDone },
      items_checked: sharingStats.itemsChecked,
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
    if (warnings.length) console.warn('[sharepoint-security] warnings', JSON.stringify(warnings))

    return json({
      run_id: runId, status, sources, counts, warnings,
      // Kept for older clients.
      findings_upserted: counts.open_total,
      breakdown: {
        external_sharing: (byCategory.external_share ?? 0) + (byCategory.tenant_policy ?? 0),
        public_files: byCategory.public_file ?? 0,
        guest_access: byCategory.guest_access ?? 0,
        internal_exposure: byCategory.org_wide_link ?? 0,
        sites_scanned: sharingStats.drives,
      },
    })
  } catch (err) {
    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status: 'failed', finished_at: new Date().toISOString(),
        error: (err as Error)?.message ?? String(err),
      }).eq('id', runId)
    }
    return errorResponse(err, 'sharepoint-security')
  }
})

// ── Persistence helpers ───────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function upsertFindings(supabase: any, rows: Json[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('sharepoint_findings')
      .upsert(rows.slice(i, i + 500), { onConflict: 'org_id,finding_id' })
    if (error) throw new Error(`Saving findings failed: ${error.message}`)
  }
}

// deno-lint-ignore no-explicit-any
async function resolveFindings(supabase: any, orgId: string, ids: string[], now: string) {
  for (let i = 0; i < ids.length; i += 200) {
    await supabase.from('sharepoint_findings')
      .update({ status: 'resolved', resolved_at: now })
      .eq('org_id', orgId).eq('status', 'open').in('finding_id', ids.slice(i, i + 200))
  }
}

function baseRow(orgId: string, now: string) {
  return { org_id: orgId, status: 'open', resolved_at: null, last_seen_at: now, updated_at: now, subject_email: null }
}

// ── 1. Tenant policy ──────────────────────────────────────────────────────────

function tenantFindings(orgId: string, s: Json, adminUrl: string | null, now: string): Json[] {
  const out: Json[] = []
  const sharing = String(s.sharingCapability ?? '')
  const externalOn = sharing !== '' && sharing !== 'disabled'
  const add = (key: string, severity: string, title: string, description: string, control: string, recommendation: string) => out.push({
    ...baseRow(orgId, now),
    finding_id: `tenant:${key}`, source: 'tenant', category: 'tenant_policy', severity,
    title, description, control, recommendation,
    subject_id: 'tenant', subject_name: 'SharePoint and OneDrive tenant settings',
    subject_url: adminUrl, source_url: adminUrl,
    raw_data: {
      sharingCapability: s.sharingCapability ?? null,
      sharingDomainRestrictionMode: s.sharingDomainRestrictionMode ?? null,
      isResharingByExternalUsersEnabled: s.isResharingByExternalUsersEnabled ?? null,
      isRequireAcceptingUserToMatchInvitedUserEnabled: s.isRequireAcceptingUserToMatchInvitedUserEnabled ?? null,
      isLegacyAuthProtocolsEnabled: s.isLegacyAuthProtocolsEnabled ?? null,
      idleSessionSignOut: s.idleSessionSignOut ?? null,
      isUnmanagedSyncAppForTenantRestricted: s.isUnmanagedSyncAppForTenantRestricted ?? null,
    },
  })

  if (sharing === 'externalUserAndGuestSharing') {
    add('anyone_links', 'critical', '"Anyone" links are allowed across SharePoint and OneDrive',
      'The tenant sharing level is "Anyone", so users can create links that open files without signing in. Such links can be forwarded to anyone and are the most common cause of accidental data exposure.',
      withPdpl(ECC.data, PDPL.security, PDPL.disclosure),
      'In the SharePoint admin center → Policies → Sharing, lower SharePoint and OneDrive to "New and existing guests" (or stricter). If Anyone links are required, set them to expire and to view-only.')
  }
  if (externalOn && String(s.sharingDomainRestrictionMode ?? 'none') === 'none') {
    add('no_domain_restriction', 'warning', 'External sharing is not limited to approved domains',
      'Users can share with people at any external email domain. Restricting sharing to partner domains (allow list) or blocking known personal-mail domains limits where data can go.',
      withPdpl(ECC.data, PDPL.security),
      'In the SharePoint admin center → Policies → Sharing → More external sharing settings, enable "Limit external sharing by domain" and add an allow list of partner domains.')
  }
  if (externalOn && s.isResharingByExternalUsersEnabled === true) {
    add('guest_resharing', 'warning', 'Guests can reshare content they don\'t own',
      'External users can share files and folders they were given access to with other people, so access can spread beyond the people your staff chose.',
      withPdpl(`${ECC.authz} | ${ECC.data}`, PDPL.security),
      'In the SharePoint admin center → Policies → Sharing → More external sharing settings, turn off "Allow guests to share items they don\'t own".')
  }
  if (externalOn && s.isRequireAcceptingUserToMatchInvitedUserEnabled === false) {
    add('invite_account_mismatch', 'warning', 'Sharing invitations can be redeemed by a different account',
      'A guest invitation sent to one email address can be accepted with another account, so a forwarded invitation grants access to whoever opens it.',
      ECC.iam,
      'In the SharePoint admin center → Policies → Sharing → More external sharing settings, enable "People who use a verification code must reauthenticate" and require guests to sign in with the invited account.')
  }
  if (s.isLegacyAuthProtocolsEnabled === true) {
    add('legacy_auth', 'warning', 'Legacy authentication is allowed for SharePoint',
      'Apps that use legacy authentication can access SharePoint without supporting modern controls such as multi-factor authentication and Conditional Access.',
      ECC.mfa,
      'In the SharePoint admin center → Policies → Access control → Apps that don\'t use modern authentication, choose "Block access". Also block legacy authentication with a Conditional Access policy.')
  }
  if (s.idleSessionSignOut && s.idleSessionSignOut.isEnabled === false) {
    add('idle_signout', 'info', 'Idle session sign-out is off',
      'Browser sessions to SharePoint and OneDrive stay signed in on unattended devices.',
      ECC.iam,
      'In the SharePoint admin center → Policies → Access control → Idle session sign-out, turn it on (for example warn after 45 minutes, sign out after 60).')
  }
  if (s.isUnmanagedSyncAppForTenantRestricted === false) {
    add('unmanaged_sync', 'info', 'OneDrive sync is allowed on unmanaged devices',
      'Files can be synced to personal or unmanaged computers, where the organisation cannot enforce encryption or remote wipe.',
      withPdpl(`${ECC.byodData} | ${ECC.byodUse} | ${ECC.data}`, PDPL.security),
      'In the SharePoint admin center → Settings → OneDrive → Sync, allow syncing only on computers joined to your domains, or use Conditional Access app-enforced restrictions for unmanaged devices.')
  }
  return out
}

// ── 2. Groups ─────────────────────────────────────────────────────────────────

function groupFindings(orgId: string, g: Json, guests: Json[], siteUrl: string | null, now: string, orgDomains: Set<string>): Json[] {
  const out: Json[] = []
  const name = g.displayName ?? g.mail ?? 'Unnamed group'
  if (guests.length > 0) {
    const domains = [...new Set(guests.map(guestDomain).filter(Boolean))].slice(0, 5) as string[]
    // Accounts in the tenant's own domain can still be typed as Guest; say so rather than call them external.
    const ownDomain = domains.filter(d => orgDomains.has(d))
    const ownNote = ownDomain.length
      ? ` Some of these accounts are in your own domain (${ownDomain.join(', ')}) but are typed as Guest; if they are staff, change their user type to Member in Entra ID.`
      : ''
    out.push({
      ...baseRow(orgId, now),
      finding_id: `guests:${g.id}`, source: 'groups', category: 'guest_access',
      severity: guests.length >= 10 ? 'warning' : 'info',
      title: `${guests.length} guest${guests.length === 1 ? '' : 's'} in "${name}"`,
      description: `The Microsoft 365 group "${name}" has ${guests.length} guest member${guests.length === 1 ? '' : 's'}${domains.length ? ` (from ${domains.join(', ')})` : ''}. Guests can open the group's SharePoint site, files and conversations.${ownNote}`,
      control: withPdpl(ECC.review, PDPL.security),
      recommendation: 'Confirm each guest still needs access. Set up an access review (Entra ID Governance) or Microsoft 365 group expiration so guest membership is re-approved regularly.',
      subject_id: g.id, subject_name: name, subject_url: siteUrl,
      source_url: siteUrl ?? `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Members/groupId/${g.id}`,
      raw_data: { groupId: g.id, mail: g.mail ?? null, visibility: g.visibility ?? null, guestCount: guests.length, guestDomains: domains },
    })
  }
  if (String(g.visibility ?? '').toLowerCase() === 'public') {
    out.push({
      ...baseRow(orgId, now),
      finding_id: `public:${g.id}`, source: 'groups', category: 'public_group', severity: 'info',
      title: `Public group "${name}"`,
      description: `Anyone in the organisation can join "${name}" without approval and read its SharePoint files and conversations.`,
      control: ECC.authz,
      recommendation: 'If the group holds anything other than openly shareable content, change its privacy to Private in the Microsoft 365 admin center or Teams.',
      subject_id: g.id, subject_name: name, subject_url: siteUrl,
      source_url: siteUrl ?? `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${g.id}`,
      raw_data: { groupId: g.id, mail: g.mail ?? null, visibility: g.visibility ?? null },
    })
  }
  return out
}

function guestDomain(u: Json): string | null {
  const mail = String(u.mail ?? '')
  if (mail.includes('@')) return mail.split('@')[1].toLowerCase()
  const upn = String(u.userPrincipalName ?? '')
  const m = upn.match(/^(.+)#EXT#/i)
  if (m) { const i = m[1].lastIndexOf('_'); if (i > 0) return m[1].slice(i + 1).toLowerCase() }
  return null
}

// ── 3. Sharing (incremental) ──────────────────────────────────────────────────

interface ScanCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  orgId: string
  token: string
  orgDomains: Set<string>
  now: string
  timeLeft: () => number
}

interface Target { key: string; driveId: string; item: Json; site: Json; drive: Json }

async function scanSharing(ctx: ScanCtx) {
  const { supabase, orgId, token, now, timeLeft } = ctx

  // Sites: team and communication sites first, then OneDrive (personal) sites.
  let sites: Json[]
  try {
    sites = await graphGetAll(`${GRAPH}/sites/getAllSites?$top=999`, token, { maxPages: 50 })
  } catch (e) {
    if (e instanceof SourceError && e.state === 'no_permission') throw e
    sites = await graphGetAll(`${GRAPH}/sites?search=*&$top=999`, token, { maxPages: 50 })
  }
  sites.sort((a, b) => Number(!!a.isPersonalSite) - Number(!!b.isPersonalSite))

  const { data: cursorRows } = await supabase.from('connector_cursors')
    .select('cursor_key, next_link, delta_link, initial_done, meta, updated_at')
    .eq('org_id', orgId).eq('connector_id', CONNECTOR)
  const cursors = new Map<string, Json>((cursorRows ?? []).map((r: Json) => [r.cursor_key, r]))

  // Libraries (drives). One call per site; stop listing when time runs short.
  const drives: { drive: Json; site: Json }[] = []
  const siteQueue = [...sites]
  await mapLimit(Array.from({ length: 4 }), 4, async () => {
    while (siteQueue.length && timeLeft() > 60_000) {
      const site = siteQueue.shift()!
      try {
        const ds = await graphGetAll(`${GRAPH}/sites/${site.id}/drives?$select=id,name,webUrl,driveType`, token, { maxPages: 5 })
        for (const d of ds) drives.push({ drive: d, site })
      } catch (e) {
        if (e instanceof SourceError && e.state === 'no_permission') throw e
        // A single site that can't be read (e.g. locked) shouldn't stop the scan.
      }
    }
  })
  const totalDrives = drives.length + siteQueue.length // unlisted sites count as pending
  // Libraries whose initial pass is unfinished go first, then the least recently scanned.
  drives.sort((a, b) => {
    const ca = cursors.get(a.drive.id), cb = cursors.get(b.drive.id)
    const ia = ca?.initial_done ? 1 : 0, ib = cb?.initial_done ? 1 : 0
    if (ia !== ib) return ia - ib
    return String(ca?.updated_at ?? '').localeCompare(String(cb?.updated_at ?? ''))
  })

  // Open item findings, keyed by "<driveId>:<itemId>".
  const { data: openRows } = await supabase.from('sharepoint_findings')
    .select('finding_id, subject_id').eq('org_id', orgId).eq('source', 'sharing').eq('status', 'open')
  const openByKey = new Map<string, string[]>()
  for (const r of openRows ?? []) {
    const list = openByKey.get(r.subject_id) ?? []
    list.push(r.finding_id)
    openByKey.set(r.subject_id, list)
  }

  const targets = new Map<string, Target>()
  const deletedKeys = new Set<string>()
  let drivesDone = 0
  let attempted = 0
  let forbidden = 0

  for (const { drive, site } of drives) {
    if (timeLeft() < 30_000 || targets.size >= MAX_PERMISSION_CHECKS) break
    attempted++
    const cur = cursors.get(drive.id)
    const fresh = `${GRAPH}/drives/${drive.id}/root/delta`
    let fullPassAt: string = cur?.meta?.fullPassAt ?? now
    const small = typeof cur?.meta?.itemCount === 'number' && cur.meta.itemCount <= SMALL_LIBRARY_ITEMS
    const stale = !cur?.next_link && cur?.initial_done &&
      (small || Date.now() - new Date(fullPassAt).getTime() > FULL_PASS_DAYS * 86_400_000)
    let url: string = stale ? fresh : (cur?.next_link ?? cur?.delta_link ?? fresh)
    if (url === fresh) fullPassAt = now
    let inFullPass = url === fresh || (!!cur?.next_link && !!cur?.meta?.inFullPass)
    let walkCount: number = url === fresh ? 0 : (cur?.meta?.walkCount ?? 0)
    let initialDone = !!cur?.initial_done && !cur?.next_link
    let finished = false
    let restarts = 0
    let saved: { next_link: string | null; delta_link: string | null; initial_done: boolean } | null = null

    while (true) {
      const res = await fetchWithRetry(url, token, { Prefer: 'hierarchicalsharing' })
      if (res.status === 410 && restarts++ === 0) { // delta token expired: start this library again
        await res.body?.cancel()
        url = fresh
        fullPassAt = now
        inFullPass = true
        walkCount = 0
        initialDone = false
        continue
      }
      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel()
        forbidden++
        break // skip a library we cannot read
      }
      if (!res.ok) { await res.body?.cancel(); break }
      const page = await res.json()

      for (const item of page.value ?? []) {
        if (item.root) continue
        walkCount++
        const key = `${drive.id}:${item.id}`
        if (item.deleted) { deletedKeys.add(key); targets.delete(key); continue }
        // The shared facet marks items with sharing on them (Prefer: hierarchicalsharing).
        const shared = !!item.shared && typeof item.shared === 'object'
        if (shared || openByKey.has(key)) {
          targets.set(key, { key, driveId: drive.id, item, site, drive })
        }
      }

      if (page['@odata.deltaLink']) {
        saved = { next_link: null, delta_link: page['@odata.deltaLink'], initial_done: true }
        finished = true
        break
      }
      const next = page['@odata.nextLink']
      if (!next) break
      url = next
      if (timeLeft() < 30_000 || targets.size >= MAX_PERMISSION_CHECKS) {
        saved = { next_link: next, delta_link: cur?.delta_link ?? null, initial_done: initialDone }
        break
      }
    }

    if (saved) {
      await supabase.from('connector_cursors').upsert({
        org_id: orgId, connector_id: CONNECTOR, cursor_key: drive.id,
        ...saved,
        meta: {
          fullPassAt,
          inFullPass: saved.next_link ? inFullPass : false,
          walkCount: saved.next_link ? walkCount : 0,
          itemCount: finished && inFullPass ? walkCount : (cur?.meta?.itemCount ?? null),
          siteId: site.id, siteName: site.displayName ?? site.name ?? null, driveName: drive.name ?? null, personal: !!site.isPersonalSite },
        updated_at: now,
      }, { onConflict: 'org_id,connector_id,cursor_key' })
    }
    if (finished) drivesDone++
  }

  if (attempted > 0 && forbidden === attempted) {
    throw new SourceError('no_permission', '/drives/{id}/root/delta returned 403 for every library', 403)
  }

  // Check permissions for every changed or shared item.
  const newRows: Json[] = []
  const checkedKeys = new Set<string>()
  await mapLimit([...targets.values()], 5, async (t) => {
    if (timeLeft() < 8_000) return
    try {
      const perms = await graphGetAll(`${GRAPH}/drives/${t.driveId}/items/${t.item.id}/permissions`, token, { maxPages: 5 })
      newRows.push(...itemFindings(ctx, t, perms))
      checkedKeys.add(t.key)
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) { deletedKeys.add(t.key); return }
      // Leave the item's findings as they are; it will be re-checked when it changes.
    }
  })

  await upsertFindings(supabase, newRows)

  const newIds = new Set(newRows.map(r => r.finding_id))
  const toResolve: string[] = []
  for (const key of [...checkedKeys, ...deletedKeys]) {
    for (const id of openByKey.get(key) ?? []) if (!newIds.has(id)) toResolve.push(id)
  }
  await resolveFindings(supabase, orgId, toResolve, now)

  return { drives: totalDrives, drivesDone, itemsChecked: checkedKeys.size }
}

function itemFindings(ctx: ScanCtx, t: Target, perms: Json[]): Json[] {
  const { orgId, orgDomains, now } = ctx
  const { item, site, drive, key } = t
  const direct = perms.filter(p => !p.inheritedFrom)
  const isFolder = !!item.folder
  const kind = isFolder ? 'Folder' : 'File'
  const name = item.name ?? 'Unnamed item'
  const siteName = site.displayName ?? site.name ?? 'a site'
  const where = site.isPersonalSite ? `${siteName}'s OneDrive` : `the "${siteName}" site`
  const path = String(item.parentReference?.path ?? '').replace(/^\/drives\/[^/]+\/root:?/, '') || '/'
  const at = path === '/' ? where : `${where} (${path})`

  const linkSummary = (p: Json) => ({
    scope: p.link?.scope ?? null,
    type: p.link?.type ?? null,
    expires: p.expirationDateTime ?? null,
    hasPassword: p.hasPassword ?? null,
  })
  const base = {
    ...baseRow(orgId, now),
    source: 'sharing',
    subject_id: key,
    subject_name: name,
    subject_url: item.webUrl ?? null,
    source_url: item.webUrl ?? null,
  }
  const raw = (extra: Json) => ({
    siteName, siteUrl: site.webUrl ?? null, personalSite: !!site.isPersonalSite,
    driveName: drive.name ?? null, path, isFolder, size: item.size ?? null,
    lastModified: item.lastModifiedDateTime ?? null, ...extra,
  })

  const out: Json[] = []

  // "Anyone" links
  const anon = direct.filter(p => p.link?.scope === 'anonymous')
  if (anon.length) {
    const canEdit = anon.some(p => p.link?.type === 'edit' || (p.roles ?? []).includes('write'))
    const noExpiry = anon.some(p => !p.expirationDateTime)
    const noPassword = anon.some(p => !p.hasPassword)
    out.push({
      ...base,
      finding_id: `anon:${key}`, category: 'public_file',
      severity: canEdit || noExpiry ? 'critical' : 'warning',
      title: `"Anyone" link on ${kind.toLowerCase()} "${name}"`,
      description: `${kind} "${name}" in ${at} has ${anon.length} "Anyone" link${anon.length === 1 ? '' : 's'}: people who have the link can ${canEdit ? 'edit' : 'view'} it without signing in. ${noExpiry ? 'At least one link never expires.' : 'All links have an expiry date.'}${noPassword ? '' : ' Links are password protected.'}${isFolder ? ' Everything inside the folder is exposed.' : ''}`,
      control: withPdpl(`${ECC.data} | ${ECC.authz}`, PDPL.security, PDPL.disclosure),
      recommendation: `Open the ${kind.toLowerCase()} in SharePoint → Manage access → Links, and remove the "Anyone" link. If external access is needed, share with specific people instead. Check whether the ${kind.toLowerCase()} contains personal or confidential data; if it does and the link was used, treat it as a possible data breach (PDPL notification rules).`,
      raw_data: raw({ links: anon.map(linkSummary) }),
    })
  }

  // Specific external people
  const externalIds = new Set<string>()
  const externalDomains = new Set<string>()
  for (const p of direct) {
    if (p.link?.scope === 'anonymous' || p.link?.scope === 'organization') continue
    const ids = [p.grantedToV2, ...(p.grantedToIdentitiesV2 ?? [])].filter(Boolean)
    // A share that hasn't been accepted yet only carries the invited address.
    if (p.invitation?.email) ids.push({ user: { email: p.invitation.email } })
    for (const id of ids) {
      const email = String(id.user?.email ?? id.siteUser?.email ?? '').toLowerCase()
      const login = String(id.siteUser?.loginName ?? '')
      const domain = email.includes('@') ? email.split('@')[1] : ''
      // #ext# = Entra B2B guest; urn:spo:guest = SharePoint verification-code guest.
      const isExternal = /#ext#/i.test(login) || /urn(%3a|:)spo(%3a|:)guest/i.test(login) ||
        (domain !== '' && orgDomains.size > 0 && !orgDomains.has(domain))
      if (isExternal) {
        externalIds.add(email || login || JSON.stringify(id))
        if (domain) externalDomains.add(domain)
      }
    }
  }
  if (externalIds.size) {
    const domains = [...externalDomains].slice(0, 5)
    out.push({
      ...base,
      finding_id: `ext:${key}`, category: 'external_share',
      severity: 'warning',
      title: `${kind} "${name}" shared with ${externalIds.size} external ${externalIds.size === 1 ? 'person' : 'people'}`,
      description: `${kind} "${name}" in ${at} is shared directly with ${externalIds.size} ${externalIds.size === 1 ? 'person' : 'people'} outside the organisation${domains.length ? ` (${domains.join(', ')})` : ''}.`,
      control: withPdpl(`${ECC.data} | ${ECC.authz}`, PDPL.security, PDPL.disclosure),
      recommendation: `Confirm each external person still needs access (SharePoint → Manage access). Remove access that is no longer needed, and set an expiry on the rest.`,
      raw_data: raw({ externalCount: externalIds.size, externalDomains: domains }),
    })
  }

  // Organisation-wide links
  const orgLinks = direct.filter(p => p.link?.scope === 'organization')
  if (orgLinks.length) {
    const canEdit = orgLinks.some(p => p.link?.type === 'edit' || (p.roles ?? []).includes('write'))
    out.push({
      ...base,
      finding_id: `org:${key}`, category: 'org_wide_link',
      severity: 'info',
      title: `${kind} "${name}" is shared with everyone in the organisation`,
      description: `${kind} "${name}" in ${at} has a "People in your organisation" link, so any employee with the link can ${canEdit ? 'edit' : 'view'} it.`,
      control: ECC.authz,
      recommendation: 'If the content is not meant for all staff, replace the link with one for specific people (need-to-know).',
      raw_data: raw({ links: orgLinks.map(linkSummary) }),
    })
  }

  if (!out.length && direct.length) {
    // Diagnostics without personal data: link scopes and login-name prefixes only.
    console.log('[sharepoint-security] shared item without finding', JSON.stringify(direct.map(p => ({
      scope: p.link?.scope ?? null,
      invitation: !!p.invitation,
      roles: p.roles ?? [],
      logins: [p.grantedToV2, ...(p.grantedToIdentitiesV2 ?? [])].filter(Boolean)
        .map((id: Json) => String(id.siteUser?.loginName ?? '').split('|').slice(0, 2).join('|')),
      domainKnown: orgDomains.size > 0,
    }))))
  }
  return out
}
