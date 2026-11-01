import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Stamp, X, Ban } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useException } from '@/hooks/useExceptions'
import { EXCEPTION_SUBJECTS, AUTHORITIES, labelOf, daysUntil } from '@/lib/policies'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Section, Facts, Field, SubmitButton, ErrorText, DueText, personName } from '@/features/audits/parts'
import { ExceptionStatusBadge, CriticalityBadge, authorityLabel } from '@/features/policies/parts'
import { tx } from '@/lib/i18n'

const rank = (t) => AUTHORITIES.findIndex((a) => a.value === t)

/* /app/exceptions/:id — one exception: the request, the decision and, while
 * it is in force, revocation. The database refuses a decision by the
 * requester or by anyone below the required authority. */
export function ExceptionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const ex = useException(id)
  const e = ex.item
  const [comment, setComment] = useState('')
  const [revoke, setRevoke] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const back = { label: tx('Exceptions'), onClick: () => navigate('/app/exceptions') }
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (err) { setError(err.message) } finally { setBusy('') } }

  if (ex.loading) return <PageLoading />
  if (!e) return <PageNotFound title={tx('Exception not found')} back={back} />

  const canDecide = e.status === 'submitted' && e.requested_by !== user?.id && ex.authority && rank(ex.authority) >= rank(e.required_authority)
  const canRevoke = e.status === 'approved' && (perms.isComplianceWriter || e.approver_id === user?.id)
  const subjectLink = e.subject_type === 'policy' ? `/app/policies/${e.subject_id}`
    : e.subject_type === 'control' ? `/app/controls/${e.subject_id}`
    : e.subject_type === 'requirement' && e.subject_id.includes('|') ? `/app/compliance/${encodeURIComponent(e.subject_id.split('|')[0])}/${encodeURIComponent(e.subject_id.split('|')[1])}` : null
  const left = daysUntil(e.expires_on)

  return (
    <RecordPage
      title={`${e.ref} — ${e.title}`}
      meta={<><ExceptionStatusBadge v={e.status} /><CriticalityBadge v={e.risk_rating} /></>}
      back={back}
      aside={
        <Section title={tx('Decision')}>
          <Facts rows={[
            [tx('Needs'), authorityLabel(e.required_authority)],
            [tx('Requested'), `${personName(members, e.requested_by)} · ${fmtDateTime(e.requested_at)}`],
            [tx('Decided'), e.approver_id ? `${personName(members, e.approver_id)} · ${authorityLabel(e.decided_authority)} · ${fmtDateTime(e.decided_at)}` : null],
            [tx('Comment'), e.decision_comment],
            [tx('Revoked'), e.revoked_by ? `${personName(members, e.revoked_by)} · ${fmtDateTime(e.revoked_at)} — ${e.revoke_reason}` : null],
          ]} />
        </Section>
      }
    >
      <Section title={tx('Request')}>
        <Facts rows={[
          [tx('From'), <span key="s">{labelOf(EXCEPTION_SUBJECTS, e.subject_type)}: {subjectLink ? <Link to={subjectLink}>{e.subject_label || e.subject_id}</Link> : (e.subject_label || e.subject_id)}</span>],
          [tx('Runs'), <span key="r">{fmtDate(e.starts_on)} – <DueText date={e.expires_on} done={e.status !== 'approved'} />{e.status === 'approved' && left >= 0 ? ` · ${left} ${tx('days left')}` : ''}</span>],
          [tx('Justification'), e.justification],
          [tx('Compensating controls'), e.compensating_controls],
        ]} />
      </Section>

      <ErrorText>{error}</ErrorText>

      {canDecide && (
        <Section title={tx('Decide')}>
          <Field label={tx('Comment')} required help={tx('Recorded with the decision. Say what the approval depends on, or why it is refused.')}>
            <textarea className="risys-input" rows={3} value={comment} onChange={(ev) => setComment(ev.target.value)} />
          </Field>
          <div className="flex" style={{ gap: 8, marginTop: 10 }}>
            <SubmitButton busy={busy === 'ok'} onClick={run('ok', () => ex.decide(true, comment.trim()))}><Stamp size={13} /> {tx('Approve')}</SubmitButton>
            <button className="btn-secondary" disabled={!!busy} onClick={run('no', () => ex.decide(false, comment.trim()))}><X size={13} /> {tx('Reject')}</button>
          </div>
        </Section>
      )}
      {e.status === 'submitted' && !canDecide && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
          {e.requested_by === user?.id ? tx('Waiting for a decision. You cannot decide your own request.') : `${tx('Waiting for a decision by')} ${authorityLabel(e.required_authority)}.`}</p>
      )}

      {canRevoke && (
        <Section title={tx('Revoke')}>
          {revoke === null ? (
            <button className="btn-secondary" onClick={() => setRevoke('')}><Ban size={13} /> {tx('Revoke this exception')}</button>
          ) : (
            <>
              <Field label={tx('Reason')} required><textarea className="risys-input" rows={2} value={revoke} onChange={(ev) => setRevoke(ev.target.value)} /></Field>
              <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                <SubmitButton busy={busy === 'rv'} onClick={run('rv', async () => { await ex.revoke(revoke.trim()); setRevoke(null) })}>{tx('Revoke')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setRevoke(null)}>{tx('Keep it')}</button>
              </div>
            </>
          )}
        </Section>
      )}
    </RecordPage>
  )
}
