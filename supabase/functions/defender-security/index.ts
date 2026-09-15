// defender-security — Defender alerts + Secure Score posture gaps.
// V6: caller must be an admin of org_id.
// V4/B3: uses an app-only Graph token (client credentials) instead of a stored delegated token.
//        Requires application permissions SecurityAlert.Read.All and SecurityEvents.Read.All
//        with admin consent in the customer tenant.
import { adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

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
      if (!ctrl.implementationStatus || ctrl.implementationStatus === 'thirdParty') continue
      if (ctrl.implementationStatus === 'implemented') continue
      const severity = ctrl.rank <= 10 ? 'critical' : ctrl.rank <= 30 ? 'warning' : 'info'
      findings.push({
        org_id,
        finding_id: `score:${ctrl.id}`,
        source: 'secure_score',
        category: 'posture',
        severity,
        title: ctrl.title ?? ctrl.id,
        description: `Control not fully implemented. Status: ${ctrl.implementationStatus}. Score: ${ctrl.currentScore ?? 0}/${ctrl.maxScore ?? 0}.`,
        control: mapScoreControl(ctrl.controlCategory ?? ''),
        recommendation: ctrl.remediation ?? 'Review and implement this control in Microsoft Secure Score.',
        subject_id: ctrl.id,
        subject_name: ctrl.title ?? ctrl.id,
        subject_email: null,
        raw_data: { ...ctrl, latestScoreTotal: latestScore?.currentScore ?? null },
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
