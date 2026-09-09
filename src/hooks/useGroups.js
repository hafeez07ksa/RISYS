import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useGroups() {
  const { organization } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchGroups = async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('org_groups')
      .select('*, org_group_members(count)')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: true })
    setGroups(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchGroups() }, [organization?.id])

  const createGroup = async ({ name, description, color }) => {
    const { data, error } = await supabase
      .from('org_groups')
      .insert({ org_id: organization.id, name, description, color })
      .select().single()
    if (error) throw error
    await fetchGroups()
    return data
  }

  const updateGroup = async (id, updates) => {
    const { error } = await supabase
      .from('org_groups')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    await fetchGroups()
  }

  const deleteGroup = async (id) => {
    await supabase.from('org_groups').delete().eq('id', id)
    await fetchGroups()
  }

  return { groups, loading, createGroup, updateGroup, deleteGroup, refetch: fetchGroups }
}
