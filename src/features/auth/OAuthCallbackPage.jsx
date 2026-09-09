import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CONNECTORS } from '@/lib/constants'
import {
  getPendingOAuth,
  clearPendingOAuth,
  exchangeCodeInBrowser,
  exchangeCodeForTokens,
} from '@/lib/oauth'
import { logAudit, AUDIT } from '@/lib/audit'
import { Spinner } from '@/components/ui/Spinner'
import { CheckCircle, XCircle } from 'lucide-react'

// ── Tenant resolution (mirrors useConnectors logic) ───────────────────────────

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))
  } catch (_) { return {} }
}

async function resolveEntraTenantId(accessToken, idToken) {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/organization?$select=id,displayName', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = await res.json()
      const tenantId   = data?.value?.[0]?.id
      const tenantName = data?.value?.[0]?.displayName
      if (tenantId && tenantId !== '9188040d-6c67-4c5b-b112-36a304b66dad') {
        return { tenantId, tenantName }
      }
    }
  } catch (_) {}

  if (idToken) {
    const claims = decodeJwtPayload(idToken)
    const tenantId = claims.tid
    if (tenantId && tenantId !== '9188040d-6c67-4c5b-b112-36a304b66dad') {
      return { tenantId, tenantName: null }
    }
  }

  return { tenantId: null, tenantName: null }
}

// ── Post-connect actions (mirrors POST_CONNECT in useConnectors) ───────────────

