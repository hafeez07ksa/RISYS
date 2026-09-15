// ingest-entra-events — inbound Entra sign-in events (n8n / automation).
// V3 fix: previously had no authentication at all.
// Requires header  x-risys-token: <per-tenant ingest token for connector "entra">
// and ?org_id=<uuid>. Fails closed when no token has been issued.
import { adminClient, corsHeaders, isUuid, json, verifyIngestToken } from '../_shared/auth.ts'

function mapRiskToSeverity(riskLevel: string, failureReason?: string): string {
  if (riskLevel === 'high') return 'critical'
  if (riskLevel === 'medium') return 'high'
  if (failureReason?.toLowerCase().includes('mfa')) return 'high'
  if (failureReason?.toLowerCase().includes('block')) return 'high'
  if (riskLevel === 'low') return 'medium'
  return 'low'
}

// deno-lint-ignore no-explicit-any
function shouldCreateIncident(event: any): boolean {
  if (event.status?.errorCode !== 0) return true
  if (event.riskLevelDuringSignIn && event.riskLevelDuringSignIn !== 'none') return true
  if (event.conditionalAccessStatus === 'failure') return true
  return false
}

const MAX_EVENTS = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const orgId = new URL(req.url).searchParams.get('org_id')
    if (!isUuid(orgId)) return json({ error: 'Unauthorized' }, 401)

    const supabase = adminClient()
    const ok = await verifyIngestToken(supabase, orgId, 'entra', req.headers.get('x-risys-token'))
    if (!ok) {
      console.warn('[ingest-entra-events] rejected: bad or missing x-risys-token')
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: org } = await supabase.from('organizations').select('status').eq('id', orgId).maybeSingle()
    if (org?.status !== 'active') return json({ error: 'Organisation is not active' }, 403)

    // deno-lint-ignore no-explicit-any
    let body: any
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    const events = (Array.isArray(body?.value) ? body.value : [body]).slice(0, MAX_EVENTS)

    const results: Array<Record<string, unknown>> = []
    for (const event of events) {
      if (!event?.id) continue
      const isFailure = event.status?.errorCode !== 0
      const riskLevel = event.riskLevelDuringSignIn || 'none'
      const failureReason = event.status?.failureReason || ''
      const mfaUsed = event.authenticationRequirement === 'multiFactorAuthentication'
      const location = event.location ? [event.location.city, event.location.countryOrRegion].filter(Boolean).join(', ') : null

      await supabase.from('entra_signin_logs').upsert({
        org_id: orgId,
        event_id: event.id,
        user_email: event.userPrincipalName,
        user_display: event.userDisplayName,
        ip_address: event.ipAddress,
        location,
        status: isFailure ? 'failure' : 'success',
        failure_reason: failureReason || null,
        risk_level: riskLevel,
        mfa_used: mfaUsed,
        app_name: event.appDisplayName,
        raw_data: event,
      }, { onConflict: 'org_id,event_id' })

      if (shouldCreateIncident(event)) {
        const severity = mapRiskToSeverity(riskLevel, failureReason)
        const title = isFailure
          ? `Failed sign-in: ${event.userPrincipalName || 'Unknown user'}`
          : `Risky sign-in detected: ${event.userPrincipalName || 'Unknown user'}`
        const description = [
          failureReason && `Reason: ${failureReason}`,
          event.ipAddress && `IP: ${event.ipAddress}`,
          location && `Location: ${location}`,
          event.appDisplayName && `App: ${event.appDisplayName}`,
          riskLevel !== 'none' && `Risk level: ${riskLevel}`,
          !mfaUsed && 'MFA: Not used',
        ].filter(Boolean).join('\n')

        await supabase.from('incidents').upsert({
          org_id: orgId,
          connector_id: 'entra',
          external_id: event.id,
          title, description, severity,
          status: 'open',
          source_type: isFailure ? 'Failed Sign-in' : 'Risky Sign-in',
          reporter: 'Microsoft Entra ID',
          raw_data: event,
        }, { onConflict: 'org_id,connector_id,external_id' })
        results.push({ event_id: event.id, incident_created: true, severity })
      } else {
        results.push({ event_id: event.id, incident_created: false })
      }
    }

    return json({ success: true, processed: results.length, results })
  } catch (err) {
    console.error('[ingest-entra-events] error:', (err as Error).message)
    return json({ error: 'Internal server error' }, 500)
  }
})
