import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TENANT_ID     = '8ee79250-ef0a-4d0e-b57f-a078ad30700f'
const CLIENT_ID     = Deno.env.get('MICROSOFT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!

// Refresh an expired access token using the stored refresh_token
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string, refresh_token: string, expiry: string }> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        scope:         'openid email profile User.Read.All Directory.Read.All AuditLog.Read.All offline_access',
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expiry:        new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}

// Get a valid access token — refresh if expired
async function getValidToken(orgId: string): Promise<string> {
  const { data: conn, error } = await supabase
    .from('org_connectors')
    .select('meta')
    .eq('org_id', orgId)
    .eq('connector_id', 'entra')
    .single()

  if (error || !conn) throw new Error('Entra not connected for this org')

  const meta = conn.meta || {}
  const now  = new Date()

  // Check if token is still valid (with 5 min buffer)
  if (meta.access_token && meta.token_expiry) {
    const expiry = new Date(meta.token_expiry)
    if (expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
      return meta.access_token
    }
  }

  // Token expired — refresh it
  if (!meta.refresh_token) throw new Error('No refresh token stored. User must reconnect Entra.')

  const refreshed = await refreshAccessToken(meta.refresh_token)

  // Update stored tokens
  await supabase
    .from('org_connectors')
    .update({
      meta: {
        ...meta,
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expiry:  refreshed.expiry,
      }
    })
    .eq('org_id', orgId)
    .eq('connector_id', 'entra')

  return refreshed.access_token
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { org_id } = body
  if (!org_id) return new Response('Missing org_id', { status: 400 })

  try {
    const accessToken = await getValidToken(org_id)

    // Pull last 50 sign-in events from Microsoft Graph
    // Filter: last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const graphUrl = `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=50&$orderby=createdDateTime desc&$filter=createdDateTime ge ${since}`

    const graphRes = await fetch(graphUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    const graphData = await graphRes.json()

    if (!graphRes.ok) {
      console.error('[entra-sync] Graph error:', graphData)
      throw new Error(graphData.error?.message || 'Graph API error')
    }

    const signIns = graphData.value || []
    console.log(`[entra-sync] Fetched ${signIns.length} sign-ins for org ${org_id}`)

    if (signIns.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    // Map to our table schema
    const rows = signIns.map((s: any) => ({
      org_id,
      external_id:  s.id,
      user_email:   s.userPrincipalName || null,
      user_display: s.userDisplayName   || null,
      app_name:     s.appDisplayName    || null,
      status:       s.status?.errorCode === 0 ? 'success' : 'failure',
      risk_level:   s.riskLevelDuringSignIn || s.riskDetail || 'none',
      ip_address:   s.ipAddress || null,
      location:     s.location
        ? [s.location.city, s.location.countryOrRegion].filter(Boolean).join(', ')
        : null,
      raw:          s,
      created_at:   s.createdDateTime || new Date().toISOString(),
    }))

    const { error: upsertError } = await supabase
      .from('entra_signin_logs')
      .upsert(rows, { onConflict: 'org_id,external_id' })

    if (upsertError) throw new Error(upsertError.message)

    return new Response(JSON.stringify({ success: true, synced: rows.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[entra-sync] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
