import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

/* The report archive. Every generated report is kept — the file in the
 * private `reports` bucket, the data it was built from in report_runs.snapshot,
 * and a SHA-256 of the file. Only the presentation record (to whom it was
 * presented or submitted, when, with notes) may change afterwards; the
 * database refuses anything else, and refuses deletion outright. */
export function useReports({ engagementId } = {}) {
  const { organization } = useAuth()
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    let q = supabase.from('report_runs')
      .select(`id, report_type, title, period_label, period_start, period_end, engagement_id,
               file_path, file_size, sha256, status, presented_at, presented_to, notes,
               generated_at, generated_by,
               generator:profiles!report_runs_generated_by_fkey ( full_name, email )`)
      .eq('org_id', organization.id)
      .order('generated_at', { ascending: false })
    if (engagementId) q = q.eq('engagement_id', engagementId)
    const { data } = await q
    setRuns(data || [])
    setLoading(false)
  }, [organization?.id, engagementId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const recordPresentation = async (id, { status, presented_at, presented_to, notes }) => {
    const { error } = await supabase.from('report_runs')
      .update({ status, presented_at: presented_at || null, presented_to: presented_to || null, notes: notes || null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  return { runs, loading, refetch: fetchAll, recordPresentation }
}

export const REPORT_STATUSES = [
  { value: 'generated', label: 'Generated' },
  { value: 'presented', label: 'Presented' },
  { value: 'submitted', label: 'Submitted' },
]
