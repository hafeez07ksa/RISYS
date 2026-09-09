import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Search, Filter } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'

// ── Action display config ─────────────────────────────────────────────────────
const ACTION_META = {
  // Risks
  'risk.created':              { label: 'Risk created',            color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  'risk.updated':              { label: 'Risk updated',            color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  'risk.deleted':              { label: 'Risk deleted',            color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'risk.status_changed':       { label: 'Risk status changed',     color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  'risk.submitted_for_review': { label: 'Risk submitted',          color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  'risk.approved':             { label: 'Risk approved',           color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  'risk.rejected':             { label: 'Risk rejected',           color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'risk.closed':               { label: 'Risk closed',             color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  // Incidents
  'incident.created':          { label: 'Incident raised',         color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'incident.updated':          { label: 'Incident updated',        color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  'incident.status_changed':   { label: 'Incident status changed', color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  'incident.resolved':         { label: 'Incident resolved',       color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  // Tasks
  'task.created':              { label: 'Task created',            color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  'task.status_changed':       { label: 'Task status changed',     color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  'task.completed':            { label: 'Task completed',          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  // Members
  'member.invited':            { label: 'Member invited',          color: '#5D0F0F', bg: '#fdf5f5', border: '#f0dada' },
  'member.removed':            { label: 'Member removed',          color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'member.role_changed':       { label: 'Role changed',            color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  // Connectors
  'connector.connected':       { label: 'Connector connected',     color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  'connector.disconnected':    { label: 'Connector disconnected',  color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'connector.synced':          { label: 'Sync completed',          color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  // Findings
  'finding.escalated_to_risk':     { label: 'Finding → Risk',      color: '#5D0F0F', bg: '#fdf5f5', border: '#f0dada' },
  'finding.escalated_to_incident': { label: 'Finding → Incident',  color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
}

const ENTITY_FILTERS = ['All', 'risk', 'incident', 'task', 'member', 'connector', 'finding']

function ActionBadge({ action }) {
  const m = ACTION_META[action] || { label: action, color: '#8a7070', bg: '#f8f7f7', border: '#e5e0e0' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      whiteSpace: 'nowrap',
    }}>{m.label}</span>
  )
}

function Avatar({ name, size = 26 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const palettes = [
    ['#EAF0FB','#2B5797'],['#ECF4EE','#2F6B3C'],['#FAF3E2','#9C6F0F'],
    ['#F6EBE8','#5D0F0F'],['#F2EEF9','#4C1D95'],['#E6F4FB','#0F5A8A'],
  ]
  const [bg, color] = palettes[(initials.charCodeAt(0) || 0) % palettes.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.38, fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>{initials}</div>
  )
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AuditLogPage() {
  const { organization } = useAuth()

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [hasMore, setHasMore]   = useState(false)
  const [offset, setOffset]     = useState(0)
  const PAGE = 50

  const [entityFilter, setEntityFilter] = useState('All')
  const [search, setSearch]             = useState('')

  const load = useCallback(async (reset = false) => {
    if (!organization?.id) return
    setLoading(true)
    const from = reset ? 0 : offset

    let q = supabase
      .from('audit_log')
      .select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)

    if (entityFilter !== 'All') q = q.eq('entity_type', entityFilter)

    const { data, error } = await q
    if (!error && data) {
      setRows(prev => reset ? data : [...prev, ...data])
      setHasMore(data.length === PAGE)
      setOffset(from + data.length)
    }
    setLoading(false)
  }, [organization?.id, entityFilter, offset])

  // Reload from top when filter changes
  useEffect(() => {
    setOffset(0)
    setRows([])
    load(true)
  }, [organization?.id, entityFilter])

  const visible = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      (r.action || '').toLowerCase().includes(q) ||
      (r.actor_name || '').toLowerCase().includes(q) ||
      (r.entity_title || '').toLowerCase().includes(q) ||
      (r.entity_type || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Audit Log"
        subtitle={organization?.name}
        actions={
          <button onClick={() => { setOffset(0); setRows([]); load(true) }}
            className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
            <RefreshCw size={13} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* Entity type */}
          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
            {ENTITY_FILTERS.map(f => (
              <button key={f} onClick={() => setEntityFilter(f)}
                className="px-3 py-1.5 rounded-md text-xs transition-colors capitalize"
                style={{
                  background: entityFilter === f ? '#fff' : 'transparent',
                  color:      entityFilter === f ? '#1a1314' : '#8a7070',
                  border:     entityFilter === f ? '1px solid #e5e0e0' : '1px solid transparent',
                  fontWeight: entityFilter === f ? 500 : 400,
                }}>{f}</button>
            ))}
          </div>

          <div className="flex-1 relative" style={{ minWidth: 200 }}>
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by action, actor, or record…"
              className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314' }} />
          </div>
        </div>

        {/* Table */}
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <Filter size={26} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
              {rows.length === 0 ? 'No audit events yet' : 'No events match this filter'}
            </p>
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {rows.length === 0
                ? 'Actions like creating risks, raising incidents, and inviting members will appear here.'
                : 'Try a different entity type or search term.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
            {/* Header */}
            <div className="grid items-center px-4 py-2.5 text-[11px] uppercase tracking-wider"
              style={{ gridTemplateColumns: '160px 1fr 1fr 1fr 100px', background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
              <span>When</span>
              <span>Action</span>
              <span>Record</span>
              <span>Actor</span>
              <span>Type</span>
            </div>

            <div style={{ background: '#fff' }}>
              {visible.map((row, i) => (
                <div key={row.id}
                  className="grid items-center px-4 py-3 hover:bg-[#fafafa] transition-colors"
                  style={{ gridTemplateColumns: '160px 1fr 1fr 1fr 100px', borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>

                  {/* When */}
                  <div>
                    <p className="text-xs" style={{ color: '#4a3a3a' }}>{timeAgo(row.created_at)}</p>
                    <p className="text-[10px]" style={{ color: '#b6acac' }}>
                      {new Date(row.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Action badge */}
                  <ActionBadge action={row.action} />

                  {/* Record */}
                  <div className="min-w-0 pr-3">
                    {row.entity_title ? (
                      <p className="text-xs truncate" style={{ color: '#1a1314' }}>{row.entity_title}</p>
                    ) : (
                      <span style={{ color: '#d4cccc', fontSize: 11 }}>—</span>
                    )}
                    {row.meta && Object.keys(row.meta).length > 0 && (
                      <p className="text-[11px] truncate" style={{ color: '#8a7070' }}>
                        {Object.entries(row.meta).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* Actor */}
                  <div className="flex items-center gap-2 min-w-0 pr-3">
                    <Avatar name={row.actor_name || '?'} />
                    <p className="text-xs truncate" style={{ color: '#4a3a3a' }}>{row.actor_name || 'System'}</p>
                  </div>

                  {/* Entity type pill */}
                  <span className="text-[10px] capitalize px-2 py-0.5 rounded-full"
                    style={{ background: '#f5f3f3', color: '#8a7070', border: '1px solid #e5e0e0', width: 'fit-content' }}>
                    {row.entity_type || '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="py-4 text-center" style={{ borderTop: '1px solid #f0eded' }}>
                <button onClick={() => load(false)} disabled={loading}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ background: loading ? '#f5f3f3' : '#fff', color: '#5D0F0F', border: '1px solid #e5e0e0' }}>
                  {loading ? 'Loading…' : 'Load more events'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
