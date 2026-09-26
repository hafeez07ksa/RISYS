import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw, Download, ScrollText, ShieldAlert, AlertTriangle, CheckSquare2,
  Users, Plug, FileWarning, ArrowRight, Clock, Hash, User, Box,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { DataTable } from '@/components/ui/DataTable'
import { DetailRow } from '@/components/ui/DetailRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/Filters'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { tx, appLocale } from '@/lib/i18n'

/* ── Audit log (§22) ──────────────────────────────────────────────────────────
 *
 * This is the page an auditor opens when they want to know who changed what,
 * when, and on what authority. It is not a notification feed, and the previous
 * version read like one: a coloured pill per row, no way to open an event, and
 * no way to get the data out.
 *
 * Three things changed that matter beyond looks:
 *
 *   1. Events are openable. An audit trail whose rows are not addressable
 *      cannot be cited in an assessment.
 *   2. Changes render as a before/after diff where the event carries one.
 *   3. There is an export. An auditor works in their own tooling; a log you
 *      can only read on screen is evidence nobody can take away with them.
 * -------------------------------------------------------------------------- */

/* Action vocabulary. `tone` maps into the shared status language (§28) so a
 * destructive audit event is the same red as a critical risk. */
const ACTION_META = {
  'risk.created':                  { label: tx('Risk created'),            tone: 'info' },
  'risk.updated':                  { label: tx('Risk updated'),            tone: 'neutral' },
  'risk.deleted':                  { label: tx('Risk deleted'),            tone: 'critical' },
  'risk.status_changed':           { label: tx('Risk status changed'),     tone: 'neutral' },
  'risk.submitted_for_review':     { label: tx('Risk submitted'),          tone: 'medium' },
  'risk.approved':                 { label: tx('Risk approved'),           tone: 'low' },
  'risk.rejected':                 { label: tx('Risk rejected'),           tone: 'critical' },
  'risk.closed':                   { label: tx('Risk closed'),             tone: 'neutral' },
  'incident.created':              { label: tx('Incident raised'),         tone: 'critical' },
  'incident.updated':              { label: tx('Incident updated'),        tone: 'neutral' },
  'incident.deleted':              { label: tx('Incident deleted'),        tone: 'critical' },
  'incident.status_changed':       { label: tx('Incident status changed'), tone: 'neutral' },
  'incident.resolved':             { label: tx('Incident resolved'),       tone: 'low' },
  'task.created':                  { label: tx('Task created'),            tone: 'info' },
  'task.updated':                  { label: tx('Task updated'),            tone: 'neutral' },
  'task.deleted':                  { label: tx('Task deleted'),            tone: 'critical' },
  'task.status_changed':           { label: tx('Task status changed'),     tone: 'neutral' },
  'task.completed':                { label: tx('Task completed'),          tone: 'low' },
  'member.invited':                { label: tx('Member invited'),          tone: 'brand' },
  'member.removed':                { label: tx('Member removed'),          tone: 'critical' },
  'member.role_changed':           { label: tx('Role changed'),            tone: 'medium' },
  'connector.connected':           { label: tx('Connector connected'),     tone: 'low' },
  'connector.disconnected':        { label: tx('Connector disconnected'),  tone: 'critical' },
  'connector.synced':              { label: tx('Sync completed'),          tone: 'info' },
  'finding.escalated_to_risk':     { label: tx('Finding → Risk'),          tone: 'brand' },
  'finding.escalated_to_incident': { label: tx('Finding → Incident'),      tone: 'critical' },
  'control.created':               { label: tx('Control created'),         tone: 'info' },
  'control.updated':               { label: tx('Control updated'),         tone: 'neutral' },
  'compliance.status_set':         { label: tx('Compliance status set'),   tone: 'neutral' },
}

/* A raw key like `incident.deleted` leaking into the UI — visible in the
 * current page — means the vocabulary is missing an entry. Rather than print
 * the key, derive something readable from it and keep the key available in the
 * detail panel, where an engineer actually wants it. */
