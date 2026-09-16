import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Search, ChevronRight, CheckCircle,
  AlertTriangle, ShieldAlert, AlertCircle, FileWarning,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import { FINDING_PROVIDERS, SEVERITY_CONFIG } from '@/lib/findings'
import { ConnectorFindingsListPage, LIST_VIEW_CONNECTORS } from './ConnectorFindingsListPage'

// ── Shared bits ───────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const palettes = [
    ['#EAF0FB','#2B5797'],['#ECF4EE','#2F6B3C'],['#FAF3E2','#9C6F0F'],
    ['#F6EBE8','#5D0F0F'],['#F2EEF9','#4C1D95'],['#E6F4FB','#0F5A8A'],
  ]
  const [bg, color] = palettes[initials.charCodeAt(0) % palettes.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.36, fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em',
    }}>{initials}</div>
  )
}

function FindingBadge({ finding }) {
  const s = SEVERITY_CONFIG[finding.severity]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: '2px 7px',
      borderRadius: 20, whiteSpace: 'nowrap',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {finding.label}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, tone, onClick }) {
  const map = {
    total:    { color: '#1a1314', bd: '#e5e0e0', bg: '#fff',    ic: '#d4cccc' },
    critical: { color: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', ic: '#fca5a5' },
    warning:  { color: '#92400e', bd: '#fde68a', bg: '#fffbeb', ic: '#fcd34d' },
    info:     { color: '#1e40af', bd: '#bfdbfe', bg: '#eff6ff', ic: '#93c5fd' },
  }[tone]
  return (
    <div onClick={onClick}
      className="rounded-xl p-4 flex flex-col gap-2 transition-all"
      style={{ background: map.bg, border: `1px solid ${map.bd}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: map.color === '#1a1314' ? '#8a7070' : map.color }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: map.ic }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color: map.color }}>{value}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FindingsPlatformPage() {
  const { connectorId } = useParams()

  // M365, Defender and SharePoint findings are about mailboxes, sites, controls and
  // alerts rather than users, so they use the list view. Entra keeps the per-user view.
  // Choosing the view here (before any hooks) keeps each page's hook order stable.
  if (LIST_VIEW_CONNECTORS.includes(connectorId)) {
    return <ConnectorFindingsListPage key={connectorId} connectorId={connectorId} />
  }
  return <UserFindingsPlatformPage key={connectorId} connectorId={connectorId} />
}

function UserFindingsPlatformPage({ connectorId }) {
  const navigate = useNavigate()
  const { organization } = useAuth()

  const provider = FINDING_PROVIDERS.find(p => p.connectorId === connectorId)

  const [loading, setLoading]     = useState(true)
  const [rows, setRows]           = useState([]) // { subject, findings }
  const [sevFilter, setSevFilter] = useState('all')
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    if (!organization?.id || !provider) return
    setLoading(true)
    const rawRows = await provider.fetch(organization.id)
    // Pair each source row with its derived findings
    const paired = rawRows.map(raw => ({
      raw,
      findings: provider.derive(raw).map(f => ({
        severity: f.severity, label: f.label, id: f.key,
      })),
      // subject info for display — derive one finding to get it, or read raw directly
      // For entra: raw has display_name, mail, etc.
      name:     raw.display_name || raw.user_principal_name || 'Unknown',
      email:    raw.mail || raw.user_principal_name || null,
      meta:     [raw.job_title, raw.department].filter(Boolean).join(' · '),
      subjectId: raw.entra_id || raw.id,
      enabled:  raw.account_enabled !== false,
    }))
    setRows(paired)
    setLoading(false)
  }, [organization?.id, connectorId])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total:    rows.reduce((s, r) => s + r.findings.length, 0),
    critical: rows.reduce((s, r) => s + r.findings.filter(f => f.severity === 'critical').length, 0),
    warning:  rows.reduce((s, r) => s + r.findings.filter(f => f.severity === 'warning').length, 0),
    info:     rows.reduce((s, r) => s + r.findings.filter(f => f.severity === 'info').length, 0),
    users:    rows.length,
    affected: rows.filter(r => r.findings.length > 0).length,
  }), [rows])

  const visible = useMemo(() => rows.filter(r => {
    // severity filter: only show rows that have at least one finding of that severity
    if (sevFilter !== 'all' && !r.findings.some(f => f.severity === sevFilter)) return false
    // search
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${r.name} ${r.email || ''} ${r.meta}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [rows, sevFilter, search])

  if (!provider) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Unknown Platform" subtitle="Findings" />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: '#8a7070' }}>No provider found for "{connectorId}"</p>
        </div>
      </div>
    )
  }

  const SEV_TABS = [
    ['all',      `All users (${rows.length})`],
    ['critical', `Critical (${counts.critical})`],
    ['warning',  `Warning (${counts.warning})`],
    ['info',     `Info (${counts.info})`],
  ]

  const GRID = '2fr 1.5fr 1.5fr 80px 20px'

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={provider.connectorName}
        subtitle="Security Findings · Users"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => navigate('/app/findings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back to Findings
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Findings" value={counts.total}    icon={FileWarning}   tone="total" />
          <StatCard label="Critical"       value={counts.critical} icon={AlertTriangle} tone="critical" onClick={() => setSevFilter('critical')} />
          <StatCard label="Warning"        value={counts.warning}  icon={ShieldAlert}   tone="warning"  onClick={() => setSevFilter('warning')} />
          <StatCard label="Informational"  value={counts.info}     icon={AlertCircle}   tone="info"     onClick={() => setSevFilter('info')} />
        </div>

        {/* Filter + search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
            {SEV_TABS.map(([val, lbl]) => (
              <button key={val} onClick={() => setSevFilter(val)}
                className="px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background: sevFilter === val ? '#fff' : 'transparent',
                  color:      sevFilter === val ? '#1a1314' : '#8a7070',
                  border:     sevFilter === val ? '1px solid #e5e0e0' : '1px solid transparent',
                  fontWeight: sevFilter === val ? 500 : 400,
                }}>{lbl}</button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, department…"
              className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314' }} />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <CheckCircle size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#bbf7d0' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
              {rows.length === 0 ? 'No directory data yet' : 'No users match this filter'}
            </p>
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {rows.length === 0 ? 'Sync the connector to pull user data.' : 'Try a different severity level or search term.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
            {/* Header */}
            <div className="grid items-center px-4 py-2.5 text-[11px] uppercase tracking-wider"
              style={{ gridTemplateColumns: GRID, background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
              <span>User</span>
              <span>Department · Title</span>
              <span>Security Findings</span>
              <span>Status</span>
              <span />
            </div>

            <div style={{ background: '#fff' }}>
              {visible.map((row, i) => {
                const hasCritical = row.findings.some(f => f.severity === 'critical')
                const hasWarning  = row.findings.some(f => f.severity === 'warning')
                const leftColor   = hasCritical ? '#ef4444' : hasWarning ? '#f59e0b' : row.findings.length > 0 ? '#3b82f6' : 'transparent'

                return (
                  <div key={row.subjectId}
                    onClick={() => navigate(`/app/findings/${connectorId}/users/${row.subjectId}`)}
                    className="grid items-center px-4 py-3 hover:bg-[#fafafa] transition-colors cursor-pointer"
                    style={{
                      gridTemplateColumns: GRID,
                      borderTop: i > 0 ? '1px solid #f5f3f3' : 'none',
                      borderLeft: `3px solid ${leftColor}`,
                      opacity: row.enabled ? 1 : 0.6,
                    }}>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <Avatar name={row.name} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: '#1a1314' }}>{row.name}</p>
                        <p className="text-[11px] truncate" style={{ color: '#8a7070' }}>{row.email || '—'}</p>
                      </div>
                    </div>

                    {/* Meta */}
                    <p className="text-xs truncate pr-3" style={{ color: '#8a7070' }}>{row.meta || '—'}</p>

                    {/* Finding badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, overflow: 'hidden' }}>
                      {row.findings.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#d4cccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={11} style={{ color: '#22c55e' }} /> Clean
                        </span>
                      ) : (
                        row.findings.map(f => <FindingBadge key={f.id} finding={f} />)
                      )}
                    </div>

                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.enabled ? '#22c55e' : '#9ca3af' }} />
                      <span style={{ fontSize: 11, color: row.enabled ? '#166534' : '#6b7280' }}>
                        {row.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <ChevronRight size={14} style={{ color: '#d4cccc' }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
