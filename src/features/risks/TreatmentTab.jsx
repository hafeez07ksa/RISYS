import { useState, useEffect } from 'react'
import { Plus, Wrench, ShieldCheck, Trash, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTreatmentActions, useRiskExceptions } from '@/hooks/useRisks'
import {
  TREATMENT_ACTION_TYPES, TREATMENT_ACTION_STATUSES, ACTION_PRIORITIES,
  getTreatmentActionStatus, getExceptionStatus,
} from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'

function Card({ children }) {
  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>{children}</div>
}
function Pill({ s }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${s.border}`, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
}
function Empty({ icon: Icon, title, sub }) {
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '36px 16px', textAlign: 'center', background: '#fff' }}>
      <Icon size={26} strokeWidth={1.2} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</p>
    </div>
  )
}
const inputStyle = { width: '100%', fontSize: 13 }

/* ── Remediation plan card with status updates ───────────── */
function ActionCard({ action, member, onUpdate, onStatusUpdate, fetchUpdates, onDelete }) {
  const st = getTreatmentActionStatus(action.status)
  const pr = ACTION_PRIORITIES.find(p => p.value === action.priority) || ACTION_PRIORITIES[1]
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
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>{action.action_ref}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{action.title}</span>
            <Pill s={st} />
            <span style={{ fontSize: 11, color: pr.color, fontWeight: 600, textTransform: 'capitalize' }}>{pr.label}</span>
            {overdue && <span style={{ fontSize: 11, color: '#8C1616', fontWeight: 600 }}>OVERDUE</span>}
          </div>
          {action.description && <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 8 }}>{action.description}</p>}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)' }}>
            <span>{action.action_type}</span>
            {action.owner_id && <span>Owner: <strong style={{ color: 'var(--text-2)' }}>{member(action.owner_id)}</strong></span>}
            {action.target_date && <span>Target: <strong style={{ color: overdue ? '#8C1616' : 'var(--text-2)' }}>{new Date(action.target_date).toLocaleDateString('en-GB')}</strong></span>}
            {action.estimated_cost != null && <span>Est. {Number(action.estimated_cost).toLocaleString()} {action.currency}</span>}
            {(action.expected_likelihood && action.expected_impact) ? <span>Expected residual: <strong style={{ color: 'var(--text-2)' }}>{action.expected_likelihood * action.expected_impact}</strong></span> : null}
          </div>
          {/* progress */}
          <div style={{ marginTop: 10, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-3)' }}>Progress</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{action.percent_complete || 0}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--border)' }}>
              <div style={{ height: '100%', borderRadius: 3, background: action.status === 'completed' ? '#2F6B3C' : 'var(--crimson)', width: `${action.percent_complete || 0}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }}>
          <SelectField value={action.status} onChange={e => onUpdate(action.id, { status: e.target.value })}
            style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-2)', background: '#fff', cursor: 'pointer' }}>
            {TREATMENT_ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
          <button onClick={() => onDelete(action.id)} title="Delete action"
            style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <Trash size={13} />
          </button>
        </div>
      </div>

      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 12, color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        Status updates {updates ? `(${updates.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {/* add update */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 150 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>% complete: <strong style={{ color: 'var(--text)' }}>{pct}%</strong></p>
              <input type="range" min="0" max="100" step="5" value={pct} onChange={e => setPct(parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="What changed? (e.g. MFA rollout completed for finance dept)"
              className="risys-input" style={{ flex: 1, minWidth: 200, fontSize: 12 }} />
            <button onClick={submitUpdate} disabled={saving || (!comment.trim() && pct === (action.percent_complete || 0))}
              className="btn-primary" style={{ fontSize: 12, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Spinner size="sm" /> : 'Post Update'}
            </button>
          </div>
          {/* history */}
          {updates === null ? <Spinner size="sm" /> : updates.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No updates posted yet.</p>
            : updates.map(u => (
              <div key={u.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--surface)' }}>
                <Clock size={13} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    {u.percent_complete != null && <strong>{u.percent_complete}% — </strong>}{u.comment || 'Progress updated'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{member(u.updated_by)} · {new Date(u.created_at).toLocaleString('en-GB')}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </Card>
  )
}

/* ── Exception request card ──────────────────────────────── */
function ExceptionCard({ exc, member, risk, canDecide: hasDecidePerm, onDecide }) {
  const { user } = useAuth()
  const st = getExceptionStatus(exc.status)
  const [comment, setComment] = useState('')
  const [deciding, setDeciding] = useState(false)
  const canDecide = hasDecidePerm && exc.status === 'pending' && (!exc.approver_id || exc.approver_id === user?.id)
  const expiringSoon = exc.status === 'approved' && exc.expires_at &&
    (new Date(exc.expires_at) - new Date()) < 30 * 86400000 && new Date(exc.expires_at) > new Date()

  const decide = async (decision) => {
    setDeciding(true)
    try { await onDecide(exc.id, decision, comment, risk) } finally { setDeciding(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>{exc.exception_ref}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Risk Acceptance Request</span>
        <Pill s={st} />
        {expiringSoon && <span style={{ fontSize: 11, color: '#B5491B', fontWeight: 600 }}>Expires {new Date(exc.expires_at).toLocaleDateString('en-GB')}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 6 }}>{exc.justification}</p>
      {exc.compensating_controls && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}><strong>Compensating controls:</strong> {exc.compensating_controls}</p>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)' }}>
        <span>Requested by <strong style={{ color: 'var(--text-2)' }}>{member(exc.requested_by)}</strong> {new Date(exc.created_at).toLocaleDateString('en-GB')}</span>
        {exc.approver_id && <span>Approver: <strong style={{ color: 'var(--text-2)' }}>{member(exc.approver_id)}</strong></span>}
        {exc.expires_at && <span>Valid until: <strong style={{ color: 'var(--text-2)' }}>{new Date(exc.expires_at).toLocaleDateString('en-GB')}</strong></span>}
        {exc.decided_at && <span>Decided {new Date(exc.decided_at).toLocaleDateString('en-GB')}{exc.decision_comment ? ` — "${exc.decision_comment}"` : ''}</span>}
      </div>

      {canDecide && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Decision comment (optional)"
            className="risys-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => decide('approved')} disabled={deciding}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: '#2F6B3C', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <CheckCircle2 size={13} /> Approve Acceptance
            </button>
            <button onClick={() => decide('rejected')} disabled={deciding}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, background: '#fff', color: '#8C1616', border: '1px solid #F0CECE', cursor: 'pointer' }}>
              <XCircle size={13} /> Reject
            </button>
          </div>
        </div>
      )}
      {hasDecidePerm && exc.status === 'approved' && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => decide('revoked')} disabled={deciding}
            style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            Revoke this acceptance
          </button>
        </div>
      )}
    </Card>
  )
}

/* ── Main tab ────────────────────────────────────────────── */
export function TreatmentTab({ risk, member, members, onRiskChanged, perms }) {
  const riskId = risk.id
  const { actions, loading, createAction, updateAction, addStatusUpdate, fetchUpdates, deleteAction } = useTreatmentActions(riskId)
  const { exceptions, loading: loadingExc, requestException, decideException } = useRiskExceptions(riskId)
  const [mode, setMode] = useState(null) // 'action' | 'exception' | null
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const blankAction = { title: '', description: '', action_type: 'Remediation', owner_id: '', priority: 'medium', target_date: '', estimated_cost: '', expected_likelihood: '', expected_impact: '' }
  const blankExc = { justification: '', compensating_controls: '', approver_id: risk.approver_id || '', expires_at: '' }
  const [form, setForm] = useState(blankAction)
  const [excForm, setExcForm] = useState(blankExc)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setExc = k => e => setExcForm(f => ({ ...f, [k]: e.target.value }))

  const openActions = actions.filter(a => !['completed', 'cancelled'].includes(a.status)).length

  const saveAction = async () => {
    setSaving(true); setError('')
    try {
      await createAction({
        ...form,
        owner_id: form.owner_id || null,
        target_date: form.target_date || null,
        estimated_cost: form.estimated_cost === '' ? null : parseFloat(form.estimated_cost),
        expected_likelihood: form.expected_likelihood ? parseInt(form.expected_likelihood) : null,
        expected_impact: form.expected_impact ? parseInt(form.expected_impact) : null,
        status: 'planned', percent_complete: 0,
      }, risk)
      setForm(blankAction); setMode(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const saveException = async () => {
    setSaving(true); setError('')
    try {
      await requestException({
        justification: excForm.justification,
        compensating_controls: excForm.compensating_controls || null,
        approver_id: excForm.approver_id || null,
        expires_at: excForm.expires_at ? new Date(excForm.expires_at).toISOString() : null,
      }, risk)
      setExcForm(blankExc); setMode(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDecide = async (id, decision, comment) => {
    await decideException(id, decision, comment, risk)
    onRiskChanged && onRiskChanged()
  }

  if (loading || loadingExc) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Treatment Plan — {openActions} open action{openActions !== 1 ? 's' : ''}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Remediate with tracked action plans, or formally accept the risk via an approved, time-bound exception
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {perms?.canRequestException(risk) && <button onClick={() => { setMode(mode === 'exception' ? null : 'exception'); setError('') }} className="btn-secondary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={13} /> Request Acceptance
          </button>}
          {perms?.canManageRiskChildren(risk) && <button onClick={() => { setMode(mode === 'action' ? null : 'action'); setError('') }} className="btn-primary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Add Action Plan
          </button>}
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#8C1616' }}>{error}</p>}

      {/* New action form */}
      {mode === 'action' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={form.title} onChange={set('title')} placeholder="Action title — e.g. Deploy MFA across all privileged accounts" className="risys-input" style={inputStyle} autoFocus />
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="What will be done, by whom, and how success is verified" className="risys-input" style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <SelectField value={form.action_type} onChange={set('action_type')} style={inputStyle}>
                {TREATMENT_ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </SelectField>
              <SelectField value={form.priority} onChange={set('priority')} style={inputStyle}>
                {ACTION_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label} priority</option>)}
              </SelectField>
              <SelectField value={form.owner_id} onChange={set('owner_id')} style={inputStyle}>
                <option value="">Assign owner…</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.title || m.user_id?.slice(0, 8)}</option>)}
              </SelectField>
              <input type="date" value={form.target_date} onChange={set('target_date')} className="risys-input" style={inputStyle} title="Target completion date" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <input type="number" value={form.estimated_cost} onChange={set('estimated_cost')} placeholder="Estimated cost (SAR)" className="risys-input" style={inputStyle} />
              <SelectField value={form.expected_likelihood} onChange={set('expected_likelihood')} style={inputStyle}>
                <option value="">Expected likelihood after…</option>
                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
              </SelectField>
              <SelectField value={form.expected_impact} onChange={set('expected_impact')} style={inputStyle}>
                <option value="">Expected impact after…</option>
                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
              </SelectField>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMode(null)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={saveAction} disabled={saving || !form.title.trim()} className="btn-primary" style={{ fontSize: 13, opacity: !form.title.trim() ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} Create Action
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* New exception form */}
      {mode === 'exception' && (
        <Card>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
            A risk acceptance is a formal, approved, <strong>time-bound</strong> exception. When it expires, the risk automatically reopens.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea value={excForm.justification} onChange={setExc('justification')} rows={3} autoFocus
              placeholder="Business justification — why accepting this risk is within appetite (cost/benefit, constraints, context)"
              className="risys-input" style={{ ...inputStyle, resize: 'vertical' }} />
            <textarea value={excForm.compensating_controls} onChange={setExc('compensating_controls')} rows={2}
              placeholder="Compensating controls in place while the risk is accepted (optional)"
              className="risys-input" style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Approver</p>
                <SelectField value={excForm.approver_id} onChange={setExc('approver_id')} style={inputStyle}>
                  <option value="">Select approver…</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.title || m.user_id?.slice(0, 8)}</option>)}
                </SelectField>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Acceptance valid until</p>
                <input type="date" value={excForm.expires_at} onChange={setExc('expires_at')} className="risys-input" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMode(null)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={saveException} disabled={saving || !excForm.justification.trim()} className="btn-primary" style={{ fontSize: 13, opacity: !excForm.justification.trim() ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} Submit for Approval
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Action plans */}
      {actions.length === 0 && exceptions.length === 0 && !mode && (
        <Empty icon={Wrench} title="No treatment activity yet"
          sub="Create remediation action plans, or request formal risk acceptance" />
      )}
      {actions.map(a => (
        <ActionCard key={a.id} action={a} member={member}
          onUpdate={updateAction} onStatusUpdate={addStatusUpdate}
          fetchUpdates={fetchUpdates} onDelete={deleteAction} />
      ))}

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginTop: 8 }}>
            Acceptance / Exception Requests
          </p>
          {exceptions.map(e => (
            <ExceptionCard key={e.id} exc={e} member={member} risk={risk} canDecide={perms?.canDecideException} onDecide={handleDecide} />
          ))}
        </>
      )}
    </div>
  )
}
