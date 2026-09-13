import { useState } from 'react'
import { Send, CheckCircle2, XCircle, Archive, RotateCcw, AlertCircle, ClipboardCheck, Wrench, Undo2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRiskWorkflow } from '@/hooks/useRisks'
import { WORKFLOW_ACTIONS, getWorkflowState, normalizeWorkflowState } from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

const ICONS = {
  admitted:           ClipboardCheck,
  returned:           XCircle,
  treatment_approved: Wrench,
  treatment_complete: CheckCircle2,
  acceptance_revoked: Undo2,
  closed:             Archive,
  reopened:           RotateCcw,
}
// Any action without a dedicated icon still renders — a missing entry
// used to blank the whole bar.
const FallbackIcon = Send

const STYLES = {
  primary: { background: 'var(--crimson)', color: '#fff', border: '1px solid var(--crimson)' },
  success: { background: '#2F6B3C', color: '#fff', border: '1px solid #2F6B3C' },
  danger:  { background: '#fff', color: '#8C1616', border: '1px solid #F0CECE' },
  neutral: { background: '#fff', color: 'var(--text-2)', border: '1px solid var(--border-2)' },
}

/**
 * The MANUAL half of the lifecycle.
 *
 * draft -> registered -> assessed -> [gate] -> monitored | treatment_required
 *
 * What is deliberately absent from this bar is any button that moves a
 * risk in or out of tolerance. Crossing the gate is the system's
 * decision, taken from the score and the tolerance rules, and a user
 * pressing a button must never be able to overrule it. The bar only
 * carries acts a human is genuinely accountable for: admitting the
 * record, approving a treatment plan, closing out a cause.
 */
export function WorkflowBar({ risk, member, onChanged, perms, treatmentReadiness }) {
  const { user } = useAuth()
  const { busy, transition } = useRiskWorkflow(risk, onChanged)
  const [confirming, setConfirming] = useState(null) // action object awaiting comment
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const state = normalizeWorkflowState(risk.workflow_state)
  const allActions = WORKFLOW_ACTIONS[state] || []
  // Gate each transition by role:
  //  - submit_for_review: owner (member) or manager+
  //  - approve / reject:  manager+ only
  //  - close / reopen:    manager+ only
  const actions = allActions.filter(a => {
    if (!perms) return true
    // Admission and return are second-line acts: the reviewer validates
    // the record before it becomes part of the register.
    if (a.action === 'admitted' || a.action === 'returned') return perms.canApproveReject
    if (a.action === 'closed' || a.action === 'reopened') return perms.canCloseReopen
    if (a.action === 'treatment_approved' || a.action === 'acceptance_revoked') return perms.canApproveReject
    return perms.canEditRisk(risk)
  })
  const wf = getWorkflowState(state)

  const isReviewer = user?.id && (user.id === risk.reviewer_id || user.id === risk.approver_id)
  const reviewPending = state === 'draft'

  // Step 9: a treatment plan cannot be approved until every option has a
  // recorded decision and each selected option has a plan with a target.
  const notReady = (a) => a.action === 'treatment_approved' && !!treatmentReadiness && !treatmentReadiness.ready

  const run = async (a, withComment) => {
    setError('')
    try {
      await transition({ action: a.action, to: a.to, comment: withComment || null })
      setConfirming(null); setComment('')
    } catch (e) { setError(e.message || 'Transition failed') }
  }

  const handleClick = (a) => {
    if (a.requireComment) { setConfirming(a); setComment(''); setError('') }
    else run(a)
  }

  return (
    <div style={{ margin: '12px 28px 0', borderRadius: 12, background: '#fff', border: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>Workflow</span>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, border: `1px solid ${wf.border}`, background: wf.bg, color: wf.color, fontWeight: 500 }}>
            {wf.label}
          </span>
          {reviewPending && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: isReviewer ? '#9C6F0F' : 'var(--text-3)' }}>
              <AlertCircle size={13} />
              {isReviewer ? 'Awaiting your admission' : `Awaiting admission by ${member(risk.reviewer_id) || member(risk.approver_id) || 'a reviewer'}`}
            </span>
          )}
          {state !== 'draft' && risk.approved_at && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Admitted {new Date(risk.approved_at).toLocaleDateString('en-GB')}{risk.approved_by ? ` by ${member(risk.approved_by)}` : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {actions.map(a => {
            const Icon = ICONS[a.action] || FallbackIcon
            return (
              <button key={a.action} onClick={() => !notReady(a) && handleClick(a)} disabled={busy || notReady(a)}
                title={notReady(a) ? treatmentReadiness.blockers.join(' ') : a.hint}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: busy ? 'wait' : notReady(a) ? 'not-allowed' : 'pointer', opacity: busy || notReady(a) ? 0.55 : 1, ...STYLES[a.style] }}>
                {busy ? <Spinner size="sm" /> : <Icon size={13} />}
                {a.label}
              </button>
            )
          })}
        </div>
      </div>

      {state === 'treatment_required' && treatmentReadiness && !treatmentReadiness.ready && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 3 }}>Before the treatment plan can be approved:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {treatmentReadiness.blockers.map((b, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{b}</li>)}
          </ul>
        </div>
      )}

      {confirming && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
            {confirming.action === 'returned' ? 'Why is this being returned?'
              : confirming.action === 'acceptance_revoked' ? 'Why is the acceptance being revoked?'
              : 'Closure reason — what makes the cause unable to recur?'}
            <span style={{ color: '#8C1616' }}> *</span>
          </p>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} autoFocus
            placeholder={confirming.action === 'returned'
              ? 'e.g. Inherent impact appears understated; please re-assess against the Q2 incident data.'
              : 'e.g. Legacy VPN concentrator decommissioned on 14 Jun — the cause can no longer occur.'}
            className="risys-input" style={{ width: '100%', fontSize: 13, resize: 'vertical' }} />
          {error && <p style={{ fontSize: 12, color: '#8C1616', marginTop: 6 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirming(null)} className="btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
            <button onClick={() => run(confirming, comment)} disabled={!comment.trim() || busy}
              style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', opacity: !comment.trim() ? 0.5 : 1, ...STYLES[confirming.style] }}>
              Confirm {confirming.label}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
