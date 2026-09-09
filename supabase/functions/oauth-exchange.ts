import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Token endpoint + credentials per connector
const CONNECTOR_CONFIG: Record<string, {
  tokenUrl: string
  clientIdEnv: string
  clientSecretEnv: string
}> = {
  jira: {
    tokenUrl:        'https://auth.atlassian.com/oauth/token',
    clientIdEnv:     'JIRA_CLIENT_ID',
    clientSecretEnv: 'JIRA_CLIENT_SECRET',
  },
  entra: {
    tokenUrl:        `https://login.microsoftonline.com/8ee79250-ef0a-4d0e-b57f-a078ad30700f/oauth2/v2.0/token`,
    clientIdEnv:     'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
  },
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { connectorId, code, redirectUri, orgId } = body

  if (!connectorId || !code || !redirectUri || !orgId) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const config = CONNECTOR_CONFIG[connectorId]
  if (!config) {
    return new Response(JSON.stringify({ error: `Unsupported connector: ${connectorId}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const clientId     = Deno.env.get(config.clientIdEnv)
  const clientSecret = Deno.env.get(config.clientSecretEnv)

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: `Secrets not configured for ${connectorId}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  // Exchange auth code for tokens
  const tokenRes = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokenRes.ok || tokens.error) {
    console.error(`[oauth-exchange] ${connectorId} token error:`, tokens)
    return new Response(JSON.stringify({ error: tokens.error_description || tokens.error || 'Token exchange failed' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  // Store tokens securely in org_connectors.meta
  // Never expose tokens to the frontend — store server-side only
  const tokenExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: dbError } = await supabase
    .from('org_connectors')
    .upsert({
      org_id:       orgId,
      connector_id: connectorId,
      status:       'active',
      connected_at: new Date().toISOString(),
      meta: {
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expiry:  tokenExpiry,
        scope:         tokens.scope || null,
        connected_via: 'oauth',
      },
    }, { onConflict: 'org_id,connector_id' })
    .select()
    .single()

  if (dbError) {
    console.error('[oauth-exchange] DB error:', dbError)
    return new Response(JSON.stringify({ error: 'Failed to save connection' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  console.log(`[oauth-exchange] ${connectorId} connected for org ${orgId}`)

  return new Response(JSON.stringify({ success: true, connector: connectorId }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
})
