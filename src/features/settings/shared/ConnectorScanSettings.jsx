import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, RotateCw, AlertTriangle, CheckCircle, X,
  ArrowRight, CalendarClock, History, Info,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { usePermissions } from '@/hooks/usePermissions'
import { Spinner } from '@/components/ui/Spinner'
import {
  useConnectorScans, SCAN_INTERVALS, formatRelative, isActiveRun, runStatus,
} from '@/hooks/useConnectorScans'
import { SourceStatePill, SOURCE_LABELS } from '@/features/findings/ScanHealth'

const STATUS_STYLE = {
  success: { label: 'Success',    color: '#166534', bg: '#f0fdf4', bd: '#bbf7d0' },
  partial: { label: 'Incomplete', color: '#92400e', bg: '#fffbeb', bd: '#fde68a' },
  failed:  { label: 'Failed',     color: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
  running: { label: 'Running',    color: '#1e40af', bg: '#eff6ff', bd: '#bfdbfe' },
}

function Card({ title, icon: Icon, right, children }) {
  return (
    <div className="rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #f0ecec' }}>
        {Icon && <Icon size={14} style={{ color: '#5D0F0F' }} />}
        <p className="text-sm font-medium flex-1" style={{ color: '#1a1314' }}>{title}</p>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.failed
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: s.color, background: s.bg, border: `1px solid ${s.bd}` }}>
      {s.label}
    </span>
  )
}

const fmt = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Shared settings page for scan-based connectors: summary cards, data sources
 * (with permissions and how to fix), automatic scan schedule, and scan history.
 *
 * props:
 *   connectorId, functionName, title, accent, findingsPath
 *   sources:      [{ key, Icon, permissions, requires, note?, howTo? }]
 *   summaryCards: (lastCompletedRun) => [{ label, value, sub, warn? }]
 *   openTotal:    (run) => number
 *   changes:      (run) => string
 *   scanMessage:  (result) => string
 *   notes:        optional node shown under the summary
 */
