// defender-security — Defender alerts + Secure Score posture gaps.
// V6: caller must be an admin of org_id.
// V4/B3: app-only Graph token. Requires application permissions SecurityAlert.Read.All
//        and SecurityEvents.Read.All with admin consent in the customer tenant.
//
// FIX (16 Sep 2026): posture-gap detection was using ctrl.implementationStatus and
// ctrl.currentScore from /security/secureScoreControlProfiles. Neither field exists on
// that Graph resource (it's a static control catalog — title/rank/remediation/maxScore
// only). implementationStatus was always undefined, so the "!ctrl.implementationStatus"
// check discarded every control on every run — posture gaps were hard-locked at 0
// regardless of the tenant's actual Secure Score. The tenant's real per-control achieved
// score lives on secureScores[0].controlScores[], keyed by controlName. We now join the
// two collections and flag a gap whenever achieved < max. Controls the tenant has
// manually marked ThirdParty/Ignored in the Secure Score UI (controlStateUpdates) are
// still excluded, matching the original intent.
import { adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgRole } from './_shared/auth.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const supabase = adminClient()
    await requireOrgRole(req, supabase, org_id)

    const { data: conn, error: connErr } = await supabase
      .from('org_connectors').select('meta')
      .eq('org_id', org_id).eq('connector_id', 'entra').eq('status', 'active').single()
    if (connErr || !conn) throw new HttpError(400, 'Entra connector not connected')

    const token = await getMicrosoftAppToken(conn.meta?.tenant_id)
    const graphErrors: string[] = []

    // deno-lint-ignore no-explicit-any
    async function graphGetAll(endpoint: string): Promise<any[]> {
      // deno-lint-ignore no-explicit-any
      const results: any[] = []
      let url: string | null = `${GRAPH}${endpoint}`
      let pages = 0
      while (url && pages < 20) {
        const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          // deno-lint-ignore no-explicit-any
          graphErrors.push(`${endpoint.split('?')[0]}: ${res.status} ${(err as any)?.error?.code ?? ''}`.trim())
          break
        }
        // deno-lint-ignore no-explicit-any
        const data: any = await res.json()
        if (data.value) results.push(...data.value)
        url = data['@odata.nextLink'] ?? null
        pages++
      }
      return results
    }

    const alerts = await graphGetAll(`/security/alerts_v2?$filter=status ne 'resolved'&$top=100&$orderby=createdDateTime desc`)
    const [secureScores, controlProfiles] = await Promise.all([
      graphGetAll('/security/secureScores?$top=1'),
      graphGetAll('/security/secureScoreControlProfiles?$top=200'),
    ])

    const latestScore = secureScores[0] ?? null

    // Map of controlName -> achieved score for this tenant, from the score report itself
    // (secureScoreControlProfiles has no per-tenant score — only static catalog metadata).
    // deno-lint-ignore no-explicit-any
    const achievedByControl = new Map<string, number>()
    // deno-lint-ignore no-explicit-any
    for (const cs of (latestScore?.controlScores ?? []) as any[]) {
      if (cs?.controlName) achievedByControl.set(cs.controlName, Number(cs.score ?? 0))
    }

    // deno-lint-ignore no-explicit-any
    const findings: any[] = []

    for (const a of alerts) {
      findings.push({
        org_id,
        finding_id: `alert:${a.id}`,
        source: 'alert',
        category: mapAlertCategory(a.serviceSource ?? a.detectionSource ?? ''),
        severity: mapAlertSeverity(a.severity),
        title: a.title ?? 'Security Alert',
        description: a.description ?? `Alert raised by ${a.serviceSource ?? 'Microsoft Defender'}.`,
        control: mapAlertControl(a.category ?? ''),
        recommendation: a.recommendedActions ?? 'Review and remediate the alert in Microsoft Defender portal.',
        subject_id: a.id,
        subject_name: a.userStates?.[0]?.accountName ?? a.hostStates?.[0]?.fqdn ?? 'Tenant',
        subject_email: a.userStates?.[0]?.emailRole ?? null,
        raw_data: a,
      })
    }

    for (const ctrl of controlProfiles) {
      if (ctrl.deprecated) continue

      // Latest manual state the tenant set in the Secure Score UI (Default/Ignored/ThirdParty/Reviewed).
      // deno-lint-ignore no-explicit-any
      const updates = (ctrl.controlStateUpdates ?? []) as any[]
      const latestUpdate = updates.length
        ? updates.slice().sort((x, y) => new Date(y.updatedDateTime ?? 0).getTime() - new Date(x.updatedDateTime ?? 0).getTime())[0]
        : null
      const manualState = String(latestUpdate?.state ?? '').toLowerCase()
      if (manualState === 'thirdparty' || manualState === 'ignored') continue

      const maxScore = Number(ctrl.maxScore ?? 0)
      if (maxScore <= 0) continue
      const achieved = achievedByControl.get(ctrl.controlName) ?? 0
      const gap = maxScore - achieved
      if (gap <= 0) continue // fully achieved for this tenant — not a finding

      const severity = ctrl.rank <= 10 ? 'critical' : ctrl.rank <= 30 ? 'warning' : 'info'
      findings.push({
        org_id,
        finding_id: `score:${ctrl.id}`,
        source: 'secure_score',
        category: 'posture',
        severity,
        title: ctrl.title ?? ctrl.controlName ?? ctrl.id,
        description: `Control not fully achieved. Score: ${achieved}/${maxScore}${manualState ? ` (marked ${manualState} in Secure Score)` : ''}.`,
        control: mapScoreControl(ctrl.controlCategory ?? ''),
        recommendation: ctrl.remediation ?? 'Review and implement this control in Microsoft Secure Score.',
        subject_id: ctrl.id,
        subject_name: ctrl.title ?? ctrl.controlName ?? ctrl.id,
        subject_email: null,
        raw_data: { ...ctrl, achievedScore: achieved, latestScoreTotal: latestScore?.currentScore ?? null },
      })
    }

    if (findings.length > 0) {
      const { error: upsertErr } = await supabase.from('defender_findings').upsert(findings, { onConflict: 'org_id,finding_id' })
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`)
    }

    // Only prune when Graph calls succeeded, so a permissions error doesn't wipe findings
    if (graphErrors.length === 0) {
      const activeIds = new Set(findings.map(f => f.finding_id))
      const { data: existing } = await supabase.from('defender_findings').select('finding_id').eq('org_id', org_id)
      const stale = (existing ?? []).map(r => r.finding_id).filter(id => !activeIds.has(id))
      for (let i = 0; i < stale.length; i += 100) {
        await supabase.from('defender_findings').delete().eq('org_id', org_id).in('finding_id', stale.slice(i, i + 100))
      }
    }

    return json({
      findings_upserted: findings.length,
      breakdown: {
        alerts: findings.filter(f => f.source === 'alert').length,
        posture: findings.filter(f => f.source === 'secure_score').length,
      },
      secure_score: latestScore?.currentScore ?? null,
      ...(graphErrors.length ? { warnings: graphErrors } : {}),
    })
  } catch (err) {
    return errorResponse(err, 'defender-security')
  }
})

function mapAlertSeverity(s: string): 'critical' | 'warning' | 'info' {
  if (!s) return 'info'
  const l = s.toLowerCase()
  if (l === 'high' || l === 'critical') return 'critical'
  if (l === 'medium') return 'warning'
  return 'info'
}

function mapAlertCategory(source: string): string {
  const s = source.toLowerCase()
  if (s.includes('endpoint') || s.includes('mde')) return 'endpoint'
  if (s.includes('cloud') || s.includes('mcas') || s.includes('azure')) return 'cloud'
  if (s.includes('identity') || s.includes('aad') || s.includes('entra')) return 'identity'
  if (s.includes('office') || s.includes('365')) return 'office'
  return 'threat'
}

function mapAlertControl(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('malware') || c.includes('ransomware')) return 'NCA ECC 3-3 · Malware Protection'
  if (c.includes('credential') || c.includes('identity')) return 'NCA ECC 2-1-2 · Identity & Access Management'
  if (c.includes('data') || c.includes('exfil')) return 'NCA ECC 2-5 · Data Protection'
  if (c.includes('network') || c.includes('lateral')) return 'NCA ECC 3-1 · Network Security'
  return 'NCA ECC 3-4 · Vulnerability Management'
}

function mapScoreControl(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('identity')) return 'NCA ECC 2-1 · Identity & Access Management'
  if (c.includes('device') || c.includes('endpoint')) return 'NCA ECC 3-3 · Endpoint Protection'
  if (c.includes('data')) return 'NCA ECC 2-5 · Data Protection'
  if (c.includes('app')) return 'NCA ECC 3-2 · Application Security'
  return 'NCA ECC 3-4 · Security Posture'
}