function actionMeta(action) {
  if (ACTION_META[action]) return ACTION_META[action]
  const [entity, ...verb] = String(action || '').split('.')
  const label = `${entity} ${verb.join(' ').replace(/_/g, ' ')}`.trim()
  const destructive = /delete|remove|revoke|disconnect/.test(action || '')
  return {
    label: label ? label.charAt(0).toUpperCase() + label.slice(1) : tx('Unknown action'),
    tone: destructive ? 'critical' : 'neutral',
    derived: true,
  }
}

const ENTITY_META = {
  risk:       { label: tx('Risk'),      icon: ShieldAlert,   route: (id) => `/app/risks/${id}` },
  incident:   { label: tx('Incident'),  icon: AlertTriangle, route: (id) => `/app/incidents/${id}` },
  task:       { label: tx('Task'),      icon: CheckSquare2,  route: (id) => `/app/tasks/${id}` },
  member:     { label: tx('Member'),    icon: Users,         route: () => '/app/people' },
  connector:  { label: tx('Connector'), icon: Plug,          route: () => '/app/settings' },
  finding:    { label: tx('Finding'),   icon: FileWarning,   route: () => '/app/findings' },
  control:    { label: tx('Control'),   icon: CheckSquare2,  route: (id) => `/app/controls/${id}` },
  compliance: { label: tx('Compliance'),icon: ScrollText,    route: () => '/app/compliance' },
}

const ENTITY_FILTERS = ['risk', 'incident', 'task', 'member', 'connector', 'finding']

/* Metadata keys that describe a transition rather than a property. Audit rows
 * store flat meta, so a change is encoded as a pair — and the pairs are not
 * named consistently across the writers. Recognise the shapes that exist
 * instead of assuming one. */
const DIFF_PAIRS = [
  ['from', 'to'], ['old', 'new'], ['before', 'after'],
  ['old_status', 'new_status'], ['previous_status', 'status'],
  ['old_role', 'new_role'], ['from_status', 'to_status'],
  ['old_owner', 'new_owner'], ['old_priority', 'new_priority'],
]

function extractDiff(meta) {
  if (!meta || typeof meta !== 'object') return { diffs: [], rest: {} }
  const rest = { ...meta }
  const diffs = []
  for (const [a, b] of DIFF_PAIRS) {
    /* Both sides required. A single `status: open` is a property of the record,
     * not a transition — matching it half-way would invent a change from
     * nothing to "open" that never happened, which in an audit log is worse
     * than showing no diff at all. */
    if (a in rest && b in rest) {
      const field = a.replace(/^(old|from|previous|before)_?/, '') || 'value'
      diffs.push({
        field: field === 'value' ? 'Value' : field.replace(/_/g, ' '),
        before: rest[a], after: rest[b],
      })
      delete rest[a]; delete rest[b]
    }
  }
  return { diffs, rest }
}

function timeAgo(d) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

const fullTime = (d) =>
  new Date(d).toLocaleString(appLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

function Avatar({ name, size = 22 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const palettes = [
    ['#EAF0FB','#2B5797'], ['#ECF4EE','#2F6B3C'], ['#FAF3E2','#9C6F0F'],
    ['#F6EBE8','#5D0F0F'], ['#F2EEF9','#4C1D95'], ['#E6F4FB','#0F5A8A'],
  ]
  const [bg, color] = palettes[(initials.charCodeAt(0) || 0) % palettes.length]
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.4, fontWeight: 600, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{initials}</span>
  )
}

/* A change reads as two states with an arrow between them, not as a sentence.
 * §22 asks for a visual diff, and an auditor comparing states wants them
 * side by side. */
function Diff({ field, before, after }) {
  const cell = (v, tone) => (
    <span style={{
      flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 'var(--r)',
      fontSize: 'var(--t-sm)', lineHeight: 1.4, wordBreak: 'break-word',
      background: tone === 'before' ? 'var(--surface)' : 'var(--low-bg)',
      color: tone === 'before' ? 'var(--text-3)' : 'var(--text-2)',
      border: `1px solid ${tone === 'before' ? 'var(--border)' : 'var(--low-bd)'}`,
      textDecoration: tone === 'before' ? 'line-through' : 'none',
    }}>
      {v === null || v === undefined || v === '' ? '—' : String(v)}
    </span>
  )
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{
        fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-3)', fontWeight: 500, margin: '0 0 5px',
      }}>{field}</p>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 7 }}>
        {cell(before, 'before')}
        <ArrowRight
          size={13}
          style={{ color: 'var(--taupe)', flexShrink: 0, alignSelf: 'center' }}
          className='rtl-flip' />
        {cell(after, 'after')}
      </div>
    </div>
  )
}

