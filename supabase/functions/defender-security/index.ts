// defender-security — Microsoft Defender findings for one organisation.
//
// Data sources (each is reported separately in connector_scan_runs.sources):
//   posture   Secure Score control gaps           Graph  SecurityEvents.Read.All
//   alerts    Defender XDR alerts (alerts_v2)      Graph  SecurityAlert.Read.All
//   endpoint  Defender for Endpoint recommendations + device health
//             api.securitycenter.microsoft.com     WindowsDefenderATP
//             SecurityRecommendation.Read.All, Machine.Read.All
//
// Callers: an org admin (manual "Scan now") or the scan dispatcher (scheduled).
//
// Lifecycle: findings are never deleted. A finding that is no longer reported
// is marked resolved (only when its source was read successfully), and a
// resolved finding that is reported again is reopened. High-severity alerts
// raise a RISYS incident once (deduplicated on the alert id).
//
// History of fixes (16–17 Sep 2026):
//  - Posture gaps used ctrl.implementationStatus, which does not exist on
//    secureScoreControlProfile, so every control was skipped. Gaps now come from
//    secureScores[0].controlScores joined to the profiles by id.
//  - Only controls present in the tenant's score report are considered.
//  - Severity follows score impact; remediation HTML is converted to text.
//  - ECC labels use verified NCA ECC-2:2024 control IDs.
//  - Alerts read users/devices from alerts_v2 `evidence` (userStates and
//    hostStates belong to the retired v1 API).
import {
  adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json,
  MDE_SCOPE, MicrosoftTokenError, requireOrgAccess,
} from '../_shared/auth.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const MDE   = 'https://api.securitycenter.microsoft.com/api'
const RESOLVED_ALERT_WINDOW_DAYS = 30

type SourceState = 'ok' | 'not_licensed' | 'no_permission' | 'error' | 'skipped'
interface SourceResult { state: SourceState; detail?: string; count?: number }

// deno-lint-ignore no-explicit-any
type Json = any

class SourceError extends Error {
  state: SourceState
  constructor(state: SourceState, detail: string) { super(detail); this.state = state }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = adminClient()
  let runId: string | null = null

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const { user, trigger } = await requireOrgAccess(req, supabase, org_id)

    const { data: conn } = await supabase
      .from('org_connectors').select('meta')
      .eq('org_id', org_id).eq('connector_id', 'entra').eq('status', 'active').maybeSingle()
    if (!conn) throw new HttpError(400, 'Microsoft Entra ID is not connected. Connect it from Settings first.')
    const tenantId = conn.meta?.tenant_id

    const { data: run } = await supabase.from('connector_scan_runs').insert({
      org_id, connector_id: 'defender', trigger, triggered_by: user?.id ?? null,
    }).select('id').single()
    runId = run?.id ?? null

    const now = new Date().toISOString()
    const sources: Record<string, SourceResult> = {}
    const warnings: string[] = []
    // deno-lint-ignore no-explicit-any
    const findings: any[] = []
    // Finding sources whose data was read completely (safe to resolve missing rows).
    const completeSources = new Set<string>()

    const graphToken = await getMicrosoftAppToken(tenantId)

    // ── Posture (Secure Score) ───────────────────────────────────────────────
    let secureScore: { current: number | null; max: number | null } = { current: null, max: null }
    try {
      const [scores, profiles] = await Promise.all([
        getAll(`${GRAPH}/security/secureScores?$top=1`, graphToken, 1),
        getAll(`${GRAPH}/security/secureScoreControlProfiles?$top=200`, graphToken),
      ])
      const latest = scores[0]
      if (!latest) throw new SourceError('not_licensed', 'Microsoft returned no Secure Score for this tenant.')
      secureScore = { current: num(latest.currentScore), max: num(latest.maxScore) }
      const posture = postureFindings(org_id, latest, profiles, now)
      findings.push(...posture)
      completeSources.add('secure_score')
      sources.posture = { state: 'ok', count: posture.length }
    } catch (e) {
      sources.posture = sourceFailure(e)
      warnings.push(`Secure Score: ${sources.posture.detail}`)
    }

