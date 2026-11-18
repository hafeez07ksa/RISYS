import { useState, useEffect } from 'react'
import {
  Plus, Wrench, ShieldCheck, Trash, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Save, Target, Scale, Info,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTreatmentActions, useRiskExceptions } from '@/hooks/useRisks'
import { fetchAcceptanceTerms } from '@/hooks/useErm'
import { ACCEPTANCE_PURPOSES, maxTermMonths, monthsPlus, daysUntil } from '@/lib/erm'
import { labelOf } from '@/lib/policies'
import { DateField } from '@/components/ui/DateField'
import { useTreatmentOptions, useTreatmentPlans, useAuthorityHolders } from '@/hooks/useTreatment'
import { useRiskMatrix } from '@/hooks/useRiskGate'
import {
  TREATMENT_ACTION_STATUSES, ACTION_PRIORITIES, REVIEW_FREQUENCIES,
  getTreatmentActionStatus, getExceptionStatus, normalizeWorkflowState,
} from '@/lib/risks'
import {
  TREATMENT_OPTIONS, OPTION_DECISIONS, HORIZONS, MOVES, PLAN_STATUSES,
  treatmentReadiness, movesMeta, planStatusMeta, optionMeta,
} from '@/lib/treatment'
import {
  requiredAuthority, acceptanceType, eligibleApprovers, canApprove, highestTierFor, tierMeta, tierRank,
} from '@/lib/authority'
import { bandForScore, bandMeta, levelFor } from '@/lib/matrix'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { tx, appLocale } from '@/lib/i18n'

// ============================================================
// TREATMENT — step 9, the plans that execute it, and the acceptance
// branch, in the order the process runs them:
//
//   1. Decide   — all four options recorded, rejected ones with reasons
//   2. Plan     — a plan per selected option, each with a target residual
//                 score and tasks that say what they move
//   3. Accept   — only through a time-bound approval signed at the
//                 authority the band requires; above tolerance it is an
//                 exception
// ============================================================

function Card({ children, style }) {
  return <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, ...style }}>{children}</div>
}

