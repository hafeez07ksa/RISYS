import { useState } from 'react'
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'
import { useControlTests } from '@/hooks/useRisks'
import { Spinner } from '@/components/ui/Spinner'

const RESULT_COLORS = { Pass: '#2F6B3C', Fail: '#8C1616', Partial: '#9C6F0F' }

/**
 * Control test log (Archer: design & operating effectiveness testing).
 * Logging a test automatically updates the parent control's testing
 * status, last-tested date, and effectiveness (DB trigger).
 */
export function ControlTestsPanel({ control, onTestLogged, canTest }) {
  const [open, setOpen] = useState(false)
  const { tests, loading, logTest } = useControlTests(open ? control.id : null)
  const [form, setForm] = useState({ test_type: 'Operating', result: 'Pass', effectiveness: control.effectiveness || 3, notes: '', test_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      await logTest({ ...form, effectiveness: parseInt(form.effectiveness) })
      setForm(f => ({ ...f, notes: '' }))
      onTestLogged && onTestLogged()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        <FlaskConical size={12} /> Test history
        {control.last_tested_at && !open && <span style={{ color: 'var(--text-3)' }}>· last tested {new Date(control.last_tested_at).toLocaleDateString('en-GB')}</span>}
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {/* log a test — managers/admins only */}
          {canTest && <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 90px 110px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <select value={form.test_type} onChange={set('test_type')} className="sentrix-input" style={{ fontSize: 12 }}>
              <option>Design</option><option>Operating</option>
            </select>
            <select value={form.result} onChange={set('result')} className="sentrix-input" style={{ fontSize: 12 }}>
              <option>Pass</option><option>Fail</option><option>Partial</option>
            </select>
            <select value={form.effectiveness} onChange={set('effectiveness')} className="sentrix-input" style={{ fontSize: 12 }} title="Assessed effectiveness 1–5">
              {[1,2,3,4,5].map(v => <option key={v} value={v}>Eff {v}/5</option>)}
            </select>
            <input type="date" value={form.test_date} onChange={set('test_date')} className="sentrix-input" style={{ fontSize: 12 }} />
            <input value={form.notes} onChange={set('notes')} placeholder="Test notes — sample size, exceptions found…" className="sentrix-input" style={{ fontSize: 12 }} />
            <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 12 }}>
              {saving ? <Spinner size="sm" /> : 'Log Test'}
            </button>
          </div>}

          {loading ? <Spinner size="sm" /> : tests.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No tests recorded — log design and operating effectiveness tests above.</p>
            : tests.map(t => (
              <div key={t.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--surface)', fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: RESULT_COLORS[t.result] || 'var(--text-2)', width: 50, flexShrink: 0 }}>{t.result}</span>
                <span style={{ color: 'var(--text-3)', width: 70, flexShrink: 0 }}>{t.test_type}</span>
                <span style={{ color: 'var(--text-3)', width: 80, flexShrink: 0 }}>{new Date(t.test_date).toLocaleDateString('en-GB')}</span>
                {t.effectiveness && <span style={{ color: 'var(--text-3)', width: 60, flexShrink: 0 }}>Eff {t.effectiveness}/5</span>}
                <span style={{ color: 'var(--text-2)', flex: 1 }}>{t.notes || ''}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