    // ── Alerts (Defender XDR) ────────────────────────────────────────────────
    let alertRows: Json[] = []
    try {
      const since = new Date(Date.now() - RESOLVED_ALERT_WINDOW_DAYS * 86400_000).toISOString()
      const [fresh, inProgress, recent] = await Promise.all([
        getAll(alertsUrl(`status eq 'new'`), graphToken),
        getAll(alertsUrl(`status eq 'inProgress'`), graphToken),
        getAll(alertsUrl(`lastUpdateDateTime ge ${since}`), graphToken),
      ])
      const byId = new Map<string, Json>()
      for (const a of [...recent, ...fresh, ...inProgress]) byId.set(a.id, a)
      alertRows = [...byId.values()]
      const alerts = alertRows.map(a => alertFinding(org_id, a, now))
      findings.push(...alerts)
      completeSources.add('alert')
      sources.alerts = { state: 'ok', count: alerts.filter(a => a.status === 'open').length }
    } catch (e) {
      sources.alerts = sourceFailure(e, 'SecurityAlert.Read.All')
      warnings.push(`Alerts: ${sources.alerts.detail}`)
    }

    // ── Endpoint (Defender for Endpoint) ─────────────────────────────────────
    try {
      let mdeToken: string
      try {
        mdeToken = await getMicrosoftAppToken(tenantId, MDE_SCOPE)
      } catch (e) {
        if (e instanceof MicrosoftTokenError && e.notProvisioned) {
          throw new SourceError('not_licensed', 'Defender for Endpoint is not available in this tenant (no licence or not set up).')
        }
        throw e
      }
      const [recs, machines] = await Promise.all([
        getAll(`${MDE}/recommendations`, mdeToken),
        getAll(`${MDE}/machines`, mdeToken),
      ])
      const vulns = recs
        .filter(r => String(r.status ?? '').toLowerCase() === 'active' && Number(r.exposedMachinesCount ?? 0) > 0)
        .map(r => recommendationFinding(org_id, r, now))
      const devices = machines.flatMap(m => deviceFindings(org_id, m, now))
      findings.push(...vulns, ...devices)
      completeSources.add('recommendation')
      completeSources.add('device')
      sources.endpoint = { state: 'ok', count: vulns.length + devices.length }
    } catch (e) {
      sources.endpoint = sourceFailure(e, 'WindowsDefenderATP permissions')
      if (sources.endpoint.state !== 'not_licensed') warnings.push(`Endpoint: ${sources.endpoint.detail}`)
    }

    // ── Persist ──────────────────────────────────────────────────────────────
    for (let i = 0; i < findings.length; i += 500) {
      const { error } = await supabase.from('defender_findings')
        .upsert(findings.slice(i, i + 500), { onConflict: 'org_id,finding_id' })
      if (error) throw new Error(`Saving findings failed: ${error.message}`)
    }

    // Resolve findings that a fully-read source no longer reports.
    let resolvedCount = 0
    if (completeSources.size) {
      const seen = new Set(findings.map(f => f.finding_id))
      const { data: open } = await supabase.from('defender_findings')
        .select('finding_id, source').eq('org_id', org_id).eq('status', 'open')
        .in('source', [...completeSources])
      const gone = (open ?? []).map(r => r.finding_id).filter(id => !seen.has(id))
      for (let i = 0; i < gone.length; i += 200) {
        await supabase.from('defender_findings')
          .update({ status: 'resolved', resolved_at: now })
          .eq('org_id', org_id).in('finding_id', gone.slice(i, i + 200))
      }
      resolvedCount = gone.length
    }

    const newIncidents = await raiseAlertIncidents(supabase, org_id, alertRows)

    const counts = {
      open: {
        posture: findings.filter(f => f.source === 'secure_score').length,
        alerts: findings.filter(f => f.source === 'alert' && f.status === 'open').length,
        vulnerabilities: findings.filter(f => f.source === 'recommendation').length,
        devices: findings.filter(f => f.source === 'device').length,
      },
      resolved_this_scan: resolvedCount,
      incidents_raised: newIncidents,
      secure_score: secureScore,
    }
    const failed = Object.values(sources).filter(s => s.state === 'error' || s.state === 'no_permission').length
    const okCount = Object.values(sources).filter(s => s.state === 'ok').length
    const status = okCount === 0 ? 'failed' : failed > 0 ? 'partial' : 'success'

    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status, finished_at: new Date().toISOString(), sources, counts, warnings,
      }).eq('id', runId)
    }
    if (warnings.length) console.warn('[defender-security] warnings', JSON.stringify(warnings))

    return json({
      run_id: runId, status, sources, counts, warnings,
      // Kept for older clients.
      findings_upserted: findings.filter(f => f.status === 'open').length,
      breakdown: { alerts: counts.open.alerts, posture: counts.open.posture },
      secure_score: secureScore.current,
    })
  } catch (err) {
    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status: 'failed', finished_at: new Date().toISOString(),
        error: (err as Error)?.message ?? String(err),
      }).eq('id', runId)
    }
    return errorResponse(err, 'defender-security')
  }
})

