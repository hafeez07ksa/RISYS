import { useState, useEffect } from 'react'
import { X, Save, Loader2, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { SelectField } from '@/components/ui/Combobox'
import { usePeople } from '@/hooks/usePeople'
import { CONTROL_TYPES, CONTROL_FREQUENCIES } from '@/hooks/useControls'
import { FrameworkClausePicker } from './FrameworkClausePicker'

const FIELD = (label, children, hint) => (
  <div>
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, letterSpacing: '0.02em' }}>
      {label}
    </label>
    {children}
    {hint && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{hint}</p>}
  </div>
)

const EMPTY = {
  name: '', description: '', control_type: 'Preventive', control_frequency: 'Continuous',
  owner_id: '', effectiveness: 3, is_automated: false, framework_ref: '', notes: '', status: 'active',
  next_test_date: '',
}

export function ControlModal({ open, onClose, onSave, editControl }) {
  const { members } = usePeople()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editControl) {
      setForm({
        name:              editControl.name || '',
        description:       editControl.description || '',
        control_type:      editControl.control_type || 'Preventive',
        control_frequency: editControl.control_frequency || 'Continuous',
        owner_id:          editControl.owner_id || '',
        effectiveness:     editControl.effectiveness || 3,
        is_automated:      editControl.is_automated || false,
        framework_ref:     editControl.framework_ref || '',
        notes:             editControl.notes || '',
        status:            editControl.status || 'active',
        next_test_date:    editControl.next_test_date ? editControl.next_test_date.split('T')[0] : '',
      })
    } else {
      setForm(EMPTY)
    }
    setError('')
  }, [open, editControl])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Control name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        effectiveness:  parseInt(form.effectiveness),
        owner_id:       form.owner_id || null,
        next_test_date: form.next_test_date || null,
        framework_ref:  form.framework_ref || null,
        notes:          form.notes || null,
        description:    form.description || null,
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save control.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editControl ? 'Edit Control' : 'Add Control'} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {FIELD('Control Name *', (
          <input
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. MFA enforced on all privileged accounts"
            className="risys-input"
            autoFocus
          />
        ))}

        {FIELD('Description', (
          <textarea
            value={form.description}
            onChange={set('description')}
            placeholder="What does this control do and how is it implemented?"
            className="risys-input"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FIELD('Type', (
            <SelectField value={form.control_type} onChange={set('control_type')}>
              {CONTROL_TYPES.map(t => <option key={t}>{t}</option>)}
            </SelectField>
          ))}
          {FIELD('Frequency', (
            <SelectField value={form.control_frequency} onChange={set('control_frequency')}>
              {CONTROL_FREQUENCIES.map(f => <option key={f}>{f}</option>)}
            </SelectField>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FIELD('Owner', (
            <SelectField value={form.owner_id} onChange={set('owner_id')}>
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </SelectField>
          ))}
          {FIELD('Effectiveness', (
            <SelectField value={form.effectiveness} onChange={set('effectiveness')}>
              <option value={1}>1 — Very Low</option>
              <option value={2}>2 — Low</option>
              <option value={3}>3 — Moderate</option>
              <option value={4}>4 — High</option>
              <option value={5}>5 — Very High</option>
            </SelectField>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FIELD('Next Test Date', (
            <input
              type="date"
              value={form.next_test_date}
              onChange={set('next_test_date')}
              className="risys-input"
            />
          ))}
          {FIELD('Status', (
            <SelectField value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="under_review">Under Review</option>
            </SelectField>
          ))}
        </div>

        {FIELD('Framework Reference', (
          <>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                background: form.framework_ref ? '#fdf5f5' : '#fff',
                fontSize: 13, color: form.framework_ref ? 'var(--crimson)' : 'var(--text-3)',
                fontFamily: form.framework_ref ? 'var(--font-mono)' : 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{form.framework_ref || 'Select framework clause…'}</span>
              <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
            <FrameworkClausePicker
              open={showPicker}
              onClose={() => setShowPicker(false)}
              currentValue={form.framework_ref}
              onSelect={(ref) => setForm(f => ({ ...f, framework_ref: ref }))}
            />
          </>
        ), 'Optional — link to a specific framework clause')}

        {FIELD('Notes', (
          <textarea
            value={form.notes}
            onChange={set('notes')}
            placeholder="Implementation notes, testing guidance, or context…"
            className="risys-input"
            rows={2}
            style={{ resize: 'vertical' }}
          />
        ))}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={form.is_automated}
            onChange={setCheck('is_automated')}
            style={{ accentColor: 'var(--crimson)', width: 14, height: 14 }}
          />
          This control is automated (no manual steps required)
        </label>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 10px', background: '#fef2f2', borderRadius: 6 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editControl ? 'Save Changes' : 'Add Control'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