export function ConnectorScanSettings({
  connectorId, functionName, title, accent, findingsPath,
  sources, summaryCards, openTotal, changes, scanMessage, notes,
}) {
  const navigate = useNavigate()
  const { isAdmin } = usePermissions()
  const {
    runs, latestRun, lastCompletedRun, schedule, loading, available, scanning,
    scanNow, saveSchedule, refresh,
  } = useConnectorScans(connectorId, { historyLimit: 10 })

  const [msg, setMsg] = useState(null) // { tone: 'ok'|'warn'|'error', text }
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedInterval, setSchedInterval] = useState(360)
  const [savingSched, setSavingSched] = useState(false)

  useEffect(() => {
    setSchedEnabled(!!schedule?.enabled)
    setSchedInterval(schedule?.interval_minutes ?? 360)
  }, [schedule])

  const handleScan = async () => {
    setMsg(null)
    try {
      const r = await scanNow(functionName)
      setMsg({
        tone: r?.status === 'success' ? 'ok' : 'warn',
        text: `${r?.status === 'success' ? 'Scan complete' : 'Scan finished with gaps (see Data sources)'}: ${scanMessage(r)}`,
      })
    } catch (e) {
      setMsg({ tone: 'error', text: e.message })
    }
  }

  const handleSaveSchedule = async () => {
    setSavingSched(true)
    try {
      await saveSchedule({ enabled: schedEnabled, intervalMinutes: Number(schedInterval) })
      setMsg({ tone: 'ok', text: schedEnabled ? 'Automatic scans saved. The first one runs within 15 minutes.' : 'Automatic scans turned off.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e.message })
    } finally {
      setSavingSched(false)
    }
  }

  const running = isActiveRun(latestRun) || scanning
  const lastSources = lastCompletedRun?.sources || {}
  const labels = SOURCE_LABELS[connectorId] || {}
  const schedDirty = schedEnabled !== !!schedule?.enabled || Number(schedInterval) !== (schedule?.interval_minutes ?? 360)
  const msgStyle = {
    ok:    { bg: '#f0fdf4', bd: '#bbf7d0', color: '#166534', Icon: CheckCircle },
    warn:  { bg: '#fffbeb', bd: '#fde68a', color: '#92400e', Icon: AlertTriangle },
    error: { bg: '#fef2f2', bd: '#fecaca', color: '#b91c1c', Icon: AlertTriangle },
  }[msg?.tone || 'ok']

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={title}
        subtitle="Connection, data sources and scan schedule"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={refresh} title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            {isAdmin && (
              <button onClick={handleScan} disabled={running}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg flex-shrink-0"
                style={{ background: accent, color: '#fff', border: 'none', opacity: running ? 0.6 : 1 }}>
                {running ? <Spinner size="sm" /> : <RotateCw size={13} />}
                {running ? 'Scanning…' : 'Scan now'}
              </button>
            )}
            <button onClick={() => navigate(findingsPath)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              View findings <ArrowRight size={13} />
            </button>
            <button onClick={() => navigate('/app/settings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {msg && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg text-xs"
            style={{ background: msgStyle.bg, border: `1px solid ${msgStyle.bd}`, color: msgStyle.color }}>
            <msgStyle.Icon size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span className="flex-1">{msg.text}</span>
            <button onClick={() => setMsg(null)} aria-label="Dismiss"><X size={12} /></button>
          </div>
        )}

        {!available && (
          <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            Scan history needs the database migration <span className="font-mono">20260917090000_conn_01_finding_lifecycle_and_scan_runs.sql</span>.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {summaryCards(lastCompletedRun).map(c => <Summary key={c.label} {...c} />)}
            </div>
            {notes}

            {/* Data sources */}
            <Card title="Data sources" icon={Info}
              right={lastCompletedRun && <span className="text-[11px]" style={{ color: '#8a7070' }}>As of {fmt(lastCompletedRun.finished_at || lastCompletedRun.started_at)}</span>}>
              <div className="flex flex-col">
                {sources.map((src, i) => {
                  const res = lastSources[src.key]
                  const label = labels[src.key] || { name: src.key, what: '' }
                  return (
                    <div key={src.key} className="flex gap-3 py-3" style={{ borderTop: i ? '1px solid #f5f3f3' : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <src.Icon size={14} style={{ color: accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" style={{ color: '#1a1314' }}>{label.name}</p>
                          <span className="text-xs" style={{ color: '#8a7070' }}>{label.what}</span>
                          <span style={{ marginInlineStart: 'auto' }}>
                            {res ? <SourceStatePill state={res.state} /> : <span className="text-[11px]" style={{ color: '#a09090' }}>Not scanned</span>}
                          </span>
                        </div>
                        {res && res.state !== 'ok' && res.detail && (
                          <p className="text-xs mt-1" style={{ color: res.state === 'not_licensed' ? '#6b5555' : res.state === 'partial' ? '#92400e' : '#b91c1c' }}>{res.detail}</p>
                        )}
                        <p className="text-[11px] mt-1" style={{ color: '#8a7070' }}>
                          <strong>Permission:</strong> {src.permissions} · <strong>Requires:</strong> {src.requires}
                        </p>
                        {src.note && <p className="text-[11px] mt-0.5" style={{ color: '#8a7070' }}>{src.note}</p>}
                        {src.howTo && res && res.state !== 'ok' && res.state !== 'partial' && (
                          <p className="text-[11px] mt-1 px-2 py-1.5 rounded" style={{ color: '#4a3a3a', background: '#f8f7f7' }}>
                            <strong>How to fix:</strong> {src.howTo}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Schedule */}
            <Card title="Automatic scans" icon={CalendarClock}>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm" style={{ color: '#1a1314', cursor: isAdmin ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={schedEnabled} disabled={!isAdmin}
                    onChange={e => setSchedEnabled(e.target.checked)} />
                  Scan automatically
                </label>
                <select value={schedInterval} disabled={!isAdmin || !schedEnabled}
                  onChange={e => setSchedInterval(Number(e.target.value))}
                  className="text-xs px-2 py-1.5 rounded-md"
                  style={{ border: '1px solid #e5e0e0', background: '#fff', color: '#1a1314' }}>
                  {SCAN_INTERVALS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {isAdmin && (
                  <button onClick={handleSaveSchedule} disabled={!schedDirty || savingSched}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: !schedDirty || savingSched ? 0.5 : 1 }}>
                    {savingSched ? 'Saving…' : 'Save'}
                  </button>
                )}
                <span className="text-xs" style={{ color: '#8a7070', marginInlineStart: 'auto' }}>
                  {schedule?.enabled
                    ? <>Next scan {formatRelative(schedule.next_run_at)}{schedule.last_run_at ? ` · last ${formatRelative(schedule.last_run_at)} (${schedule.last_status})` : ''}</>
                    : 'Off — scans run only when someone clicks Scan now.'}
                </span>
              </div>
              {schedule?.consecutive_failures > 0 && (
                <p className="text-xs mt-2" style={{ color: '#b91c1c' }}>
                  The last {schedule.consecutive_failures} automatic scan(s) failed, so RISYS is retrying less often. Check Data sources above.
                </p>
              )}
              {!isAdmin && <p className="text-xs mt-2" style={{ color: '#8a7070' }}>Only organisation admins can change the schedule.</p>}
            </Card>

            {/* History */}
            <Card title="Recent scans" icon={History}>
              {runs.length === 0 ? (
                <p className="text-xs" style={{ color: '#8a7070' }}>No scans yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: '#8a7070', textAlign: 'start' }}>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Started</th>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Trigger</th>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Result</th>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Open findings</th>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Changes</th>
                      <th className="font-normal py-1" style={{ textAlign: 'start' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(r => {
                      const total = openTotal(r)
                      const secs = r.finished_at ? Math.max(1, Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000)) : null
                      const change = changes(r)
                      return (
                        <tr key={r.id} style={{ borderTop: '1px solid #f5f3f3', color: '#1a1314' }} title={r.error || (r.warnings || []).join('\n') || undefined}>
                          <td className="py-2">{fmt(r.started_at)}</td>
                          <td className="py-2 capitalize">{r.trigger}</td>
                          <td className="py-2"><StatusBadge status={runStatus(r)} /></td>
                          <td className="py-2">{r.status === 'running' ? '—' : total}</td>
                          <td className="py-2" style={{ color: '#6b5555' }}>{change || '—'}</td>
                          <td className="py-2" style={{ color: '#6b5555' }}>{secs ? `${secs}s` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export function Summary({ label, value, sub, warn }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${warn ? '#fecaca' : '#e5e0e0'}` }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8a7070' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 300, color: warn ? '#b91c1c' : '#1a1314', marginTop: 4 }}>{value}</p>
      <p style={{ fontSize: 11, color: warn ? '#b91c1c' : '#8a7070' }}>{sub}</p>
    </div>
  )
}
