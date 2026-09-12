import { useState } from 'react'
import { X } from 'lucide-react'
import { useGroups } from '@/hooks/useGroups'
import { Spinner } from '@/components/ui/Spinner'

const COLORS = [
  '#5D0F0F', '#895353', '#1e40af', '#166534',
  '#92400e', '#6b21a8', '#0f766e', '#334155',
]

export function CreateGroupModal({ onClose, editGroup }) {
  const { createGroup, updateGroup } = useGroups()
  const [name, setName] = useState(editGroup?.name || '')
  const [description, setDescription] = useState(editGroup?.description || '')
  const [color, setColor] = useState(editGroup?.color || '#5D0F0F')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true); setError('')
    try {
      if (editGroup) await updateGroup(editGroup.id, { name: name.trim(), description, color })
      else await createGroup({ name: name.trim(), description, color })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl shadow-xl p-6" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>{editGroup ? 'Edit group' : 'Create group'}</h2>
          <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Group name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. IT Security, Finance, Legal"
              className="risys-input" autoFocus />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Description (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this group do?"
              className="risys-input" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || loading}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-md px-4 py-2.5"
            style={{ background: '#5D0F0F', color: '#fff', opacity: !name.trim() ? 0.5 : 1, border: 'none' }}>
            {loading ? <Spinner size="sm" /> : null}
            {editGroup ? 'Save changes' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
