import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { useRisks } from '@/hooks/useRisks'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { logAudit, AUDIT } from '@/lib/audit'
import {
  RISK_CATEGORIES, RISK_SUBCATEGORIES, RISK_TYPES, RISK_TREATMENTS,
  RISK_APPETITES, RISK_DIRECTIONS, REVIEW_FREQUENCIES, RISK_SOURCES,
  LIKELIHOOD_LABELS, IMPACT_LABELS, getRiskLevel
} from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

function ScoreSelector({ label, value, onChange, labels }) {
  const level = getRiskLevel(value * value)
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs uppercase tracking-wider" style={{ color: '#97817d' }}>{label}</label>
      <div className="flex gap-1.5">
        {[1,2,3,4,5].map(v => (
          <button key={v} onClick={() => onChange(v)}
            className="flex-1 py-2 rounded-lg text-xs font-medium border transition-all"
            style={{
              background: value === v ? '#5D0F0F' : '#f6eeec',
              color: value === v ? '#fff' : '#4d3e3e',
              borderColor: value === v ? '#5D0F0F' : '#e9dad7',
            }}>{v}</button>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: '#97817d' }}>{labels[value]}</p>
    </div>
  )
}

export function CreateRiskModal({ onClose, editRisk }) {
  const { createRisk, updateRisk } = useRisks()
  const { user } = useAuth()
  const { members } = usePeople()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('basic') // basic | assessment | treatment | governance

  const [form, setForm] = useState({
    title:                editRisk?.title              || '',
    description:          editRisk?.description        || '',
    risk_statement:       editRisk?.risk_statement     || '',
    risk_drivers:         editRisk?.risk_drivers       || '',
    category:             editRisk?.category           || '',
    subcategory:          editRisk?.subcategory        || '',
    risk_type:            editRisk?.risk_type          || 'Operational',
    business_unit:        editRisk?.business_unit      || '',
    source:               editRisk?.source             || '',
    identified_date:      editRisk?.identified_date    ? editRisk.identified_date.split('T')[0] : new Date().toISOString().split('T')[0],
    // Inherent
    inherent_likelihood:  editRisk?.inherent_likelihood || 3,
    inherent_impact:      editRisk?.inherent_impact     || 3,
    // Residual
    residual_likelihood:  editRisk?.residual_likelihood || null,
    residual_impact:      editRisk?.residual_impact     || null,
    // Treatment
    treatment:            editRisk?.treatment          || '',
    treatment_notes:      editRisk?.treatment_notes    || '',
    // Governance
    owner_id:             editRisk?.owner_id           || user?.id || '',
    assigned_to:          editRisk?.assigned_to        || '',
    reviewer_id:          editRisk?.reviewer_id        || '',
    approver_id:          editRisk?.approver_id        || '',
    risk_appetite:        editRisk?.risk_appetite      || 'Cautious',
    risk_direction:       editRisk?.risk_direction     || 'Stable',
    review_frequency:     editRisk?.review_frequency   || 'Quarterly',
    review_date:          editRisk?.review_date        ? editRisk.review_date.split('T')[0] : '',
    framework_ref:        editRisk?.framework_ref      || '',
    status:               editRisk?.status             || 'open',
    workflow_state:       editRisk?.workflow_state     || 'draft',
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inherentScore = form.inherent_likelihood * form.inherent_impact
  const residualScore = form.residual_likelihood && form.residual_impact
    ? form.residual_likelihood * form.residual_impact : null

  const inherentLevel = getRiskLevel(inherentScore)
  const residualLevel = residualScore ? getRiskLevel(residualScore) : null

  const subcats = RISK_SUBCATEGORIES[form.category] || []

  const TABS = [
    { id: 'basic',      label: 'Basic Info' },
    { id: 'assessment', label: 'Assessment' },
    { id: 'treatment',  label: 'Treatment' },
    { id: 'governance', label: 'Governance' },
  ]

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setLoading(true); setError('')
    try {
      const payload = {
        ...form,
        owner_id:    form.owner_id    || null,
        assigned_to: form.assigned_to || null,
        reviewer_id: form.reviewer_id || null,
        approver_id: form.approver_id || null,
        review_date: form.review_date || null,
        identified_date: form.identified_date || null,
        source: form.source || null,
        residual_likelihood: form.residual_likelihood || null,
        residual_impact:     form.residual_impact     || null,
        // Keep legacy fields in sync
        likelihood: form.inherent_likelihood,
        impact:     form.inherent_impact,
      }
      if (editRisk) {
        await updateRisk(editRisk.id, payload, user?.id)
        await logAudit(organization?.id, AUDIT.RISK_UPDATED, 'risk', editRisk.id, payload.title)
      } else {
        const newRisk = await createRisk({ ...payload, created_by: user?.id })
        await logAudit(organization?.id, AUDIT.RISK_CREATED, 'risk', newRisk?.id ?? null, payload.title)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save risk')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1px solid #e9dad7', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid #e9dad7', background: 'var(--surface)' }}>
          <div>
            <h2 className="text-sm font-medium" style={{ color: '#292021' }}>{editRisk ? 'Edit Risk' : 'Add Risk to Register'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
                style={{ color: inherentLevel.color, background: inherentLevel.bg, borderColor: inherentLevel.border }}>
                Inherent: {inherentLevel.label} {inherentScore}
              </span>
              {residualLevel && (
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{ color: residualLevel.color, background: residualLevel.bg, borderColor: residualLevel.border }}>
                  Residual: {residualLevel.label} {residualScore}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#97817d' }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: '#e9dad7' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2.5 text-xs font-medium transition-colors"
              style={{
                borderBottom: tab === t.id ? '2px solid #5D0F0F' : '2px solid transparent',
                color: tab === t.id ? '#5D0F0F' : '#97817d',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* BASIC INFO */}
          {tab === 'basic' && (
            <>
              <Field label="Title *">
                <input value={form.title} onChange={set('title')} placeholder="e.g. Unauthorized access to customer data" className="sentrix-input" autoFocus />
              </Field>
              <Field label="Risk Statement" hint="There is a risk that... resulting in...">
                <textarea value={form.risk_statement} onChange={set('risk_statement')} rows={2}
                  placeholder="There is a risk that [event] occurs due to [cause], resulting in [impact]..."
                  className="sentrix-input resize-none" />
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={set('description')} rows={2}
                  placeholder="Additional context and details..." className="sentrix-input resize-none" />
              </Field>
              <Field label="Risk Drivers / Root Causes">
                <textarea value={form.risk_drivers} onChange={set('risk_drivers')} rows={2}
                  placeholder="Contributing factors and root causes..." className="sentrix-input resize-none" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk Type">
                  <SelectField value={form.risk_type} onChange={set('risk_type')} options={RISK_TYPES.map(v => ({ value: v, label: v }))} />
                </Field>
                <Field label="Business Unit">
                  <input value={form.business_unit} onChange={set('business_unit')} placeholder="e.g. Finance, IT, Operations" className="sentrix-input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <SelectField value={form.category} onChange={e => { set('category')(e); setVal('subcategory', '') }}
                    options={RISK_CATEGORIES.map(c => ({ value: c, label: c }))} placeholder="Select category" />
                </Field>
                <Field label="Subcategory">
                  <SelectField value={form.subcategory} onChange={set('subcategory')}
                    options={subcats.map(c => ({ value: c, label: c }))} placeholder="Select subcategory" disabled={!subcats.length} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk Source" hint="how it was identified">
                  <SelectField value={form.source} onChange={set('source')}
                    options={RISK_SOURCES.map(s => ({ value: s, label: s }))} placeholder="Select source" />
                </Field>
                <Field label="Identified Date">
                  <input type="date" value={form.identified_date} onChange={set('identified_date')} className="sentrix-input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Framework Reference">
                  <input value={form.framework_ref} onChange={set('framework_ref')} placeholder="e.g. NCA-ECC-1.1.2, ISO27001-A.9" className="sentrix-input" />
                </Field>
                <Field label="Risk Direction">
                  <SelectField value={form.risk_direction} onChange={set('risk_direction')}
                    options={RISK_DIRECTIONS.map(d => ({ value: d.value, label: d.label }))} />
                </Field>
              </div>
            </>
          )}

          {/* ASSESSMENT */}
          {tab === 'assessment' && (
            <>
              <div className="p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: '#292021' }}>Inherent Risk <span className="font-normal" style={{ color: '#97817d' }}>(before controls)</span></p>
                <p className="text-[11px]" style={{ color: '#97817d' }}>Score the risk as if no controls existed</p>
              </div>
              <ScoreSelector label="Inherent Likelihood" value={form.inherent_likelihood}
                onChange={v => setVal('inherent_likelihood', v)} labels={LIKELIHOOD_LABELS} />
              <ScoreSelector label="Inherent Impact" value={form.inherent_impact}
                onChange={v => setVal('inherent_impact', v)} labels={IMPACT_LABELS} />

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px" style={{ background: '#e9dad7' }} />
                <span className="text-[11px]" style={{ color: '#97817d' }}>Inherent Score: <strong style={{ color: inherentLevel.color }}>{inherentScore} — {inherentLevel.label}</strong></span>
                <div className="flex-1 h-px" style={{ background: '#e9dad7' }} />
              </div>

              <div className="p-3 rounded-lg" style={{ background: '#ECF4EE', border: '1px solid #C8DECD' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: '#2F6B3C' }}>Residual Risk <span className="font-normal" style={{ color: '#97817d' }}>(after controls — optional)</span></p>
                <p className="text-[11px]" style={{ color: '#97817d' }}>Score after applying your controls. Leave blank if no controls yet.</p>
              </div>
              <ScoreSelector label="Residual Likelihood" value={form.residual_likelihood || 3}
                onChange={v => setVal('residual_likelihood', v)} labels={LIKELIHOOD_LABELS} />
              <ScoreSelector label="Residual Impact" value={form.residual_impact || 3}
                onChange={v => setVal('residual_impact', v)} labels={IMPACT_LABELS} />
              {residualScore && (
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px" style={{ background: '#e9dad7' }} />
                  <span className="text-[11px]" style={{ color: '#97817d' }}>Residual Score: <strong style={{ color: residualLevel?.color }}>{residualScore} — {residualLevel?.label}</strong></span>
                  <div className="flex-1 h-px" style={{ background: '#e9dad7' }} />
                </div>
              )}
              <Field label="Risk Appetite">
                <div className="grid grid-cols-5 gap-1.5">
                  {RISK_APPETITES.map(a => (
                    <button key={a.value} onClick={() => setVal('risk_appetite', a.value)}
                      className="py-1.5 px-2 rounded-lg text-[11px] border transition-all text-center"
                      style={{
                        background: form.risk_appetite === a.value ? '#5D0F0F' : '#f6eeec',
                        color: form.risk_appetite === a.value ? '#fff' : '#4d3e3e',
                        borderColor: form.risk_appetite === a.value ? '#5D0F0F' : '#e9dad7',
                      }}>
                      <p className="font-medium">{a.label}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] mt-1" style={{ color: '#97817d' }}>
                  {RISK_APPETITES.find(a => a.value === form.risk_appetite)?.desc}
                </p>
              </Field>
            </>
          )}

          {/* TREATMENT */}
          {tab === 'treatment' && (
            <>
              <Field label="Treatment Strategy">
                <div className="grid grid-cols-2 gap-2">
                  {RISK_TREATMENTS.map(t => (
                    <button key={t.value} onClick={() => setVal('treatment', t.value)}
                      className="py-2.5 px-3 rounded-lg text-xs border transition-all text-left"
                      style={{
                        background: form.treatment === t.value ? t.bg : '#f6eeec',
                        borderColor: form.treatment === t.value ? t.color : '#e9dad7',
                        color: form.treatment === t.value ? t.color : '#4d3e3e',
                      }}>
                      <p className="font-semibold">{t.label}</p>
                      <p className="text-[11px] opacity-70 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Treatment Plan / Notes">
                <textarea value={form.treatment_notes} onChange={set('treatment_notes')} rows={4}
                  placeholder="Describe the treatment plan, specific actions, timelines, and responsible parties..."
                  className="sentrix-input resize-none" />
              </Field>
              <Field label="Status">
                <div className="grid grid-cols-3 gap-2">
                  {['open', 'mitigating', 'accepted', 'transferred', 'closed'].map(s => (
                    <button key={s} onClick={() => setVal('status', s)}
                      className="py-2 rounded-lg text-xs border transition-all capitalize"
                      style={{
                        background: form.status === s ? '#5D0F0F' : '#f6eeec',
                        color: form.status === s ? '#fff' : '#4d3e3e',
                        borderColor: form.status === s ? '#5D0F0F' : '#e9dad7',
                      }}>
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* GOVERNANCE */}
          {tab === 'governance' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk Owner" hint={editRisk ? undefined : 'you — the person raising this risk'}>
                  {editRisk ? (
                    <UserSelect value={form.owner_id} onChange={v => setVal('owner_id', v)} members={members} />
                  ) : (
                    <div className="sentrix-input flex items-center" style={{ background: 'var(--surface)', color: 'var(--text-2)', cursor: 'not-allowed' }}>
                      {(() => {
                        const me = members.find(m => m.user_id === user?.id)
                        return me?.full_name || me?.email || 'You'
                      })()}
                    </div>
                  )}
                </Field>
                <Field label="Assign To" hint="who will work on this risk">
                  <UserSelect value={form.assigned_to} onChange={v => setVal('assigned_to', v)} members={members} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reviewer (2nd Line)">
                  <UserSelect value={form.reviewer_id} onChange={v => setVal('reviewer_id', v)} members={members} />
                </Field>
                <Field label="Approver">
                  <UserSelect value={form.approver_id} onChange={v => setVal('approver_id', v)} members={members} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Review Frequency">
                  <SelectField value={form.review_frequency} onChange={set('review_frequency')}
                    options={REVIEW_FREQUENCIES.map(v => ({ value: v, label: v }))} />
                </Field>
                <Field label="Next Review Date">
                  <input type="date" value={form.review_date} onChange={set('review_date')} className="sentrix-input" />
                </Field>
              </div>
              <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'var(--surface)', border: '1px solid #e9dad7' }}>
                <Info size={13} style={{ color: '#97817d', marginTop: 1, flexShrink: 0 }} />
                <p className="text-[11px]" style={{ color: '#97817d' }}>
                  {editRisk
                    ? <>Workflow state is managed from the risk detail page. Current state: <strong style={{ color: '#292021' }}>{(form.workflow_state || 'draft').replace('_', ' ')}</strong>.</>
                    : <>New risks start in <strong style={{ color: '#292021' }}>Draft</strong>. Submit for review from the risk detail page once assessment is complete.</>}
                </p>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 pb-5 pt-3" style={{ borderTop: '1px solid #e9dad7' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !form.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-md px-4 py-2.5"
            style={{ background: '#5D0F0F', color: '#fff', opacity: !form.title.trim() ? 0.5 : 1, border: 'none' }}>
            {loading ? <Spinner size="sm" /> : null}
            {editRisk ? 'Save Changes' : 'Add to Register'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs uppercase tracking-wider" style={{ color: '#97817d' }}>{label}</label>
        {hint && <span className="text-[11px]" style={{ color: '#b0a0a0' }}>— {hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SelectField({ value, onChange, options, placeholder = 'Select...', disabled }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} disabled={disabled}
        className="w-full sentrix-input appearance-none pr-7 cursor-pointer disabled:opacity-50">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#97817d' }}>▾</span>
    </div>
  )
}

function UserSelect({ value, onChange, members }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full sentrix-input appearance-none pr-7 cursor-pointer">
        <option value="">Unassigned</option>
        {members.map(m => (
          <option key={m.user_id} value={m.user_id}>
            {m.full_name || m.email || m.user_id?.slice(0, 8) + '...'} ({m.role})
          </option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#97817d' }}>▾</span>
    </div>
  )
}
