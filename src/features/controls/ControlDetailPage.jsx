import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, Edit2, Trash2, FlaskConical,
  FileText, ShieldAlert, Zap, Calendar, User, Upload,
  Plus, ExternalLink, Loader2, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import {
  useControls,
  useControlTestsForControl,
  useControlEvidence,
  useControlRiskMappings,
  getTestingStatusStyle,
  getControlTypeStyle,
  getEffectivenessLabel,
} from '@/hooks/useControls'
import { getRiskLevel } from '@/lib/risks'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { EvidenceFileLink } from '@/components/ui/EvidenceFileLink'
import { tx, appLocale } from '@/lib/i18n'

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'tests',    label: tx('Test History'), icon: FlaskConical },
  { id: 'evidence', label: tx('Evidence'),     icon: FileText },
  { id: 'risks',    label: tx('Linked Risks'), icon: ShieldAlert },
]

const RESULT_COLORS = { Pass: '#166534', Fail: '#991b1b', Partial: '#92400e' }

// ── Test History tab ──────────────────────────────────────────────────────────
function TestTab({ control, canTest, onTested }) {
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
      if (onTested) await onTested()
    } finally { setSaving(false) }
  }

  return (
    <div>
      {canTest && (
        <div className="card mb-5" style={{ padding: 20 }}>
          <p className="eyebrow mb-4">{tx('Log Test')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{tx('Test Type')}</label>
              <SelectField value={form.test_type} onChange={set('test_type')}>
                <option>{tx('Design')}</option><option>{tx('Operating')}</option>
              </SelectField>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{tx('Result')}</label>
              <SelectField value={form.result} onChange={set('result')}>
                <option>{tx('Pass')}</option><option>{tx('Fail')}</option><option>{tx('Partial')}</option>
              </SelectField>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{tx('Effectiveness')}</label>
              <SelectField value={form.effectiveness} onChange={set('effectiveness')}>
                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}/5 — {getEffectivenessLabel(v)}</option>)}
              </SelectField>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{tx('Test Date')}</label>
              <input type="date" value={form.test_date} onChange={set('test_date')} className="risys-input" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={form.notes}
              onChange={set('notes')}
              placeholder={tx('Test notes — sample size, exceptions found, method used…')}
              className="risys-input"
              style={{ flex: 1 }}
            />
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{tx('Log Test')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : tests.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <FlaskConical size={28} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tx('No tests recorded yet.')}</p>
          {canTest && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{tx('Use the form above to log your first test.')}</p>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Result', 'Type', 'Date', 'Effectiveness', 'Notes', 'Tested By'].map(h => (
                  <th key={h} className='table-head px-4 py-2.5 text-start'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: RESULT_COLORS[t.result] || 'var(--text-2)' }}>{t.result}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-2)' }}>{t.test_type}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-2)' }}>
                    {new Date(t.test_date).toLocaleDateString(appLocale())}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {t.effectiveness ? (
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.effectiveness}/5 — {getEffectivenessLabel(t.effectiveness)}</span>
                    ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-2)', maxWidth: 300 }}>{t.notes || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-3)' }}>
                    {t.tested_by ? t.tested_by.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Evidence tab ──────────────────────────────────────────────────────────────
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
        <div style={{ marginBottom: 20 }}>
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="btn-secondary">
              <Plus size={14} /> {tx('Add Evidence')}</button>
          ) : (
            <div className="card" style={{ padding: 20, marginBottom: 0 }}>
              <p className="eyebrow mb-4">{tx('Add Evidence')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 10 }}>
                  <input value={form.title} onChange={set('title')} placeholder={tx('Evidence title *')} className="risys-input" />
                  <SelectField value={form.evidence_type} onChange={set('evidence_type')}>
                    {['Document','Screenshot','Log','Attestation','Test Result','Policy','Certificate','Report'].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </SelectField>
                </div>
                <input value={form.description} onChange={set('description')} placeholder={tx('Description (optional)')} className="risys-input" />
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  fontSize: 13, color: 'var(--text-2)', padding: '10px 12px',
                  border: '1px dashed var(--border-2)', borderRadius: 8,
                }}>
                  <Upload size={14} style={{ color: 'var(--taupe)' }} />
                  {file ? <span style={{ color: 'var(--crimson)' }}>{file.name}</span> : tx('Attach file (optional)')}
                  <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowForm(false); setFile(null) }} className="btn-secondary">{tx('Cancel')}</button>
                  <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : tx('Save Evidence')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : evidence.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <FileText size={28} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tx('No evidence attached yet.')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {evidence.map(ev => (
            <div key={ev.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileText size={16} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{ev.title}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {ev.evidence_type} {tx('· Collected')} {new Date(ev.collected_at).toLocaleDateString(appLocale())}
                  {ev.file_name && ` · ${ev.file_name}`}
                </p>
                {ev.description && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{ev.description}</p>}
              </div>
              {ev.file_path && (
                <EvidenceFileLink evidence={ev}
                  style={{ color: 'var(--crimson)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <ExternalLink size={13} /> {tx('View')}</EvidenceFileLink>
              )}
              {canManage && (
                <button onClick={() => deleteEvidence(ev.id)}
                  style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Linked Risks tab ──────────────────────────────────────────────────────────
function RisksTab({ control }) {
  const { risks, loading } = useControlRiskMappings(control.id)
  const navigate = useNavigate()

  if (loading) return <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>

  if (risks.length === 0) return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <ShieldAlert size={28} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tx('This control isn\'t linked to any risks yet.')}</p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{tx('Link it from the risk detail page under the Controls tab.')}</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {risks.map(r => {
        const level = getRiskLevel(r.inherent_score || 0)
        return (
          <button key={r.id} onClick={() => navigate(`/app/risks/${r.id}`)}
            className="card row-hover"
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'start', width: '100%', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <ShieldAlert size={16} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{r.title}</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.risk_id} · {r.status}</p>
            </div>
            <span style={{
              fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600,
              color: level.color, background: level.bg, border: `1px solid ${level.border}`, flexShrink: 0,
            }}>
              {level.label} · {r.inherent_score}
            </span>
            <ChevronRight
              size={14}
              style={{ color: 'var(--text-3)', flexShrink: 0 }}
              className='rtl-flip' />
          </button>
        )
      })}
    </div>
  )
}

// ── Meta cell ─────────────────────────────────────────────────────────────────
function MetaCell({ icon: Icon, label, value, valueColor, badge }) {
  return (
    <div style={{ padding: '16px 20px', borderInlineEnd: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <Icon size={11} style={{ color: 'var(--taupe)' }} />
        <span className="eyebrow">{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: valueColor || 'var(--text-2)' }}>{value}</span>
        {badge && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Effectiveness bar ─────────────────────────────────────────────────────────
function EffBar({ value }) {
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1,2,3,4,5].map(i => (
          <span key={i} style={{
            width: 8, height: 18, borderRadius: 3,
            background: i <= value ? (colors[value] || 'var(--taupe)') : 'var(--surface-2)',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{value}/5 — {getEffectivenessLabel(value)}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ControlDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()

  const [control, setControl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('tests')

  const { deleteControl } = useControls()

  const reload = async () => {
    const { data } = await supabase.from('risk_controls').select('*').eq('id', id).single()
    if (data) setControl(data)
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [id])


  const owner = control?.owner_id ? members.find(m => m.user_id === control.owner_id) : null
  const ownerName = owner?.full_name || owner?.email || '—'
  const canManage = perms.isManager || perms.isAdmin
  const isOverdue = control?.next_test_date && new Date(control.next_test_date) < new Date()

  if (loading) return (
    <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  )

  if (!control) return (
    <div style={{ padding: '80px 28px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{tx('Control not found.')}</p>
      <button onClick={() => navigate('/app/controls')}
        style={{ color: 'var(--crimson)', fontSize: 12, marginTop: 8, background: 'none', border: 'none', cursor: 'pointer' }}>{tx('← Back to Controls')}</button>
    </div>
  )

  const typeStyle = getControlTypeStyle(control.control_type)
  const testStyle = getTestingStatusStyle(control.testing_status)

  return (
    <>

      {/* Breadcrumb */}
      <div style={{ padding: '14px 28px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => navigate('/app/controls')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={13} className='rtl-flip' /> {tx('Controls')}</button>
        <ChevronRight size={11} style={{ color: 'var(--border-2)' }} className='rtl-flip' />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{control.control_id || control.id.slice(0, 8)}</span>
      </div>

      {/* Hero */}
      <div style={{ padding: '16px 28px 0' }}>
        <div className="card" style={{ padding: '20px 24px 0', overflow: 'hidden' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {control.control_id && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: 'var(--surface)', color: 'var(--rose)', border: '1px solid var(--border)', letterSpacing: '0.04em' }}>
                    {control.control_id}
                  </span>
                )}
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600, color: typeStyle.color, background: typeStyle.bg }}>
                  {control.control_type}
                </span>
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600, color: testStyle.color, background: testStyle.bg, border: `1px solid ${testStyle.border}` }}>
                  {control.testing_status || tx('Not Tested')}
                </span>
                {control.is_automated && (
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={10} /> {tx('Automated')}</span>
                )}
                {control.status && control.status !== 'active' && (
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600, color: '#6b7280', background: '#f9fafb' }}>
                    {control.status === 'under_review' ? tx('Under Review') : tx('Inactive')}
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: control.description ? 10 : 0 }}>
                {control.name}
              </h1>
              {control.description && (
                <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 760 }}>
                  {control.description}
                </p>
              )}
            </div>

            {/* Actions */}
            {canManage && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => navigate(`/app/controls/${id}/edit`)} className="btn-secondary" style={{ fontSize: 13 }}>
                  <Edit2 size={13} /> {tx('Edit')}</button>
                <InlineConfirm triggerStyle={{ fontSize: 13, color: 'var(--danger)' }} triggerTitle={tx('Delete control')}
                  message={tx('Delete this control with its test history and evidence?')} confirmLabel={tx('Delete')}
                  onConfirm={async () => { await deleteControl(id); navigate('/app/controls') }}>
                  <Trash2 size={13} />
                </InlineConfirm>
              </div>
            )}
          </div>

          {/* Meta strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid var(--border)', margin: '0 -24px' }}>
            <MetaCell icon={User}       label={tx('Owner')}         value={ownerName} />
            <MetaCell icon={Calendar}   label={tx('Frequency')}     value={control.control_frequency || '—'} />
            <MetaCell icon={FlaskConical} label={tx('Effectiveness')}
              value={control.effectiveness ? '' : '—'}
              badge={undefined}
            />
            <MetaCell icon={Calendar}   label={tx('Next Test')}
              value={control.next_test_date ? new Date(control.next_test_date).toLocaleDateString(appLocale()) : '—'}
              valueColor={isOverdue ? 'var(--danger)' : undefined}
              badge={isOverdue ? 'Overdue' : undefined}
            />
            <MetaCell icon={ShieldAlert} label={tx('Framework Ref')} value={control.framework_ref || '—'} />
          </div>

          {/* Effectiveness full width */}
          {control.effectiveness > 0 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', margin: '0 -24px', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="eyebrow">{tx('Effectiveness')}</span>
                <EffBar value={control.effectiveness} />
              </div>
            </div>
          )}

          {/* Notes */}
          {control.notes && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', margin: '0 -24px' }}>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>{tx('Notes')}</span>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{control.notes}</p>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, margin: '0 -24px', borderTop: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 20px', fontSize: 13, fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === t.id ? 'var(--crimson)' : 'var(--text-3)',
                  borderBottom: tab === t.id ? '2px solid var(--crimson)' : '2px solid transparent',
                  marginBottom: -1,
                }}>
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto' }}>
        {tab === 'tests'    && <TestTab     control={control} canTest={canManage} onTested={reload} />}
        {tab === 'evidence' && <EvidenceTab control={control} canManage={canManage} />}
        {tab === 'risks'    && <RisksTab    control={control} />}
      </div>

    </>
  )
}
