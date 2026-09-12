import { useState } from 'react'
import { Send, CheckCircle2, XCircle, Archive, RotateCcw, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRiskWorkflow } from '@/hooks/useRisks'
import { WORKFLOW_ACTIONS, getWorkflowState } from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

const ICONS = { submitted: Send, approved: CheckCircle2, rejected: XCircle, closed: Archive, reopened: RotateCcw }

const STYLES = {
  primary: { background: 'var(--crimson)', color: '#fff', border: '1px solid var(--crimson)' },
  success: { background: '#2F6B3C', color: '#fff', border: '1px solid #2F6B3C' },
  danger:  { background: '#fff', color: '#8C1616', border: '1px solid #F0CECE' },
  neutral: { background: '#fff', color: 'var(--text-2)', border: '1px solid var(--border-2)' },
}

/**
 * Enforced workflow lifecycle: draft → under review → approved → closed.
 * - Submitting notifies the reviewer; approving/rejecting notifies the owner.
 * - Rejection requires a comment (Archer: "request changes").
 * - Approve/Reject is highlighted for the assigned reviewer/approver.
 */
export function WorkflowBar({ risk, member, onChanged, perms }) {
  const { user } = useAuth()
  const { busy, transition } = useRiskWorkflow(risk, onChanged)
  const [confirming, setConfirming] = useState(null) // action object awaiting comment
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const state = risk.workflow_state || 'draft'
  const allActions = WORKFLOW_ACTIONS[state] || []
  // Gate each transition by role:
  //  - submit_for_review: owner (member) or manager+
  //  - approve / reject:  manager+ only
  //  - close / reopen:    manager+ only
  const actions = allActions.filter(a => {
    if (!perms) return true
    if (a.action === 'submitted') return perms.canSubmitForReview(risk)
    if (a.action === 'approved' || a.action === 'rejected') return perms.canApproveReject
    if (a.action === 'closed' || a.action === 'reopened') return perms.canCloseReopen
    return perms.canEditRisk(risk)
  })
  const wf = getWorkflowState(state)

  const isReviewer = user?.id && (user.id === risk.reviewer_id || user.id === risk.approver_id)
  const reviewPending = state === 'under_review'

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
              {isReviewer ? 'Awaiting your decision' : `Awaiting review by ${member(risk.reviewer_id) || member(risk.approver_id) || 'assigned reviewer'}`}
            </span>
          )}
          {state === 'approved' && risk.approved_at && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Approved {new Date(risk.approved_at).toLocaleDateString('en-GB')}{risk.approved_by ? ` by ${member(risk.approved_by)}` : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {actions.map(a => {
            const Icon = ICONS[a.action]
            return (
              <button key={a.action} onClick={() => handleClick(a)} disabled={busy} title={a.hint}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, ...STYLES[a.style] }}>
                {busy ? <Spinner size="sm" /> : <Icon size={13} />}
                {a.label}
              </button>
            )
          })}
        </div>
      </div>

      {confirming && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
            {confirming.action === 'rejected' ? 'Why is this being returned?' : 'Closure reason'}
            <span style={{ color: '#8C1616' }}> *</span>
          </p>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} autoFocus
            placeholder={confirming.action === 'rejected' ? 'e.g. Inherent impact appears understated; please re-assess against the Q2 incident data.' : 'e.g. Risk fully treated — all remediation actions complete and verified.'}
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