const alertsUrl = (filter: string) =>
  `${GRAPH}/security/alerts_v2?$filter=${encodeURIComponent(filter)}&$top=500`

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function getAll(url: string, token: string, maxPages = 20): Promise<Json[]> {
  const out: Json[] = []
  let next: string | null = url
  let pages = 0
  while (next && pages < maxPages) {
    const res = await fetchWithRetry(next, token)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const code = body?.error?.code ?? ''
      const endpoint = next.split('?')[0].replace(/^https:\/\/[^/]+/, '')
      if (res.status === 401 || res.status === 403) {
        throw new SourceError('no_permission', `${endpoint} returned ${res.status} ${code}`.trim())
      }
      throw new SourceError('error', `${endpoint} returned ${res.status} ${code}`.trim())
    }
    const data = await res.json()
    if (Array.isArray(data.value)) out.push(...data.value)
    next = data['@odata.nextLink'] ?? null
    pages++
  }
  return out
}

/** Retries throttling (429) and transient 5xx, honouring Retry-After. */
async function fetchWithRetry(url: string, token: string, attempts = 4): Promise<Response> {
  let res: Response | null = null
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if ((res.status !== 429 && res.status < 500) || i === attempts - 1) return res
    const retryAfter = Number(res.headers.get('Retry-After'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** i
    await res.body?.cancel()
    await new Promise(r => setTimeout(r, waitMs))
  }
  return res!
}

function sourceFailure(e: unknown, permission?: string): SourceResult {
  if (e instanceof SourceError) {
    if (e.state === 'no_permission') {
      return {
        state: 'no_permission',
        detail: `Microsoft refused access (${e.message}). Check the app has ${permission ?? 'the required permission'} with admin consent, and that the tenant is licensed for this Defender product.`,
      }
    }
    return { state: e.state, detail: e.message }
  }
  return { state: 'error', detail: (e as Error)?.message ?? String(e) }
}

const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

// ── Posture ───────────────────────────────────────────────────────────────────

function postureFindings(orgId: string, latest: Json, profiles: Json[], now: string) {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const scoreByControl = new Map<string, Json>()
  for (const cs of (latest.controlScores ?? []) as Json[]) {
    const key = norm(cs?.controlName ?? cs?.id)
    if (key) scoreByControl.set(key, cs)
  }
  if (scoreByControl.size === 0) throw new SourceError('error', 'Secure Score report has no per-control scores.')
  const maxTotal = Number(latest.maxScore ?? 0)

  const out: Json[] = []
  let matched = 0
  for (const ctrl of profiles) {
    if (ctrl.deprecated) continue
    const cs = scoreByControl.get(norm(ctrl.controlName)) ?? scoreByControl.get(norm(ctrl.id))
    if (!cs) continue // not applicable to this tenant
    matched++

    const updates = (ctrl.controlStateUpdates ?? []) as Json[]
    const latestUpdate = updates.slice().sort((x, y) =>
      new Date(y.updatedDateTime ?? 0).getTime() - new Date(x.updatedDateTime ?? 0).getTime())[0]
    const manualState = norm(latestUpdate?.state)
    if (manualState === 'thirdparty' || manualState === 'ignored') continue

    const maxScore = Number(ctrl.maxScore ?? 0)
    if (!(maxScore > 0)) continue
    const achieved = Number(cs.score ?? 0)
    if (achieved >= maxScore) continue

    const impact = maxTotal > 0 ? (maxScore / maxTotal) * 100 : 0
    const stateNote = manualState && manualState !== 'default' ? ` Marked "${manualState}" in Secure Score.` : ''
    out.push({
      org_id: orgId,
      finding_id: `score:${ctrl.id}`,
      source: 'secure_score',
      category: 'posture',
      severity: impact >= 3 ? 'critical' : impact >= 1 ? 'warning' : 'info',
      title: ctrl.title ?? ctrl.controlName ?? ctrl.id,
      description: `Secure Score control not fully achieved: ${achieved} of ${maxScore} points (+${impact.toFixed(2)}% score impact).${stateNote}`,
      control: mapScoreControl(ctrl),
      recommendation: htmlToText(ctrl.remediation) || 'Review and implement this control in Microsoft Secure Score.',
      subject_id: ctrl.id,
      subject_name: ctrl.title ?? ctrl.controlName ?? ctrl.id,
      subject_email: null,
      source_url: 'https://security.microsoft.com/securescore?viewid=actions',
      status: 'open', resolved_at: null, last_seen_at: now, updated_at: now,
      raw_data: {
        service: ctrl.service, controlCategory: ctrl.controlCategory, rank: ctrl.rank,
        maxScore, achievedScore: achieved, scoreImpact: impact, actionUrl: ctrl.actionUrl ?? null,
        tier: ctrl.tier ?? null, userImpact: ctrl.userImpact ?? null, implementationCost: ctrl.implementationCost ?? null,
      },
    })
  }
  if (matched === 0) throw new SourceError('error', 'No Secure Score controls could be matched to the score report.')
  return out
}

// ── Alerts ────────────────────────────────────────────────────────────────────

function alertFinding(orgId: string, a: Json, now: string) {
  const subject = alertSubject(a)
  const resolved = String(a.status ?? '').toLowerCase() === 'resolved'
  const threat = [a.threatDisplayName, a.threatFamilyName].filter(Boolean).join(' · ')
  const mitre = Array.isArray(a.mitreTechniques) && a.mitreTechniques.length ? ` MITRE: ${a.mitreTechniques.join(', ')}.` : ''
  return {
    org_id: orgId,
    finding_id: `alert:${a.id}`,
    source: 'alert',
    category: mapAlertCategory(a.serviceSource ?? a.detectionSource ?? ''),
    severity: mapAlertSeverity(a.severity),
    title: a.title ?? 'Security alert',
    description: [
      a.description || `Alert raised by ${prettyService(a.serviceSource)}.`,
      threat ? `Threat: ${threat}.` : '',
      `Detected by ${prettyService(a.serviceSource)}${a.createdDateTime ? ` on ${new Date(a.createdDateTime).toUTCString()}` : ''}.${mitre}`,
    ].filter(Boolean).join(' '),
    control: mapAlertControl(a.category ?? ''),
    recommendation: htmlToText(a.recommendedActions) || 'Investigate and remediate this alert in the Microsoft Defender portal.',
    subject_id: subject.id,
    subject_name: subject.name,
    subject_email: subject.email,
    source_url: a.alertWebUrl ?? null,
    status: resolved ? 'resolved' : 'open',
    resolved_at: resolved ? (a.resolvedDateTime ?? now) : null,
    last_seen_at: now, updated_at: now,
    raw_data: {
      alertId: a.id, incidentId: a.incidentId ?? null, incidentWebUrl: a.incidentWebUrl ?? null,
      msSeverity: a.severity, msStatus: a.status, classification: a.classification ?? null,
      determination: a.determination ?? null, serviceSource: a.serviceSource ?? null,
      detectionSource: a.detectionSource ?? null, category: a.category ?? null,
      mitreTechniques: a.mitreTechniques ?? [], createdDateTime: a.createdDateTime ?? null,
      evidence: (a.evidence ?? []).slice(0, 10).map(evidenceSummary),
    },
  }
}

/** The most useful affected entity from alerts_v2 evidence: user, then mailbox, then device. */
function alertSubject(a: Json): { id: string; name: string; email: string | null } {
  const ev = (a.evidence ?? []) as Json[]
  const type = (e: Json) => String(e['@odata.type'] ?? '').toLowerCase()
  const user = ev.find(e => type(e).endsWith('userevidence'))
  if (user?.userAccount) {
    const u = user.userAccount
    return { id: u.azureAdUserId ?? u.userPrincipalName ?? u.accountName ?? a.id, name: u.displayName ?? u.userPrincipalName ?? u.accountName ?? 'User', email: u.userPrincipalName ?? null }
  }
  const mailbox = ev.find(e => type(e).endsWith('mailboxevidence'))
  if (mailbox) {
    return { id: mailbox.primaryAddress ?? a.id, name: mailbox.displayName ?? mailbox.primaryAddress ?? 'Mailbox', email: mailbox.primaryAddress ?? null }
  }
  const device = ev.find(e => type(e).endsWith('deviceevidence'))
  if (device) {
    return { id: device.mdeDeviceId ?? device.azureAdDeviceId ?? device.deviceDnsName ?? a.id, name: device.deviceDnsName ?? device.hostName ?? 'Device', email: null }
  }
  const app = ev.find(e => type(e).endsWith('cloudapplicationevidence') || type(e).endsWith('oauthapplicationevidence'))
  if (app) return { id: String(app.appId ?? a.id), name: app.displayName ?? 'Application', email: null }
  return { id: a.id, name: 'Tenant', email: null }
}

function evidenceSummary(e: Json) {
  const t = String(e['@odata.type'] ?? '').split('.').pop()
  return {
    type: t,
    name: e.userAccount?.userPrincipalName ?? e.deviceDnsName ?? e.primaryAddress ?? e.ipAddress ??
      e.fileDetails?.fileName ?? e.displayName ?? e.url ?? null,
    verdict: e.verdict ?? null,
    remediationStatus: e.remediationStatus ?? null,
  }
}

const SERVICE_NAMES: Record<string, string> = {
  microsoftdefenderforendpoint: 'Defender for Endpoint',
  microsoftdefenderforidentity: 'Defender for Identity',
  microsoftdefenderforoffice365: 'Defender for Office 365',
  microsoftdefenderforcloudapps: 'Defender for Cloud Apps',
  microsoftdefenderforcloud: 'Defender for Cloud',
  azureadidentityprotection: 'Entra ID Protection',
  microsoftdefenderxdr: 'Defender XDR',
  microsoft365defender: 'Defender XDR',
  microsoftsentinel: 'Microsoft Sentinel',
  microsoftinsiderriskmanagement: 'Insider Risk Management',
  microsoftdatalossprevention: 'Data Loss Prevention',
}
const prettyService = (s: unknown) => SERVICE_NAMES[String(s ?? '').toLowerCase()] ?? (s ? String(s) : 'Microsoft Defender')

function mapAlertSeverity(s: unknown): 'critical' | 'warning' | 'info' {
  const l = String(s ?? '').toLowerCase()
  if (l === 'high') return 'critical'
  if (l === 'medium') return 'warning'
  return 'info'
}

function mapAlertCategory(source: string): string {
  const s = source.toLowerCase()
  if (s.includes('identityprotection') || s.includes('identity') || s.includes('entra')) return 'identity'
  if (s.includes('endpoint')) return 'endpoint'
  if (s.includes('office') || s.includes('dataloss')) return 'office'
  if (s.includes('cloud')) return 'cloud'
  return 'threat'
}

/** High-severity open alerts become RISYS incidents, once per alert. Returns how many were created. */
// deno-lint-ignore no-explicit-any
async function raiseAlertIncidents(supabase: any, orgId: string, alerts: Json[]): Promise<number> {
  const eligible = alerts.filter(a =>
    String(a.severity ?? '').toLowerCase() === 'high' && String(a.status ?? '').toLowerCase() !== 'resolved')
  if (!eligible.length) return 0

  const ids = eligible.map(a => String(a.id))
  const { data: existing } = await supabase.from('incidents')
    .select('id, external_id').eq('org_id', orgId).eq('connector_id', 'defender').in('external_id', ids)
  const known = new Map<string, string>((existing ?? []).map((r: Json) => [String(r.external_id), String(r.id)] as [string, string]))

  const toCreate = eligible.filter(a => !known.has(String(a.id)))
  let created: Json[] = []
  if (toCreate.length) {
    const { data, error } = await supabase.from('incidents').upsert(toCreate.map(a => {
      const subject = alertSubject(a)
      return {
        org_id: orgId,
        connector_id: 'defender',
        external_id: String(a.id),
        external_url: a.alertWebUrl ?? null,
        title: a.title ?? 'Defender alert',
        description: [
          a.description ?? '',
          `Affected: ${subject.name}${subject.email ? ` (${subject.email})` : ''}`,
          `Detected by ${prettyService(a.serviceSource)}${a.createdDateTime ? ` on ${new Date(a.createdDateTime).toUTCString()}` : ''}.`,
          a.recommendedActions ? `Recommended actions: ${htmlToText(a.recommendedActions)}` : '',
          `Control reference: ${mapAlertControl(a.category ?? '')}`,
        ].filter(Boolean).join('\n\n'),
        severity: 'high',
        priority: 'high',
        status: 'open',
        source_type: 'Microsoft Defender alert (auto-raised)',
        raw_data: { alertId: a.id, incidentId: a.incidentId ?? null, serviceSource: a.serviceSource ?? null },
      }
    }), { onConflict: 'org_id,connector_id,external_id', ignoreDuplicates: true }).select('id, external_id, title')
    if (error) {
      console.error('[defender-security] incident creation failed', error.message)
    } else {
      created = data ?? []
      for (const r of created) known.set(r.external_id, r.id)
    }
  }

  // Link findings to their incidents.
  for (const [alertId, incidentId] of known) {
    await supabase.from('defender_findings').update({ incident_id: incidentId })
      .eq('org_id', orgId).eq('finding_id', `alert:${alertId}`).is('incident_id', null)
  }

  // Tell the org's admins about newly raised incidents.
  if (created.length) {
    const { data: admins } = await supabase.from('organization_members')
      .select('user_id').eq('org_id', orgId).in('role', ['admin', 'owner'])
    const notes = (admins ?? []).flatMap((m: Json) => created.map((inc: Json) => ({
      org_id: orgId, user_id: m.user_id, type: 'incident',
      title: 'High-severity Defender alert raised as an incident',
      body: inc.title, link: `/app/incidents/${inc.id}`,
    })))
    if (notes.length) await supabase.from('notifications').insert(notes)
  }
  return created.length
}

// ── Endpoint (Defender for Endpoint) ──────────────────────────────────────────

function recommendationFinding(orgId: string, r: Json, now: string) {
  const score = Number(r.severityScore ?? 0)
  const exploited = Boolean(r.publicExploit || r.activeAlert)
  const severity = exploited || score >= 7 ? 'critical' : score >= 4 ? 'warning' : 'info'
  const weaknesses = Number(r.weaknesses ?? 0)
  const exposed = Number(r.exposedMachinesCount ?? 0)
  const total = Number(r.totalMachineCount ?? 0)
  const remediation = String(r.remediationType ?? '').toLowerCase()
  const category = String(r.recommendationCategory ?? '').toLowerCase()
  const control = remediation === 'configurationchange' || category.includes('securitycontrols')
    ? (category.includes('network') ? ECC.netSeg : ECC.sysProt)
    : weaknesses > 0 ? ECC.vulnRemediate : ECC.patch

  const facts = [
    `${exposed} of ${total || '?'} devices exposed`,
    weaknesses ? `${weaknesses} known vulnerabilit${weaknesses === 1 ? 'y' : 'ies'}` : null,
    r.publicExploit ? 'a public exploit exists' : null,
    r.activeAlert ? 'linked to an active alert' : null,
  ].filter(Boolean).join(', ')

  return {
    org_id: orgId,
    finding_id: `rec:${r.id}`,
    source: 'recommendation',
    category: 'vulnerability',
    severity,
    title: r.recommendationName ?? `Update ${r.productName ?? 'software'}`,
    description: `${r.vendor ? `${r.vendor} ` : ''}${r.productName ?? ''}: ${facts}. Severity score ${score.toFixed(1)}/10.`.trim(),
    control,
    recommendation: r.recommendedVersion
      ? `Update ${r.productName ?? 'the affected software'} to version ${r.recommendedVersion} or later on all exposed devices.`
      : `Apply the "${r.recommendationName ?? 'recommended'}" remediation on all exposed devices (Defender portal → Vulnerability management → Recommendations).`,
    subject_id: String(r.id),
    subject_name: [r.vendor, r.productName].filter(Boolean).join(' ') || 'Software',
    subject_email: null,
    source_url: 'https://security.microsoft.com/security-recommendations',
    status: 'open', resolved_at: null, last_seen_at: now, updated_at: now,
    raw_data: {
      productName: r.productName ?? null, vendor: r.vendor ?? null, severityScore: score,
      publicExploit: !!r.publicExploit, activeAlert: !!r.activeAlert, weaknesses,
      exposedMachinesCount: exposed, totalMachineCount: total, remediationType: r.remediationType ?? null,
      recommendationCategory: r.recommendationCategory ?? null, recommendedVersion: r.recommendedVersion ?? null,
      exposureImpact: r.exposureImpact ?? null, configScoreImpact: r.configScoreImpact ?? null,
    },
  }
}

const UNHEALTHY = new Set(['inactive', 'impairedcommunication', 'nosensordata', 'nosensordataimpairedcommunication'])

function deviceFindings(orgId: string, m: Json, now: string) {
  const out: Json[] = []
  if (String(m.onboardingStatus ?? 'Onboarded').toLowerCase() !== 'onboarded') return out
  const name = m.computerDnsName ?? m.id
  const base = {
    org_id: orgId, source: 'device', category: 'device',
    subject_id: String(m.id), subject_name: name, subject_email: null,
    source_url: `https://security.microsoft.com/machines/v2/${encodeURIComponent(m.id)}/overview`,
    status: 'open', resolved_at: null, last_seen_at: now, updated_at: now,
    raw_data: {
      osPlatform: m.osPlatform ?? null, osVersion: m.osVersion ?? null, healthStatus: m.healthStatus ?? null,
      riskScore: m.riskScore ?? null, exposureLevel: m.exposureLevel ?? null, lastSeen: m.lastSeen ?? null,
      rbacGroupName: m.rbacGroupName ?? null,
    },
  }
  const health = String(m.healthStatus ?? '').toLowerCase()
  if (UNHEALTHY.has(health)) {
    out.push({
      ...base,
      finding_id: `device:${m.id}:health`,
      severity: 'warning',
      title: 'Defender sensor not reporting',
      description: `${name} (${m.osPlatform ?? 'unknown OS'}) is onboarded but its health is "${m.healthStatus}". Last seen ${m.lastSeen ? new Date(m.lastSeen).toUTCString() : 'unknown'}. The device may be unprotected or no longer monitored.`,
      control: ECC.malware,
      recommendation: 'Check the device is powered on and online, the Defender sensor service is running and can reach Microsoft, or offboard it if it has been retired.',
    })
  }
  const risk = String(m.riskScore ?? '').toLowerCase()
  if (risk === 'high') {
    out.push({
      ...base,
      finding_id: `device:${m.id}:risk`,
      severity: 'critical',
      title: 'High-risk device',
      description: `Defender rates ${name} as high risk, which means active threats or alerts are associated with it.`,
      control: ECC.incident,
      recommendation: 'Review the device timeline and its alerts in the Defender portal, and isolate the device if it is compromised.',
    })
  } else if (String(m.exposureLevel ?? '').toLowerCase() === 'high') {
    out.push({
      ...base,
      finding_id: `device:${m.id}:exposure`,
      severity: 'warning',
      title: 'Highly exposed device',
      description: `Defender rates ${name}'s exposure level as high because of unpatched vulnerabilities or weak configuration.`,
      control: ECC.vulnRemediate,
      recommendation: 'Apply the security recommendations listed for this device in the Defender portal.',
    })
  }
  return out
}

// ── Text ──────────────────────────────────────────────────────────────────────

function htmlToText(html: unknown): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ol|ul|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"').replace(/&rsquo;|&lsquo;|&#39;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

// ── NCA ECC-2:2024 references (IDs verified against nca_ecc, 16 Sep 2026) ─────

const ECC = {
  iam:           'NCA ECC 2-2-2 · Identity and Access Management',
  singleAuth:    'NCA ECC 2-2-3-1 · Single-factor Authentication (username and password)',
  mfa:           'NCA ECC 2-2-3-2 · Multi-factor Authentication',
  authz:         'NCA ECC 2-2-3-3 · User Authorization (need-to-know, least privilege)',
  pam:           'NCA ECC 2-2-3-4 · Privileged Access Management',
  review:        'NCA ECC 2-2-3-5 · Periodic Review of Identities and Access Rights',
  sysProt:       'NCA ECC 2-3-2 · Information System and Processing Facilities Protection',
  malware:       'NCA ECC 2-3-3-1 · Malware Protection',
  media:         'NCA ECC 2-3-3-2 · External Storage Media',
  patch:         'NCA ECC 2-3-3-3 · Patch Management',
  email:         'NCA ECC 2-4-2 · Email Protection',
  phishing:      'NCA ECC 2-4-3-1 · Email Filtering (phishing and spam)',
  emailApt:      'NCA ECC 2-4-3-4 · Email APT Protection',
  emailDom:      'NCA ECC 2-4-3-5 · Email Domain Validation (SPF, DKIM, DMARC)',
  netSeg:        'NCA ECC 2-5-3-1 · Network Segmentation',
  netBrowse:     'NCA ECC 2-5-3-3 · Secure Browsing and Restricting File Storage/Sharing Websites',
  netPorts:      'NCA ECC 2-5-3-5 · Network Services, Protocols and Ports',
  data:          'NCA ECC 2-7-2 · Data and Information Protection',
  crypto:        'NCA ECC 2-8-3-3 · Encryption of Data In-transit and At-rest',
  vuln:          'NCA ECC 2-10-2 · Vulnerabilities Management',
  vulnRemediate: 'NCA ECC 2-10-3-3 · Vulnerability Remediation',
  logs:          'NCA ECC 2-12-3-1 · Cybersecurity Event Logs',
  monitor:       'NCA ECC 2-12-3-4 · Continuous Log Monitoring',
  incident:      'NCA ECC 2-13-2 · Cybersecurity Incident and Threat Management',
  cloud:         'NCA ECC 4-2-2 · Cloud Computing and Hosting Cybersecurity',
  cloudData:     'NCA ECC 4-2-3-1 · Protection of Data by Cloud Service Providers',
}

// An alert is evidence for the control it tests and for incident handling (2-13).
function mapAlertControl(category: string): string {
  const specific = mapAlertThreatControl(category)
  return specific === ECC.incident ? specific : `${specific} | ${ECC.incident}`
}

function mapAlertThreatControl(category: string): string {
  const c = category.toLowerCase()
  if (/malware|ransomware|virus|trojan/.test(c)) return ECC.malware
  if (/phish|email|spam/.test(c)) return ECC.phishing
  if (/credential|identity|account|brute/.test(c)) return ECC.iam
  if (/exfil|data|leak|collection/.test(c)) return ECC.data
  if (/network|lateral|command/.test(c)) return ECC.netSeg
  return ECC.incident
}

function mapScoreControl(ctrl: { service?: string; title?: string; controlCategory?: string }): string {
  const svc = (ctrl.service ?? '').toLowerCase()
  const t = (ctrl.title ?? '').toLowerCase()
  const cat = (ctrl.controlCategory ?? '').toLowerCase()

  if (svc === 'mdo' || svc === 'exo' || /mail|phish|spam|spoof|imperson|quarantine|safe links|safe attachments/.test(t)) {
    if (/dkim|spf|dmarc/.test(t)) return ECC.emailDom
    if (/safe attachments|safe documents|safe links|defender for office|zero-day|sandbox/.test(t)) return ECC.emailApt
    if (/audit/.test(t)) return ECC.logs
    if (/lockbox/.test(t)) return ECC.cloudData
    if (/storage provider/.test(t)) return `${ECC.data} | ${ECC.netBrowse}`
    if (/forward|external sharing/.test(t)) return ECC.data
    if (/phish|spam|bulk|bcl|spoof|imperson|quarantine|malware|filter/.test(t)) return ECC.phishing
    return ECC.email
  }
  if (svc === 'azuread' || svc === 'azure atp' || cat.includes('identity')) {
    if (/multifactor|multi-factor|mfa|modern authentication|legacy auth/.test(t)) return ECC.mfa
    if (/sign out inactive|idle session|session timeout/.test(t)) return ECC.iam
    if (/admin|privileg|role|pim|break glass|emergency/.test(t)) return ECC.pam
    if (/review|dormant|inactive|stale/.test(t)) return ECC.review
    if (/password|kerberos|ntlm|authentication/.test(t)) return ECC.singleAuth
    if (/consent|guest|access|permission|delegation|sid/.test(t)) return ECC.authz
    if (/sensor|audit|log/.test(t)) return ECC.monitor
    return ECC.iam
  }
  if (svc === 'mdatp' || cat.includes('device')) {
    if (/antivirus|malware|defender|attack surface|asr|exploit|tamper|ransom|cloud-delivered/.test(t)) return ECC.malware
    if (/update|patch|vulnerab|outdated|unsupported|end-of-support/.test(t)) return ECC.patch
    if (/removable|usb|storage device/.test(t)) return ECC.media
    if (/bitlocker|encrypt/.test(t)) return ECC.crypto
    if (/firewall/.test(t)) return ECC.netSeg
    if (/smb|protocol|port|remote|rdp|winrm|netbios|llmnr/.test(t)) return ECC.netPorts
    if (/browser|smartscreen|edge|chrome|internet/.test(t)) return ECC.netBrowse
    if (/audit|log/.test(t)) return ECC.logs
    if (/account|password|admin|credential|uac/.test(t)) return ECC.authz
    return ECC.sysProt
  }
  if (['mip', 'spo', 'ms teams', 'forms', 'sway', 'odb'].includes(svc) || cat.includes('data')) {
    if (/audit|log search/.test(t)) return ECC.logs
    if (/meeting|lobby|anonymous/.test(t)) return ECC.authz
    return ECC.data
  }
  if (svc === 'mcas' || svc.startsWith('mda_') || svc === 'appg') return ECC.cloud
  if (/audit|log/.test(t)) return ECC.logs
  return ECC.vuln
}
