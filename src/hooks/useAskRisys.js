import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { callEdgeFunction } from '@/lib/functions'

/* ── Ask RISYS data ───────────────────────────────────────────────────────────
 *
 * Reads go straight to the tables (RLS: a person sees only their own
 * conversations). Writes never happen here: asking a question goes through the
 * ai-gateway edge function, which checks the workspace's AI setting, runs the
 * read-only tools as the signed-in person, and stores the turn and the log row.
 * -------------------------------------------------------------------------- */

/** Whether Ask RISYS is on for this workspace. */
export function useAiSettings(orgId) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!orgId) return
    let live = true
    setLoading(true)
    supabase.from('ai_settings').select('enabled, mode, daily_request_limit').eq('org_id', orgId).maybeSingle()
      .then(({ data }) => { if (live) { setSettings(data || { enabled: false, mode: 'off' }); setLoading(false) } })
    return () => { live = false }
  }, [orgId])
  const enabled = !!settings?.enabled && settings?.mode !== 'off'
  return { settings, enabled, loading }
}

/** The signed-in person's conversations in this workspace, newest first. */
export function useConversations(orgId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const refetch = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase.from('ai_conversations')
      .select('id, title, updated_at').eq('org_id', orgId)
      .order('updated_at', { ascending: false }).limit(40)
    setList(data || [])
    setLoading(false)
  }, [orgId])
  useEffect(() => { refetch() }, [refetch])
  return { conversations: list, loading, refetch }
}

/** One conversation's turns, plus `ask` to add the next one. */
export function useConversation(orgId, conversationId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  // Set when `ask` has just created this conversation: its turns are already
  // on screen, so loading them again would only flicker.
  const createdRef = useRef(null)

  useEffect(() => {
    setError('')
    if (!conversationId) { setMessages([]); return }
    if (createdRef.current === conversationId) { createdRef.current = null; return }
    let live = true
    setLoading(true)
    supabase.from('ai_messages')
      .select('id, role, content, sources, created_at')
      .eq('conversation_id', conversationId).order('created_at', { ascending: true })
      .then(({ data }) => { if (live) { setMessages(data || []); setLoading(false) } })
    return () => { live = false }
  }, [conversationId])

  /* Shows the question at once, then the answer when it arrives. Resolves to
     the conversation id, which is new when this was the first question. */
  const ask = useCallback(async (question) => {
    const q = question.trim()
    if (!q || asking) return null
    setError('')
    setAsking(true)
    const pending = { id: `pending-${Date.now()}`, role: 'user', content: q, sources: [], created_at: new Date().toISOString() }
    setMessages(m => [...m, pending])
    try {
      const res = await callEdgeFunction('ai-gateway', {
        org_id: orgId, conversation_id: conversationId || null, question: q,
      })
      setMessages(m => [...m, res.message])
      if (!conversationId) createdRef.current = res.conversation_id
      return res.conversation_id
    } catch (e) {
      setMessages(m => m.filter(x => x.id !== pending.id))
      setError(e.message || 'Ask RISYS could not answer just now.')
      return null
    } finally {
      setAsking(false)
    }
  }, [orgId, conversationId, asking])

  const reset = useCallback(() => { setMessages([]); setError('') }, [])

  return { messages, loading, asking, error, ask, reset }
}
