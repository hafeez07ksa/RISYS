import { useState, useEffect } from 'react'
import {
  Plus, Wrench, ShieldCheck, Trash, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Save, Target, Scale, Info,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTreatmentActions, useRiskExceptions } from '@/hooks/useRisks'
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
    if (needsReason && !form.rejection_reason.trim()) { setError('Say why — auditors ask why you did not do the other thing.'); return }
    if (needsHorizon && !form.horizon) { setError('Choose a horizon for the selected option.'); return }
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
          placeholder="Assessment — what this option would involve, cost and change" />
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
            <option value="">Horizon…</option>
            {HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </SelectField>
        )}
        {needsReason && (
          <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} disabled={!canManage}
            value={form.rejection_reason} onChange={e => setForm(f => ({ ...f, rejection_reason: e.target.value }))}
            placeholder={meta.value === 'transfer'
              ? 'e.g. Insurance moves financial impact only; it does not move likelihood or fix ECC non-compliance.'
              : 'Why this option is rejected or not available'} />
        )}
        {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
        {canManage && dirty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
            <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={save}>
              {saving ? <Spinner size="sm" /> : <><Save size={12} /> Save decision</>}
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
                {mv.value === 'none' ? 'Supporting' : `Moves ${mv.short}`}
              </span>
            )}
            {overdue && <span style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 600 }}>OVERDUE</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            <span style={{ color: pr.color, fontWeight: 600 }}>{pr.label}</span>
            {action.owner_id && <span>Owner: <strong style={{ color: 'var(--text-2)' }}>{member(action.owner_id)}</strong></span>}
            {action.target_date && <span>Due <strong style={{ color: overdue ? 'var(--critical)' : 'var(--text-2)' }}>{new Date(action.target_date).toLocaleDateString('en-GB')}</strong></span>}
            <span>{action.percent_complete || 0}% complete</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }}>
          <SelectField value={action.status} onChange={e => onUpdate(action.id, { status: e.target.value })} size="sm">
            {TREATMENT_ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
          <button onClick={() => onDelete(action.id)} title="Delete task" className="btn-ghost" style={{ padding: 5 }}>
            <Trash size={12} />
          </button>
        </div>
      </div>

      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11.5, color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Progress updates {updates ? `(${updates.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-3)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ width: 140 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>% complete: <strong style={{ color: 'var(--text)' }}>{pct}%</strong></p>
              <input type="range" min="0" max="100" step="5" value={pct} onChange={e => setPct(parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="What changed?"
              className="risys-input" style={{ flex: 1, minWidth: 180, fontSize: 12 }} />
            <button onClick={submitUpdate} disabled={saving || (!comment.trim() && pct === (action.percent_complete || 0))}
              className="btn-primary" style={{ fontSize: 12 }}>
              {saving ? <Spinner size="sm" /> : 'Post update'}
            </button>
          </div>
          {updates === null ? <Spinner size="sm" /> : updates.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No updates posted yet.</p>
            : updates.map(u => (
              <div key={u.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: '1px solid var(--surface)' }}>
                <Clock size={12} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text)' }}>
                    {u.percent_complete != null && <strong>{u.percent_complete}% — </strong>}{u.comment || 'Progress updated'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{member(u.updated_by)} · {new Date(u.created_at).toLocaleString('en-GB')}</p>
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
    if (!task.title.trim()) { setError('A task needs a title.'); return }
    if (!task.moves) { setError('Say whether this task moves likelihood, impact, both — or is supporting.'); return }
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
          <span className="badge tnum" title="Target residual score" style={{ color: target.color, background: target.bg, border: `1px solid ${target.border}` }}>
            <Target size={10} style={{ marginRight: 3 }} /> Target {target.score} · {target.label}
          </span>
        )}
        {canManage ? (
          <SelectField size="sm" value={plan.status} onChange={e => onUpdatePlan(plan.id, { status: e.target.value })}>
            {PLAN_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        ) : <Pill s={status} />}
      </div>
      <div style={{ padding: '6px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', background: 'var(--surface)' }}>
        {plan.owner_id && <span>Owner <strong style={{ color: 'var(--text-2)' }}>{member(plan.owner_id)}</strong></span>}
        {plan.due_date && <span>Due <strong style={{ color: 'var(--text-2)' }}>{new Date(plan.due_date).toLocaleDateString('en-GB')}</strong></span>}
        <span>{done} of {tasks.length} task{tasks.length === 1 ? '' : 's'} complete</span>
        {plan.approved_at && <span>Approved {new Date(plan.approved_at).toLocaleDateString('en-GB')}{plan.approved_by ? ` by ${member(plan.approved_by)}` : ''}</span>}
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {tasks.length === 0 && !adding && (
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No tasks yet. Front-load the cheap, fast tasks that remove the worst of the impact while the real fix is built.</p>
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
              placeholder="e.g. Remove the 6 privileged accounts from the VPN; route them through the PAM jump host" />
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 150px', gap: 8 }}>
              <SelectField size="sm" value={task.moves} onChange={e => setTask(t => ({ ...t, moves: e.target.value }))}>
                <option value="">What does it move? *</option>
                {MOVES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SelectField>
              <SelectField size="sm" value={task.owner_id} onChange={e => setTask(t => ({ ...t, owner_id: e.target.value }))}>
                <option value="">Task owner…</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
              </SelectField>
              <input type="date" className="risys-input" style={{ fontSize: 12 }} value={task.target_date}
                onChange={e => setTask(t => ({ ...t, target_date: e.target.value }))} />
            </div>
            {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setAdding(false); setError('') }}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={addTask}>
                {saving ? <Spinner size="sm" /> : 'Add task'}
              </button>
            </div>
          </div>
        ) : canManage && (
          <button className="btn-ghost" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
            <Plus size={12} /> Add task
          </button>
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
    if (!form.title.trim()) { setError('Give the plan a title.'); return }
    if (!form.target_likelihood || !form.target_impact) { setError('Set the target residual score this plan must reach.'); return }
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
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
        New {optionMeta(option).label.toLowerCase()} plan
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input className="risys-input" autoFocus style={{ width: '100%' }} value={form.title} onChange={set('title')}
          placeholder={option === 'avoid' ? 'e.g. Decommission VPN-LEGACY-01 and migrate remote access to ZTNA' : 'e.g. Put a RADIUS proxy with MFA in front of the VPN concentrator'} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8, alignItems: 'end' }}>
          <SelectField label="Horizon" size="sm" value={form.horizon} onChange={set('horizon')}>
            <option value="">—</option>
            {HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </SelectField>
          <SelectField label="Target likelihood *" size="sm" value={form.target_likelihood} onChange={set('target_likelihood')}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </SelectField>
          <SelectField label="Target impact *" size="sm" value={form.target_impact} onChange={set('target_impact')}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </SelectField>
          <SelectField label="Plan owner" size="sm" value={form.owner_id} onChange={set('owner_id')}>
            <option value="">—</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
          </SelectField>
          <div>
            <p className="field-label">Due</p>
            <input type="date" className="risys-input" style={{ width: '100%', fontSize: 12 }} value={form.due_date} onChange={set('due_date')} />
          </div>
        </div>
        {target && (
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>
            Target residual: <strong style={{ color: target.color }}>{target.score} · {target.label}</strong>
          </p>
        )}
        {error && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
          <button className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={create}>
            {saving ? <Spinner size="sm" /> : 'Create plan'}
          </button>
        </div>
      </div>
    </Card>
  )
}

/* ── 3. An acceptance / exception record ─────────────────── */
function ExceptionCard({ exc, member, risk, holders, fallbackRequired, onDecide }) {
  const { user } = useAuth()
  const st = getExceptionStatus(exc.status)
  const [comment, setComment] = useState('')
  const [deciding, setDeciding] = useState(false)
  const required = exc.required_authority || fallbackRequired
  const verdict = canApprove({ userId: user?.id, risk, holders, required, requestedBy: exc.requested_by })
  const held = highestTierFor({ userId: user?.id, risk, holders })
  const canRevoke = exc.status === 'approved' && tierRank(held) >= tierRank(required)
  const isException = exc.exception_type === 'exception'
  const expiringSoon = exc.status === 'approved' && exc.expires_at &&
    (new Date(exc.expires_at) - new Date()) < 30 * 86400000 && new Date(exc.expires_at) > new Date()

  const decide = async (decision) => {
    setDeciding(true)
    try { await onDecide(exc.id, decision, comment, decision === 'approved' ? verdict.held : null) } finally { setDeciding(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{exc.exception_ref}</span>
        <span className="badge" style={isException
          ? { color: 'var(--critical)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)' }
          : { color: 'var(--neutral)', background: 'var(--neutral-bg)', border: '1px solid var(--neutral-bd)' }}>
          {isException ? 'Exception · above tolerance' : 'Acceptance'}
        </span>
        <Pill s={st} />
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Needs <strong style={{ color: 'var(--text-2)' }}>{tierMeta(required).label}</strong></span>
        {exc.residual_at_request != null && (
          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>at {exc.residual_at_request} · {bandMeta(exc.band_at_request).label}</span>
        )}
        {expiringSoon && <span style={{ fontSize: 11, color: 'var(--high)', fontWeight: 600 }}>Expires {new Date(exc.expires_at).toLocaleDateString('en-GB')}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 6 }}>{exc.justification}</p>
      {exc.compensating_controls && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}><strong>Compensating controls:</strong> {exc.compensating_controls}</p>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)' }}>
        <span>Requested by <strong style={{ color: 'var(--text-2)' }}>{member(exc.requested_by)}</strong> {new Date(exc.created_at).toLocaleDateString('en-GB')}</span>
        {exc.approver_id && <span>Approver: <strong style={{ color: 'var(--text-2)' }}>{member(exc.approver_id)}</strong></span>}
        {exc.expires_at && <span>Valid until <strong style={{ color: 'var(--text-2)' }}>{new Date(exc.expires_at).toLocaleDateString('en-GB')}</strong></span>}
        {exc.review_frequency && <span>Reviewed <strong style={{ color: 'var(--text-2)' }}>{exc.review_frequency}</strong></span>}
        {exc.decided_at && (
          <span>
            Decided {new Date(exc.decided_at).toLocaleDateString('en-GB')}
            {exc.decided_authority ? ` as ${tierMeta(exc.decided_authority).label}` : ''}
            {exc.decision_comment ? ` — "${exc.decision_comment}"` : ''}
          </span>
        )}
      </div>

      {exc.status === 'pending' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {verdict.allowed ? (
            <>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Decision comment"
                className="risys-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => decide('approved')} disabled={deciding}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: 'var(--low)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <CheckCircle2 size={13} /> Approve as {tierMeta(verdict.held).label}
                </button>
                <button onClick={() => decide('rejected')} disabled={deciding}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: '#fff', color: 'var(--critical)', border: '1px solid var(--critical-bd)', cursor: 'pointer' }}>
                  <XCircle size={13} /> Reject
                </button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
              <Scale size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />
              {verdict.reason}
            </p>
          )}
        </div>
      )}
      {canRevoke && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => decide('revoked')} disabled={deciding}
            style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            Revoke — puts the risk back in front of the gate
          </button>
        </div>
      )}
    </Card>
  )
}

/* ── Main tab ────────────────────────────────────────────── */
export function TreatmentTab({ risk, member, members, onRiskChanged, perms, verdict, onTreatmentChanged }) {
  const riskId = risk.id
  const canManage = !!perms?.canManageRiskChildren(risk)
  const taskApi = useTreatmentActions(riskId)
  const { exceptions, loading: loadingExc, requestException, decideException } = useRiskExceptions(riskId)
  const { options, loading: loadingOpt, migrated, saveOption } = useTreatmentOptions(riskId)
  const { plans, loading: loadingPlans, createPlan, updatePlan } = useTreatmentPlans(riskId)
  const { holders } = useAuthorityHolders()
  const { matrix } = useRiskMatrix()
  const [planFor, setPlanFor] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [excForm, setExcForm] = useState({ justification: '', compensating_controls: '', approver_id: '', expires_at: '', review_frequency: '' })
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
  const band = bandForScore(score, matrix)
  const within = verdict?.evaluated ? verdict.passed : undefined
  const required = verdict?.evaluated ? verdict.requiredAuthority : requiredAuthority({ band, withinTolerance: within })
  const type = acceptanceType(within)
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
    if (f.justification.trim().length < 20) { setExcError('Give the rationale — why retaining this risk is justified.'); return }
    if (type === 'exception' && !f.compensating_controls.trim()) { setExcError('An exception above tolerance needs its compensating controls on record.'); return }
    if (!f.approver_id) { setExcError(`Choose an approver who holds ${tierMeta(required).label} authority.`); return }
    if (!f.expires_at || new Date(f.expires_at) <= new Date()) { setExcError('An acceptance is time-bound: set an expiry date in the future.'); return }
    setExcSaving(true)
    try {
      await requestException({
        justification: f.justification.trim(),
        compensating_controls: f.compensating_controls.trim() || null,
        approver_id: f.approver_id,
        expires_at: new Date(f.expires_at).toISOString(),
        exception_type: type,
        required_authority: required,
        band_at_request: band,
        residual_at_request: score || null,
        review_frequency: f.review_frequency || (type === 'exception' ? 'Monthly' : 'Quarterly'),
      }, risk)
      setExcForm({ justification: '', compensating_controls: '', approver_id: '', expires_at: '', review_frequency: '' })
      setRequesting(false)
    } catch (e) { setExcError(e.message) } finally { setExcSaving(false) }
  }

  const handleDecide = async (id, decision, comment, authority) => {
    await decideException(id, decision, comment, risk, authority)
    onRiskChanged && onRiskChanged()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!migrated && (
        <div style={{ padding: '11px 13px', borderRadius: 8, background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Treatment decisions, plans and acceptance authority need <span className="mono">supabase/migrations/003_treatment_acceptance_triage.sql</span>. Apply it in the Supabase SQL editor, then reload.
          </p>
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
            {readiness.ready ? 'Treatment decision is complete — the plan can be approved.' : 'Treatment decision is not complete yet'}
          </p>
          {!readiness.ready && (
            <ul style={{ margin: '3px 0 0', paddingLeft: 16 }}>
              {readiness.blockers.map((b, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{b}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* 1. Decide */}
      <StepHeader n={1} title="Decide the treatment"
        hint="Record all four options, including the rejected ones — an auditor always asks why you did not do the other thing. Reduce and Avoid can both be selected, on different horizons." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {TREATMENT_OPTIONS.map(meta => (
          <OptionCard key={meta.value} meta={meta} record={byOption.get(meta.value)} canManage={canManage && migrated}
            acceptHint={meta.value === 'accept' ? acceptHint : null}
            onSave={async (opt, patch) => { await saveOption(opt, patch, risk); changed() }} />
        ))}
      </div>

      {/* 2. Plan */}
      <StepHeader n={2} title="Plan each selected option"
        hint="Every plan names the residual score it must reach. Every task says whether it moves likelihood, impact or both; a task that moves neither is marked as supporting." />
      {selectedPlanned.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '22px 16px', textAlign: 'center', background: 'var(--bg-2)' }}>
          <Wrench size={22} strokeWidth={1.2} style={{ color: 'var(--border-2)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Select Avoid, Reduce or Transfer above to plan it.</p>
        </div>
      ) : selectedPlanned.map(o => {
        const optionPlans = plans.filter(p => p.option === o.option)
        return (
          <div key={o.option} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="eyebrow">{optionMeta(o.option).label}{o.horizon ? ` · ${HORIZONS.find(h => h.value === o.horizon)?.label}` : ''}</p>
              {canManage && migrated && planFor !== o.option && (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setPlanFor(o.option)}><Plus size={12} /> Add plan</button>
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
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No plan yet for {optionMeta(o.option).label}.</p>
            )}
          </div>
        )
      })}

      {/* 3. Accept */}
      <StepHeader n={3} title="Acceptance"
        hint="Acceptance is a record, not the absence of one: a rationale, an approver whose authority matches the band, an expiry and a review cadence. Above tolerance it is an exception and needs at least the Steering Committee."
        right={perms?.canRequestException(risk) && !requesting && (
          <button className="btn-secondary" disabled={!canRequest} onClick={() => setRequesting(true)}
            title={preMeasurement ? 'Score the risk before requesting acceptance'
              : hasOpenAcceptance ? 'An acceptance is already pending or active'
              : `Needs ${tierMeta(required).label} approval`}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, opacity: canRequest ? 1 : 0.55 }}>
            <ShieldCheck size={13} /> Request {type === 'exception' ? 'exception' : 'acceptance'}
          </button>
        )} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <Scale size={13} style={{ color: 'var(--crimson)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          {preMeasurement ? 'Not yet scored. ' : ''}
          Current residual <strong className="tnum">{score || '—'}</strong>{band ? ` · ${bandMeta(band).label}` : ''}
          {' — '}{type === 'exception' ? 'outside tolerance, so acceptance is an exception' : 'an acceptance'} signed by the <strong>{tierMeta(required).label}</strong>.
        </span>
      </div>

      {requesting && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p className="field-label">Rationale <span className="field-req">*</span></p>
              <textarea className="risys-input" rows={3} autoFocus style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }}
                value={excForm.justification} onChange={e => setExcForm(f => ({ ...f, justification: e.target.value }))}
                placeholder="e.g. Vendor end-of-life, no MFA integration path; the ZTNA replacement is funded and in flight" />
            </div>
            <div>
              <p className="field-label">Compensating controls{type === 'exception' && <span className="field-req"> *</span>}</p>
              <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }}
                value={excForm.compensating_controls} onChange={e => setExcForm(f => ({ ...f, compensating_controls: e.target.value }))}
                placeholder="e.g. Privileged accounts removed from the VPN; access limited to 12 named users; source IP allowlist; session recording" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
              <div>
                <SelectField label={`Approver (${tierMeta(required).label} or above) *`} size="sm" value={excForm.approver_id}
                  disabled={eligible.length === 0} onChange={e => setExcForm(f => ({ ...f, approver_id: e.target.value }))}>
                  <option value="">{eligible.length ? 'Select approver…' : 'Nobody holds this authority'}</option>
                  {eligible.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>)}
                </SelectField>
                {eligible.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--critical)', marginTop: 4 }}>
                    No member holds {tierMeta(required).label} authority. An admin assigns it on Risk Register → Tolerances.
                  </p>
                )}
              </div>
              <div>
                <p className="field-label">Expires <span className="field-req">*</span></p>
                <input type="date" className="risys-input" style={{ width: '100%', fontSize: 12 }} value={excForm.expires_at}
                  onChange={e => setExcForm(f => ({ ...f, expires_at: e.target.value }))} />
              </div>
              <SelectField label="Review" size="sm" value={excForm.review_frequency || (type === 'exception' ? 'Monthly' : 'Quarterly')}
                onChange={e => setExcForm(f => ({ ...f, review_frequency: e.target.value }))}>
                {REVIEW_FREQUENCIES.map(r => <option key={r} value={r}>{r}</option>)}
              </SelectField>
            </div>
            {excError && <p style={{ fontSize: 12, color: 'var(--critical)' }}>{excError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRequesting(false); setExcError('') }} className="btn-secondary" style={{ fontSize: 12.5 }}>Cancel</button>
              <button onClick={submitAcceptance} disabled={excSaving} className="btn-primary" style={{ fontSize: 12.5 }}>
                {excSaving ? <Spinner size="sm" /> : 'Submit for approval'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {exceptions.map(e => (
        <ExceptionCard key={e.id} exc={e} member={member} risk={risk} holders={holders}
          fallbackRequired={required} onDecide={handleDecide} />
      ))}

      {/* Legacy actions not yet attached to a plan */}
      {unplannedActions.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 8 }}>Other actions — not attached to a plan</p>
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
