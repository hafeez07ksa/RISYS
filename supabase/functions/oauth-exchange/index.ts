// oauth-exchange — server-side authorization-code exchange for secret-holding connectors.
// V6: caller must be an admin of orgId (previously anyone could overwrite any org's connection).
// V4: tokens go to Vault via connector_secret_set; org_connectors.meta never holds tokens.
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

const CONNECTOR_CONFIGS: Record<string, { tokenUrl: string; clientIdEnv: string; clientSecretEnv: string }> = {
  jira:   { tokenUrl: 'https://auth.atlassian.com/oauth/token',  clientIdEnv: 'JIRA_CLIENT_ID',   clientSecretEnv: 'JIRA_CLIENT_SECRET' },
  google: { tokenUrl: 'https://oauth2.googleapis.com/token',     clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET' },
  notion: { tokenUrl: 'https://api.notion.com/v1/oauth/token',   clientIdEnv: 'NOTION_CLIENT_ID', clientSecretEnv: 'NOTION_CLIENT_SECRET' },
  slack:  { tokenUrl: 'https://slack.com/api/oauth.v2.access',   clientIdEnv: 'SLACK_CLIENT_ID',  clientSecretEnv: 'SLACK_CLIENT_SECRET' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { connectorId, code, redirectUri, orgId } = await req.json().catch(() => ({}))
    if (!connectorId || !code || !redirectUri || !orgId) throw new HttpError(400, 'Missing required fields')

    const supabase = adminClient()
    await requireOrgRole(req, supabase, orgId)

    const config = CONNECTOR_CONFIGS[connectorId]
    if (!config) throw new HttpError(400, `Unsupported connector: ${connectorId}`)

    const clientId = Deno.env.get(config.clientIdEnv)
    const clientSecret = Deno.env.get(config.clientSecretEnv)
    if (!clientId || !clientSecret) throw new HttpError(500, `OAuth credentials not configured for ${connectorId}`)

    const isNotion = connectorId === 'notion'
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: isNotion
        ? { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
        : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: isNotion
        ? JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
        : new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString(),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || tokens.error) {
      console.warn(`[oauth-exchange] token exchange failed connector=${connectorId} status=${tokenResponse.status} error=${tokens.error}`)
      throw new HttpError(400, tokens.error_description || tokens.error || 'Token exchange failed')
    }

    // deno-lint-ignore no-explicit-any
    const profile: Record<string, any> = {}
    const meta: Record<string, unknown> = { connected_via: 'oauth', scope: tokens.scope ?? null }

    if (connectorId === 'jira') {
      try {
        const me = await fetch('https://api.atlassian.com/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
        if (me.ok) {
          const d = await me.json()
          profile.email = d.email; profile.displayName = d.name; profile.accountId = d.account_id
        }
        const r = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
        })
        const resources = await r.json()
        if (Array.isArray(resources) && resources.length > 0) {
          profile.cloud_id = resources[0].id
          profile.cloud_name = resources[0].name
          profile.cloud_url = resources[0].url
          meta.cloud_id = resources[0].id
        }
      } catch (e) {
        console.warn('[oauth-exchange] jira profile lookup failed:', (e as Error).message)
      }
    }
    meta.profile = profile

    const { error: vaultErr } = await supabase.rpc('connector_secret_set', {
      p_org: orgId,
      p_connector: connectorId,
      p_secret: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        scope: tokens.scope ?? null,
      },
    })
    if (vaultErr) throw new Error(`Failed to store credentials: ${vaultErr.message}`)

    const { error: upsertError } = await supabase.from('org_connectors').upsert({
      org_id: orgId,
      connector_id: connectorId,
      status: 'active',
      connected_at: new Date().toISOString(),
      meta,
    }, { onConflict: 'org_id,connector_id' })
    if (upsertError) throw new Error(`Failed to save connection: ${upsertError.message}`)

    return json({ success: true, profile })
  } catch (err) {
    return errorResponse(err, 'oauth-exchange')
  }
})
