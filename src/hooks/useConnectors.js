import { useEffect } from 'react'
import { useConnectorsStore } from '@/store/connectorsStore'
import { useAuth } from './useAuth'
import { startOAuthRedirect } from '@/lib/oauth'
import { CONNECTORS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { logAudit, AUDIT } from '@/lib/audit'

// V4: OAuth tokens are never held in the browser or in org_connectors.meta.
// Microsoft syncs use app-only tokens server-side; Jira tokens live in Vault
// and are refreshed inside edge functions.

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

  return {
    connections:    store.connections,
    loading:        store.loading,
    error:          store.error,
    isConnected:    store.isConnected,
    getConnection:  store.getConnection,
    connect,
    disconnect,
  }
}
