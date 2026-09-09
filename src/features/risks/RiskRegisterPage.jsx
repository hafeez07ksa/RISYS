import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, ShieldAlert, RefreshCw, LayoutGrid, List, Filter,
  Download, Trash2, ChevronUp, ChevronDown, AlertTriangle, User
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useRisks, runExceptionExpiry } from '@/hooks/useRisks'
import { RiskMatrix } from './RiskMatrix'
import { CreateRiskModal } from './CreateRiskModal'
import {
  getRiskLevel, getRiskStatus, getWorkflowState, isReviewOverdue,
  risksToCSV, downloadCSV,
  RISK_CATEGORIES, RISK_STATUSES, WORKFLOW_STATES, RISK_TREATMENTS,
} from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

function RiskBadge({ score }) {
  const l = getRiskLevel(score)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium border w-fit"
      style={{ color: l.color, background: l.bg, borderColor: l.border }}>
      {l.label} · {score}
    </span>
  )
}

function Segment({ label, value, color, barColor, sub, onClick, active, last }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="relative text-left px-4 pt-3.5 pb-4 transition-colors"
      style={{
        background: active ? '#F6EBE8' : 'transparent',
        border: 'none',
        borderRight: last ? 'none' : '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick && !active) e.currentTarget.style.background = '#FAF3F1' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? '#F6EBE8' : 'transparent' }}>
      {active && <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#5D0F0F' }} />}
      <p className="eyebrow mb-1.5">{label}</p>
      <p className="text-3xl font-light" style={{ color: color || 'var(--text)' }}>{value}</p>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span style={{ width: 18, height: 3, borderRadius: 2, background: barColor || 'var(--taupe)', flexShrink: 0 }} />
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{sub || '\u00A0'}</p>
      </div>
    </button>
  )
}

const SORTS = {
  inherent:  (a, b) => (b.inherent_score || b.risk_score || 0) - (a.inherent_score || a.risk_score || 0),
  residual:  (a, b) => (b.residual_score || b.inherent_score || 0) - (a.residual_score || a.inherent_score || 0),
  title:     (a, b) => (a.title || '').localeCompare(b.title || ''),
  risk_id:   (a, b) => (a.risk_id || '').localeCompare(b.risk_id || ''),
  review:    (a, b) => new Date(a.review_date || '2999-01-01') - new Date(b.review_date || '2999-01-01'),
  created:   (a, b) => new Date(b.created_at) - new Date(a.created_at),
}

export function RiskRegisterPage() {
  const { organization, user } = useAuth()
  const { members } = usePeople()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [treatmentFilter, setTreatmentFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState('') // '' | 'mine' | 'overdue' | 'pending_review'
  const perms = usePermissions()
  const [showCreate, setShowCreate] = useState(false)
  const [editRisk, setEditRisk] = useState(null)
  const [view, setView] = useState('list')
  const [sortKey, setSortKey] = useState('inherent')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const { risks, loading, deleteRisk, updateRisk, refetch } = useRisks({
    status:         statusFilter   || undefined,
    category:       categoryFilter || undefined,
    workflow_state: workflowFilter || undefined,
    search:         search         || undefined,
  })

  // Auto-expire approved exceptions whose validity has lapsed (reopens accepted risks)
  useEffect(() => {
    if (organization?.id) runExceptionExpiry(organization.id).then(() => {})
  }, [organization?.id])

  const memberName = (uid) => {
    if (!uid) return ''
    const m = members.find(m => m.user_id === uid)
    return m?.full_name || m?.email || m?.title || uid.slice(0, 8)
  }

  const filtered = useMemo(() => {
    let list = [...risks]
    if (treatmentFilter) list = list.filter(r => r.treatment === treatmentFilter)
    if (quickFilter === 'mine')           list = list.filter(r => r.owner_id === user?.id || r.reviewer_id === user?.id || r.approver_id === user?.id)
    if (quickFilter === 'overdue')        list = list.filter(isReviewOverdue)
    if (quickFilter === 'pending_review') list = list.filter(r => r.workflow_state === 'under_review')
    if (quickFilter === 'critical')       list = list.filter(r => (r.inherent_score || r.risk_score || 0) >= 20)
    if (quickFilter === 'high')           list = list.filter(r => { const s = r.inherent_score || r.risk_score || 0; return s >= 12 && s < 20 })
    const sorter = SORTS[sortKey] || SORTS.inherent
    list.sort(sorter)
    if (sortAsc) list.reverse()
    return list
  }, [risks, treatmentFilter, quickFilter, sortKey, sortAsc, user?.id])

  const counts = useMemo(() => ({
    total:    risks.length,
    critical: risks.filter(r => (r.inherent_score || r.risk_score) >= 20).length,
    high:     risks.filter(r => { const s = r.inherent_score || r.risk_score; return s >= 12 && s < 20 }).length,
    overdue:  risks.filter(isReviewOverdue).length,
    pending:  risks.filter(r => r.workflow_state === 'under_review').length,
    avgResidual: risks.length ? Math.round(risks.reduce((sum, r) => sum + (r.residual_score || r.inherent_score || r.risk_score || 0), 0) / risks.length) : 0,
  }), [risks])

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const toggleSelect = (id, e) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))
  }

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} risk(s)? This cannot be undone.`)) return
    setBulkBusy(true)
    try {
      for (const id of selected) await deleteRisk(id)
      setSelected(new Set())
    } finally { setBulkBusy(false) }
  }

  const bulkSetStatus = async (status) => {
    if (!status) return
    setBulkBusy(true)
    try {
      for (const id of selected) await updateRisk(id, { status }, user?.id)
      setSelected(new Set())
    } finally { setBulkBusy(false) }
  }

  const exportCSV = () => {
    const csv = risksToCSV(filtered, memberName)
    downloadCSV(`risk-register-${new Date().toISOString().split('T')[0]}.csv`, csv)
  }

  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setCategoryFilter(''); setWorkflowFilter('')
    setTreatmentFilter(''); setQuickFilter('')
  }
  const hasFilters = search || statusFilter || categoryFilter || workflowFilter || treatmentFilter || quickFilter

  const SortHeader = ({ k, children }) => (
    <button onClick={() => handleSort(k)}
      className="flex items-center gap-1 uppercase text-left"
      style={{ fontSize: 10.5, letterSpacing: '0.1em', color: sortKey === k ? '#5D0F0F' : '#895353', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: sortKey === k ? 700 : 500 }}>
      {children}
      {sortKey === k && (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  )

  const GRID = '28px 90px 2fr 90px 90px 110px 110px 110px 100px'

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Risk Register"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden" style={{ borderColor: '#e9dad7' }}>
              {[['list', List], ['matrix', LayoutGrid]].map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v)}
                  className="px-2.5 py-1.5 transition-colors"
                  style={{ background: view === v ? '#5D0F0F' : '#fff', color: view === v ? '#fff' : '#97817d' }}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <button onClick={exportCSV} title="Export filtered register to CSV"
              className="w-8 h-8 flex items-center justify-center rounded-md border transition-colors hover:bg-[#f6eeec]"
              style={{ borderColor: '#e9dad7', color: '#97817d' }}>
              <Download size={13} />
            </button>
            <button onClick={refetch} className="w-8 h-8 flex items-center justify-center rounded-md border transition-colors hover:bg-[#f6eeec]"
              style={{ borderColor: '#e9dad7', color: '#97817d' }}>
              <RefreshCw size={13} />
            </button>
            {perms.canCreateRisk && <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
              <Plus size={13} /> Add Risk
            </button>}
          </div>
        }
      />

      {(showCreate || editRisk) && (
        <CreateRiskModal editRisk={editRisk} onClose={() => { setShowCreate(false); setEditRisk(null); refetch() }} />
      )}

      <div className="flex-1 overflow-y-auto page-content">
        {/* Risk posture strip — every segment filters or sorts the register */}
        <div className="grid grid-cols-6 mb-5 rounded-xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid var(--border)' }}>
          <Segment label="Total Risks" value={counts.total} barColor="var(--taupe)" sub="in register"
            onClick={clearFilters} />
          <Segment label="Critical" value={counts.critical} color={counts.critical ? '#8C1616' : undefined} barColor="#8C1616" sub="inherent ≥ 20"
            onClick={() => setQuickFilter(q => q === 'critical' ? '' : 'critical')} active={quickFilter === 'critical'} />
          <Segment label="High" value={counts.high} color={counts.high ? '#B5491B' : undefined} barColor="#B5491B" sub="inherent 12–19"
            onClick={() => setQuickFilter(q => q === 'high' ? '' : 'high')} active={quickFilter === 'high'} />
          <Segment label="Overdue Review" value={counts.overdue} color={counts.overdue ? '#8C1616' : undefined} barColor="#9C6F0F" sub="needs recertification"
            onClick={() => setQuickFilter(q => q === 'overdue' ? '' : 'overdue')} active={quickFilter === 'overdue'} />
          <Segment label="Awaiting Approval" value={counts.pending} barColor="var(--rose)" sub="in review"
            onClick={() => setQuickFilter(q => q === 'pending_review' ? '' : 'pending_review')} active={quickFilter === 'pending_review'} />
          <Segment label="Avg Residual" value={counts.avgResidual} color={getRiskLevel(counts.avgResidual).color} barColor={getRiskLevel(counts.avgResidual).color} sub="after controls — sort"
            onClick={() => { setSortKey(k => k === 'residual' ? 'inherent' : 'residual'); setSortAsc(false) }} active={sortKey === 'residual'} last />
        </div>

        {view === 'matrix' && (
          <div className="mb-5">
            <RiskMatrix risks={filtered} onRiskClick={r => navigate(`/app/risks/${r.id}`)} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#97817d' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search risks..." className="w-full text-xs pl-8 pr-3 py-2 rounded-md border outline-none"
              style={{ borderColor: '#e9dad7' }} />
          </div>
          <button onClick={() => setQuickFilter(q => q === 'mine' ? '' : 'mine')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border"
            style={{
              borderColor: quickFilter === 'mine' ? '#5D0F0F' : '#e9dad7',
              background: quickFilter === 'mine' ? '#f6ebe8' : '#fff',
              color: quickFilter === 'mine' ? '#5D0F0F' : '#97817d',
            }}>
            <User size={11} /> My Risks
          </button>
          {[
            { value: statusFilter, onChange: setStatusFilter, options: RISK_STATUSES, placeholder: 'All statuses' },
            { value: categoryFilter, onChange: setCategoryFilter, options: RISK_CATEGORIES.map(c => ({ value: c, label: c })), placeholder: 'All categories' },
            { value: workflowFilter, onChange: setWorkflowFilter, options: WORKFLOW_STATES, placeholder: 'All workflow states' },
            { value: treatmentFilter, onChange: setTreatmentFilter, options: RISK_TREATMENTS, placeholder: 'All treatments' },
          ].map((f, i) => (
            <div key={i} className="relative">
              <select value={f.value} onChange={e => f.onChange(e.target.value)}
                className="text-xs pl-3 pr-7 py-2 rounded-md border appearance-none outline-none cursor-pointer"
                style={{ borderColor: '#e9dad7', color: f.value ? '#292021' : '#97817d', background: '#fff' }}>
                <option value="">{f.placeholder}</option>
                {f.options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
              </select>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#97817d' }}>▾</span>
            </div>
          ))}
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs px-3 py-2 rounded-md border hover:bg-[#f6eeec]"
              style={{ borderColor: '#e9dad7', color: '#97817d' }}>
              <Filter size={11} className="inline mr-1" />Clear
            </button>
          )}
          <span className="text-xs ml-auto" style={{ color: '#97817d' }}>{filtered.length} risk{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg"
            style={{ background: '#f6ebe8', border: '1px solid #e6cfc9' }}>
            <span className="text-xs font-medium" style={{ color: '#5D0F0F' }}>{selected.size} selected</span>
            <select onChange={e => { bulkSetStatus(e.target.value); e.target.value = '' }} defaultValue=""
              className="text-xs px-2 py-1.5 rounded-md border outline-none cursor-pointer"
              style={{ borderColor: '#e9dad7', background: '#fff', color: '#4d3e3e' }} disabled={bulkBusy}>
              <option value="" disabled>Set status…</option>
              {RISK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {perms.canDeleteRisk && <button onClick={bulkDelete} disabled={bulkBusy}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
              style={{ background: '#fff', color: '#8C1616', border: '1px solid #F0CECE' }}>
              <Trash2 size={11} /> Delete
            </button>}
            <button onClick={() => setSelected(new Set())} className="text-xs ml-auto" style={{ color: '#97817d', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear selection
            </button>
            {bulkBusy && <Spinner size="sm" />}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e9dad7' }}>
            <ShieldAlert size={32} strokeWidth={1} className="mx-auto mb-4" style={{ color: '#d9c5c1' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4d3e3e' }}>
              {hasFilters ? 'No risks match your filters' : 'No risks yet'}
            </p>
            <p className="text-xs mb-4" style={{ color: '#97817d' }}>
              {hasFilters ? 'Try adjusting your filters' : 'Start building your risk register'}
            </p>
            {!hasFilters && perms.canCreateRisk && (
              <button onClick={() => setShowCreate(true)} className="text-xs px-4 py-2 rounded-md"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                Add first risk
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e9dad7' }}>
            <div className="grid items-center px-4 py-2.5"
              style={{ gridTemplateColumns: GRID, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll}
                style={{ cursor: 'pointer', accentColor: '#5D0F0F' }} />
              <SortHeader k="risk_id">ID</SortHeader>
              <SortHeader k="title">Risk</SortHeader>
              <SortHeader k="inherent">Inherent</SortHeader>
              <SortHeader k="residual">Residual</SortHeader>
              <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 500, color: '#895353' }}>Status</span>
              <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 500, color: '#895353' }}>Workflow</span>
              <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 500, color: '#895353' }}>Owner</span>
              <SortHeader k="review">Next Review</SortHeader>
            </div>
            <div style={{ background: '#fff' }}>
              {filtered.map((risk, i) => {
                const s = getRiskStatus(risk.status)
                const w = getWorkflowState(risk.workflow_state)
                const inherentScore = risk.inherent_score || risk.risk_score || 0
                const residualScore = risk.residual_score || inherentScore
                const overdue = isReviewOverdue(risk)
                return (
                  <div key={risk.id} onClick={() => navigate(`/app/risks/${risk.id}`)}
                    className="grid items-center px-4 py-3 cursor-pointer hover:bg-[#faf3f1] transition-colors"
                    style={{ gridTemplateColumns: GRID, borderTop: i > 0 ? '1px solid #f6eeec' : 'none' }}>
                    <input type="checkbox" checked={selected.has(risk.id)} onChange={() => {}} onClick={e => toggleSelect(risk.id, e)}
                      style={{ cursor: 'pointer', accentColor: '#5D0F0F' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#97817d' }}>{risk.risk_id || ''}</span>
                    <div className="pr-4 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#292021' }}>{risk.title}</p>
                      <p className="text-[11px] truncate" style={{ color: '#97817d' }}>
                        {risk.category}{risk.subcategory ? ` · ${risk.subcategory}` : ''}{risk.business_unit ? ` — ${risk.business_unit}` : ''}
                      </p>
                    </div>
                    <RiskBadge score={inherentScore} />
                    {residualScore !== inherentScore ? (
                      <span className="text-xs" style={{ color: '#2F6B3C' }}>↓ {residualScore}</span>
                    ) : <span className="text-xs" style={{ color: '#97817d' }}>—</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full border w-fit"
                      style={{ color: s.color, background: s.bg, borderColor: s.border }}>{s.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border w-fit"
                      style={{ color: w.color, background: w.bg, borderColor: w.border }}>{w.label}</span>
                    <span className="text-xs truncate pr-2" style={{ color: risk.owner_id ? '#4d3e3e' : '#d9c5c1' }}>
                      {memberName(risk.owner_id) || 'Unassigned'}
                    </span>
                    {risk.review_date ? (
                      <span className="flex items-center gap-1 text-xs" style={{ color: overdue ? '#8C1616' : '#97817d', fontWeight: overdue ? 600 : 400 }}>
                        {overdue && <AlertTriangle size={11} />}
                        {new Date(risk.review_date).toLocaleDateString('en-GB')}
                      </span>
                    ) : <span className="text-xs" style={{ color: '#d9c5c1' }}>—</span>}
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
