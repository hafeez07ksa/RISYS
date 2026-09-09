import { useState } from 'react'
import {
  X, FlaskConical, FileText, ShieldAlert, Zap, Calendar,
  User, Trash2, Upload, Plus, ChevronDown, ChevronUp, Loader2, ExternalLink
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  useControlTestsForControl, useControlEvidence, useControlRiskMappings,
  getTestingStatusStyle, getEffectivenessLabel, getControlTypeStyle
} from '@/hooks/useControls'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { getRiskLevel } from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

const RESULT_COLORS = { Pass: '#166534', Fail: '#991b1b', Partial: '#92400e' }

const TABS = [
  { id: 'tests',    label: 'Test History', icon: FlaskConical },
  { id: 'evidence', label: 'Evidence',     icon: FileText },
  { id: 'risks',    label: 'Linked Risks', icon: ShieldAlert },
]

function TestTab({ control, canTest }) {
  const { tests, loading, logTest } = useControlTestsForControl(control.id)
  const [form, setForm] = useState({
    test_type: 'Operating', result: 'Pass',
    effectiveness: control.effectiveness || 3,
    notes: '', test_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      await logTest({ ...form, effectiveness: parseInt(form.effectiveness) })
      setForm(f => ({ ...f, notes: '' }))
    } finally { setSaving(false) }
  }

  return (
    <div>
      {canTest && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface)', borderRadius: 8 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Log Test</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select value={form.test_type} onChange={set('test_type')} className="sentrix-select" style={{ fontSize: 12 }}>
              <option>Design</option><option>Operating</option>
            </select>
            <select value={form.result} onChange={set('result')} className="sentrix-select" style={{ fontSize: 12 }}>
              <option>Pass</option><option>Fail</option><option>Partial</option>
            </select>
            <select value={form.effectiveness} onChange={set('effectiveness')} className="sentrix-select" style={{ fontSize: 12 }}>
              {[1,2,3,4,5].map(v => <option key={v} value={v}>Eff {v}/5</option>)}
            </select>
            <input type="date" value={form.test_date} onChange={set('test_date')} className="sentrix-input" style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={form.notes}
              onChange={set('notes')}
              placeholder="Test notes — sample size, exceptions found…"
              className="sentrix-input"
              style={{ fontSize: 12, flex: 1 }}
            />
            <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 12, flexShrink: 0 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Log'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Spinner size="sm" /> : tests.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
          No tests recorded yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px 76px 90px 60px 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--surface)' }}>
            {['Result','Type','Date','Eff','Notes'].map(h => (
              <span key={h} className="eyebrow">{h}</span>
            ))}
          </div>
          {tests.map(t => (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '56px 76px 90px 60px 1fr', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--surface)', fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: RESULT_COLORS[t.result] || 'var(--text-2)' }}>{t.result}</span>
              <span style={{ color: 'var(--text-3)' }}>{t.test_type}</span>
              <span style={{ color: 'var(--text-3)' }}>{new Date(t.test_date).toLocaleDateString('en-GB')}</span>
              <span style={{ color: 'var(--text-3)' }}>{t.effectiveness ? `${t.effectiveness}/5` : '—'}</span>
              <span style={{ color: 'var(--text-2)' }}>{t.notes || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EvidenceTab({ control, canManage }) {
  const { evidence, loading, addEvidence, deleteEvidence } = useControlEvidence(control.id)
  const [form, setForm] = useState({ title: '', description: '', evidence_type: 'Document' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await addEvidence(form, file)
      setForm({ title: '', description: '', evidence_type: 'Document' })
      setFile(null)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 16 }}>
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="btn-secondary" style={{ fontSize: 12 }}>
              <Plus size={13} /> Add Evidence
            </button>
          ) : (
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 8 }}>
              <p className="eyebrow" style={{ marginBottom: 10 }}>Add Evidence</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={form.title} onChange={set('title')} placeholder="Evidence title *" className="sentrix-input" style={{ fontSize: 12 }} />
                  <select value={form.evidence_type} onChange={set('evidence_type')} className="sentrix-select" style={{ fontSize: 12 }}>
                    {['Document','Screenshot','Log','Attestation','Test Result','Policy','Certificate','Report'].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <input value={form.description} onChange={set('description')} placeholder="Description (optional)" className="sentrix-input" style={{ fontSize: 12 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                  <Upload size={13} />
                  {file ? file.name : 'Attach file (optional)'}
                  <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
                  <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary" style={{ fontSize: 12 }}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <Spinner size="sm" /> : evidence.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
          No evidence attached yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {evidence.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
              <FileText size={14} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{ev.title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {ev.evidence_type} · {new Date(ev.collected_at).toLocaleDateString('en-GB')}
                  {ev.file_name && ` · ${ev.file_name}`}
                </p>
              </div>
              {ev.file_url && (
                <a href={ev.file_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--crimson)', flexShrink: 0 }}>
                  <ExternalLink size={13} />
                </a>
              )}
              {canManage && (
                <button onClick={() => deleteEvidence(ev.id)} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RisksTab({ control }) {
  const { risks, loading } = useControlRiskMappings(control.id)
  const navigate = useNavigate()

  if (loading) return <Spinner size="sm" />
  if (risks.length === 0) return (
    <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
      This control isn't linked to any risks yet. Link it from the risk detail page.
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {risks.map(r => {
        const level = getRiskLevel(r.inherent_score || 0)
        return (
          <button
            key={r.id}
            onClick={() => navigate(`/app/risks/${r.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            <ShieldAlert size={14} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{r.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.risk_id}</p>
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: level.color, background: level.bg, border: `1px solid ${level.border}`, flexShrink: 0 }}>
              {level.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ControlDrawer({ control, onClose, onEdit, onDelete, canManage }) {
  const [tab, setTab] = useState('tests')
  const { members } = usePeople()
  const perms = usePermissions()

  if (!control) return null

  const owner = control.owner_id ? members.find(m => m.user_id === control.owner_id) : null
  const ownerName = owner?.full_name || owner?.email || '—'
  const typeStyle = getControlTypeStyle(control.control_type)
  const testStyle = getTestingStatusStyle(control.testing_status)

  const isOverdue = control.next_test_date && new Date(control.next_test_date) < new Date()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 580, height: '100%', background: '#fff',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: '-8px 0 32px rgba(26,19,20,0.08)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: typeStyle.color, background: typeStyle.bg }}>
                  {control.control_type}
                </span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: testStyle.color, background: testStyle.bg, border: `1px solid ${testStyle.border}` }}>
                  {control.testing_status || 'Not Tested'}
                </span>
                {control.is_automated && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: '#1e40af', background: '#eff6ff', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Zap size={10} /> Automated
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                {control.name}
              </h2>
              {control.control_id && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{control.control_id}</p>
              )}
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
              <X size={16} />
            </button>
          </div>

          {control.description && (
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 12 }}>
              {control.description}
            </p>
          )}
        </div>

        {/* Meta grid */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, flexShrink: 0 }}>
          <MetaCell icon={User} label="Owner" value={ownerName} />
          <MetaCell icon={Calendar} label="Frequency" value={control.control_frequency || '—'} />
          <MetaCell icon={FlaskConical} label="Effectiveness"
            value={control.effectiveness ? `${control.effectiveness}/5 — ${getEffectivenessLabel(control.effectiveness)}` : '—'}
          />
          {control.next_test_date && (
            <MetaCell icon={Calendar} label="Next Test"
              value={new Date(control.next_test_date).toLocaleDateString('en-GB')}
              valueStyle={{ color: isOverdue ? 'var(--danger)' : 'var(--text-2)' }}
              badge={isOverdue ? 'Overdue' : null}
            />
          )}
          {control.last_tested_at && (
            <MetaCell icon={Calendar} label="Last Tested"
              value={new Date(control.last_tested_at).toLocaleDateString('en-GB')}
            />
          )}
          {control.framework_ref && (
            <MetaCell icon={ShieldAlert} label="Framework Ref" value={control.framework_ref} />
          )}
        </div>

        {/* Notes */}
        {control.notes && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <p className="eyebrow" style={{ marginBottom: 5 }}>Notes</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{control.notes}</p>
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onEdit} className="btn-secondary" style={{ fontSize: 12 }}>Edit</button>
            <button onClick={onDelete} className="btn-ghost" style={{ fontSize: 12, color: 'var(--danger)' }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', fontSize: 12, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                color: tab === t.id ? 'var(--crimson)' : 'var(--text-3)',
                borderBottom: tab === t.id ? '2px solid var(--crimson)' : '2px solid transparent',
                marginBottom: -1,
              }}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, padding: '16px 24px', overflowY: 'auto' }}>
          {tab === 'tests'    && <TestTab control={control} canTest={perms.canLogControlTest} />}
          {tab === 'evidence' && <EvidenceTab control={control} canManage={canManage} />}
          {tab === 'risks'    && <RisksTab control={control} />}
        </div>
      </div>
    </div>
  )
}

function MetaCell({ icon: Icon, label, value, valueStyle, badge }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon size={11} style={{ color: 'var(--taupe)' }} />
        <span className="eyebrow">{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', ...valueStyle }}>{value}</span>
        {badge && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}
