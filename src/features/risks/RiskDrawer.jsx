import { useState } from 'react'
import { X, Edit2, Trash2, Plus, Shield, FileText, AlertTriangle, Activity, Clock, Check, ExternalLink, Upload, Trash, Link } from 'lucide-react'
import {
  getRiskLevel, getRiskStatus, getWorkflowState, getControlTestingStatus, getRAGStatus,
  LIKELIHOOD_LABELS, IMPACT_LABELS, EFFECTIVENESS_LABELS, CONTROL_TYPES,
  CONTROL_FREQUENCIES, CONTROL_TESTING_STATUSES, EVIDENCE_TYPES, RAG_STATUSES
} from '@/lib/risks'
import { useRiskControls, useRiskEvidence, useRiskKRIs, useRiskLossEvents, useRiskAuditLog } from '@/hooks/useRisks'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useComments } from '@/hooks/useComments'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'

const TABS = [
  { id: 'overview',   label: 'Overview',     icon: Shield },
  { id: 'controls',   label: 'Controls',     icon: Check },
  { id: 'evidence',   label: 'Evidence',     icon: FileText },
  { id: 'kris',       label: 'KRIs',         icon: Activity },
  { id: 'loss',       label: 'Loss Events',  icon: AlertTriangle },
  { id: 'comments',   label: 'Comments',     icon: Clock },
  { id: 'audit',      label: 'Audit Trail',  icon: Clock },
]

export function RiskDrawer({ risk, onClose, onEdit, onDelete, onUpdate }) {
  const [tab, setTab] = useState('overview')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const { user } = useAuth()
  const { members } = usePeople()

  const inherentScore = risk.inherent_score || risk.risk_score || 0
  const residualScore = risk.residual_score || inherentScore
  const inherentLevel = getRiskLevel(inherentScore)
  const residualLevel = getRiskLevel(residualScore)
  const status = getRiskStatus(risk.status)
  const workflow = getWorkflowState(risk.workflow_state)

  const getMemberName = (id) => {
    if (!id) return '—'
    const m = members.find(m => m.user_id === id)
    return m?.full_name || m?.email || id?.slice(0, 8) + '...'
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: 'rgba(0,0,0,0.2)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl h-full flex flex-col shadow-2xl" style={{ background: '#fff', borderLeft: '1px solid #e9dad7' }}>

        {/* Header */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #e9dad7', background: 'var(--surface)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {risk.risk_id && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#f0eded', color: '#97817d' }}>{risk.risk_id}</span>}
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: status.color, background: status.bg, borderColor: status.border }}>{status.label}</span>
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: workflow.color, background: workflow.bg, borderColor: workflow.border }}>{workflow.label}</span>
              </div>
              <h2 className="text-sm font-medium leading-snug" style={{ color: '#292021' }}>{risk.title}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#97817d' }}>
                {risk.risk_type}{risk.category ? ` · ${risk.category}` : ''}{risk.subcategory ? ` · ${risk.subcategory}` : ''}{risk.business_unit ? ` — ${risk.business_unit}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => onEdit(risk)} className="p-1.5 rounded hover:bg-[#f6eeec] transition-colors" style={{ color: '#97817d' }}><Edit2 size={13} /></button>
              {deleteConfirm ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => { onDelete(); setDeleteConfirm(false) }}
                    className="text-[11px] px-2 py-1 rounded" style={{ background: '#FBEAEA', color: '#8C1616', border: '1px solid #F0CECE' }}>Confirm</button>
                  <button onClick={() => setDeleteConfirm(false)}
                    className="text-[11px] px-2 py-1 rounded" style={{ background: '#f6eeec', color: '#97817d', border: '1px solid #e9dad7' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(true)} className="p-1.5 rounded hover:bg-[#FBEAEA] transition-colors" style={{ color: '#97817d' }}><Trash2 size={13} /></button>
              )}
              <button onClick={onClose} className="p-1.5 rounded hover:bg-[#f6eeec] transition-colors" style={{ color: '#97817d' }}><X size={14} /></button>
            </div>
          </div>

          {/* Score bars */}
          <div className="flex items-center gap-3 mt-3">
            <ScoreBar label="Inherent" score={inherentScore} level={inherentLevel} max={25} />
            <span className="text-[11px]" style={{ color: '#97817d' }}>→</span>
            <ScoreBar label="Residual" score={residualScore} level={residualLevel} max={25} />
            {residualScore < inherentScore && (
              <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#ECF4EE', color: '#2F6B3C' }}>
                ↓ {Math.round((1 - residualScore / inherentScore) * 100)}% reduced
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b overflow-x-auto" style={{ borderColor: '#e9dad7' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
              style={{
                borderBottom: tab === t.id ? '2px solid #5D0F0F' : '2px solid transparent',
                color: tab === t.id ? '#5D0F0F' : '#97817d',
              }}>
              <t.icon size={11} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview'  && <OverviewTab risk={risk} getMemberName={getMemberName} />}
          {tab === 'controls'  && <ControlsTab riskId={risk.id} />}
          {tab === 'evidence'  && <EvidenceTab riskId={risk.id} />}
          {tab === 'kris'      && <KRIsTab riskId={risk.id} />}
          {tab === 'loss'      && <LossEventsTab riskId={risk.id} />}
          {tab === 'comments'  && <CommentsTab riskId={risk.id} user={user} />}
          {tab === 'audit'     && <AuditTab riskId={risk.id} />}
        </div>
      </div>
    </div>
  )
}

function ScoreBar({ label, score, level, max }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: '#97817d' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color: level.color }}>{level.label} {score}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: '#f0eded' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(score / max) * 100}%`, background: level.color }} />
      </div>
    </div>
  )
}

// ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
function OverviewTab({ risk, getMemberName }) {
  const inherentScore = risk.inherent_score || risk.risk_score || 0
  const rows = [
    { label: 'Risk Statement',   value: risk.risk_statement, wide: true },
    { label: 'Description',      value: risk.description,    wide: true },
    { label: 'Risk Drivers',     value: risk.risk_drivers,   wide: true },
    { label: 'Inherent Score',   value: `${inherentScore} (${LIKELIHOOD_LABELS[risk.inherent_likelihood || risk.likelihood]?.split('—')[0]?.trim()} × ${IMPACT_LABELS[risk.inherent_impact || risk.impact]?.split('—')[0]?.trim()})` },
    { label: 'Residual Score',   value: risk.residual_score ? `${risk.residual_score} (${LIKELIHOOD_LABELS[risk.residual_likelihood]?.split('—')[0]?.trim()} × ${IMPACT_LABELS[risk.residual_impact]?.split('—')[0]?.trim()})` : 'Not assessed' },
    { label: 'Risk Appetite',    value: risk.risk_appetite || '—' },
    { label: 'Treatment',        value: risk.treatment ? risk.treatment.charAt(0).toUpperCase() + risk.treatment.slice(1) : '—' },
    { label: 'Treatment Notes',  value: risk.treatment_notes, wide: true },
    { label: 'Risk Owner',       value: getMemberName(risk.owner_id) },
    { label: 'Reviewer',         value: getMemberName(risk.reviewer_id) },
    { label: 'Approver',         value: getMemberName(risk.approver_id) },
    { label: 'Risk Direction',   value: risk.risk_direction || 'Stable' },
    { label: 'Review Frequency', value: risk.review_frequency || '—' },
    { label: 'Next Review',      value: risk.review_date ? new Date(risk.review_date).toLocaleDateString() : '—' },
    { label: 'Framework Ref',    value: risk.framework_ref || '—' },
    { label: 'Created',          value: risk.created_at ? new Date(risk.created_at).toLocaleDateString() : '—' },
  ]
  return (
    <div className="grid gap-3">
      {rows.filter(r => r.value).map(row => (
        <div key={row.label} className={row.wide ? 'col-span-2' : ''}>
          <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: '#97817d' }}>{row.label}</p>
          <p className="text-xs" style={{ color: '#292021', whiteSpace: 'pre-wrap' }}>{row.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── CONTROLS TAB ─────────────────────────────────────────────────────────────
function ControlsTab({ riskId }) {
  const { controls, allControls, loading, createControl, updateControl, linkControl, unlinkControl } = useRiskControls(riskId)
  const [showAdd, setShowAdd] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [editCtrl, setEditCtrl] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', control_type: 'Preventive', control_frequency: 'Monthly', effectiveness: 3, is_automated: false, framework_ref: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const mappedIds = controls.map(c => c.id)
  const unmappedControls = allControls.filter(c => !mappedIds.includes(c.id))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editCtrl) { await updateControl(editCtrl.id, form) }
      else { await createControl(form) }
      setShowAdd(false); setEditCtrl(null)
      setForm({ name: '', description: '', control_type: 'Preventive', control_frequency: 'Monthly', effectiveness: 3, is_automated: false, framework_ref: '', notes: '' })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: '#292021' }}>{controls.length} Control{controls.length !== 1 ? 's' : ''} linked</p>
          <p className="text-[11px]" style={{ color: '#97817d' }}>Controls that reduce this risk's likelihood or impact</p>
        </div>
        <div className="flex gap-2">
          {unmappedControls.length > 0 && (
            <button onClick={() => setShowLink(!showLink)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors hover:bg-[#f6eeec]"
              style={{ borderColor: '#e9dad7', color: '#97817d' }}>
              <Link size={11} /> Link Existing
            </button>
          )}
          <button onClick={() => { setShowAdd(true); setEditCtrl(null) }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
            style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
            <Plus size={11} /> New Control
          </button>
        </div>
      </div>

      {/* Link existing controls */}
      {showLink && (
        <div className="p-3 rounded-lg" style={{ background: '#f6eeec', border: '1px solid #e9dad7' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#292021' }}>Link existing control</p>
          <div className="flex flex-col gap-1.5">
            {unmappedControls.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded" style={{ background: '#fff', border: '1px solid #e9dad7' }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: '#292021' }}>{c.name}</p>
                  <p className="text-[11px]" style={{ color: '#97817d' }}>{c.control_type} · {c.control_id}</p>
                </div>
                <button onClick={() => { linkControl(c.id); setShowLink(false) }}
                  className="text-[11px] px-2 py-1 rounded" style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                  Link
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {(showAdd || editCtrl) && (
        <ControlForm form={form} setForm={setForm} set={set} onSave={handleSave} onCancel={() => { setShowAdd(false); setEditCtrl(null) }} saving={saving} isEdit={!!editCtrl} />
      )}

      {/* Controls list */}
      {controls.length === 0 && !showAdd ? (
        <EmptyState icon={Check} title="No controls linked" sub="Add controls to reduce this risk's exposure" />
      ) : (
        <div className="flex flex-col gap-2">
          {controls.map(ctrl => {
            const ts = getControlTestingStatus(ctrl.testing_status)
            return (
              <div key={ctrl.id} className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono" style={{ color: '#97817d' }}>{ctrl.control_id}</span>
                      <span className="text-xs font-medium" style={{ color: '#292021' }}>{ctrl.name}</span>
                      {ctrl.is_automated && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#eff6ff', color: '#1e40af' }}>Automated</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-[11px]" style={{ color: '#97817d' }}>{ctrl.control_type}</span>
                      <span className="text-[11px]" style={{ color: '#97817d' }}>{ctrl.control_frequency}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded border"
                        style={{ color: ts.color, background: ts.bg, borderColor: ts.border }}>{ts.label}</span>
                      <EffectivenessBar value={ctrl.effectiveness} />
                    </div>
                    {ctrl.description && <p className="text-[11px] mt-1" style={{ color: '#97817d' }}>{ctrl.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditCtrl(ctrl); setForm({ name: ctrl.name, description: ctrl.description || '', control_type: ctrl.control_type, control_frequency: ctrl.control_frequency, effectiveness: ctrl.effectiveness, is_automated: ctrl.is_automated, framework_ref: ctrl.framework_ref || '', notes: ctrl.notes || '' }); setShowAdd(false) }}
                      className="p-1 rounded hover:bg-[#f0eded]" style={{ color: '#97817d' }}><Edit2 size={11} /></button>
                    <button onClick={() => unlinkControl(ctrl.id)} className="p-1 rounded hover:bg-[#FBEAEA]" style={{ color: '#97817d' }}><X size={11} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EffectivenessBar({ value }) {
  const pct = ((value - 1) / 4) * 100
  const color = value >= 4 ? '#2F6B3C' : value >= 3 ? '#9C6F0F' : '#8C1616'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px]" style={{ color: '#97817d' }}>Effectiveness</span>
      <div className="w-16 h-1 rounded-full" style={{ background: '#e9dad7' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px]" style={{ color }}>{value}/5</span>
    </div>
  )
}

function ControlForm({ form, setForm, set, onSave, onCancel, saving, isEdit }) {
  return (
    <div className="p-4 rounded-lg flex flex-col gap-3" style={{ background: '#f6eeec', border: '1px solid #e9dad7' }}>
      <p className="text-xs font-medium" style={{ color: '#292021' }}>{isEdit ? 'Edit Control' : 'New Control'}</p>
      <input value={form.name} onChange={set('name')} placeholder="Control name *" className="risys-input text-xs" />
      <textarea value={form.description} onChange={set('description')} placeholder="Description..." rows={2} className="risys-input text-xs resize-none" />
      <div className="grid grid-cols-2 gap-2">
        <MiniSelect label="Type" value={form.control_type} onChange={set('control_type')} options={CONTROL_TYPES} />
        <MiniSelect label="Frequency" value={form.control_frequency} onChange={set('control_frequency')} options={CONTROL_FREQUENCIES} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px]" style={{ color: '#97817d' }}>Effectiveness: {form.effectiveness}/5 — {EFFECTIVENESS_LABELS[form.effectiveness]?.split('—')[0]?.trim()}</label>
        <input type="range" min="1" max="5" value={form.effectiveness}
          onChange={e => setForm(f => ({ ...f, effectiveness: parseInt(e.target.value) }))}
          className="w-full" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="automated" checked={form.is_automated}
          onChange={e => setForm(f => ({ ...f, is_automated: e.target.checked }))} />
        <label htmlFor="automated" className="text-xs" style={{ color: '#4d3e3e' }}>Automated control</label>
      </div>
      <input value={form.framework_ref} onChange={set('framework_ref')} placeholder="Framework reference (optional)" className="risys-input text-xs" />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 btn-secondary text-xs py-1.5">Cancel</button>
        <button onClick={onSave} disabled={saving || !form.name.trim()}
          className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1"
          style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: !form.name.trim() ? 0.5 : 1 }}>
          {saving ? <Spinner size="sm" /> : null} Save
        </button>
      </div>
    </div>
  )
}

// ── EVIDENCE TAB ──────────────────────────────────────────────────────────────
function EvidenceTab({ riskId }) {
  const { evidence, loading, addEvidence, deleteEvidence } = useRiskEvidence(riskId)
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', evidence_type: 'Document', evidence_period: '' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await addEvidence({ ...form, collected_by: user?.id }, file)
      setShowAdd(false); setForm({ title: '', description: '', evidence_type: 'Document', evidence_period: '' }); setFile(null)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: '#292021' }}>{evidence.length} Evidence Item{evidence.length !== 1 ? 's' : ''}</p>
          <p className="text-[11px]" style={{ color: '#97817d' }}>Documents, screenshots, attestations, and test results</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
          style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
          <Plus size={11} /> Add Evidence
        </button>
      </div>

      {showAdd && (
        <div className="p-4 rounded-lg flex flex-col gap-3" style={{ background: '#f6eeec', border: '1px solid #e9dad7' }}>
          <input value={form.title} onChange={set('title')} placeholder="Evidence title *" className="risys-input text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <MiniSelect label="Type" value={form.evidence_type} onChange={set('evidence_type')} options={EVIDENCE_TYPES} />
            <input value={form.evidence_period} onChange={set('evidence_period')} placeholder="Period (e.g. Q1 2025)" className="risys-input text-xs" />
          </div>
          <textarea value={form.description} onChange={set('description')} placeholder="Description..." rows={2} className="risys-input text-xs resize-none" />
          <div>
            <label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Attachment (optional)</label>
            <input type="file" onChange={e => setFile(e.target.files[0])} className="text-xs" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 btn-secondary text-xs py-1.5">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: !form.title.trim() ? 0.5 : 1 }}>
              {saving ? <Spinner size="sm" /> : null} Save
            </button>
          </div>
        </div>
      )}

      {evidence.length === 0 && !showAdd ? (
        <EmptyState icon={FileText} title="No evidence collected" sub="Add documents, screenshots, and attestations" />
      ) : (
        <div className="flex flex-col gap-2">
          {evidence.map(ev => (
            <div key={ev.id} className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#eff6ff', color: '#1e40af' }}>{ev.evidence_type}</span>
                    <span className="text-xs font-medium" style={{ color: '#292021' }}>{ev.title}</span>
                    {ev.evidence_period && <span className="text-[11px]" style={{ color: '#97817d' }}>{ev.evidence_period}</span>}
                  </div>
                  {ev.description && <p className="text-[11px] mt-1" style={{ color: '#97817d' }}>{ev.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    {ev.file_url && (
                      <a href={ev.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px]" style={{ color: '#1e40af' }}>
                        <ExternalLink size={10} /> {ev.file_name || 'View file'}
                      </a>
                    )}
                    <span className="text-[11px]" style={{ color: '#97817d' }}>{new Date(ev.collected_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => deleteEvidence(ev.id)} className="p-1 rounded hover:bg-[#FBEAEA]" style={{ color: '#97817d' }}><Trash size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── KRIs TAB ──────────────────────────────────────────────────────────────────
function KRIsTab({ riskId }) {
  const { kris, loading, createKRI, updateKRI, deleteKRI } = useRiskKRIs(riskId)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', metric_formula: '', current_value: '', unit: '', green_threshold: '', amber_threshold: '', red_threshold: '', frequency: 'Monthly', trend: 'Stable' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createKRI({ ...form, current_value: form.current_value !== '' ? parseFloat(form.current_value) : null, green_threshold: form.green_threshold || null, amber_threshold: form.amber_threshold || null, red_threshold: form.red_threshold || null })
      setShowAdd(false)
      setForm({ name: '', description: '', metric_formula: '', current_value: '', unit: '', green_threshold: '', amber_threshold: '', red_threshold: '', frequency: 'Monthly', trend: 'Stable' })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: '#292021' }}>{kris.length} Key Risk Indicator{kris.length !== 1 ? 's' : ''}</p>
          <p className="text-[11px]" style={{ color: '#97817d' }}>Early warning signals for this risk</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
          style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
          <Plus size={11} /> Add KRI
        </button>
      </div>

      {showAdd && (
        <div className="p-4 rounded-lg flex flex-col gap-3" style={{ background: '#f6eeec', border: '1px solid #e9dad7' }}>
          <input value={form.name} onChange={set('name')} placeholder="KRI name *" className="risys-input text-xs" />
          <textarea value={form.description} onChange={set('description')} placeholder="What does this measure?" rows={2} className="risys-input text-xs resize-none" />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Current Value</label><input value={form.current_value} onChange={set('current_value')} placeholder="e.g. 42" className="risys-input text-xs" /></div>
            <div><label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Unit</label><input value={form.unit} onChange={set('unit')} placeholder="%, count, $" className="risys-input text-xs" /></div>
            <MiniSelect label="Frequency" value={form.frequency} onChange={set('frequency')} options={['Daily', 'Weekly', 'Monthly', 'Quarterly']} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[11px] block mb-1" style={{ color: '#2F6B3C' }}>🟢 Green ≤</label><input value={form.green_threshold} onChange={set('green_threshold')} placeholder="e.g. 5" className="risys-input text-xs" /></div>
            <div><label className="text-[11px] block mb-1" style={{ color: '#9C6F0F' }}>🟡 Amber ≤</label><input value={form.amber_threshold} onChange={set('amber_threshold')} placeholder="e.g. 10" className="risys-input text-xs" /></div>
            <div><label className="text-[11px] block mb-1" style={{ color: '#8C1616' }}>🔴 Red &gt;</label><input value={form.red_threshold} onChange={set('red_threshold')} placeholder="e.g. 10" className="risys-input text-xs" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 btn-secondary text-xs py-1.5">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: !form.name.trim() ? 0.5 : 1 }}>
              {saving ? <Spinner size="sm" /> : null} Save KRI
            </button>
          </div>
        </div>
      )}

      {kris.length === 0 && !showAdd ? (
        <EmptyState icon={Activity} title="No KRIs defined" sub="Add key risk indicators to monitor this risk" />
      ) : (
        <div className="flex flex-col gap-2">
          {kris.map(kri => {
            const rag = getRAGStatus(kri.rag_status)
            return (
              <div key={kri.id} className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: `1px solid ${rag.border}` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: rag.color }} />
                      <span className="text-xs font-medium" style={{ color: '#292021' }}>{kri.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {kri.current_value !== null && (
                        <span className="text-sm font-semibold" style={{ color: rag.color }}>
                          {kri.current_value}{kri.unit || ''}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: '#97817d' }}>{kri.trend}</span>
                      <span className="text-[11px]" style={{ color: '#97817d' }}>{kri.frequency}</span>
                    </div>
                    {(kri.green_threshold || kri.amber_threshold || kri.red_threshold) && (
                      <div className="flex items-center gap-2 mt-1">
                        {kri.green_threshold && <span className="text-[10px]" style={{ color: '#2F6B3C' }}>🟢≤{kri.green_threshold}</span>}
                        {kri.amber_threshold && <span className="text-[10px]" style={{ color: '#9C6F0F' }}>🟡≤{kri.amber_threshold}</span>}
                        {kri.red_threshold && <span className="text-[10px]" style={{ color: '#8C1616' }}>🔴&gt;{kri.red_threshold}</span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteKRI(kri.id)} className="p-1 rounded hover:bg-[#FBEAEA]" style={{ color: '#97817d' }}><Trash size={11} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── LOSS EVENTS TAB ───────────────────────────────────────────────────────────
function LossEventsTab({ riskId }) {
  const { lossEvents, loading, createLossEvent } = useRiskLossEvents(riskId)
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', event_date: '', gross_loss: '', net_loss: '', currency: 'USD', loss_type: 'Operational', root_cause: '', root_cause_category: 'Process' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.title.trim() || !form.event_date) return
    setSaving(true)
    try {
      await createLossEvent({ ...form, gross_loss: form.gross_loss ? parseFloat(form.gross_loss) : null, net_loss: form.net_loss ? parseFloat(form.net_loss) : null, reported_by: user?.id })
      setShowAdd(false)
      setForm({ title: '', description: '', event_date: '', gross_loss: '', net_loss: '', currency: 'USD', loss_type: 'Operational', root_cause: '', root_cause_category: 'Process' })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  const totalLoss = lossEvents.reduce((sum, e) => sum + (e.net_loss || e.gross_loss || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: '#292021' }}>{lossEvents.length} Loss Event{lossEvents.length !== 1 ? 's' : ''}</p>
          {totalLoss > 0 && <p className="text-[11px]" style={{ color: '#8C1616' }}>Total exposure: ${totalLoss.toLocaleString()}</p>}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
          style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
          <Plus size={11} /> Log Event
        </button>
      </div>

      {showAdd && (
        <div className="p-4 rounded-lg flex flex-col gap-3" style={{ background: '#f6eeec', border: '1px solid #e9dad7' }}>
          <input value={form.title} onChange={set('title')} placeholder="Event title *" className="risys-input text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Event Date *</label><input type="date" value={form.event_date} onChange={set('event_date')} className="risys-input text-xs" /></div>
            <MiniSelect label="Root Cause Category" value={form.root_cause_category} onChange={set('root_cause_category')} options={['People', 'Process', 'System', 'External']} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Gross Loss</label><input value={form.gross_loss} onChange={set('gross_loss')} placeholder="0.00" className="risys-input text-xs" /></div>
            <div><label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>Net Loss</label><input value={form.net_loss} onChange={set('net_loss')} placeholder="0.00" className="risys-input text-xs" /></div>
            <MiniSelect label="Currency" value={form.currency} onChange={set('currency')} options={['USD', 'SAR', 'EUR', 'GBP', 'AED']} />
          </div>
          <textarea value={form.root_cause} onChange={set('root_cause')} placeholder="Root cause analysis..." rows={2} className="risys-input text-xs resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 btn-secondary text-xs py-1.5">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.event_date}
              className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: (!form.title.trim() || !form.event_date) ? 0.5 : 1 }}>
              {saving ? <Spinner size="sm" /> : null} Log Event
            </button>
          </div>
        </div>
      )}

      {lossEvents.length === 0 && !showAdd ? (
        <EmptyState icon={AlertTriangle} title="No loss events" sub="Log actual loss events that materialized from this risk" />
      ) : (
        <div className="flex flex-col gap-2">
          {lossEvents.map(ev => (
            <div key={ev.id} className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #F0CECE' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono" style={{ color: '#97817d' }}>{ev.event_id}</span>
                    <span className="text-xs font-medium" style={{ color: '#292021' }}>{ev.title}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px]" style={{ color: '#97817d' }}>{new Date(ev.event_date).toLocaleDateString()}</span>
                    {ev.gross_loss && <span className="text-xs font-medium" style={{ color: '#8C1616' }}>{ev.currency} {ev.gross_loss.toLocaleString()}</span>}
                    {ev.root_cause_category && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#f0eded', color: '#97817d' }}>{ev.root_cause_category}</span>}
                  </div>
                  {ev.root_cause && <p className="text-[11px] mt-1" style={{ color: '#97817d' }}>{ev.root_cause}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── COMMENTS TAB ──────────────────────────────────────────────────────────────
function CommentsTab({ riskId, user }) {
  const { comments, loading, addComment } = useComments('risk', riskId)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try { await addComment(text); setText('') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <>
          {comments.length === 0 && <EmptyState icon={Clock} title="No comments yet" sub="Start a discussion about this risk" />}
          <div className="flex flex-col gap-2">
            {comments.map(c => (
              <div key={c.id} className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
                <p className="text-[11px] mb-0.5" style={{ color: '#97817d' }}>{c.author_id?.slice(0, 8)}... · {new Date(c.created_at).toLocaleDateString()}</p>
                <p className="text-xs" style={{ color: '#292021' }}>{c.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment..." rows={2}
              className="flex-1 risys-input text-xs resize-none" />
            <button onClick={handleSubmit} disabled={saving || !text.trim()}
              className="px-3 py-2 rounded-md text-xs"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: !text.trim() ? 0.5 : 1 }}>
              {saving ? <Spinner size="sm" /> : <></>} Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── AUDIT TRAIL TAB ───────────────────────────────────────────────────────────
function AuditTab({ riskId }) {
  const { auditLog } = useRiskAuditLog(riskId)
  return (
    <div className="flex flex-col gap-2">
      {auditLog.length === 0 ? (
        <EmptyState icon={Clock} title="No audit log entries" sub="Actions on this risk are recorded here" />
      ) : auditLog.map(entry => (
        <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#5D0F0F' }} />
          <div>
            <p className="text-xs" style={{ color: '#292021' }}>
              <strong className="capitalize">{entry.action.replace(/_/g, ' ')}</strong>
              {entry.note ? ` — ${entry.note}` : ''}
              {entry.old_value && entry.new_value ? ` (${entry.old_value} → ${entry.new_value})` : ''}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: '#97817d' }}>{new Date(entry.performed_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── SHARED ────────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="text-center py-8">
      <Icon size={24} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d9c5c1' }} />
      <p className="text-xs font-medium" style={{ color: '#4d3e3e' }}>{title}</p>
      <p className="text-[11px] mt-0.5" style={{ color: '#97817d' }}>{sub}</p>
    </div>
  )
}

function MiniSelect({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="text-[11px] block mb-1" style={{ color: '#97817d' }}>{label}</label>}
      <div className="relative">
        <SelectField value={value} onChange={onChange} className="w-full">
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </SelectField>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#97817d' }}>▾</span>
      </div>
    </div>
  )
}
