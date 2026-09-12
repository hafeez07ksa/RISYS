import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Clock, CheckCircle2, Circle, AlertCircle,
  RefreshCw, AlertTriangle, User, Link2, Calendar,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useTasks } from '@/hooks/useTasks'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { TASK_STATUSES, TASK_PRIORITIES, getTaskStatus, getTaskPriority } from '@/lib/sla'
import { logAudit, AUDIT } from '@/lib/audit'

function Field({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 4 }}>{label}</p>
      <div style={{ fontSize: 13, color: '#1a1314' }}>{children}</div>
    </div>
  )
}

function DueChip({ dueAt, status }) {
  if (!dueAt || status === 'done' || status === 'cancelled') return null
  const diff = new Date(dueAt) - new Date()
  const hrs = diff / 3600000
  const overdue = diff < 0
  const urgent = hrs < 24 && hrs >= 0
  if (!overdue && !urgent) return (
    <span style={{ fontSize: 12, color: '#8a7070' }}>
      Due {new Date(dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
    </span>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: overdue ? '#b91c1c' : '#92400e', fontWeight: 600 }}>
      <Clock size={12} />
      {overdue ? `Overdue by ${Math.abs(Math.floor(hrs))}h` : `Due in ${Math.floor(hrs)}h`}
    </span>
  )
}

