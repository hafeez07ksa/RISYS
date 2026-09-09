import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useTasks(filters = {}) {
  const { organization } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })

    if (filters.status)      query = query.eq('status', filters.status)
    if (filters.priority)    query = query.eq('priority', filters.priority)
    if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
    if (filters.incident_id) query = query.eq('incident_id', filters.incident_id)

    const { data, error } = await query
    if (!error) setTasks(data || [])
    setLoading(false)
  }, [organization?.id, filters.status, filters.priority, filters.assigned_to, filters.incident_id])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const createTask = async (data) => {
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ ...data, org_id: organization.id })
      .select().single()
    if (error) throw error

    // Notify the assignee if different from creator
    if (data.assigned_to && data.assigned_to !== data.created_by) {
      await supabase.from('notifications').insert({
        org_id:  organization.id,
        user_id: data.assigned_to,
        type:    'task_assigned',
        title:   `Task assigned: ${data.title}`,
        body:    `You have been assigned a ${data.priority || 'medium'} priority task.`,
        link:    `/app/tasks/${task.id}`,
      })
    }

    await fetchTasks()
    return task
  }

  const updateTask = async (id, updates) => {
    const extra = {}
    if (updates.status === 'done' && !updates.completed_at) {
      extra.completed_at = new Date().toISOString()
    }
    const { error } = await supabase
      .from('tasks')
      .update({ ...updates, ...extra })
      .eq('id', id)
    if (error) throw error
    await fetchTasks()
  }

  const deleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    await fetchTasks()
  }

  return { tasks, loading, createTask, updateTask, deleteTask, refetch: fetchTasks }
}
