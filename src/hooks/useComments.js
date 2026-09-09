import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useComments(type, id) {
  const { organization, user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)

  const tableMap = { incident: 'incident_comments', task: 'task_comments', risk: 'risk_comments' }
  const fkMap    = { incident: 'incident_id',       task: 'task_id',       risk: 'risk_id' }
  const table = tableMap[type]
  const fk    = fkMap[type]

  const fetchComments = async () => {
    if (!id || !table) return
    setLoading(true)
    const { data } = await supabase.from(table).select('*').eq(fk, id).order('created_at', { ascending: true })
    setComments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()
    if (!id || !table) return
    const channel = supabase.channel(`${table}:${id}`)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${fk}=eq.${id}` }, () => fetchComments())
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, type])

  const addComment = async (content) => {
    if (!content.trim() || !user || !organization) return
    const { error } = await supabase.from(table).insert({ [fk]: id, org_id: organization.id, user_id: user.id, content: content.trim() })
    if (error) throw error
    await fetchComments()
  }

  const deleteComment = async (commentId) => {
    await supabase.from(table).delete().eq('id', commentId)
    await fetchComments()
  }

  return { comments, loading, addComment, deleteComment }
}
