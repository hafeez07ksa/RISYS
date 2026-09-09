import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useMappings(connectorId) {
  const { organization } = useAuth()
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchMappings = async () => {
    if (!organization?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('connector_mappings')
      .select('*')
      .eq('org_id', organization.id)
      .eq('connector_id', connectorId)
    setMappings(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchMappings() }, [organization?.id, connectorId])

  const saveMapping = async (sourceValue, targetValue) => {
    const { data, error } = await supabase
      .from('connector_mappings')
      .upsert({
        org_id: organization.id,
        connector_id: connectorId,
        mapping_type: 'issue_type_to_severity',
        source_value: sourceValue,
        target_value: targetValue,
      }, { onConflict: 'org_id,connector_id,mapping_type,source_value' })
      .select().single()
    if (error) throw error
    await fetchMappings()
    return data
  }

  const deleteMapping = async (id) => {
    await supabase.from('connector_mappings').delete().eq('id', id)
    await fetchMappings()
  }

  return { mappings, loading, saveMapping, deleteMapping, refetch: fetchMappings }
}
