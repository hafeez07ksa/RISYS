import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Clock, CheckCircle2, Circle, AlertCircle,
  LayoutGrid, List, ChevronRight, RefreshCw,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useTasks } from '@/hooks/useTasks'
import { CreateTaskModal } from './CreateTaskModal'
import { TASK_STATUSES, TASK_PRIORITIES, getTaskStatus, getTaskPriority } from '@/lib/sla'
import { logAudit, AUDIT } from '@/lib/audit'
import { Spinner } from '@/components/ui/Spinner'

function DueLabel({ dueAt, status }) {
  if (!dueAt || status === 'done' || status === 'cancelled') return null
  const diff = new Date(dueAt) - new Date()
  const hrs = diff / 3600000
  const overdue = diff < 0
  const urgent = hrs < 24 && hrs >= 0
  if (!overdue && !urgent) return (
    <span className="text-[11px]" style={{ color: '#8a7070' }}>
      Due {new Date(dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: overdue ? '#b91c1c' : '#92400e', fontWeight: 600 }}>
      <Clock size={10} />
      {overdue ? `Overdue` : `Due in ${Math.floor(hrs)}h`}
    </span>
  )
}

function Avatar({ name, size = 22 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#5D0F0F', color: '#fff',
      fontSize: size * 0.38, fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>{initials}</div>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function TaskCard({ task, memberName, onUpdate, onClick }) {
  const s = getTaskStatus(task.status)
  const p = getTaskPriority(task.priority)
  const [updating, setUpdating] = useState(false)

  const cycleStatus = async (e) => {
    e.stopPropagation()
    const order = ['todo', 'in_progress', 'done']
    const next = order[(order.indexOf(task.status) + 1) % order.length]
    setUpdating(true)
    try { await onUpdate(task.id, { status: next }) }
    finally { setUpdating(false) }
  }

  const StatusIcon = task.status === 'done' ? CheckCircle2
    : task.status === 'in_progress' ? AlertCircle : Circle

  return (
    <div onClick={onClick}
      className="p-3 rounded-xl mb-2 cursor-pointer transition-colors hover:shadow-sm"
      style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-start gap-2">
        <button onClick={cycleStatus} className="mt-0.5 flex-shrink-0 transition-opacity hover:opacity-70"
          style={{ color: s.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {updating ? <Spinner size="sm" /> : <StatusIcon size={15} strokeWidth={1.5} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium leading-snug ${task.status === 'done' ? 'line-through opacity-50' : ''}`}
            style={{ color: '#1a1314' }}>{task.title}</p>
          {task.description && (
            <p className="text-[11px] mt-1 truncate" style={{ color: '#8a7070' }}>{task.description}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <DueLabel dueAt={task.due_at} status={task.status} />
            </div>
            {task.assigned_to && memberName(task.assigned_to) && (
              <Avatar name={memberName(task.assigned_to)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Kanban view ───────────────────────────────────────────────────────────────
function KanbanView({ tasks, memberName, onUpdate, onNavigate }) {
  const columns = TASK_STATUSES.filter(s => s.value !== 'cancelled')
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {columns.map(col => {
        const colTasks = tasks.filter(t => t.status === col.value)
        return (
          <div key={col.value}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium" style={{ color: '#1a1314' }}>{col.label}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}>
                {colTasks.length}
              </span>
            </div>
            <div className="min-h-[200px] rounded-xl p-2" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
              {colTasks.length === 0
                ? <p className="text-[11px] text-center py-8" style={{ color: '#d4cccc' }}>No tasks</p>
                : colTasks.map(t => (
                  <TaskCard key={t.id} task={t} memberName={memberName}
                    onUpdate={onUpdate} onClick={() => onNavigate(t.id)} />
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({ tasks, memberName, onUpdate, onNavigate }) {
  const GRID = '2fr 80px 110px 90px 140px 20px'
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
      <div className="grid text-[11px] uppercase tracking-wider px-4 py-2.5"
        style={{ gridTemplateColumns: GRID, background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
        <span>Task</span><span>Priority</span><span>Status</span><span>Due</span><span>Assignee</span><span />
      </div>
      <div style={{ background: '#fff' }}>
        {tasks.map((task, i) => {
          const s = getTaskStatus(task.status)
          const p = getTaskPriority(task.priority)
          const name = memberName(task.assigned_to)
          return (
            <div key={task.id}
              onClick={() => onNavigate(task.id)}
              className="grid items-center px-4 py-3 hover:bg-[#fafafa] transition-colors cursor-pointer"
              style={{ gridTemplateColumns: GRID, borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
              <div className="flex items-center gap-2 pr-4 min-w-0">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span className={`text-xs truncate ${task.status === 'done' ? 'line-through opacity-50' : ''}`}
                  style={{ color: '#1a1314' }}>{task.title}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{p.label}</span>
              <div onClick={e => e.stopPropagation()}>
                <select value={task.status}
                  onChange={async e => { await onUpdate(task.id, { status: e.target.value }) }}
                  className="text-xs px-2 py-1 rounded border outline-none appearance-none cursor-pointer"
                  style={{ borderColor: s.border, color: s.color, background: s.bg }}>
                  {TASK_STATUSES.map(ts => <option key={ts.value} value={ts.value}>{ts.label}</option>)}
                </select>
              </div>
              <div><DueLabel dueAt={task.due_at} status={task.status} /></div>
              <div className="flex items-center gap-2 min-w-0">
                {name ? (
                  <>
                    <Avatar name={name} />
                    <span className="text-xs truncate" style={{ color: '#4a3a3a' }}>{name}</span>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#d4cccc' }}>—</span>
                )}
              </div>
              <ChevronRight size={14} style={{ color: '#d4cccc' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TasksPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()
  const [view, setView] = useState('list')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { tasks, loading, updateTask, refetch } = useTasks({
    priority: priorityFilter || undefined,
    status: statusFilter || undefined,
  })

  const memberName = (uid) => {
    if (!uid) return null
    const m = members.find(m => m.user_id === uid)
    return m?.full_name || m?.email || null
  }

  const handleUpdate = async (id, updates) => {
    await updateTask(id, updates)
    const task = tasks.find(t => t.id === id)
    if (task && updates.status) {
      await logAudit(organization.id, AUDIT.TASK_STATUS, 'task', id, task.title, {
        from: task.status, to: updates.status,
      })
    }
  }

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  )

  const counts = {
    total:      tasks.length,
    todo:       tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done:       tasks.filter(t => t.status === 'done').length,
    overdue:    tasks.filter(t => t.due_at && new Date(t.due_at) < new Date() && !['done','cancelled'].includes(t.status)).length,
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Tasks"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={refetch}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <div className="flex rounded-md overflow-hidden border" style={{ borderColor: '#e5e0e0' }}>
              <button onClick={() => setView('list')}
                className="px-2.5 py-1.5 transition-colors"
                style={{ background: view === 'list' ? '#f5f3f3' : '#fff', color: view === 'list' ? '#1a1314' : '#8a7070' }}>
                <List size={13} />
              </button>
              <button onClick={() => setView('kanban')}
                className="px-2.5 py-1.5 transition-colors"
                style={{ background: view === 'kanban' ? '#f5f3f3' : '#fff', color: view === 'kanban' ? '#1a1314' : '#8a7070', borderLeft: '1px solid #e5e0e0' }}>
                <LayoutGrid size={13} />
              </button>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
              <Plus size={13} /> New Task
            </button>
          </div>
        }
      />

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={refetch}
        />
      )}

      <div className="flex-1 overflow-y-auto page-content">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Total',       val: counts.total,      active: !statusFilter },
            { label: 'To Do',       val: counts.todo,       filter: 'todo' },
            { label: 'In Progress', val: counts.inProgress, filter: 'in_progress' },
            { label: 'Done',        val: counts.done,       filter: 'done' },
            { label: 'Overdue',     val: counts.overdue,    warn: counts.overdue > 0 },
          ].map(s => (
            <div key={s.label}
              onClick={() => s.filter && setStatusFilter(f => f === s.filter ? '' : s.filter)}
              className="rounded-xl p-3 text-center transition-all"
              style={{
                background: s.filter && statusFilter === s.filter ? '#fdf5f5' : '#fff',
                border: `1px solid ${s.warn && counts.overdue > 0 ? '#fecaca' : s.filter && statusFilter === s.filter ? '#f0dada' : '#e5e0e0'}`,
                cursor: s.filter ? 'pointer' : 'default',
              }}>
              <p className="text-xl font-light" style={{ color: s.warn && counts.overdue > 0 ? '#b91c1c' : '#1a1314' }}>{s.val}</p>
              <p className="text-[11px] mt-0.5" style={{ color: s.warn && counts.overdue > 0 ? '#b91c1c' : '#8a7070' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full text-xs pl-8 pr-3 py-2 rounded-md border outline-none"
              style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
          </div>
          <div className="relative">
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
              className="text-xs pl-3 pr-7 py-2 rounded-md border appearance-none outline-none cursor-pointer"
              style={{ borderColor: '#e5e0e0', color: priorityFilter ? '#1a1314' : '#8a7070' }}>
              <option value="">All priorities</option>
              {TASK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
          </div>
          {(search || priorityFilter || statusFilter) && (
            <button onClick={() => { setSearch(''); setPriorityFilter(''); setStatusFilter('') }}
              className="text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>Clear</button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <CheckCircle2 size={32} strokeWidth={1} className="mx-auto mb-4" style={{ color: '#d4cccc' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
              {tasks.length === 0 ? 'No tasks yet' : 'No tasks match this filter'}
            </p>
            <p className="text-xs mb-4" style={{ color: '#8a7070' }}>
              {tasks.length === 0 ? 'Create tasks to track remediation work linked to incidents and risks' : 'Try a different filter'}
            </p>
            {tasks.length === 0 && (
              <button onClick={() => setShowCreate(true)}
                className="text-xs px-4 py-2 rounded-md"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                Create first task
              </button>
            )}
          </div>
        ) : view === 'kanban' ? (
          <KanbanView tasks={filtered} memberName={memberName} onUpdate={handleUpdate} onNavigate={id => navigate(`/app/tasks/${id}`)} />
        ) : (
          <ListView tasks={filtered} memberName={memberName} onUpdate={handleUpdate} onNavigate={id => navigate(`/app/tasks/${id}`)} />
        )}
      </div>
    </div>
  )
}
