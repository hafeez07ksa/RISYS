import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useIncidents(filters = {}) {
  const { organization } = useAuth()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchIncidents = async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)

    let query = supabase
      .from('incidents')
      .select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })

    if (filters.severity)     query = query.eq('severity', filters.severity)
    if (filters.status)       query = query.eq('status', filters.status)
    if (filters.connector_id) query = query.eq('connector_id', filters.connector_id)
    if (filters.search)       query = query.ilike('title', `%${filters.search}%`)

    const { data, error } = await query
    if (error) setError(error.message)
    else setIncidents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchIncidents()
    if (!organization?.id) return

    const channel = supabase.channel(`incidents:${organization.id}`)
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'incidents',
      filter: `org_id=eq.${organization.id}`,
    }, () => fetchIncidents())
    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [organization?.id, filters.severity, filters.status, filters.connector_id, filters.search])

  return { incidents, loading, error, refetch: fetchIncidents }
}