/* ── Event detail (§22) ──────────────────────────────────────────────────── */
/* Opens under the event's own row, so the list keeps its place and several
 * events can be compared by opening one after another. */
function EventDetail({ event, onOpenRecord }) {
  const entity = ENTITY_META[event.entity_type]
  const { diffs, rest } = extractDiff(event.meta)
  const canOpen = entity?.route && event.entity_id

  return (
    <div className="anim-fade" style={{ padding: '14px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px 24px' }}
         onClick={(e) => e.stopPropagation()}>
      {diffs.length > 0 && (
        <section style={{ gridColumn: '1 / -1' }}>
          <p className="rp-label" style={{ marginBottom: 8 }}>{tx('What changed')}</p>
          {diffs.map(d => <Diff key={d.field} {...d} />)}
        </section>
      )}

      <section>
        <p className="rp-label">{tx('Event')}</p>
        <DetailRow label={tx('Action')}>
          <span className="mono" style={{ fontSize: 'var(--t-meta)' }}>{event.action}</span>
        </DetailRow>
        <DetailRow label={tx('Module')}>{entity?.label || event.entity_type || '—'}</DetailRow>
        <DetailRow label={tx('Record')}>{event.entity_title || '—'}</DetailRow>
        <DetailRow label={tx('Record ID')} mono>{event.entity_id || '—'}</DetailRow>
        <DetailRow label={tx('Event ID')} mono>{event.id}</DetailRow>
      </section>

      <section>
        <p className="rp-label">{tx('Actor')}</p>
        <DetailRow label={tx('Name')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Avatar name={event.actor_name || 'System'} size={20} />
            {event.actor_name || tx('System')}
          </span>
        </DetailRow>
        {event.actor_email && <DetailRow label={tx('Email')}>{event.actor_email}</DetailRow>}
        <DetailRow label={tx('Actor ID')} mono>{event.actor_id || '—'}</DetailRow>
        {event.ip_address && <DetailRow label={tx('Source IP')} mono>{event.ip_address}</DetailRow>}
        <DetailRow label={tx('Timestamp')}>{fullTime(event.created_at)}</DetailRow>
      </section>

      {Object.keys(rest).length > 0 && (
        <section>
          <p className="rp-label">{tx('Metadata')}</p>
          {Object.entries(rest).map(([k, v]) => (
            <DetailRow key={k} label={k.replace(/_/g, ' ')} mono={/id$/i.test(k)}>
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </DetailRow>
          ))}
        </section>
      )}

      {canOpen && (
        <div style={{ gridColumn: '1 / -1' }}>
          <button className="btn-secondary" onClick={() => onOpenRecord(entity.route(event.entity_id))}>
            {tx('Open')} {entity.label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function AuditLogPage() {
  const { organization } = useAuth()
  const navigate = useNavigate()

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset]   = useState(0)
  const PAGE = 50

  const [entityFilter, setEntityFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [filters, setFilters]           = useState({})
  const [selected, setSelected]         = useState(null)

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

  useEffect(() => {
    setOffset(0); setRows([]); load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, entityFilter])

  /* Actor options come from what has actually been loaded rather than from the
   * members table: the log can contain actors who have since been removed, and
   * hiding their events behind an unavailable filter would be the wrong
   * behaviour for an audit trail. */
  const actorOptions = useMemo(() => {
    const seen = new Map()
    for (const r of rows) {
      const name = r.actor_name || 'System'
      if (!seen.has(name)) seen.set(name, { value: name, label: name })
    }
    return [...seen.values()]
  }, [rows])

  const actionOptions = useMemo(() => {
    const seen = new Map()
    for (const r of rows) {
      if (!seen.has(r.action)) seen.set(r.action, { value: r.action, label: actionMeta(r.action).label })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const filterDefs = useMemo(() => [
    { key: 'actor',  label: tx('Actor'),  options: actorOptions,  multiple: true, pinned: true },
    { key: 'action', label: tx('Action'), options: actionOptions, multiple: true, pinned: true },
    { key: 'since',  label: tx('Period'), options: [
      { value: '24h', label: tx('Last 24 hours') },
      { value: '7d',  label: tx('Last 7 days') },
      { value: '30d', label: tx('Last 30 days') },
      { value: '90d', label: tx('Last 90 days') },
    ] },
  ], [actorOptions, actionOptions])

  const visible = useMemo(() => {
    let out = rows

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r =>
        (r.action || '').toLowerCase().includes(q) ||
        actionMeta(r.action).label.toLowerCase().includes(q) ||
        (r.actor_name || '').toLowerCase().includes(q) ||
        (r.entity_title || '').toLowerCase().includes(q) ||
        (r.entity_type || '').toLowerCase().includes(q)
      )
    }
    if (filters.actor?.length)  out = out.filter(r => filters.actor.includes(r.actor_name || 'System'))
    if (filters.action?.length) out = out.filter(r => filters.action.includes(r.action))
    if (filters.since) {
      const hours = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 }[filters.since]
      const cutoff = Date.now() - hours * 3600_000
      out = out.filter(r => new Date(r.created_at).getTime() >= cutoff)
    }
    return out
  }, [rows, search, filters])

  /* Export what is on screen, filters included — an auditor asks for "the
   * access-control changes in Q2", not for the whole table. */
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Timestamp', 'Action', 'Action key', 'Module', 'Record', 'Record ID', 'Actor', 'Event ID', 'Metadata']
    const lines = visible.map(r => [
      new Date(r.created_at).toISOString(),
      actionMeta(r.action).label,
      r.action,
      ENTITY_META[r.entity_type]?.label || r.entity_type || '',
      r.entity_title || '',
      r.entity_id || '',
      r.actor_name || 'System',
      r.id,
      r.meta ? JSON.stringify(r.meta) : '',
    ].map(esc).join(','))

    const blob = new Blob(['\uFEFF' + [header.map(esc).join(','), ...lines].join('\r\n')],
      { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `risys-audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns = useMemo(() => [
    {
      key: 'created_at', header: tx('When'), width: 150, sortable: true,
      sortValue: r => new Date(r.created_at).getTime(),
      render: r => (
        <span style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
            {timeAgo(r.created_at)}
          </span>
          <span className="tnum" style={{ display: 'block', fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>
            {new Date(r.created_at).toLocaleString(appLocale(), {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </span>
      ),
    },
    {
      key: 'action', header: tx('Action'), width: 230, sortable: true,
      sortValue: r => actionMeta(r.action).label,
      render: r => {
        const m = actionMeta(r.action)
        /* Wrapped, because a bare badge as a direct grid/flex child stretches
           to the column width — which is exactly what the old page did. */
        return (
          <span style={{ display: 'inline-flex' }}>
            <StatusBadge status={r.action} tone={m.tone} label={m.label} />
          </span>
        )
      },
    },
    {
      key: 'entity_title', header: tx('Record'), sortable: true,
      render: r => {
        const { rest } = extractDiff(r.meta)
        const summary = Object.entries(rest)
          .filter(([k]) => !/^(id|org_id)$|_id$/i.test(k))
          .slice(0, 2)
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
          .join(' · ')
        return (
          <span style={{ display: 'block', minWidth: 0 }}>
            <span className="truncate" style={{
              display: 'block', fontSize: 'var(--t-body)',
              color: r.entity_title ? 'var(--text)' : 'var(--text-3)',
            }}>
              {/* A deleted record has no title left to show. "Deleted record"
                  is the truthful label; the old page printed "NONE". */}
              {r.entity_title || (/delete/.test(r.action || '') ? tx('Deleted record') : '—')}
            </span>
            {summary && (
              <span className="truncate" style={{
                display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 1,
              }}>{summary}</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'actor_name', header: tx('Actor'), width: 170, sortable: true,
      render: r => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Avatar name={r.actor_name || 'System'} />
          <span className="truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
            {r.actor_name || tx('System')}
          </span>
        </span>
      ),
    },
    {
      key: 'entity_type', header: tx('Module'), width: 120, sortable: true, hideBelow: 1280,
      render: r => {
        const e = ENTITY_META[r.entity_type]
        const Icon = e?.icon || Box
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 'var(--t-sm)', color: 'var(--text-3)',
          }}>
            <Icon size={12} /> {e?.label || r.entity_type || '—'}
          </span>
        )
      },
    },
  ], [])

  const activeFilterCount =
    Object.values(filters).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0)

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={tx('Audit Log')}
        subtitle={tx('Every consequential action taken in this workspace, and who took it.')}
        actions={
          <>
            <button onClick={exportCsv} className="btn-secondary" disabled={visible.length === 0}>
              <Download size={13} /> {tx('Export CSV')}</button>
            <button onClick={() => { setOffset(0); setRows([]); load(true) }}
              className="btn-secondary" title={tx('Refresh')} aria-label={tx('Refresh')}
              style={{ padding: '7px 9px' }}>
              <RefreshCw size={13} />
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto" style={{ padding: '16px var(--gutter) var(--s-10)' }}>

        <div style={{ marginBottom: 14 }}>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={tx('Search by action, actor, or record…')}
            defs={filterDefs}
            value={filters}
            onChange={setFilters}
            views={[
              { value: 'All', label: tx('All') },
              ...ENTITY_FILTERS.map(f => ({
                value: f, label: ENTITY_META[f]?.label || f,
              })),
            ]}
            activeView={entityFilter}
            onViewChange={setEntityFilter}
          />
        </div>

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={r => r.id}
          loading={loading && rows.length === 0}
          defaultDensity="comfortable"
          onRowClick={(r) => setSelected((cur) => (cur?.id === r.id ? null : r))}
          expandedKey={selected?.id}
          renderExpanded={(r) => <EventDetail event={r} onOpenRecord={navigate} />}
          empty={
            <EmptyState
              icon={ScrollText}
              title={rows.length === 0 ? tx('No audit events yet') : tx('No events match these filters')}
              description={rows.length === 0
                ? tx(
                'Creating risks, raising incidents and inviting members are all recorded here.'
              )
                : tx('Try a different module, actor, or period.')}
              filtered={rows.length > 0}
              onClearFilters={() => { setFilters({}); setSearch(''); setEntityFilter('All') }}
            />
          }
        />

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button onClick={() => load(false)} disabled={loading} className="btn-secondary">
              {loading ? tx('Loading…') : tx('Load 50 more events')}
            </button>
          </div>
        )}

        {/* The table paginates client-side over what has been fetched, so say so
            rather than letting a filter look like it found everything. */}
        {hasMore && activeFilterCount > 0 && (
          <p style={{
            textAlign: 'center', marginTop: 8,
            fontSize: 'var(--t-meta)', color: 'var(--text-3)',
          }}>{tx('Filters apply to the')} {rows.length} {tx('events loaded so far.')}</p>
        )}
      </div>

    </div>
  )
}
