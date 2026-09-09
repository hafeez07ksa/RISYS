import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const useConnectorsStore = create((set, get) => ({
  connections: [],
  loading: false,
  error: null,

  setLoading: (loading) => set({ loading }),

  fetchConnections: async (orgId) => {
    if (!orgId) { set({ loading: false }); return }
    // Don't show spinner for background sync
    const { data, error } = await supabase
      .from('org_connectors')
      .select('*')
      .eq('org_id', orgId)
    if (!error && data) set({ connections: data })
  },

  addConnection: async (orgId, connectorId, meta = {}) => {
    const { data, error } = await supabase
      .from('org_connectors')
      .upsert({ org_id: orgId, connector_id: connectorId, status: 'active', connected_at: new Date().toISOString(), meta }, { onConflict: 'org_id,connector_id' })
      .select().single()
    if (error) throw error
    return data
  },

  removeConnection: async (orgId, connectorId) => {
    const { error } = await supabase.from('org_connectors').delete().eq('org_id', orgId).eq('connector_id', connectorId)
    if (error) throw error
  },

  mockConnect: (connectorId) => {
    set((state) => ({
      connections: [
        ...state.connections.filter(c => c.connector_id !== connectorId),
        { id: connectorId, connector_id: connectorId, status: 'active', connected_at: new Date().toISOString(), meta: {} }
      ]
    }))
  },

  mockDisconnect: (connectorId) => {
    set((state) => ({ connections: state.connections.filter(c => c.connector_id !== connectorId) }))
  },

  isConnected: (connectorId) => get().connections.some(c => c.connector_id === connectorId && c.status === 'active'),
  getConnection: (connectorId) => get().connections.find(c => c.connector_id === connectorId),
}))
