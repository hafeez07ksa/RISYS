import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, CheckSquare, RefreshCw, Zap,
  AlertTriangle, Calendar, ChevronUp, ChevronDown,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import {
  useControls,
  getTestingStatusStyle,
  getControlTypeStyle,
  CONTROL_TYPES,
  TESTING_STATUSES,
} from '@/hooks/useControls'
import { ControlModal } from './ControlModal'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'

// ── Stat segment ──────────────────────────────────────────────────────────────
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

// ── Table sort header ─────────────────────────────────────────────────────────
function SortTh({ label, sortKey, currentSort, sortAsc, onSort }) {
  const active = currentSort === sortKey
  return (
    <th className="table-head px-4 py-2.5 text-left cursor-pointer select-none" onClick={() => onSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {active
          ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronDown size={11} style={{ opacity: 0.3 }} />}
      </div>
    </th>
  )
}

const SORTS = {
  name:           (a, b) => (a.name || '').localeCompare(b.name || ''),
  control_type:   (a, b) => (a.control_type || '').localeCompare(b.control_type || ''),
  effectiveness:  (a, b) => (b.effectiveness || 0) - (a.effectiveness || 0),
  testing_status: (a, b) => (a.testing_status || '').localeCompare(b.testing_status || ''),
  next_test_date: (a, b) => new Date(a.next_test_date || '2999-01-01') - new Date(b.next_test_date || '2999-01-01'),
}

export function ControlsPage() {
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const navigate = useNavigate()

  // Filters
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [quickFilter, setQuickFilter]   = useState('')

  // Sort
  const [sortKey, setSortKey]   = useState('name')
  const [sortAsc, setSortAsc]   = useState(true)

  // Create modal only
  const [showCreate, setShowCreate] = useState(false)

  const { controls, loading, createControl, refetch } = useControls({
    search:         search || undefined,
    control_type:   typeFilter || undefined,
    testing_status: statusFilter || undefined,
  })

  // Stats
  const total     = controls.length
  const passing   = controls.filter(c => c.testing_status === 'Pass').length
  const failing   = controls.filter(c => c.testing_status === 'Fail').length
  const notTested = controls.filter(c => !c.testing_status || c.testing_status === 'Not Tested').length
  const overdue   = controls.filter(c => c.next_test_date && new Date(c.next_test_date) < new Date()).length
  const automated = controls.filter(c => c.is_automated).length

  // Quick filter + sort
  const filtered = useMemo(() => {
    let list = [...controls]
    if (quickFilter === 'overdue')   list = list.filter(c => c.next_test_date && new Date(c.next_test_date) < new Date())
    if (quickFilter === 'failing')   list = list.filter(c => c.testing_status === 'Fail')
    if (quickFilter === 'automated') list = list.filter(c => c.is_automated)
    const sorter = SORTS[sortKey]
    if (sorter) list = list.sort(sortAsc ? sorter : (a, b) => sorter(b, a))
    return list
  }, [controls, quickFilter, sortKey, sortAsc])

  const handleSort = (key) => {
    if (key === sortKey) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const handleSave = async (data) => {
    await createControl(data)
    setShowCreate(false)
  }

  const memberName = (uid) => {
    if (!uid) return '—'
    const m = members.find(m => m.user_id === uid)
    return m?.full_name || m?.email || '—'
  }

  const canManage = perms.isManager || perms.isAdmin

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title="Controls"
        subtitle={organization?.name}
        actions={
          canManage && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus size={14} /> Add Control
            </button>
          )
        }
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Stats bar ── */}
        <div className="card mb-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', overflow: 'hidden' }}>
          <Segment label="Total"     value={total}     sub="controls in library"      barColor="var(--taupe)" />
          <Segment label="Passing"   value={passing}   sub="last test passed"   color="#166534" barColor="#86efac"
            onClick={() => setQuickFilter(q => q === 'failing' ? '' : 'failing')} active={quickFilter === 'failing'} />
          <Segment label="Failing"   value={failing}   sub="need attention"     color="#991b1b" barColor="#fca5a5"
            onClick={() => setQuickFilter(q => q === 'failing' ? '' : 'failing')} active={quickFilter === 'failing'} />
          <Segment label="Overdue"   value={overdue}   sub="test past due"      color={overdue > 0 ? '#92400e' : undefined} barColor="#fde68a"
            onClick={() => setQuickFilter(q => q === 'overdue' ? '' : 'overdue')} active={quickFilter === 'overdue'} />
          <Segment label="Automated" value={automated} sub="no manual steps"          barColor="#c084fc"
            onClick={() => setQuickFilter(q => q === 'automated' ? '' : 'automated')} active={quickFilter === 'automated'} last />
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search controls…"
              className="risys-input"
              style={{ paddingLeft: 30 }}
            />
          </div>

          <SelectField value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 160 }}>
            <option value="">All Types</option>
            {CONTROL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </SelectField>

          <SelectField value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 160 }}>
            <option value="">All Statuses</option>
            {TESTING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </SelectField>

          <button onClick={refetch} className="btn-ghost" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <CheckSquare size={32} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
              {controls.length === 0 ? 'No controls yet' : 'No controls match your filters'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {controls.length === 0
                ? 'Add your first control to start building your control library.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {controls.length === 0 && canManage && (
              <button onClick={() => setShowCreate(true)} className="btn-primary" style={{ marginTop: 16 }}>
                <Plus size={14} /> Add Control
              </button>
            )}
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <SortTh label="Control Name"    sortKey="name"           currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="Type"             sortKey="control_type"   currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="table-head px-4 py-2.5 text-left">Owner</th>
                  <th className="table-head px-4 py-2.5 text-left">Frequency</th>
                  <SortTh label="Effectiveness"   sortKey="effectiveness"  currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="Testing Status"  sortKey="testing_status" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="Next Test"        sortKey="next_test_date" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="table-head px-4 py-2.5 text-left">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ctrl => {
                  const typeStyle = getControlTypeStyle(ctrl.control_type)
                  const testStyle = getTestingStatusStyle(ctrl.testing_status)
                  const isOverdue = ctrl.next_test_date && new Date(ctrl.next_test_date) < new Date()

                  return (
                    <tr
                      key={ctrl.id}
                      className="row-hover"
                      onClick={() => navigate(`/app/controls/${ctrl.id}`)}
                      style={{
                        cursor: 'pointer',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      {/* Name */}
                      <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ctrl.name}
                        </p>
                        {ctrl.framework_ref && (
                          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{ctrl.framework_ref}</p>
                        )}
                      </td>

                      {/* Type */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: typeStyle.color, background: typeStyle.bg }}>
                          {ctrl.control_type || '—'}
                        </span>
                      </td>

                      {/* Owner */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{memberName(ctrl.owner_id)}</span>
                      </td>

                      {/* Frequency */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{ctrl.control_frequency || '—'}</span>
                      </td>

                      {/* Effectiveness */}
                      <td style={{ padding: '12px 16px' }}>
                        <EffBar value={ctrl.effectiveness || 0} />
                      </td>

                      {/* Testing Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: testStyle.color, background: testStyle.bg, border: `1px solid ${testStyle.border}` }}>
                          {ctrl.testing_status || 'Not Tested'}
                        </span>
                      </td>

                      {/* Next Test */}
                      <td style={{ padding: '12px 16px' }}>
                        {ctrl.next_test_date ? (
                          <span style={{ fontSize: 12, color: isOverdue ? 'var(--danger)' : 'var(--text-3)', fontWeight: isOverdue ? 600 : 400 }}>
                            {new Date(ctrl.next_test_date).toLocaleDateString('en-GB')}
                            {isOverdue && ' ⚠'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--border-2)' }}>—</span>
                        )}
                      </td>

                      {/* Flags */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ctrl.is_automated && (
                            <span title="Automated" style={{ color: '#7c3aed' }}><Zap size={13} /></span>
                          )}
                          {ctrl.testing_status === 'Fail' && (
                            <span title="Test failing" style={{ color: 'var(--danger)' }}><AlertTriangle size={13} /></span>
                          )}
                          {isOverdue && (
                            <span title="Test overdue" style={{ color: '#92400e' }}><Calendar size={13} /></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {filtered.length} of {total} control{total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Create modal ── */}
      <ControlModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleSave}
        editControl={null}
      />
    </div>
  )
}

// ── Effectiveness bar ─────────────────────────────────────────────────────────
function EffBar({ value }) {
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1,2,3,4,5].map(i => (
          <span key={i} style={{
            width: 6, height: 14, borderRadius: 2,
            background: i <= value ? (colors[value] || 'var(--taupe)') : 'var(--surface-2)',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{value}/5</span>
    </div>
  )
}
