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

    // The assignee is notified by the database (trigger task_notify) — also
    // when you assign yourself, as a record — and reminded at reminder_at by
    // send_task_reminders. Nothing to send from here.

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
