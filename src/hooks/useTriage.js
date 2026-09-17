import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { logAudit, AUDIT } from '@/lib/audit'

// ============================================================
// Finding triage records.
//
// One row per finding per org. The row is the human decision: which risk
// it became or was attached to, or why it was closed. Findings are
// re-derived on every connector sync, so a finding closed as a false
// positive stays closed the next time the same rule fires for the same
// subject — that is what the stable finding key is for.
// ============================================================

export function useFindingTriage() {
  const { organization, user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchRecords = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('finding_triage')
      .select('*')
      .eq('org_id', organization.id)
    if (error) setMigrated(false)
    setRecords(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const byKey = useMemo(() => new Map(records.map(r => [r.finding_key, r])), [records])

  const recordTriage = async ({ finding, disposition, reasonCode = null, note = null, riskId = null }) => {
    const { data, error } = await supabase
      .from('finding_triage')
      .upsert({
        org_id: organization.id,
        finding_key: finding.key,
        connector_id: finding.connectorId || null,
        finding_title: finding.title || null,
        severity: finding.severity || null,
        subject_id: finding.subject?.id != null ? String(finding.subject.id) : null,
        subject_name: finding.subject?.name || null,
        control_ref: finding.control || null,
        disposition,
        reason_code: reasonCode,
        note: note || null,
        risk_id: riskId,
        decided_by: user?.id,
        decided_at: new Date().toISOString(),
      }, { onConflict: 'org_id,finding_key' })
      .select().single()
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.FINDING_TRIAGED, 'finding', riskId, finding.title, {
      disposition, reason: reasonCode, subject: finding.subject?.name || null, connector: finding.connectorId || null,
    })
    await fetchRecords()
    return data
  }

  const reopen = async (record) => {
    const { error } = await supabase.from('finding_triage').delete().eq('id', record.id)
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.FINDING_TRIAGE_REOPENED, 'finding', null, record.finding_title, {
      was: record.disposition, reason: record.reason_code,
    })
    await fetchRecords()
  }

  return { records, byKey, loading, migrated, recordTriage, reopen, refetch: fetchRecords }
}

/** Findings that raised or were attached to one risk. */
export function useRiskFindings(riskId) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLinks = useCallback(async () => {
    if (!riskId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('finding_triage')
      .select('*')
      .eq('risk_id', riskId)
      .order('decided_at', { ascending: false })
    const rows = data || []

    // Whether the source system still reports each finding. Connectors that
    // don't keep finding history yet simply have no row here (status unknown).
    const keys = rows.map(r => r.finding_key).filter(Boolean)
    let statusByKey = new Map()
    if (keys.length) {
      const { data: statuses } = await supabase
        .from('v_finding_status')
        .select('finding_key, status, resolved_at, last_seen_at')
        .in('finding_key', keys)
      statusByKey = new Map((statuses || []).map(s => [s.finding_key, s]))
    }
    setLinks(rows.map(r => {
      const st = statusByKey.get(r.finding_key)
      return { ...r, source_status: st?.status || null, source_resolved_at: st?.resolved_at || null }
    }))
    setLoading(false)
  }, [riskId])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  return { links, loading, refetch: fetchLinks }
}
