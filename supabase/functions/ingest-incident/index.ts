// ingest-incident — inbound Jira / n8n incidents.
// V2 fix: no payload-controlled bypass. Two authenticated paths, both fail closed:
//   1. Jira dynamic webhook (registered by register-jira-webhook):
//      Authorization: Bearer <HS256 JWT signed with JIRA_CLIENT_SECRET>
//      AND ?token=<per-tenant token for "jira"> binding the call to one organisation.
//   2. n8n / manual: header  x-risys-token: <per-tenant token for "jira-n8n">
import { adminClient, corsHeaders, isUuid, json, verifyHs256Jwt, verifyIngestToken } from '../_shared/auth.ts'

const DEFAULT_PRIORITY_MAP: Record<string, string> = {
  highest: 'critical', high: 'high', medium: 'medium', low: 'low', lowest: 'informational',
}
const STATUS_MAP: Record<string, string> = {
  'to do': 'open', open: 'open', new: 'open',
  'in progress': 'in_progress', 'in review': 'in_progress',
  done: 'resolved', resolved: 'resolved',
  closed: 'closed', cancelled: 'closed', canceled: 'closed',
}
const ALLOWED_CONNECTORS = new Set(['jira'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = new URL(req.url)
    const raw = await req.text()
    // deno-lint-ignore no-explicit-any
    let body: any
    try { body = JSON.parse(raw) } catch { return json({ error: 'Invalid JSON' }, 400) }

    const isJiraNative = typeof body?.webhookEvent === 'string'
    const org_id = url.searchParams.get('org_id') || body?.org_id
    const connector_id = url.searchParams.get('connector_id') || body?.connector_id || 'jira'
    const issue = body?.issue

    if (!isUuid(org_id) || !ALLOWED_CONNECTORS.has(connector_id)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabase = adminClient()

    // ── Authentication (fail closed) ────────────────────────────────────────
    if (isJiraNative) {
      const jiraSecret = Deno.env.get('JIRA_CLIENT_SECRET')
      const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
      const jwtOk = !!jiraSecret && !!bearer && !!(await verifyHs256Jwt(bearer, jiraSecret))
      const tokenOk = await verifyIngestToken(supabase, org_id, 'jira', url.searchParams.get('token'))
      if (!jwtOk || !tokenOk) {
        console.warn(`[ingest-incident] rejected jira webhook: jwt=${jwtOk} token=${tokenOk}`)
        return json({ error: 'Unauthorized' }, 401)
      }
    } else {
      const tokenOk = await verifyIngestToken(supabase, org_id, 'jira-n8n', req.headers.get('x-risys-token'))
      if (!tokenOk) {
        console.warn('[ingest-incident] rejected manual call: bad or missing x-risys-token')
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    if (!issue || typeof issue !== 'object') return json({ error: 'Missing issue' }, 400)

    // Ignore events for suspended organisations
    const { data: org } = await supabase.from('organizations').select('status').eq('id', org_id).maybeSingle()
    if (org?.status !== 'active') return json({ error: 'Organisation is not active' }, 403)

    const { data: mappings } = await supabase
      .from('connector_mappings')
      .select('source_value, target_value')
      .eq('org_id', org_id)
      .eq('connector_id', connector_id)
      .eq('mapping_type', 'issue_type_to_severity')

    const issueType: string = issue.fields?.issuetype?.name || ''
    const adminMapping = mappings?.find(m => String(m.source_value).toLowerCase() === issueType.toLowerCase())

    let severity = 'medium'
    if (adminMapping) {
      severity = adminMapping.target_value
    } else {
      const priority = String(issue.fields?.priority?.name || 'medium').toLowerCase()
      severity = DEFAULT_PRIORITY_MAP[priority] || 'medium'
    }

    const status = STATUS_MAP[String(issue.fields?.status?.name || 'open').toLowerCase()] || 'open'

    const incident = {
      org_id,
      connector_id,
      external_id: String(issue.key ?? ''),
      external_url: typeof issue.self === 'string' ? `${issue.self.split('/rest/')[0]}/browse/${issue.key}` : null,
      title: issue.fields?.summary || 'Untitled Issue',
      description: issue.fields?.description
        ? (typeof issue.fields.description === 'string'
            ? issue.fields.description
            : issue.fields.description?.content?.[0]?.content?.[0]?.text || '')
        : null,
      severity,
      status,
      assignee: issue.fields?.assignee?.displayName || null,
      reporter: issue.fields?.reporter?.displayName || null,
      source_type: issueType,
      raw_data: issue,
      resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
    }
    if (!incident.external_id) return json({ error: 'Issue key missing' }, 400)

    const { data, error } = await supabase
      .from('incidents')
      .upsert(incident, { onConflict: 'org_id,connector_id,external_id' })
      .select('id')
      .single()

    if (error) {
      console.error('[ingest-incident] DB error:', error.message)
      return json({ error: 'Failed to save incident' }, 500)
    }
    return json({ success: true, incident_id: data.id })
  } catch (err) {
    console.error('[ingest-incident] error:', (err as Error).message)
    return json({ error: 'Internal server error' }, 500)
  }
})