function Pill({ s }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${s.border}`, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function StepHeader({ n, title, hint, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <span className="tnum" style={{
          width: 20, height: 20, borderRadius: '50%', background: 'var(--crimson)', color: '#fff', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-micro)', fontWeight: 600, marginTop: 1,
        }}>{n}</span>
        <div>
          <p style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>{title}</p>
          {hint && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 2, maxWidth: 680 }}>{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

const DECISION_TONE = {
  pending:       { color: 'var(--text-3)',  bg: 'var(--surface)',     border: 'var(--border)' },
  selected:      { color: 'var(--low)',     bg: 'var(--low-bg)',      border: 'var(--low-bd)' },
  rejected:      { color: 'var(--critical)', bg: 'var(--critical-bg)', border: 'var(--critical-bd)' },
  not_available: { color: 'var(--neutral)', bg: 'var(--neutral-bg)',  border: 'var(--neutral-bd)' },
}

/* ── 1. One treatment option ─────────────────────────────── */
function OptionCard({ meta, record, canManage, acceptHint, onSave }) {
  const initial = {
    assessment: record?.assessment || '',
    decision: record?.decision || 'pending',
    horizon: record?.horizon || '',
    rejection_reason: record?.rejection_reason || '',
  }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setForm(initial) }, [record?.updated_at]) // eslint-disable-line

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const needsReason = form.decision === 'rejected' || form.decision === 'not_available'
  const needsHorizon = form.decision === 'selected' && meta.planned
  const tone = DECISION_TONE[form.decision] || DECISION_TONE.pending

  const save = async () => {
    setError('')
    if (needsReason && !form.rejection_reason.trim()) { setError(tx('Say why — auditors ask why you did not do the other thing.')); return }
    if (needsHorizon && !form.horizon) { setError(tx('Choose a horizon for the selected option.')); return }
    setSaving(true)
    try {
      await onSave(meta.value, {
        assessment: form.assessment || null,
        decision: form.decision,
        horizon: needsHorizon ? form.horizon : null,
        rejection_reason: needsReason ? form.rejection_reason : null,
      })
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--bg-2)', border: `1px solid ${tone.border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', background: tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>{meta.label}</span>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: tone.color }}>
          {OPTION_DECISIONS.find(d => d.value === form.decision)?.label}
          {form.decision === 'selected' && form.horizon ? ` · ${HORIZONS.find(h => h.value === form.horizon)?.label}` : ''}
        </span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>{meta.desc}</p>
        {acceptHint && (
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', background: 'var(--surface)', borderRadius: 6, padding: '6px 8px' }}>{acceptHint}</p>
        )}
        <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} disabled={!canManage}
          value={form.assessment} onChange={e => setForm(f => ({ ...f, assessment: e.target.value }))}
          placeholder={tx('Assessment — what this option would involve, cost and change')} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {OPTION_DECISIONS.filter(d => d.value !== 'pending').map(d => {
            const active = form.decision === d.value
            const t = DECISION_TONE[d.value]
            return (
              <button key={d.value} type="button" disabled={!canManage}
                onClick={() => setForm(f => ({ ...f, decision: active ? 'pending' : d.value }))}
                style={{
                  fontSize: 'var(--t-meta)', padding: '4px 9px', borderRadius: 'var(--r-full)', cursor: canManage ? 'pointer' : 'default',
                  border: `1px solid ${active ? t.color : 'var(--border-2)'}`, background: active ? t.bg : 'var(--bg-2)',
                  color: active ? t.color : 'var(--text-2)', fontWeight: active ? 600 : 400,
                }}>
                {d.label}
              </button>
            )
          })}
        </div>
        {needsHorizon && (
          <SelectField size="sm" value={form.horizon} disabled={!canManage} onChange={e => setForm(f => ({ ...f, horizon: e.target.value }))}>
            <option value="">{tx('Horizon…')}</option>
            {HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </SelectField>
        )}
        {needsReason && (
          <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} disabled={!canManage}
            value={form.rejection_reason} onChange={e => setForm(f => ({ ...f, rejection_reason: e.target.value }))}
            placeholder={meta.value === 'transfer'
              ? tx(
              'e.g. Insurance moves financial impact only; it does not move likelihood or fix ECC non-compliance.'
            )
              : tx('Why this option is rejected or not available')} />
        )}
        {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
        {canManage && dirty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
            <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={save}>
              {saving ? <Spinner size="sm" /> : <><Save size={12} /> {tx('Save decision')}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── A task inside a plan (or a legacy action) ───────────── */
function ActionCard({ action, member, onUpdate, onStatusUpdate, fetchUpdates, onDelete }) {
  const st = getTreatmentActionStatus(action.status)
  const pr = ACTION_PRIORITIES.find(p => p.value === action.priority) || ACTION_PRIORITIES[1]
  const mv = movesMeta(action.moves)
  const [open, setOpen] = useState(false)
  const [updates, setUpdates] = useState(null)
  const [pct, setPct] = useState(action.percent_complete || 0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const overdue = action.target_date && action.status !== 'completed' && action.status !== 'cancelled'
    && new Date(action.target_date) < new Date()

  useEffect(() => {
    if (open && updates === null) fetchUpdates(action.id).then(setUpdates)
  }, [open]) // eslint-disable-line

  const submitUpdate = async () => {
    setSaving(true)
    try {
      await onStatusUpdate(action.id, { percent_complete: pct, comment })
      setComment('')
      setUpdates(await fetchUpdates(action.id))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border-3)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{action.action_ref}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{action.title}</span>
            <Pill s={st} />
            {mv && (
              <span title={mv.label} style={{
                fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                background: mv.value === 'none' ? 'var(--surface)' : 'var(--crimson-wash)',
                color: mv.value === 'none' ? 'var(--text-3)' : 'var(--crimson)',
              }}>
                {mv.value === 'none' ? tx('Supporting') : `Moves ${mv.short}`}
              </span>
            )}
            {overdue && <span style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 600 }}>{tx('OVERDUE')}</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            <span style={{ color: pr.color, fontWeight: 600 }}>{pr.label}</span>
            {action.owner_id && <span>{tx('Owner:')} <strong style={{ color: 'var(--text-2)' }}>{member(action.owner_id)}</strong></span>}
            {action.target_date && <span>{tx('Due')} <strong style={{ color: overdue ? 'var(--critical)' : 'var(--text-2)' }}>{new Date(action.target_date).toLocaleDateString(appLocale())}</strong></span>}
            <span>{action.percent_complete || 0}{tx('% complete')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }}>
          <SelectField value={action.status} onChange={e => onUpdate(action.id, { status: e.target.value })} size="sm">
            {TREATMENT_ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
          <button onClick={() => onDelete(action.id)} title={tx('Delete task')} className="btn-ghost" style={{ padding: 5 }}>
            <Trash size={12} />
          </button>
        </div>
      </div>

      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11.5, color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{tx('Progress updates')} {updates ? `(${updates.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-3)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ width: 140 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{tx('% complete:')} <strong style={{ color: 'var(--text)' }}>{pct}%</strong></p>
              <input type="range" min="0" max="100" step="5" value={pct} onChange={e => setPct(parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder={tx('What changed?')}
              className="risys-input" style={{ flex: 1, minWidth: 180, fontSize: 12 }} />
            <button onClick={submitUpdate} disabled={saving || (!comment.trim() && pct === (action.percent_complete || 0))}
              className="btn-primary" style={{ fontSize: 12 }}>
              {saving ? <Spinner size="sm" /> : tx('Post update')}
            </button>
          </div>
          {updates === null ? <Spinner size="sm" /> : updates.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('No updates posted yet.')}</p>
            : updates.map(u => (
              <div key={u.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: '1px solid var(--surface)' }}>
                <Clock size={12} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text)' }}>
                    {u.percent_complete != null && <strong>{u.percent_complete}% — </strong>}{u.comment || tx('Progress updated')}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{member(u.updated_by)} · {new Date(u.created_at).toLocaleString(appLocale())}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/* ── 2. A plan and its tasks ─────────────────────────────── */
function PlanCard({ plan, tasks, member, members, canManage, matrix, onUpdatePlan, onCreateTask, taskApi }) {
  const [adding, setAdding] = useState(false)
  const [task, setTask] = useState({ title: '', moves: '', owner_id: '', target_date: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const status = planStatusMeta(plan.status)
  const target = plan.target_likelihood && plan.target_impact ? levelFor(plan.target_likelihood, plan.target_impact, matrix) : null

  const addTask = async () => {
    setError('')
    if (!task.title.trim()) { setError(tx('A task needs a title.')); return }
    if (!task.moves) { setError(tx('Say whether this task moves likelihood, impact, both — or is supporting.')); return }
    setSaving(true)
    try {
      await onCreateTask({
        title: task.title.trim(), moves: task.moves, plan_id: plan.id,
        owner_id: task.owner_id || null, target_date: task.target_date || null,
        action_type: 'Mitigation', priority: 'medium', status: 'planned', percent_complete: 0,
      })
      setTask({ title: '', moves: '', owner_id: '', target_date: '' }); setAdding(false)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const done = tasks.filter(t => t.status === 'completed').length

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-3)' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{plan.plan_ref}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 160 }}>{plan.title}</span>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
          {optionMeta(plan.option).label}{plan.horizon ? ` · ${HORIZONS.find(h => h.value === plan.horizon)?.label}` : ''}
        </span>
        {target && (
          <span className="badge tnum" title={tx('Target residual score')} style={{ color: target.color, background: target.bg, border: `1px solid ${target.border}` }}>
            <Target size={10} style={{ marginInlineEnd: 3 }} /> {tx('Target')} {target.score} · {target.label}
          </span>
        )}
        {canManage ? (
          <SelectField size="sm" value={plan.status} onChange={e => onUpdatePlan(plan.id, { status: e.target.value })}>
            {PLAN_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        ) : <Pill s={status} />}
      </div>
      <div style={{ padding: '6px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', background: 'var(--surface)' }}>
        {plan.owner_id && <span>{tx('Owner')} <strong style={{ color: 'var(--text-2)' }}>{member(plan.owner_id)}</strong></span>}
        {plan.due_date && <span>{tx('Due')} <strong style={{ color: 'var(--text-2)' }}>{new Date(plan.due_date).toLocaleDateString(appLocale())}</strong></span>}
        <span>{done} {tx('of')} {tasks.length} {tx('task')}{tasks.length === 1 ? '' : 's'} {tx('complete')}</span>
        {plan.approved_at && <span>{tx('Approved')} {new Date(plan.approved_at).toLocaleDateString(appLocale())}{plan.approved_by ? ` by ${member(plan.approved_by)}` : ''}</span>}
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {tasks.length === 0 && !adding && (
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx(
            'No tasks yet. Front-load the cheap, fast tasks that remove the worst of the impact while the real fix is built.'
          )}</p>
        )}
        {tasks.map(t => (
          <ActionCard key={t.id} action={t} member={member}
            onUpdate={taskApi.updateAction} onStatusUpdate={taskApi.addStatusUpdate}
            fetchUpdates={taskApi.fetchUpdates} onDelete={taskApi.deleteAction} />
        ))}

        {adding ? (
          <div style={{ border: '1px dashed var(--border-2)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="risys-input" autoFocus style={{ width: '100%', fontSize: 12.5 }} value={task.title}
              onChange={e => setTask(t => ({ ...t, title: e.target.value }))}
              placeholder={tx(
                'e.g. Remove the 6 privileged accounts from the VPN; route them through the PAM jump host'
              )} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 150px', gap: 8 }}>
              <SelectField size="sm" value={task.moves} onChange={e => setTask(t => ({ ...t, moves: e.target.value }))}>
                <option value="">{tx('What does it move? *')}</option>
                {MOVES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SelectField>
              <SelectField size="sm" value={task.owner_id} onChange={e => setTask(t => ({ ...t, owner_id: e.target.value }))}>
                <option value="">{tx('Task owner…')}</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
              </SelectField>
              <input type="date" className="risys-input" style={{ fontSize: 12 }} value={task.target_date}
                onChange={e => setTask(t => ({ ...t, target_date: e.target.value }))} />
            </div>
            {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setAdding(false); setError('') }}>{tx('Cancel')}</button>
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={addTask}>
                {saving ? <Spinner size="sm" /> : tx('Add task')}
              </button>
            </div>
          </div>
        ) : canManage && (
          <button className="btn-ghost" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
            <Plus size={12} /> {tx('Add task')}</button>
        )}
      </div>
    </Card>
  )
}

function PlanForm({ option, horizon, members, matrix, onCancel, onCreate }) {
  const [form, setForm] = useState({ title: '', horizon: horizon || '', target_likelihood: '', target_impact: '', owner_id: '', due_date: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const target = form.target_likelihood && form.target_impact ? levelFor(form.target_likelihood, form.target_impact, matrix) : null

  const create = async () => {
    setError('')
    if (!form.title.trim()) { setError(tx('Give the plan a title.')); return }
    if (!form.target_likelihood || !form.target_impact) { setError(tx('Set the target residual score this plan must reach.')); return }
    setSaving(true)
    try {
      await onCreate({
        option, title: form.title.trim(), horizon: form.horizon || null,
        target_likelihood: Number(form.target_likelihood), target_impact: Number(form.target_impact),
        owner_id: form.owner_id || null, due_date: form.due_date || null, status: 'planned',
      })
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Card style={{ borderStyle: 'dashed' }}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{tx('New')} {optionMeta(option).label.toLowerCase()} {tx('plan')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input className="risys-input" autoFocus style={{ width: '100%' }} value={form.title} onChange={set('title')}
          placeholder={option === 'avoid' ? tx('e.g. Decommission VPN-LEGACY-01 and migrate remote access to ZTNA') : tx('e.g. Put a RADIUS proxy with MFA in front of the VPN concentrator')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8, alignItems: 'end' }}>
          <SelectField label={tx('Horizon')} size="sm" value={form.horizon} onChange={set('horizon')}>
            <option value="">—</option>
            {HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </SelectField>
          <SelectField label={tx('Target likelihood *')} size="sm" value={form.target_likelihood} onChange={set('target_likelihood')}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </SelectField>
          <SelectField label={tx('Target impact *')} size="sm" value={form.target_impact} onChange={set('target_impact')}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </SelectField>
          <SelectField label={tx('Plan owner')} size="sm" value={form.owner_id} onChange={set('owner_id')}>
            <option value="">—</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
          </SelectField>
          <div>
            <p className="field-label">{tx('Due')}</p>
            <input type="date" className="risys-input" style={{ width: '100%', fontSize: 12 }} value={form.due_date} onChange={set('due_date')} />
          </div>
        </div>
        {target && (
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>{tx('Target residual:')} <strong style={{ color: target.color }}>{target.score} · {target.label}</strong>
          </p>
        )}
        {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>{tx('Cancel')}</button>
          <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={create}>
            {saving ? <Spinner size="sm" /> : tx('Create plan')}
          </button>
        </div>
      </div>
    </Card>
  )
}

/* ── 3. An acceptance / exception record ─────────────────── */
// Who may decide is shown from the same ladder the database enforces in
// decide_risk_acceptance(); the database has the last word either way.
function ExceptionCard({ exc, member, risk, holders, fallbackRequired, onDecide, onReview, canManage }) {
  const { user } = useAuth()
  const st = getExceptionStatus(exc.status)
  const [comment, setComment] = useState('')
  const [conditions, setConditions] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [revoking, setRevoking] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState('')
  const required = exc.required_authority || fallbackRequired
  const verdict = canApprove({ userId: user?.id, risk, holders, required, requestedBy: exc.requested_by })
  const held = highestTierFor({ userId: user?.id, risk, holders })
  const canRevoke = exc.status === 'approved' && (tierRank(held) >= tierRank(required) || canManage)
  const isException = exc.exception_type === 'exception'
  const reviewPending = exc.status === 'pending' && exc.management_review_required && !exc.management_reviewed_at
  const iReview = reviewPending && exc.management_reviewer_id === user?.id
  const objected = exc.management_review_outcome === 'objected'
  const decisionDays = exc.status === 'pending' && exc.decision_due_on ? daysUntil(exc.decision_due_on) : null
  const expiringSoon = exc.status === 'approved' && exc.expires_at && daysUntil(exc.expires_at) <= 30 && daysUntil(exc.expires_at) >= 0

  const act = async (fn) => {
    setDeciding(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setDeciding(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{exc.exception_ref}</span>
        <span className="badge" style={isException
          ? { color: 'var(--critical)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)' }
          : { color: 'var(--neutral)', background: 'var(--neutral-bg)', border: '1px solid var(--neutral-bd)' }}>
          {isException ? tx('Exception · above tolerance') : tx('Acceptance')}
        </span>
        <Pill s={st} />
        {exc.purpose && <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 500 }}>{labelOf(ACCEPTANCE_PURPOSES, exc.purpose)}</span>}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{tx('Needs')} <strong style={{ color: 'var(--text-2)' }}>{tierMeta(required).label}</strong></span>
        {exc.residual_at_request != null && (
          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{tx('at')} {exc.residual_at_request} · {bandMeta(exc.band_at_request).label}</span>
        )}
        {expiringSoon && <span style={{ fontSize: 11, color: 'var(--high)', fontWeight: 600 }}>{tx('Expires')} {new Date(exc.expires_at).toLocaleDateString(appLocale())}</span>}
        {decisionDays !== null && (
          <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: decisionDays < 0 ? 'var(--critical)' : 'var(--text-3)' }}>
            {decisionDays < 0 ? tx('Decision {{n}} days overdue', { n: -decisionDays }) : `${tx('Decide by')} ${new Date(`${exc.decision_due_on}T12:00:00`).toLocaleDateString(appLocale())}`}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 6 }}>{exc.justification}</p>
      {exc.compensating_controls && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}><strong>{tx('Compensating controls:')}</strong> {exc.compensating_controls}</p>
      )}
      {exc.conditions && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}><strong>{tx('Conditions:')}</strong> {exc.conditions}</p>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)' }}>
        <span>{tx('Requested by')} <strong style={{ color: 'var(--text-2)' }}>{member(exc.requested_by)}</strong> {new Date(exc.created_at).toLocaleDateString(appLocale())}</span>
        {exc.approver_id && <span>{tx('Approver:')} <strong style={{ color: 'var(--text-2)' }}>{member(exc.approver_id)}</strong></span>}
        {exc.expires_at && <span>{tx('Valid until')} <strong style={{ color: 'var(--text-2)' }}>{new Date(exc.expires_at).toLocaleDateString(appLocale())}</strong></span>}
        {exc.review_frequency && <span>{tx('Reviewed')} <strong style={{ color: 'var(--text-2)' }}>{tx(exc.review_frequency)}</strong></span>}
        {exc.decided_at && (
          <span>{tx('Decided')} {new Date(exc.decided_at).toLocaleDateString(appLocale())}
            {exc.decided_by ? ` ${tx('by')} ${member(exc.decided_by)}` : ''}
            {exc.decided_authority ? ` ${tx('as')} ${tierMeta(exc.decided_authority).label}` : ''}
            {exc.decision_comment ? ` — "${exc.decision_comment}"` : ''}
          </span>
        )}
        {exc.revoked_at && (
          <span>{tx('Revoked')} {new Date(exc.revoked_at).toLocaleDateString(appLocale())} {tx('by')} {member(exc.revoked_by)}{exc.revoke_reason ? ` — "${exc.revoke_reason}"` : ''}</span>
        )}
      </div>

      {exc.management_review_required && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
          <strong>{tx('Management review')}</strong>{' · '}{member(exc.management_reviewer_id)}{' · '}
          {exc.management_reviewed_at
            ? <><span style={{ color: objected ? 'var(--critical)' : 'var(--low)', fontWeight: 600 }}>{objected ? tx('Objected') : tx('Endorsed')}</span>{exc.management_review_note ? ` — "${exc.management_review_note}"` : ''}</>
            : <span style={{ color: 'var(--medium)' }}>{tx('Waiting for the review before the decision')}</span>}
        </div>
      )}

      {iReview && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{tx('You are the management reviewer. Endorse the acceptance or object to it; the approver decides after you.')}</p>
          <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2} className="risys-input"
            placeholder={tx('The basis of your review (at least 10 characters)')} style={{ width: '100%', fontSize: 12, marginBottom: 8, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={deciding} onClick={() => act(() => onReview(exc.id, 'endorsed', reviewNote))} className="btn-primary" style={{ fontSize: 12 }}>
              <CheckCircle2 size={13} /> {tx('Endorse')}</button>
            <button disabled={deciding} onClick={() => act(() => onReview(exc.id, 'objected', reviewNote))} className="btn-secondary" style={{ fontSize: 12, color: 'var(--critical)' }}>
              <XCircle size={13} /> {tx('Object')}</button>
          </div>
        </div>
      )}

      {exc.status === 'pending' && !reviewPending && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {verdict.allowed ? (
            <>
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder={objected ? tx('Management objected: record why you approve anyway (at least 20 characters)') : tx('Decision comment (required to reject)')}
                className="risys-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} />
              <input value={conditions} onChange={e => setConditions(e.target.value)} placeholder={tx('Conditions of approval (optional)')}
                className="risys-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => act(() => onDecide(exc.id, 'approved', comment, conditions))} disabled={deciding}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: 'var(--low)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <CheckCircle2 size={13} /> {tx('Approve as')} {tierMeta(verdict.held).label}
                </button>
                <button onClick={() => act(() => onDecide(exc.id, 'rejected', comment))} disabled={deciding}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: '#fff', color: 'var(--critical)', border: '1px solid var(--critical-bd)', cursor: 'pointer' }}>
                  <XCircle size={13} /> {tx('Reject')}</button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
              <Scale size={12} style={{ display: 'inline', marginInlineEnd: 5, verticalAlign: '-2px' }} />
              {verdict.reason}
            </p>
          )}
        </div>
      )}
      {canRevoke && (
        <div style={{ marginTop: 10 }}>
          {!revoking ? (
            <button onClick={() => { setRevoking(true); setComment('') }}
              style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>{tx('Revoke — puts the risk back in front of the gate')}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={comment} onChange={e => setComment(e.target.value)} autoFocus className="risys-input" style={{ fontSize: 12 }}
                placeholder={tx('Why is the acceptance being revoked? (at least 10 characters)')} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ fontSize: 12, color: 'var(--critical)' }} disabled={deciding}
                  onClick={() => act(async () => { await onDecide(exc.id, 'revoked', comment); setRevoking(false) })}>{tx('Revoke acceptance')}</button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setRevoking(false)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--critical)', marginTop: 8 }}>{error}</p>}
    </Card>
  )
}

/* ── Main tab ────────────────────────────────────────────── */
export function TreatmentTab({ risk, member, members, onRiskChanged, perms, verdict, onTreatmentChanged }) {
  const { user } = useAuth()
  const riskId = risk.id
  const canManage = !!perms?.canManageRiskChildren(risk)
  const taskApi = useTreatmentActions(riskId)
  const { exceptions, loading: loadingExc, requestException, decideException, reviewException } = useRiskExceptions(riskId)
  const { options, loading: loadingOpt, migrated, saveOption } = useTreatmentOptions(riskId)
  const { plans, loading: loadingPlans, createPlan, updatePlan } = useTreatmentPlans(riskId)
  const { holders } = useAuthorityHolders()
  const { matrix } = useRiskMatrix()
  const [planFor, setPlanFor] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const BLANK_ACCEPTANCE = { purpose: '', justification: '', compensating_controls: '', approver_id: '', expires_on: '', decision_due_on: '',
    review_frequency: '', management_review: false, management_reviewer_id: '' }
  const [excForm, setExcForm] = useState(BLANK_ACCEPTANCE)
  // The database's own reading of band, type and authority (risk_acceptance_terms).
  const [terms, setTerms] = useState(null)
  useEffect(() => {
    let live = true
    if (requesting) fetchAcceptanceTerms(riskId).then(t => { if (live) setTerms(t) })
    return () => { live = false }
  }, [requesting, riskId])
  const [excError, setExcError] = useState('')
  const [excSaving, setExcSaving] = useState(false)

  if (taskApi.loading || loadingExc || loadingOpt || loadingPlans) {
    return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  }

  const changed = () => onTreatmentChanged?.()
  const readiness = treatmentReadiness({ options, plans })
  const byOption = new Map(options.map(o => [o.option, o]))
  const selectedPlanned = options.filter(o => o.decision === 'selected' && optionMeta(o.option).planned)

  // Who may accept, from the gate when it has judged, else from the band.
  const residualScored = !!(risk.residual_likelihood && risk.residual_impact)
  const score = residualScored ? risk.residual_score : (risk.inherent_score || 0)
  const clientBand = bandForScore(score, matrix)
  const within = verdict?.evaluated ? verdict.passed : undefined
  const clientRequired = verdict?.evaluated ? verdict.requiredAuthority : requiredAuthority({ band: clientBand, withinTolerance: within })
  const band = terms?.band || clientBand
  const required = terms?.required_authority || clientRequired
  const type = terms?.acceptance_type || acceptanceType(within)
  const maxMonths = maxTermMonths({ purpose: excForm.purpose, band, type })
  const purposes = ACCEPTANCE_PURPOSES.filter(p => type !== 'exception' || p.value !== 'within_tolerance')
  const reviewers = members.filter(m => m.role !== 'viewer' && m.user_id !== excForm.approver_id && m.user_id !== user?.id)
  const eligible = eligibleApprovers({ required, risk, holders, members })
  const state = normalizeWorkflowState(risk.workflow_state)
  const preMeasurement = state === 'draft' || state === 'registered'
  const hasOpenAcceptance = exceptions.some(e => e.status === 'pending' || e.status === 'approved')
  const canRequest = perms?.canRequestException(risk) && !preMeasurement && !hasOpenAcceptance && migrated
  const unplannedActions = taskApi.actions.filter(a => !a.plan_id)

  const acceptHint = required
    ? `${type === 'exception' ? 'Outside tolerance: this would be an exception.' : 'Within tolerance.'} Needs ${tierMeta(required).label} approval.`
    : null

  const submitAcceptance = async () => {
    setExcError('')
    const f = excForm
    if (!f.purpose) { setExcError(tx('Choose the purpose of the acceptance.')); return }
    if (f.justification.trim().length < 20) { setExcError(tx('Give the rationale — why retaining this risk is justified.')); return }
    if (type === 'exception' && f.compensating_controls.trim().length < 10) { setExcError(tx('An exception above tolerance needs its compensating controls on record.')); return }
    if (!f.approver_id) { setExcError(`${tx('Choose an approver who holds this authority:')} ${tierMeta(required).label}`); return }
    if (!f.expires_on || daysUntil(f.expires_on) <= 0) { setExcError(tx('An acceptance is time-bound: set an expiry date in the future.')); return }
    if (f.expires_on > monthsPlus(maxMonths)) { setExcError(tx('This acceptance can run for at most {{n}} months.', { n: maxMonths })); return }
    if (f.management_review && !f.management_reviewer_id) { setExcError(tx('Choose who carries out the management review.')); return }
    setExcSaving(true)
    try {
      await requestException({
        purpose: f.purpose,
        justification: f.justification.trim(),
        compensating_controls: f.compensating_controls.trim() || null,
        approver_id: f.approver_id,
        expires_on: f.expires_on,
        decision_due_on: f.decision_due_on || null,
        review_frequency: f.review_frequency || (type === 'exception' ? 'Monthly' : 'Quarterly'),
        management_review: !!f.management_review,
        management_reviewer_id: f.management_review ? f.management_reviewer_id : null,
      })
      setExcForm(BLANK_ACCEPTANCE)
      setRequesting(false)
    } catch (e) { setExcError(e.message) } finally { setExcSaving(false) }
  }

  const handleDecide = async (id, decision, comment, conditions) => {
    await decideException(id, decision, comment, conditions)
    onRiskChanged && onRiskChanged()
  }
  const handleReview = async (id, outcome, note) => {
    await reviewException(id, outcome, note)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!migrated && (
        <div style={{ padding: '11px 13px', borderRadius: 8, background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{tx('Treatment decisions, plans and acceptance authority need')} <span className="mono">{tx('supabase/migrations/003_treatment_acceptance_triage.sql')}</span>{tx('. Apply it in the Supabase SQL editor, then reload.')}</p>
        </div>
      )}

      {/* Readiness summary */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 10,
        background: readiness.ready ? 'var(--low-bg)' : 'var(--surface)',
        border: `1px solid ${readiness.ready ? 'var(--low-bd)' : 'var(--border)'}`,
      }}>
        {readiness.ready
          ? <CheckCircle2 size={15} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 1 }} />
          : <Info size={15} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 1 }} />}
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
            {readiness.ready ? tx('Treatment decision is complete — the plan can be approved.') : tx('Treatment decision is not complete yet')}
          </p>
          {!readiness.ready && (
            <ul style={{ margin: '3px 0 0', paddingInlineStart: 16 }}>
              {readiness.blockers.map((b, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{b}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* 1. Decide */}
      <StepHeader n={1} title={tx('Decide the treatment')}
        hint={tx(
          'Record all four options, including the rejected ones — an auditor always asks why you did not do the other thing. Reduce and Avoid can both be selected, on different horizons.'
        )} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {TREATMENT_OPTIONS.map(meta => (
          <OptionCard key={meta.value} meta={meta} record={byOption.get(meta.value)} canManage={canManage && migrated}
            acceptHint={meta.value === 'accept' ? acceptHint : null}
            onSave={async (opt, patch) => { await saveOption(opt, patch, risk); changed() }} />
        ))}
      </div>

      {/* 2. Plan */}
      <StepHeader n={2} title={tx('Plan each selected option')}
        hint={tx(
          'Every plan names the residual score it must reach. Every task says whether it moves likelihood, impact or both; a task that moves neither is marked as supporting.'
        )} />
      {selectedPlanned.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '22px 16px', textAlign: 'center', background: 'var(--bg-2)' }}>
          <Wrench size={22} strokeWidth={1.2} style={{ color: 'var(--border-2)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{tx('Select Avoid, Reduce or Transfer above to plan it.')}</p>
        </div>
      ) : selectedPlanned.map(o => {
        const optionPlans = plans.filter(p => p.option === o.option)
        return (
          <div key={o.option} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="eyebrow">{optionMeta(o.option).label}{o.horizon ? ` · ${HORIZONS.find(h => h.value === o.horizon)?.label}` : ''}</p>
              {canManage && migrated && planFor !== o.option && (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setPlanFor(o.option)}><Plus size={12} /> {tx('Add plan')}</button>
              )}
            </div>
            {optionPlans.map(p => (
              <PlanCard key={p.id} plan={p} tasks={taskApi.actions.filter(a => a.plan_id === p.id)}
                member={member} members={members} canManage={canManage} matrix={matrix}
                onUpdatePlan={async (id, patch) => { await updatePlan(id, patch); changed() }}
                onCreateTask={data => taskApi.createAction(data, risk)} taskApi={taskApi} />
            ))}
            {planFor === o.option && (
              <PlanForm option={o.option} horizon={o.horizon} members={members} matrix={matrix}
                onCancel={() => setPlanFor(null)}
                onCreate={async data => { await createPlan(data, risk); setPlanFor(null); changed() }} />
            )}
            {optionPlans.length === 0 && planFor !== o.option && (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('No plan yet for')} {optionMeta(o.option).label}.</p>
            )}
          </div>
        )
      })}

      {/* 3. Accept */}
      <StepHeader n={3} title={tx('Acceptance')}
        hint={tx(
          'Acceptance is a record, not the absence of one: a rationale, an approver whose authority matches the band, an expiry and a review cadence. Above tolerance it is an exception and needs at least the Steering Committee.'
        )}
        right={perms?.canRequestException(risk) && !requesting && (
          <button className="btn-secondary" disabled={!canRequest} onClick={() => setRequesting(true)}
            title={preMeasurement ? tx('Score the risk before requesting acceptance')
              : hasOpenAcceptance ? tx('An acceptance is already pending or active')
              : `Needs ${tierMeta(required).label} approval`}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, opacity: canRequest ? 1 : 0.55 }}>
            <ShieldCheck size={13} /> {tx('Request')} {type === 'exception' ? 'exception' : 'acceptance'}
          </button>
        )} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <Scale size={13} style={{ color: 'var(--crimson)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          {preMeasurement ? tx('Not yet scored. ') : ''}{tx('Current residual')} <strong className="tnum">{score || '—'}</strong>{band ? ` · ${bandMeta(band).label}` : ''}
          {' — '}{type === 'exception' ? tx('outside tolerance, so acceptance is an exception') : tx('an acceptance')} {tx('signed by the')} <strong>{tierMeta(required).label}</strong>.
                  </span>
      </div>

      {requesting && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <SelectField label={`${tx('Purpose')} *`} size="sm" value={excForm.purpose}
                onChange={e => setExcForm(f => ({ ...f, purpose: e.target.value }))}>
                <option value="">{tx('Why is this risk being retained?')}</option>
                {purposes.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </SelectField>
              {excForm.purpose && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{ACCEPTANCE_PURPOSES.find(p => p.value === excForm.purpose)?.desc}</p>
              )}
            </div>
            <div>
              <p className="field-label">{tx('Rationale')} <span className="field-req">*</span></p>
              <textarea className="risys-input" rows={3} autoFocus style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }}
                value={excForm.justification} onChange={e => setExcForm(f => ({ ...f, justification: e.target.value }))}
                placeholder={tx(
                  'e.g. Vendor end-of-life, no MFA integration path; the ZTNA replacement is funded and in flight'
                )} />
            </div>
            <div>
              <p className="field-label">{tx('Compensating controls')}{type === 'exception' && <span className="field-req"> *</span>}</p>
              <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }}
                value={excForm.compensating_controls} onChange={e => setExcForm(f => ({ ...f, compensating_controls: e.target.value }))}
                placeholder={tx(
                  'e.g. Privileged accounts removed from the VPN; access limited to 12 named users; source IP allowlist; session recording'
                )} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
              <div>
                <SelectField label={`${tx('Approver')} (${tierMeta(required).label} ${tx('or above')}) *`} size="sm" value={excForm.approver_id}
                  disabled={eligible.length === 0} onChange={e => setExcForm(f => ({ ...f, approver_id: e.target.value }))}>
                  <option value="">{eligible.length ? tx('Select approver…') : tx('Nobody holds this authority')}</option>
                  {eligible.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
                </SelectField>
                {eligible.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--critical)', marginTop: 4 }}>{tx('No member holds')} {tierMeta(required).label} {tx('authority. An admin assigns it on Risk Register → Tolerances.')}</p>
                )}
              </div>
              <div>
                <p className="field-label">{tx('Expires')} <span className="field-req">*</span></p>
                <DateField value={excForm.expires_on} onChange={e => setExcForm(f => ({ ...f, expires_on: e.target.value }))} aria-label={tx('Expires')} />
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{tx('At most {{n}} months', { n: maxMonths })}</p>
              </div>
              <SelectField label={tx('Review')} size="sm" value={excForm.review_frequency || (type === 'exception' ? 'Monthly' : 'Quarterly')}
                onChange={e => setExcForm(f => ({ ...f, review_frequency: e.target.value }))}>
                {REVIEW_FREQUENCIES.map(r => <option key={r} value={r}>{tx(r)}</option>)}
              </SelectField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, alignItems: 'start' }}>
              <div>
                <p className="field-label">{tx('Decision due')}</p>
                <DateField value={excForm.decision_due_on} onChange={e => setExcForm(f => ({ ...f, decision_due_on: e.target.value }))} aria-label={tx('Decision due')} />
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{tx('Empty: the workspace default. At most 60 days.')}</p>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)', marginTop: 20 }}>
                  <input type="checkbox" checked={excForm.management_review}
                    onChange={e => setExcForm(f => ({ ...f, management_review: e.target.checked, management_reviewer_id: '' }))} />
                  {tx('Management review before the decision')}
                </label>
                {excForm.management_review && (
                  <div style={{ marginTop: 6 }}>
                    <SelectField size="sm" value={excForm.management_reviewer_id}
                      onChange={e => setExcForm(f => ({ ...f, management_reviewer_id: e.target.value }))}>
                      <option value="">{tx('Who reviews it?')}</option>
                      {reviewers.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
                    </SelectField>
                  </div>
                )}
              </div>
            </div>
            {excError && <p style={{ fontSize: 12, color: 'var(--critical)' }}>{excError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRequesting(false); setExcError(''); setTerms(null) }} className="btn-secondary" style={{ fontSize: 12.5 }}>{tx('Cancel')}</button>
              <button onClick={submitAcceptance} disabled={excSaving} className="btn-primary" style={{ fontSize: 12.5 }}>
                {excSaving ? <Spinner size="sm" /> : tx('Submit for approval')}
              </button>
            </div>
          </div>
        </Card>
      )}

      {exceptions.map(e => (
        <ExceptionCard key={e.id} exc={e} member={member} risk={risk} holders={holders}
          fallbackRequired={required} onDecide={handleDecide} onReview={handleReview} canManage={!!perms?.isManager} />
      ))}

      {/* Legacy actions not yet attached to a plan */}
      {unplannedActions.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 8 }}>{tx('Other actions — not attached to a plan')}</p>
          {unplannedActions.map(a => (
            <ActionCard key={a.id} action={a} member={member}
              onUpdate={taskApi.updateAction} onStatusUpdate={taskApi.addStatusUpdate}
              fetchUpdates={taskApi.fetchUpdates} onDelete={taskApi.deleteAction} />
          ))}
        </>
      )}
    </div>
  )
}
