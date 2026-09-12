import { useState } from 'react'
import { X } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { usePeople } from '@/hooks/usePeople'
import { useAuth } from '@/hooks/useAuth'
import { TASK_PRIORITIES } from '@/lib/sla'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { logAudit, AUDIT } from '@/lib/audit'

export function CreateTaskModal({ onClose, onCreated, incidentId, riskId }) {
  const { createTask } = useTasks()
  const { members } = usePeople()
  const { user, organization } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium',
    assigned_to: '', due_at: '', reminder_at: '',
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setLoading(true); setError('')
    try {
      const task = await createTask({
        title:       form.title.trim(),
        description: form.description.trim() || null,
        priority:    form.priority,
        assigned_to: form.assigned_to || null,
        created_by:  user?.id,
        due_at:      form.due_at || null,
        reminder_at: form.reminder_at || null,
        incident_id: incidentId || null,
        risk_id:     riskId     || null,
        status:      'todo',
      })
      await logAudit(organization.id, AUDIT.TASK_CREATED, 'task', task?.id, form.title.trim(), {
        assigned_to: form.assigned_to || null,
        linked_to: incidentId ? `incident:${incidentId}` : riskId ? `risk:${riskId}` : null,
      })
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  const sourceLabel = incidentId ? 'Linked to incident' : riskId ? 'Linked to risk' : 'Standalone task'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl shadow-xl" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div>
            <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>Create Task</h2>
            <p className="text-xs mt-0.5" style={{ color: '#8a7070' }}>{sourceLabel}</p>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Title *</label>
            <input value={form.title} onChange={set('title')}
              placeholder="e.g. Enable MFA for Ahmed Khan"
              className="risys-input" autoFocus />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Description</label>
            <textarea value={form.description} onChange={set('description')}
              placeholder="Steps, context, acceptance criteria…"
              rows={2} className="risys-input resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Priority</label>
              <div className="relative">
                <SelectField value={form.priority} onChange={set('priority')} className="w-full"
                  style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                  {TASK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </SelectField>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Assign to</label>
              <div className="relative">
                <SelectField value={form.assigned_to} onChange={set('assigned_to')} className="w-full"
                  style={{ borderColor: '#e5e0e0', color: form.assigned_to ? '#1a1314' : '#8a7070' }}>
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email || m.user_id?.slice(0, 8)} ({m.role})
                    </option>
                  ))}
                </SelectField>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Due date</label>
              <input type="datetime-local" value={form.due_at} onChange={set('due_at')}
                className="risys-input text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Reminder</label>
              <input type="datetime-local" value={form.reminder_at} onChange={set('reminder_at')}
                className="risys-input text-xs" />
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
        </div>

        <div className="flex gap-2.5 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !form.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-md px-4 py-2.5"
            style={{ background: '#5D0F0F', color: '#fff', opacity: !form.title.trim() ? 0.5 : 1, border: 'none' }}>
            {loading ? <Spinner size="sm" /> : null}
            Create Task
          </button>
        </div>
      </div>
    </div>
  )
}
