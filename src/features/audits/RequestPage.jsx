import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Send, Check, Undo2, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { fmtDateTime } from '@/lib/reports/models'
import { useAuditPage, Field, SubmitButton, ErrorText, Section, RequestBadge, DueText, Facts, personName } from './parts'
import { EvidenceList } from './EvidenceList'
import { tx } from '@/lib/i18n'

/* /app/audits/:id/requests/:requestId — one evidence request.
 *
 * Two people use this page for different things:
 *   - the person asked attaches files, explains them and submits;
 *   - the audit team accepts the evidence, or returns it saying what is missing.
 * audit_request_guard in the database enforces both, whatever the UI shows. */
export function RequestPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const { id, audit, e, members, canManage, locked, navigate, toTab } = useAuditPage()
  const r = audit.requests.find((x) => x.id === requestId)
  const [note, setNote] = useState(null)
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { if (r && note === null) setNote(r.response_note ?? '') }, [r, note])

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!r) return <PageNotFound title={tx('Request not found')} back={{ label: e.ref, onClick: () => toTab('requests') }}>{tx('It may have been withdrawn.')}</PageNotFound>

  const isAssignee = r.requested_from === user.id
  const canRespond = !locked && isAssignee && ['open', 'rejected'].includes(r.status)
  const canReview = !locked && canManage && r.status === 'submitted'
  const files = audit.files.filter((f) => f.request_id === r.id)
  const scopeItem = audit.scope.find((x) => x.id === r.scope_item_id)

  const run = (key, fn) => async () => {
    setBusy(key); setError('')
    try { await fn(); setReview('') } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const submit = run('sub', () => audit.updateRequest(r.id, { status: 'submitted', response_note: (note ?? '').trim() || null }))
  const accept = run('acc', () => audit.updateRequest(r.id, { status: 'accepted', review_note: review.trim() || null }))
  const giveBack = run('rej', () => {
    if (!review.trim()) throw new Error(tx('Say what is missing so the person can resubmit.'))
    return audit.updateRequest(r.id, { status: 'rejected', review_note: review.trim() })
  })

  const next = canRespond
    ? (r.status === 'rejected' ? tx('The auditor returned this. Read their note, add what is missing and submit again.') : tx('Attach the files, explain what they show, and submit to the auditor.'))
    : canReview ? tx('Check the files against what was asked. Accept, or return with a note saying what is missing.')
    : r.status === 'submitted' ? tx('Submitted. Waiting for the audit team to review.')
    : r.status === 'accepted' ? tx('Accepted by the audit team. Nothing more is needed.')
    : isAssignee ? null : `${tx('Waiting for')} ${personName(members, r.requested_from)}.`

  return (
    <RecordPage
      title={r.title}
      meta={<RequestBadge v={r.status} />}
      description={`${tx('Evidence request')} · ${e.ref} — ${e.title}`}
      back={{ label: e.ref, onClick: () => toTab('requests') }}
      aside={<>
        <Section title={tx('Details')}>
          <Facts rows={[
            ['Asked of', personName(members, r.requested_from)],
            ['Due', <DueText key="d" date={r.due_date} done={['submitted', 'accepted'].includes(r.status)} />],
            scopeItem && ['For test', <Link key="s" to={`/app/audits/${id}/scope/${scopeItem.id}`} style={{ color: 'var(--crimson)' }}>{scopeItem.title}</Link>],
            ['Requested', fmtDateTime(r.created_at)],
            r.submitted_at && ['Submitted', fmtDateTime(r.submitted_at)],
            r.reviewed_at && [r.status === 'accepted' ? 'Accepted' : 'Returned', `${fmtDateTime(r.reviewed_at)} · ${personName(members, r.reviewed_by)}`],
          ]} />
        </Section>
        {next && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.55 }}>{next}</p>}
        {canManage && !locked && r.status === 'open' && (
          <InlineConfirm variant="panel" triggerClassName="btn-ghost" message={tx('Withdraw this request?')}
            detail={tx('The request is deleted and the person asked no longer sees it.')} confirmLabel={tx('Withdraw')}
            onConfirm={async () => { await audit.deleteRequest(r.id); toTab('requests') }}>
            <Trash2 size={13} /> {tx('Withdraw request')}
          </InlineConfirm>
        )}
      </>}
    >
      <Section title={tx('What was asked')}>
        <p className="rp-text" style={{ color: r.description ? 'var(--text)' : 'var(--text-3)' }}>{r.description || tx('No further detail given.')}</p>
      </Section>

      {r.review_note && (
        <Section title={r.status === 'rejected' ? tx('Returned — what is missing') : tx('Auditor’s note')}>
          <p className="rp-text">{r.review_note}</p>
        </Section>
      )}

      <Section title={`${tx('Files')} (${files.length})`}>
        <EvidenceList audit={audit} files={files} locked={locked}
          canUpload={canRespond || (canManage && !locked)} onUpload={(file) => audit.uploadEvidence(file, { requestId: r.id, scopeItemId: r.scope_item_id })} />
      </Section>

      <Section title={tx('Response')}>
        {canRespond ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label={tx('Your response')} help={tx('Explain what the files show, or why something cannot be provided.')}>
              <textarea className="risys-input" rows={4} value={note ?? ''} onChange={(ev) => setNote(ev.target.value)} />
            </Field>
            <div>
              <SubmitButton busy={busy === 'sub'} disabled={!files.length && !(note ?? '').trim()} onClick={submit}>
                <Send size={13} className="rtl-flip" /> {tx('Submit to auditor')}</SubmitButton>
            </div>
          </div>
        ) : (
          <p className="rp-text" style={{ color: r.response_note ? 'var(--text)' : 'var(--text-3)' }}>{r.response_note || tx('No response yet.')}</p>
        )}
      </Section>

      {canReview && (
        <Section title={tx('Review')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label={tx('Review note')} help={tx('Required when returning the request; optional when accepting.')}>
              <textarea className="risys-input" rows={3} value={review} onChange={(ev) => setReview(ev.target.value)} />
            </Field>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <SubmitButton busy={busy === 'acc'} disabled={!!busy} onClick={accept}><Check size={13} /> {tx('Accept evidence')}</SubmitButton>
              <button className="btn-secondary" disabled={!!busy} onClick={giveBack}><Undo2 size={13} className="rtl-flip" /> {tx('Return for more')}</button>
            </div>
          </div>
        </Section>
      )}
      <ErrorText>{error}</ErrorText>
    </RecordPage>
  )
}
