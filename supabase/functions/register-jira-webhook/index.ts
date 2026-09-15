// register-jira-webhook — registers a Jira dynamic webhook for one organisation.
// V6: caller must be an admin of org_id.
// V4: Jira token read from Vault (refreshed server-side when near expiry).
// V2: the webhook URL carries a freshly issued per-tenant ingest token; ingest-incident
//     additionally verifies Jira's HS256 JWT. Re-registering rotates the token.
import { adminClient, corsHeaders, errorResponse, getJiraAccessToken, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const { org_id, projectKey, jql } = body
    const supabase = adminClient()
    const { user } = await requireOrgRole(req, supabase, org_id)

    const { data: connector, error: connErr } = await supabase
      .from('org_connectors').select('meta').eq('org_id', org_id).eq('connector_id', 'jira').single()
    if (connErr || !connector) throw new HttpError(400, 'Jira not connected')

    const accessToken = await getJiraAccessToken(supabase, org_id)

    const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    const resources = await resourcesRes.json()
    if (!Array.isArray(resources) || !resources.length) throw new HttpError(400, 'No Jira sites found')
    const cloudId = resources[0].id
    const siteUrl = resources[0].url

    // Remove the previously registered webhook (if any) before rotating the token
    const previousId = connector.meta?.jira_webhook_id
    if (previousId) {
      await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookIds: [previousId] }),
      }).catch(() => {})
    }

    const { data: ingestToken, error: tokErr } = await supabase.rpc('issue_ingest_token', {
      p_org: org_id, p_connector: 'jira', p_actor: user.id,
    })
    if (tokErr || !ingestToken) throw new Error('Failed to issue ingest token')

    const ingestUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-incident` +
      `?org_id=${encodeURIComponent(org_id)}&connector_id=jira&token=${encodeURIComponent(ingestToken)}`

    // Jira rejects an empty jqlFilter; quote-escape a supplied project key
    const safeProject = projectKey ? String(projectKey).replace(/["\\]/g, '') : ''
    const jqlFilter = (jql && String(jql).trim())
      || (safeProject ? `project = "${safeProject}"` : 'created >= "2000/01/01"')

    const webhookRes = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: ingestUrl, webhooks: [{ events: ['jira:issue_created', 'jira:issue_updated'], jqlFilter }] }),
    })
    const webhookData = await webhookRes.json()
    const result = webhookData?.webhookRegistrationResult?.[0]
    const webhookId = result?.createdWebhookId
    if (!webhookRes.ok || !webhookId) {
      console.warn('[register-jira-webhook] registration failed:', JSON.stringify(result?.errors ?? webhookData?.errorMessages ?? null))
      return json({ error: 'Failed to register webhook', details: result?.errors ?? null }, 400)
    }

    await supabase.from('org_connectors').update({
      meta: {
        ...connector.meta,
        jira_cloud_id: cloudId,
        jira_site_url: siteUrl,
        jira_webhook_id: webhookId,
        jira_webhook_jql: jqlFilter,
        webhook_registered_at: new Date().toISOString(),
      },
    }).eq('org_id', org_id).eq('connector_id', 'jira')

    // The ingest URL contains a secret — never returned to the browser
    return json({ success: true, cloudId, siteUrl, webhookId, jqlFilter })
  } catch (err) {
    return errorResponse(err, 'register-jira-webhook')
  }
})
