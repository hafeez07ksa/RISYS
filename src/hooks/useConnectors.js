import { useEffect } from 'react'
import { useConnectorsStore } from '@/store/connectorsStore'
import { useAuth } from './useAuth'
import { startOAuthRedirect } from '@/lib/oauth'
import { CONNECTORS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { logAudit, AUDIT } from '@/lib/audit'

// ── Token refresh ─────────────────────────────────────────────────────────────

function isTokenExpiringSoon(meta) {
  if (!meta?.expires_at) return false
  return new Date(meta.expires_at).getTime() - Date.now() < 5 * 60 * 1000
}

async function refreshEntraToken(orgId, connector) {
  const meta = connector?.meta
  if (!meta?.refresh_token) throw new Error('No refresh token stored — please reconnect Entra ID.')

  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID
  const body = new URLSearchParams({
    client_id:     clientId,
    grant_type:    'refresh_token',
    refresh_token: meta.refresh_token,
    scope:         'openid email profile offline_access User.Read',
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${meta.tenant_id || 'common'}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  )
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Token refresh failed')
  }

  const newMeta = {
    ...meta,
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? meta.refresh_token,
    expires_in:    data.expires_in    ?? null,
    expires_at:    data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  }

  await supabase
    .from('org_connectors')
    .update({ meta: newMeta })
    .eq('org_id', orgId)
    .eq('connector_id', 'entra')

  return { access_token: data.access_token, meta: newMeta }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useConnectors() {
  const { organization } = useAuth()
  const store = useConnectorsStore()

  useEffect(() => {
    store.setLoading(false)
    if (organization?.id) store.fetchConnections(organization.id)
  }, [organization?.id])

  // connect() — initiates the OAuth redirect flow.
  //
  // This function DOES NOT return a resolved token. It saves pending state to
  // sessionStorage then redirects the browser to the OAuth provider.
  // All post-redirect work (token exchange, tenant resolution, upsert,
  // post-connect actions) is handled by OAuthCallbackPage.
  const connect = async (connectorId) => {
    const connector = CONNECTORS.find(c => c.id === connectorId)
    if (!connector) throw new Error('Unknown connector')

    const hasClientId = connector.oauthParams?.client_id &&
      connector.oauthParams.client_id !== 'undefined'

    if (!hasClientId) {
      // Dev/demo mode — no real OAuth credentials configured
      store.mockConnect(connectorId)
      return { mock: true }
    }

    if (!organization?.id) throw new Error('No active organisation')

    // startOAuthRedirect saves state to sessionStorage and navigates away.
    // Execution does not continue past this point.
    await startOAuthRedirect(connector, organization.id)
  }

  const disconnect = async (connectorId) => {
    store.mockDisconnect(connectorId)
    if (organization?.id) {
      try {
        await store.removeConnection(organization.id, connectorId)
        await logAudit(organization.id, AUDIT.CONNECTOR_DISCONNECTED, 'connector', null, connectorId)
      } catch (_) {}
    }
  }

  const getValidEntraToken = async () => {
    const connector = store.getConnection('entra')
    const meta = connector?.meta
    if (!meta?.access_token) throw new Error('Entra ID is not connected.')
    if (isTokenExpiringSoon(meta)) {
      const { access_token } = await refreshEntraToken(organization.id, connector)
      store.mockConnect('entra')
      return access_token
    }
    return meta.access_token
  }

  return {
    connections:    store.connections,
    loading:        store.loading,
    error:          store.error,
    isConnected:    store.isConnected,
    getConnection:  store.getConnection,
    connect,
    disconnect,
    getValidEntraToken,
  }
}
