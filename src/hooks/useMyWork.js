import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

/* ── What is waiting on me ────────────────────────────────────────────────────
 *
 * One list across modules, from the database (my_work): the same rules the
 * RPCs enforce decide what appears, so nothing is listed that the person
 * could not actually act on — an approver never sees their own version, a
 * requester never sees their own exception, an uploader never reviews their
 * own evidence.
 *
 * Each module adds its kinds to my_work() and a label here. This is the
 * "my work" half of the role-dashboard pattern; the oversight half is each
 * module's own page.
 * -------------------------------------------------------------------------- */

export const WORK_KINDS = {
  policy_approval:    { label: 'Approve a policy version', group: 'Policies' },
  attestation:        { label: 'Read and accept',          group: 'Policies' },
  policy_review:      { label: 'Policy review due',        group: 'Policies' },
  exception_decision: { label: 'Decide an exception',      group: 'Exceptions' },
  evidence_review:    { label: 'Review evidence',          group: 'Evidence' },
  dsr_due:            { label: 'Data subject request',     group: 'Privacy' },
  breach_notify:      { label: 'Personal-data breach',     group: 'Privacy' },
  dpia_approval:      { label: 'Approve an impact assessment', group: 'Privacy' },
}

export function useMyWork() {
  const { organization, user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!organization?.id || !user?.id) { setLoading(false); return }
    const { data, error: err } = await supabase.rpc('my_work', { p_org: organization.id })
    setError(err?.message || null)
    // Dated items first (soonest due), then the oldest waiting.
    const rows = (data || []).slice().sort((a, b) => {
      if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on)
      if (a.due_on) return -1
      if (b.due_on) return 1
      return String(a.since || '').localeCompare(String(b.since || ''))
    })
    setItems(err ? [] : rows)
    setLoading(false)
  }, [organization?.id, user?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { items, loading, error, refetch: fetchAll }
}
