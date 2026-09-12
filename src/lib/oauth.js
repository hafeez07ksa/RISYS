// ── PKCE helpers ──────────────────────────────────────────────────────────────

async function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function buildOAuthUrl(connector) {
  const params = new URLSearchParams({
    ...connector.oauthParams,
    state: btoa(JSON.stringify({ connectorId: connector.id, ts: Date.now() })),
  })

  let codeVerifier = null
  if (connector.usePKCE) {
    codeVerifier = await generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  return { url: `${connector.oauthUrl}?${params.toString()}`, codeVerifier }
}

// ── Redirect flow ─────────────────────────────────────────────────────────────
//
// Replaces openOAuthPopup(). Instead of opening a popup window, we:
//   1. Save all state needed after the redirect into sessionStorage
//   2. Navigate the current tab to the OAuth provider
//
// OAuthCallbackPage reads this state when the provider redirects back.

const STORAGE_KEY = 'risys_oauth_pending'

export async function startOAuthRedirect(connector, orgId) {
  const { url, codeVerifier } = await buildOAuthUrl(connector)

  // Persist everything OAuthCallbackPage will need
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    connectorId:  connector.id,
    orgId,
    codeVerifier, // null for non-PKCE connectors
    returnTo:     window.location.pathname, // so we can navigate back on error
  }))

  // Full-page redirect — works in all corporate browsers and through VPNs
  window.location.href = url
}

export function getPendingOAuth() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

export function clearPendingOAuth() {
  sessionStorage.removeItem(STORAGE_KEY)
}

// ── Token exchange via Supabase edge function ─────────────────────────────────
//
// Used by OAuthCallbackPage after the redirect returns.
// For Entra/PKCE we exchange in-browser first (Microsoft requires the Origin
// header), then persist via direct Supabase upsert.
// For all other connectors we call the oauth-exchange edge function.

export async function exchangeCodeInBrowser({ connector, code, codeVerifier }) {
  const redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:5173/oauth/callback'
  const clientId    = connector.oauthParams.client_id

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    code_verifier: codeVerifier,
  })

  const res = await fetch(connector.tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  const tokens = await res.json()
  if (!res.ok || tokens.error) {
    throw new Error(tokens.error_description || tokens.error || 'Token exchange failed')
  }
  return tokens
}

export async function exchangeCodeForTokens({ connectorId, code, orgId, codeVerifier }) {
  const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const redirectUri     = import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:5173/oauth/callback'

  const res = await fetch(`${supabaseUrl}/functions/v1/oauth-exchange`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey':        supabaseAnonKey,
    },
    body: JSON.stringify({ connectorId, code, redirectUri, orgId, codeVerifier }),
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Token exchange failed')
  return data
}
