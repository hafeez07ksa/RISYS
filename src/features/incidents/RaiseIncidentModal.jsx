import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { SEVERITIES, STATUSES } from '@/lib/incidents'
import { Spinner } from '@/components/ui/Spinner'
import { logAudit, AUDIT } from '@/lib/audit'

export function RaiseIncidentModal({ onClose, onCreated }) {
  const { organization } = useAuth()
  const { members } = usePeople()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', severity: 'medium',
    status: 'open', assigned_to: '',
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.from('incidents').insert({
        org_id: organization.id,
        connector_id: 'manual',
        title: form.title.trim(),
        description: form.description.trim() || null,
        severity: form.severity,
        status: form.status,
        assigned_to: form.assigned_to || null,
      })
      if (err) throw err
      await logAudit(organization.id, AUDIT.INC_CREATED, 'incident', null, form.title.trim(), {
        severity: form.severity, source: 'manual',
      })
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create incident')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl shadow-xl" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div>
            <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>Raise Incident</h2>
            <p className="text-xs mt-0.5" style={{ color: '#8a7070' }}>Manually log a new incident</p>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Title *</label>
            <input value={form.title} onChange={set('title')}
              placeholder="e.g. Unauthorized access attempt on production server"
              className="sentrix-input" autoFocus />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Description</label>
            <textarea value={form.description} onChange={set('description')}
              placeholder="Describe what happened, impact, and any initial findings..."
              rows={3}
              className="sentrix-input resize-none" />
          </div>

          {/* Severity + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Severity</label>
              <div className="relative">
                <select value={form.severity} onChange={set('severity')}
                  className="w-full text-xs pl-3 pr-7 py-2.5 rounded-md border outline-none appearance-none cursor-pointer"
                  style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                  {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Status</label>
              <div className="relative">
                <select value={form.status} onChange={set('status')}
                  className="w-full text-xs pl-3 pr-7 py-2.5 rounded-md border outline-none appearance-none cursor-pointer"
                  style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
              </div>
            </div>
          </div>

          {/* Assignee */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Assign to</label>
            <div className="relative">
              <select value={form.assigned_to} onChange={set('assigned_to')}
                className="w-full text-xs pl-3 pr-7 py-2.5 rounded-md border outline-none appearance-none cursor-pointer"
                style={{ borderColor: '#e5e0e0', color: form.assigned_to ? '#1a1314' : '#8a7070' }}>
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.user_id}>
                    {m.user_id?.slice(0, 8)}... ({m.role})
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2.5 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !form.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-md px-4 py-2.5"
            style={{ background: '#5D0F0F', color: '#fff', opacity: !form.title.trim() ? 0.5 : 1, border: 'none' }}>
            {loading ? <Spinner size="sm" /> : null}
            Raise Incident
          </button>
        </div>
      </div>
    </div>
  )
}