async function runPostConnect(connectorId, orgId) {
  const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'apikey':        supabaseAnonKey,
  }

  if (connectorId === 'jira') {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/register-jira-webhook`, {
        method: 'POST', headers,
        body: JSON.stringify({ org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        console.warn('[Sentrix] Jira webhook registration failed:', data.error || data)
      } else {
        console.log('[Sentrix] Jira webhook registered:', data.webhookId)
      }
    } catch (err) { console.warn('[Sentrix] Jira webhook error:', err) }
  }

  if (connectorId === 'entra') {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/entra-directory`, {
        method: 'POST', headers,
        body: JSON.stringify({ org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        console.warn('[Sentrix] Entra directory sync failed:', data.error)
      } else {
        console.log('[Sentrix] Entra synced:', data.users_synced, 'users')
      }
    } catch (err) { console.warn('[Sentrix] Entra sync error:', err) }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

const PHASE = {
  PROCESSING: 'processing',
  SUCCESS:    'success',
  ERROR:      'error',
}

export function OAuthCallbackPage() {
  const [searchParams]  = useSearchParams()
  const navigate        = useNavigate()
  const [phase, setPhase]   = useState(PHASE.PROCESSING)
  const [errorMsg, setErrorMsg] = useState('')
  const [connectorName, setConnectorName] = useState('')

  useEffect(() => {
    handleCallback()
  }, [])

  async function handleCallback() {
    const code  = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDesc = searchParams.get('error_description')

    // ── Provider returned an error ─────────────────────────────────────────
    if (error) {
      clearPendingOAuth()
      setErrorMsg(errorDesc || error)
      setPhase(PHASE.ERROR)
      return
    }

    if (!code) {
      clearPendingOAuth()
      setErrorMsg('No authorization code received from provider.')
      setPhase(PHASE.ERROR)
      return
    }

    // ── Read pending state written by startOAuthRedirect ──────────────────
    const pending = getPendingOAuth()
    if (!pending) {
      setErrorMsg('OAuth session expired or was opened in an unexpected way. Please try connecting again.')
      setPhase(PHASE.ERROR)
      return
    }

    const { connectorId, orgId, codeVerifier } = pending
    const connector = CONNECTORS.find(c => c.id === connectorId)

    if (!connector) {
      clearPendingOAuth()
      setErrorMsg(`Unknown connector: ${connectorId}`)
      setPhase(PHASE.ERROR)
      return
    }

    setConnectorName(connector.name)
    clearPendingOAuth() // clear early — avoids double-processing on back-nav

    try {
      if (connector.usePKCE) {
        // ── Entra: browser-side exchange + tenant resolution + direct upsert ──
        const tokens = await exchangeCodeInBrowser({ connector, code, codeVerifier })

        const { tenantId, tenantName } = await resolveEntraTenantId(
          tokens.access_token,
          tokens.id_token
        )

        let profile = {}
        try {
          const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          if (meRes.ok) {
            const me = await meRes.json()
            profile = {
              email:       me.mail || me.userPrincipalName,
              displayName: me.displayName,
              upn:         me.userPrincipalName,
            }
          }
        } catch (_) {}

        const { error: upsertError } = await supabase
          .from('org_connectors')
          .upsert({
            org_id:       orgId,
            connector_id: connectorId,
            status:       'active',
            connected_at: new Date().toISOString(),
            meta: {
              access_token:  tokens.access_token,
              refresh_token: tokens.refresh_token  ?? null,
              expires_in:    tokens.expires_in     ?? null,
              expires_at:    tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                : null,
              token_type:    tokens.token_type     ?? 'Bearer',
              scope:         tokens.scope          ?? null,
              tenant_id:     tenantId,
              tenant_name:   tenantName,
              profile,
              connected_via: 'oauth',
            },
          }, { onConflict: 'org_id,connector_id' })

        if (upsertError) throw new Error('Failed to save connection: ' + upsertError.message)

        if (!tenantId) {
          throw new Error(
            'Connected but no Azure AD tenant found. Please sign in with a work/school ' +
            'account that has an Azure AD subscription, not a personal Microsoft account.'
          )
        }

      } else {
        // ── All other connectors: exchange via Supabase edge function ─────────
        await exchangeCodeForTokens({ connectorId, code, orgId, codeVerifier })
      }

      // ── Post-connect actions (webhook registration, initial sync) ─────────
      await runPostConnect(connectorId, orgId)

      // Audit log the connection
      await logAudit(orgId, AUDIT.CONNECTOR_CONNECTED, 'connector', null, connectorId)

      setPhase(PHASE.SUCCESS)

      // Redirect to the connector's settings page after a short success flash
      const SETTINGS_ROUTES = {
        jira:  '/app/settings/jira',
        entra: '/app/settings/entra',
        m365:  '/app/settings/m365',
      }
      setTimeout(() => {
        navigate(SETTINGS_ROUTES[connectorId] || '/app/settings', { replace: true })
      }, 1800)

    } catch (err) {
      console.error('[Sentrix] OAuthCallbackPage error:', err)
      setErrorMsg(err.message || 'Connection failed')
      setPhase(PHASE.ERROR)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: '#f8f7f7' }}
    >
      {phase === PHASE.PROCESSING && (
        <>
          <Spinner size="md" />
          <p className="text-sm font-medium" style={{ color: '#1a1314' }}>
            {connectorName ? `Connecting ${connectorName}…` : 'Completing authorization…'}
          </p>
          <p className="text-xs" style={{ color: '#8a7070' }}>This will only take a moment</p>
        </>
      )}

      {phase === PHASE.SUCCESS && (
        <>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: '#f0fdf4' }}
          >
            <CheckCircle size={24} style={{ color: '#16a34a' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: '#1a1314' }}>
            {connectorName} connected!
          </p>
          <p className="text-xs" style={{ color: '#8a7070' }}>Redirecting to settings…</p>
        </>
      )}

      {phase === PHASE.ERROR && (
        <div className="w-full max-w-sm rounded-xl p-6 shadow-sm text-center" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#fef2f2' }}
          >
            <XCircle size={24} style={{ color: '#dc2626' }} />
          </div>
          <p className="text-sm font-medium mb-2" style={{ color: '#1a1314' }}>Connection failed</p>
          <p className="text-xs mb-5 leading-relaxed" style={{ color: '#8a7070' }}>{errorMsg}</p>
          <button
            onClick={() => navigate('/app/settings', { replace: true })}
            className="btn-primary w-full"
          >
            Back to Settings
          </button>
        </div>
      )}
    </div>
  )
}
