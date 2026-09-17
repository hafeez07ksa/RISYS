// Shared auth helpers for RISYS edge functions.
// V6: every browser-invoked function verifies the caller's session JWT and
// asserts active-organisation membership (and role) before touching data.
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-risys-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(err: unknown, tag: string): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status)
  console.error(`[${tag}]`, (err as Error)?.message ?? err)
  return json({ error: (err as Error)?.message || 'Internal server error' }, 500)
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export const ORG_ADMIN_ROLES = ['admin', 'owner']

/**
 * Verifies the signed-in user's JWT (the anon key is rejected) and asserts
 * they hold one of `roles` in `orgId`, and that the organisation is active.
 */
export async function requireOrgRole(
  req: Request,
  admin: SupabaseClient,
  orgId: unknown,
  roles: string[] = ORG_ADMIN_ROLES,
): Promise<{ user: User; role: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const jwt = header.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) throw new HttpError(401, 'Missing session token')

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) throw new HttpError(401, 'Invalid or expired session')

  if (!isUuid(orgId)) throw new HttpError(400, 'Invalid org_id')

  const { data: m, error: mErr } = await admin
    .from('organization_members')
    .select('role, organizations!inner(status)')
    .eq('org_id', orgId)
    .eq('user_id', data.user.id)
    .maybeSingle()

  // deno-lint-ignore no-explicit-any
  const status = (m as any)?.organizations?.status
  if (mErr || !m || status !== 'active' || !roles.includes((m as any).role)) {
    throw new HttpError(403, 'You do not have access to this organisation')
  }
  return { user: data.user, role: (m as any).role }
}

// ── Internal (scheduled) calls ────────────────────────────────────────────────
// The scan dispatcher calls connector functions server-to-server. It sends the
// service-role key as the bearer (to pass the gateway) and the internal secret
// in x-risys-internal. The secret lives in Vault and is readable only by the
// service role through internal_scheduler_secret().

export async function isInternalCall(req: Request, admin: SupabaseClient): Promise<boolean> {
  const presented = req.headers.get('x-risys-internal')
  if (!presented) return false
  const { data: expected, error } = await admin.rpc('internal_scheduler_secret')
  if (error || typeof expected !== 'string' || !expected) return false
  return timingSafeEqual(await sha256Hex(presented), await sha256Hex(expected))
}

/**
 * Either a signed-in org admin (manual scan) or a verified internal call for an
 * active organisation (scheduled scan).
 */
export async function requireOrgAccess(
  req: Request,
  admin: SupabaseClient,
  orgId: unknown,
  roles: string[] = ORG_ADMIN_ROLES,
): Promise<{ user: User | null; trigger: 'manual' | 'scheduled' }> {
  if (req.headers.has('x-risys-internal')) {
    if (!(await isInternalCall(req, admin))) throw new HttpError(401, 'Invalid internal credential')
    if (!isUuid(orgId)) throw new HttpError(400, 'Invalid org_id')
    const { data: org } = await admin.from('organizations').select('status').eq('id', orgId).maybeSingle()
    if (org?.status !== 'active') throw new HttpError(403, 'Organisation is not active')
    return { user: null, trigger: 'scheduled' }
  }
  const { user } = await requireOrgRole(req, admin, orgId, roles)
  return { user, trigger: 'manual' }
}

// ── Constant-time helpers ─────────────────────────────────────────────────────

const enc = new TextEncoder()

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a), bb = enc.encode(b)
  if (ab.length !== bb.length) return false // inputs are fixed-length SHA-256 hex
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/**
 * V2/V3: per-tenant ingest credential check. Fails closed when no token has
 * been issued for (org, connector). Only the SHA-256 hash is stored.
 */
export async function verifyIngestToken(
  admin: SupabaseClient, orgId: string, connectorId: string, presented: string | null,
): Promise<boolean> {
  if (!presented || !isUuid(orgId)) return false
  const { data } = await admin
    .from('ingest_tokens')
    .select('token_hash')
    .eq('org_id', orgId)
    .eq('connector_id', connectorId)
    .maybeSingle()
  const expected = data?.token_hash
  const actual = await sha256Hex(presented)
  if (!expected) {
    timingSafeEqual(actual, actual) // keep timing similar
    return false
  }
  return timingSafeEqual(actual, expected)
}

// ── HS256 JWT verification (Jira OAuth 2.0 dynamic webhooks) ──────────────────

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function verifyHs256Jwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [h, p, s] = token.split('.')
    if (!h || !p || !s) return null
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))
    if (header.alg !== 'HS256') return null
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(s), enc.encode(`${h}.${p}`))
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && payload.exp < now - 60) return null
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null
    return payload
  } catch {
    return null
  }
}

// ── Microsoft app-only token ──────────────────────────────────────────────────

export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
export const MDE_SCOPE   = 'https://api.securitycenter.microsoft.com/.default'

/** A token request Microsoft refused. `notProvisioned` means the target API does not exist in the tenant (no licence). */
export class MicrosoftTokenError extends Error {
  code: string
  notProvisioned: boolean
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    // AADSTS500011: resource principal not found; AADSTS650057: invalid resource for the client.
    this.notProvisioned = /AADSTS500011|AADSTS650057|invalid_resource/i.test(`${code} ${message}`)
  }
}

export async function getMicrosoftAppToken(tenantId: string, scope: string = GRAPH_SCOPE): Promise<string> {
  if (!tenantId || tenantId === 'common' || !isUuid(tenantId)) {
    throw new HttpError(400, 'No valid Entra tenant ID. Reconnect Entra from Settings.')
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      scope,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new MicrosoftTokenError(data.error ?? `http_${res.status}`, `App token failed: ${data.error_description || data.error || res.status}`)
  }
  return data.access_token
}

// ── Jira tokens (Vault) with server-side refresh ──────────────────────────────

export async function getJiraAccessToken(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data: secret, error } = await admin.rpc('connector_secret_get', { p_org: orgId, p_connector: 'jira' })
  if (error) throw new Error(`Vault read failed: ${error.message}`)
  if (!secret?.access_token) throw new HttpError(400, 'Jira is not connected. Reconnect Jira from Settings.')

  const expiresAt = secret.expires_at ? new Date(secret.expires_at).getTime() : 0
  if (expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) return secret.access_token
  if (!secret.refresh_token) return secret.access_token // best effort; caller will surface a 401

  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('JIRA_CLIENT_ID'),
      client_secret: Deno.env.get('JIRA_CLIENT_SECRET'),
      refresh_token: secret.refresh_token,
    }),
  })
  const t = await res.json()
  if (!res.ok || t.error) throw new HttpError(400, 'Jira session expired. Reconnect Jira from Settings.')

  await admin.rpc('connector_secret_set', {
    p_org: orgId, p_connector: 'jira',
    p_secret: {
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? secret.refresh_token, // Atlassian rotates refresh tokens
      expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      scope: t.scope ?? secret.scope ?? null,
    },
  })
  return t.access_token
}
