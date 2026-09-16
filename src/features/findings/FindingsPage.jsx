import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, CheckCircle, AlertTriangle, ShieldAlert,
  AlertCircle, Plug, FileWarning, ChevronRight,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { useConnectors } from '@/hooks/useConnectors'
import { Spinner } from '@/components/ui/Spinner'
import { aggregateFindings } from '@/lib/findings'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, tone }) {
  const map = {
    total:    { color: '#1a1314', bd: '#e5e0e0', bg: '#fff',    ic: '#d4cccc' },
    critical: { color: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', ic: '#fca5a5' },
    warning:  { color: '#92400e', bd: '#fde68a', bg: '#fffbeb', ic: '#fcd34d' },
    info:     { color: '#1e40af', bd: '#bfdbfe', bg: '#eff6ff', ic: '#93c5fd' },
  }[tone]
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: map.bg, border: `1px solid ${map.bd}` }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: map.color === '#1a1314' ? '#8a7070' : map.color }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: map.ic }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color: map.color }}>{value}</p>
    </div>
  )
}

// ── Platform card ─────────────────────────────────────────────────────────────
function PlatformCard({ provider, counts, onClick }) {
  const critCount = counts.critical || 0
  const warnCount = counts.warning  || 0
  const total     = counts.total    || 0

  const urgency = critCount > 0 ? 'critical' : warnCount > 0 ? 'warning' : 'clean'
  const borders = { critical: '#fecaca', warning: '#fde68a', clean: '#e5e0e0' }
  const bgs     = { critical: '#fef2f2', warning: '#fffbeb', clean: '#fff'    }

  return (
    <div onClick={onClick}
      className="rounded-xl p-5 cursor-pointer transition-all hover:shadow-md"
      style={{ background: bgs[urgency], border: `1px solid ${borders[urgency]}` }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Coloured dot logo */}
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: provider.accent + '18',
            border: `1px solid ${provider.accent}30`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, fontWeight: 700, color: provider.accent,
            letterSpacing: '-0.02em',
          }}>
            {provider.name.slice(0, 1)}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1314' }}>{provider.name}</p>
            <p style={{ fontSize: 11, color: '#8a7070' }}>Connected</p>
          </div>
        </div>
        <ChevronRight size={16} style={{ color: '#b6acac' }} />
      </div>

      {/* Finding counts */}
      <div className="flex gap-2 flex-wrap">
        {critCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            {critCount} critical
          </span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
            {warnCount} warning
          </span>
        )}
        {total === 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
            No findings
          </span>
        )}
        <span style={{ fontSize: 11, color: '#8a7070', marginLeft: 'auto', alignSelf: 'center' }}>
          {total} total → {provider.id === 'entra' ? 'view users' : 'view findings'}
        </span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function FindingsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { connections } = useConnectors()

  const [loading, setLoading]   = useState(true)
  const [findings, setFindings] = useState([])
  const [providers, setProviders] = useState([])

  const connectedIds = useMemo(
    () => connections.filter(c => c.status === 'active').map(c => c.connector_id),
    [connections]
  )

  const load = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)
    const result = await aggregateFindings(organization.id, connectedIds)
    setFindings(result.findings)
    setProviders(result.providers)
    setLoading(false)
  }, [organization?.id, connectedIds])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total:    findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    warning:  findings.filter(f => f.severity === 'warning').length,
    info:     findings.filter(f => f.severity === 'info').length,
  }), [findings])

  // Per-provider breakdown for platform cards
  const perProvider = useMemo(() => {
    const m = {}
    for (const f of findings) {
      if (!m[f.connectorId]) m[f.connectorId] = { total: 0, critical: 0, warning: 0, info: 0 }
      m[f.connectorId].total++
      m[f.connectorId][f.severity]++
    }
    return m
  }, [findings])

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Security Findings"
        subtitle={organization?.name}
        actions={
          <button onClick={load}
            className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
            <RefreshCw size={13} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Findings" value={counts.total}    icon={FileWarning}   tone="total" />
          <StatCard label="Critical"       value={counts.critical} icon={AlertTriangle} tone="critical" />
          <StatCard label="Warning"        value={counts.warning}  icon={ShieldAlert}   tone="warning" />
          <StatCard label="Informational"  value={counts.info}     icon={AlertCircle}   tone="info" />
        </div>

        {/* Section header */}
        <div className="mb-3">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>
            Connected Platforms
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : connectedIds.length === 0 || providers.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f8f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Plug size={22} strokeWidth={1.5} style={{ color: '#b6acac' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>No connected platforms yet</p>
            <p className="text-xs mb-5" style={{ color: '#8a7070', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Connect a platform like Microsoft Entra ID to start surfacing security findings here.
            </p>
            <button onClick={() => navigate('/app/settings')}
              className="text-xs px-4 py-2 rounded-lg"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
              Go to Integrations
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {providers.map(p => (
              <PlatformCard
                key={p.id}
                provider={p}
                counts={perProvider[p.id] || {}}
                onClick={() => navigate(`/app/findings/${p.id}`)}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
