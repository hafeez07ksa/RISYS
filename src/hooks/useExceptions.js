import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail } from '@/lib/policies'

/* ── Exceptions ───────────────────────────────────────────────────────────────
 *
 * A time-limited, approved departure from a policy, requirement, control,
 * finding or vendor obligation. The rating decides the authority that must
 * decide it (low → risk owner … critical → board) and the longest it may run.
 * The requester cannot decide their own; expired ones close themselves every
 * night (expire_exceptions() in policy_daily()). All writes are RPCs.
 * -------------------------------------------------------------------------- */

export function useExceptions() {
  const { organization } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase.from('exceptions').select('*')
      .eq('org_id', organization.id).order('requested_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const request = async (v) => {
    const { data, error } = await supabase.rpc('request_exception', {
      p_org: organization.id, p_subject_type: v.subject_type, p_subject_id: v.subject_id, p_subject_label: v.subject_label || null,
      p_title: v.title, p_justification: v.justification, p_compensating: v.compensating_controls,
      p_rating: v.risk_rating, p_starts: v.starts_on, p_expires: v.expires_on,
    })
    fail(error)
    await fetchAll()
    return data
  }

  return { items, loading, refetch: fetchAll, request }
}

export function useException(id) {
  const { organization, user } = useAuth()
  const [item, setItem] = useState(null)
  const [authority, setAuthority] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOne = useCallback(async () => {
    if (!organization?.id || !id) return
    const { data } = await supabase.from('exceptions').select('*').eq('id', id).eq('org_id', organization.id).maybeSingle()
    setItem(data)
    if (data && user?.id) {
      const r = await supabase.rpc('user_authority', { p_org: organization.id, p_user: user.id, p_subject_owner: data.subject_owner_id })
      setAuthority(r.data ?? null)
    }
    setLoading(false)
  }, [organization?.id, id, user?.id])

  useEffect(() => { setLoading(true); fetchOne() }, [fetchOne])

  const call = async (name, args) => { const { error } = await supabase.rpc(name, args); fail(error); await fetchOne() }
  return {
    item, loading, authority, refetch: fetchOne,
    decide: (approve, comment) => call('decide_exception', { p_id: id, p_approve: approve, p_comment: comment }),
    revoke: (reason) => call('revoke_exception', { p_id: id, p_reason: reason }),
  }
}
