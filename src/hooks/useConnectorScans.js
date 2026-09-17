import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { callEdgeFunction } from '@/lib/functions'
import { useAuth } from './useAuth'
import { logAudit, AUDIT } from '@/lib/audit'

// ============================================================
// Connector scans: history (connector_scan_runs), automatic schedule
// (connector_schedules) and "Scan now".
//
// Each run records what every data source returned, so the UI can say
// "alerts could not be read" instead of showing a misleading zero.
// ============================================================

export const SCAN_INTERVALS = [
  { value: 60,    label: 'Every hour' },
  { value: 360,   label: 'Every 6 hours' },
  { value: 720,   label: 'Every 12 hours' },
  { value: 1440,  label: 'Daily' },
  { value: 10080, label: 'Weekly' },
]

export const SOURCE_STATE_META = {
  ok:            { label: 'Working',        tone: 'ok' },
  partial:       { label: 'In progress',    tone: 'warn' },
  not_licensed:  { label: 'Not available',  tone: 'muted' },
  no_permission: { label: 'Access refused', tone: 'error' },
  error:         { label: 'Failed',         tone: 'error' },
  skipped:       { label: 'Skipped',        tone: 'muted' },
}

export function useConnectorScans(connectorId, { historyLimit = 10 } = {}) {
  const { organization } = useAuth()
  const orgId = organization?.id

  const [runs, setRuns] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true) // false until conn_01 is applied
  const [scanning, setScanning] = useState(false)

  const refresh = useCallback(async () => {
    if (!orgId) { setLoading(false); return }
    const [runsRes, schedRes] = await Promise.all([
      supabase.from('connector_scan_runs')
        .select('id, trigger, status, started_at, finished_at, sources, counts, warnings, error')
        .eq('org_id', orgId).eq('connector_id', connectorId)
        .order('started_at', { ascending: false }).limit(historyLimit),
      supabase.from('connector_schedules')
        .select('*').eq('org_id', orgId).eq('connector_id', connectorId).maybeSingle(),
    ])
    if (runsRes.error) setAvailable(false)
    setRuns(runsRes.data || [])
    setSchedule(schedRes.data || null)
    setLoading(false)
  }, [orgId, connectorId, historyLimit])

  useEffect(() => { refresh() }, [refresh])

  // A scheduled scan may be running in the background: poll briefly while any run is in progress.
  useEffect(() => {
    if (!runs.some(isActiveRun)) return
    const t = setTimeout(refresh, 5000)
    return () => clearTimeout(t)
  }, [runs, refresh])

  const scanNow = useCallback(async (functionName) => {
    setScanning(true)
    try {
      const result = await callEdgeFunction(functionName, { org_id: orgId })
      await logAudit(orgId, AUDIT.CONNECTOR_SYNCED, 'connector', null, connectorId, {
        status: result?.status ?? null, counts: result?.counts ?? null,
      })
      return result
    } finally {
      setScanning(false)
      await refresh()
    }
  }, [orgId, connectorId, refresh])

  const saveSchedule = useCallback(async ({ enabled, intervalMinutes }) => {
    const { data: { user } } = await supabase.auth.getUser()
    const row = {
      org_id: orgId,
      connector_id: connectorId,
      enabled,
      interval_minutes: intervalMinutes,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }
    // A newly enabled or re-timed schedule runs at the next dispatcher tick.
    if (enabled && (!schedule?.enabled || schedule?.interval_minutes !== intervalMinutes)) {
      row.next_run_at = new Date().toISOString()
      row.consecutive_failures = 0
    }
    const { error } = await supabase.from('connector_schedules')
      .upsert(row, { onConflict: 'org_id,connector_id' })
    if (error) throw new Error(error.message)
    await logAudit(orgId, AUDIT.CONNECTOR_SCHEDULE, 'connector', null, connectorId, {
      enabled, interval_minutes: intervalMinutes,
    })
    await refresh()
  }, [orgId, connectorId, schedule, refresh])

  return {
    runs,
    latestRun: runs[0] || null,
    lastCompletedRun: runs.find(r => !isActiveRun(r)) || null,
    schedule,
    loading,
    available,
    scanning,
    scanNow,
    saveSchedule,
    refresh,
  }
}

// A run still marked "running" after 10 minutes was cut off (function timeout).
const STALE_MS = 10 * 60 * 1000
export function isActiveRun(run) {
  return run?.status === 'running' && Date.now() - new Date(run.started_at).getTime() < STALE_MS
}
export function runStatus(run) {
  if (!run) return null
  if (run.status === 'running' && !isActiveRun(run)) return 'failed'
  return run.status
}

export function formatRelative(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const future = diff < 0
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  let text
  if (mins < 1) text = 'less than a minute'
  else if (mins < 60) text = `${mins} min`
  else if (mins < 60 * 24) text = `${Math.round(mins / 60)} h`
  else text = `${Math.round(mins / 1440)} d`
  return future ? `in ${text}` : `${text} ago`
}
