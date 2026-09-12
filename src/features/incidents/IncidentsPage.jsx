import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Search, RefreshCw, Plus, Clock, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { useIncidents } from '@/hooks/useIncidents'
import { SeverityBadge, StatusBadge } from '@/components/ui/IncidentBadges'
import { SelectField } from '@/components/ui/Combobox'
import { RaiseIncidentModal } from './RaiseIncidentModal'
import { SEVERITIES, STATUSES } from '@/lib/incidents'
import { getSLAStatus, formatTimeRemaining } from '@/lib/sla'
import { Spinner } from '@/components/ui/Spinner'

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <SelectField value={value} onChange={e => onChange(e.target.value)}
        className="text-xs pl-3 pr-7 py-2 rounded-md border appearance-none outline-none transition-colors cursor-pointer"
        style={{ background: '#fff', borderColor: '#e5e0e0', color: value ? '#1a1314' : '#8a7070' }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectField>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
    </div>
  )
}

function StatPill({ label, count, active, onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors border"
      style={{ background: active ? '#fdf5f5' : '#fff', borderColor: active ? '#f0dada' : '#e5e0e0', color: active ? '#5D0F0F' : '#4a3a3a' }}>
      <span className="font-semibold text-sm">{count}</span>
      {label}
    </button>
  )
}

function SLAChip({ severity, createdAt, resolvedAt }) {
  const sla = getSLAStatus(severity, createdAt, resolvedAt)
  if (sla.status === 'ok' || sla.status === 'met') return null
  const colors = {
    warning:  { color: '#92400e', bg: '#fffbeb' },
    critical: { color: '#b91c1c', bg: '#fef2f2' },
    breached: { color: '#b91c1c', bg: '#fef2f2' },
  }
  const c = colors[sla.status]
  return (
    <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
      style={{ color: c.color, background: c.bg }}>
      <Clock size={10} />
      {sla.status === 'breached' ? 'SLA Breached' : formatTimeRemaining(sla.diff)}
    </span>
  )
}

export function IncidentsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showRaise, setShowRaise] = useState(false)

  const { incidents, loading, refetch } = useIncidents({
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  })

  const counts = {
    total:      incidents.length,
    open:       incidents.filter(i => i.status === 'open').length,
    critical:   incidents.filter(i => i.severity === 'critical').length,
    inProgress: incidents.filter(i => i.status === 'in_progress').length,
  }

  const timeAgo = dateStr => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Incidents"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={refetch}
              className="w-8 h-8 flex items-center justify-center rounded-md border transition-colors hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => setShowRaise(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md transition-colors"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
              <Plus size={13} /> Raise Incident
            </button>
          </div>
        }
      />

      {showRaise && <RaiseIncidentModal onClose={() => setShowRaise(false)} onCreated={refetch} />}

      <div className="flex-1 overflow-y-auto page-content">
        {/* Stat pills */}
        <div className="flex items-center gap-2 mb-5">
          <StatPill label="Total"       count={counts.total}      active={!statusFilter && !severityFilter} onClick={() => { setStatusFilter(''); setSeverityFilter('') }} />
          <StatPill label="Open"        count={counts.open}       active={statusFilter === 'open'}          onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')} />
          <StatPill label="Critical"    count={counts.critical}   active={severityFilter === 'critical'}    onClick={() => setSeverityFilter(severityFilter === 'critical' ? '' : 'critical')} />
          <StatPill label="In Progress" count={counts.inProgress} active={statusFilter === 'in_progress'}   onClick={() => setStatusFilter(statusFilter === 'in_progress' ? '' : 'in_progress')} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search incidents..."
              className="w-full text-xs pl-8 pr-3 py-2 rounded-md border outline-none"
              style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
          </div>
          <FilterSelect value={severityFilter} onChange={setSeverityFilter} options={SEVERITIES} placeholder="All severities" />
          <FilterSelect value={statusFilter}   onChange={setStatusFilter}   options={STATUSES}   placeholder="All statuses" />
          {(severityFilter || statusFilter || search) && (
            <button onClick={() => { setSeverityFilter(''); setStatusFilter(''); setSearch('') }}
              className="text-xs px-3 py-2 rounded-md border transition-colors hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : incidents.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <AlertTriangle size={32} strokeWidth={1} className="mx-auto mb-4" style={{ color: '#d4cccc' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>No incidents found</p>
            <p className="text-xs mb-4" style={{ color: '#8a7070' }}>
              {search || severityFilter || statusFilter ? 'Try adjusting your filters' : 'Incidents from connected platforms will appear here'}
            </p>
            {!search && !severityFilter && !statusFilter && (
              <button onClick={() => setShowRaise(true)}
                className="text-xs px-4 py-2 rounded-md"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                Raise first incident
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
            <div className="grid text-[11px] uppercase tracking-wider px-4 py-2.5"
              style={{ gridTemplateColumns: '2fr 100px 110px 100px 80px 20px', background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
              <span>Title</span><span>Severity</span><span>Status</span><span>Source</span><span>Created</span><span />
            </div>
            <div style={{ background: '#fff' }}>
              {incidents.map((incident, i) => (
                <div key={incident.id}
                  onClick={() => navigate(`/app/incidents/${incident.id}`)}
                  className="grid items-center px-4 py-3 cursor-pointer transition-colors hover:bg-[#fafafa]"
                  style={{ gridTemplateColumns: '2fr 100px 110px 100px 80px 20px', borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
                  <div className="pr-4 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {incident.external_id && (
                        <span className="text-[11px] font-mono flex-shrink-0" style={{ color: '#8a7070' }}>{incident.external_id}</span>
                      )}
                      <span className="text-xs font-medium truncate" style={{ color: '#1a1314' }}>{incident.title}</span>
                      <SLAChip severity={incident.severity} createdAt={incident.created_at} resolvedAt={incident.resolved_at} />
                    </div>
                  </div>
                  <div><SeverityBadge value={incident.severity} /></div>
                  <div><StatusBadge value={incident.status} /></div>
                  <div className="text-xs capitalize" style={{ color: '#8a7070' }}>{incident.connector_id}</div>
                  <div className="text-xs" style={{ color: '#8a7070' }}>{timeAgo(incident.created_at)}</div>
                  <ChevronRight size={14} style={{ color: '#d4cccc' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
