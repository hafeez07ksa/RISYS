import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

// ── Suggested risks ──────────────────────────────────────────────────────────
//
// RISYS raises these itself (refresh_risk_suggestions, after every scan and
// nightly): one per NCA ECC area with open findings or failing measurements,
// written, scored and mapped. A person approves, edits or dismisses them; the
// decisions run as database functions so the rules hold whatever the client.

export function useRiskSuggestions() {
  const { organization } = useAuth()
  const [rows, setRows] = useState([])
  const [riskRefs, setRiskRefs] = useState({})   // risk uuid -> RSK-xxxx
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data, error: err } = await supabase
      .from('risk_suggestions')
      .select('*')
      .eq('org_id', organization.id)
      .order('first_raised_at', { ascending: false })
    if (err) { setError(err); setRows([]); setLoading(false); return }
    setError(null)
    setRows(data || [])
    const ids = [...new Set((data || []).flatMap(r => [r.risk_id, r.existing_risk_id]).filter(Boolean))]
    if (ids.length) {
      const { data: risks } = await supabase.from('risks').select('id, risk_id, title').in('id', ids)
      setRiskRefs(Object.fromEntries((risks || []).map(r => [r.id, r])))
    } else setRiskRefs({})
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rpc = async (fn, args) => {
    const { data, error: err } = await supabase.rpc(fn, args)
    if (err) throw new Error(err.message)
    return data
  }

  return {
    rows, riskRefs, loading, error, refetch: fetchAll,
    checkNow: async () => { const r = await rpc('request_risk_suggestions', { p_org: organization.id }); await fetchAll(); return r },
    save: async (id, patch) => { await rpc('update_risk_suggestion', { p_id: id, p_patch: patch }); await fetchAll() },
    accept: async (id, admit) => { const riskId = await rpc('accept_risk_suggestion', { p_id: id, p_admit: admit }); await fetchAll(); return riskId },
    dismiss: async (id, reason) => { await rpc('dismiss_risk_suggestion', { p_id: id, p_reason: reason }); await fetchAll() },
    restore: async (id) => { await rpc('restore_risk_suggestion', { p_id: id }); await fetchAll() },
  }
}

// Count for the sidebar badge and the register banner. Cheap: head-only count.
export function usePendingSuggestionCount(enabled = true) {
  const { organization } = useAuth()
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!enabled || !organization?.id) { setCount(0); return }
    const { count: n } = await supabase
      .from('risk_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', organization.id)
      .eq('status', 'pending')
    setCount(n || 0)
  }, [enabled, organization?.id])

  useEffect(() => { fetchCount() }, [fetchCount])
  return { count, refetch: fetchCount }
}