// ── Delete modal ──────────────────────────────────────────────────────────────
function DeleteModal({ task, onClose, onDeleted }) {
  const { organization } = useAuth()
  const { deleteTask } = useTasks()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteTask(task.id)
      await logAudit(organization.id, 'task.deleted', 'task', task.id, task.title)
      onDeleted?.()
      navigate('/app/tasks')
    } catch (_) { setDeleting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 400, borderRadius: 14, overflow: 'hidden', background: '#fff', border: '1px solid #e5e0e0' }}>
        <div style={{ padding: '16px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: '#b91c1c' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c' }}>Delete Task?</p>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.6 }}>
            This will permanently delete <strong style={{ color: '#1a1314' }}>{task.title}</strong>. This cannot be undone.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#b91c1c', color: '#fff', border: 'none', opacity: deleting ? 0.6 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()
  const { updateTask } = useTasks()

  const [task, setTask]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // Linked entities
  const [linkedIncident, setLinkedIncident] = useState(null)
  const [linkedRisk, setLinkedRisk]         = useState(null)

  const load = async () => {
    if (!organization?.id || !id) return
    const { data } = await supabase.from('tasks').select('*').eq('id', id).single()
    setTask(data)
    if (data?.incident_id) {
      const { data: inc } = await supabase.from('incidents').select('id,title,severity,status').eq('id', data.incident_id).single()
      setLinkedIncident(inc)
    }
    if (data?.risk_id) {
      const { data: risk } = await supabase.from('risks').select('id,title,status').eq('id', data.risk_id).single()
      setLinkedRisk(risk)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [organization?.id, id])

  const handleUpdate = async (updates) => {
    setSaving(true)
    try {
      await updateTask(id, updates)
      if (updates.status) {
        await logAudit(organization.id, AUDIT.TASK_STATUS, 'task', id, task.title, {
          from: task.status, to: updates.status,
        })
        if (updates.status === 'done') {
          await logAudit(organization.id, AUDIT.TASK_COMPLETED, 'task', id, task.title)
        }
      }
      await load()
    } finally { setSaving(false) }
  }

  const memberName = (uid) => {
    if (!uid) return null
    const m = members.find(m => m.user_id === uid)
    return m?.full_name || m?.email || uid.slice(0, 8) + '…'
  }

  if (loading) return (
    <div className="h-full flex flex-col">
      <Topbar title="Loading…" subtitle="" />
      <div className="flex-1 flex items-center justify-center"><Spinner /></div>
    </div>
  )

  if (!task) return (
    <div className="h-full flex flex-col">
      <Topbar title="Task not found" subtitle="" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#8a7070' }}>This task no longer exists.</p>
          <button onClick={() => navigate('/app/tasks')} className="btn-secondary text-xs">← Back to Tasks</button>
        </div>
      </div>
    </div>
  )

  const s = getTaskStatus(task.status)
  const p = getTaskPriority(task.priority)

  const StatusIcon = task.status === 'done'
    ? CheckCircle2
    : task.status === 'in_progress' ? AlertCircle : Circle

  return (
    <div className="h-full flex flex-col">
      {showDelete && (
        <DeleteModal task={task} onClose={() => setShowDelete(false)} onDeleted={() => {}} />
      )}

      <Topbar
        title={task.title}
        subtitle={`Tasks · ${task.id.slice(0, 8)}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#fef2f2]"
              style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
              <Trash2 size={13} /> Delete
            </button>
            <button onClick={() => navigate('/app/tasks')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">
        <div className="grid grid-cols-3 gap-5">

          {/* ── Left (2/3) ─────────────────────────────────────────────── */}
          <div className="col-span-2 flex flex-col gap-4">

            {/* Action bar */}
            <div className="rounded-xl p-4 flex flex-wrap items-center gap-3"
              style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

              {/* Status */}
              <div className="flex items-center gap-2">
                <StatusIcon size={16} style={{ color: s.color }} />
                <SelectField value={task.status} onChange={e => handleUpdate({ status: e.target.value })}
                  disabled={saving}
                  className="text-xs pl-2 pr-6 py-1.5 rounded-full border appearance-none outline-none cursor-pointer font-medium"
                  style={{ color: s.color, background: s.bg, borderColor: s.border }}>
                  {TASK_STATUSES.map(ts => <option key={ts.value} value={ts.value}>{ts.label}</option>)}
                </SelectField>
              </div>

              {/* Priority */}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: p.bg, color: p.color, border: `1px solid ${p.border}` }}>
                {p.label}
              </span>

              {/* Due */}
              <DueChip dueAt={task.due_at} status={task.status} />

              {/* Quick complete */}
              {task.status !== 'done' && (
                <button onClick={() => handleUpdate({ status: 'done' })} disabled={saving}
                  className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  <CheckCircle2 size={12} /> Mark Complete
                </button>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 10 }}>Description</p>
                <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{task.description}</p>
              </div>
            )}

            {/* Linked entities */}
            {(linkedIncident || linkedRisk) && (
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 12 }}>Linked To</p>
                <div className="flex flex-col gap-3">
                  {linkedIncident && (
                    <button onClick={() => navigate(`/app/incidents/${linkedIncident.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg text-left hover:bg-[#fafafa] transition-colors"
                      style={{ border: '1px solid #e5e0e0' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertTriangle size={14} style={{ color: '#b91c1c' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 11, color: '#8a7070', marginBottom: 1 }}>Incident</p>
                        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedIncident.title}</p>
                      </div>
                      <Link2 size={13} style={{ color: '#d4cccc', flexShrink: 0 }} />
                    </button>
                  )}
                  {linkedRisk && (
                    <button onClick={() => navigate(`/app/risks/${linkedRisk.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg text-left hover:bg-[#fafafa] transition-colors"
                      style={{ border: '1px solid #e5e0e0' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fdf5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertCircle size={14} style={{ color: '#5D0F0F' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 11, color: '#8a7070', marginBottom: 1 }}>Risk</p>
                        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedRisk.title}</p>
                      </div>
                      <Link2 size={13} style={{ color: '#d4cccc', flexShrink: 0 }} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right (1/3) ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>Details</p>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Assignee */}
                <div>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>Assignee</p>
                  <div className="relative">
                    <SelectField value={task.assigned_to || ''} onChange={e => handleUpdate({ assigned_to: e.target.value || null })}
                      disabled={saving}
                      className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none cursor-pointer"
                      style={{ borderColor: '#e5e0e0', color: task.assigned_to ? '#1a1314' : '#8a7070' }}>
                      <option value="">Unassigned</option>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name || m.email || m.user_id?.slice(0, 8)}
                        </option>
                      ))}
                    </SelectField>
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]" style={{ color: '#8a7070' }}>▾</span>
                  </div>
                </div>

                <Field label="Priority">
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.color }}>{p.label}</span>
                </Field>

                <Field label="Created by">
                  <span style={{ fontSize: 12 }}>{memberName(task.created_by) || '—'}</span>
                </Field>

                <Field label="Created">
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4a3a3a' }}>
                    <Calendar size={11} />
                    {new Date(task.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Field>

                {task.due_at && (
                  <Field label="Due date">
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4a3a3a' }}>
                      <Clock size={11} />
                      {new Date(task.due_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </Field>
                )}

                {task.completed_at && (
                  <Field label="Completed">
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#166534' }}>
                      <CheckCircle2 size={11} />
                      {new Date(task.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </Field>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
