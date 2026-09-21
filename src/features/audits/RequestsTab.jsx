import { useState } from 'react'
import { Plus, Send, Check, Undo2, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { fmtDateTime } from '@/lib/reports/models'
import { Dialog, Field, Grid, SubmitButton, ErrorText, Section, RequestBadge, DueText, Th, Td, Empty, Facts, personName } from './parts'
import { EvidenceList } from './EvidenceList'

/* Evidence requests: what the auditor asked the business for. The person asked
 * attaches files and submits; only the audit team can accept or return it.
 * Both rules are enforced by audit_request_guard in the database. */

export function RequestsTab({ audit, members, canManage, locked, focusId }) {
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(focusId ?? null)
  const open = audit.requests.find((r) => r.id === openId)

  return (
    <Section title={`Evidence requests (${audit.requests.length})`} pad={false}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={13} /> New request</button>}>
      {audit.requests.length === 0 ? (
        <Empty title="No evidence requested yet">Ask the business for the documents, exports or screenshots the tests need. The person asked is notified and answers here.</Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Request</Th><Th>Asked of</Th><Th>Due</Th><Th align="right">Files</Th><Th>Status</Th></tr></thead>
          <tbody>
            {audit.requests.map((r) => {
              const files = audit.files.filter((f) => f.request_id === r.id).length
              const mine = r.requested_from === user.id && ['open', 'rejected'].includes(r.status)
              return (
                <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                  <Td>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{r.title}</div>
                    {mine && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--crimson)', fontWeight: 600 }}>Waiting on you</div>}
                  </Td>
                  <Td>{personName(members, r.requested_from) ?? '—'}</Td>
                  <Td><DueText date={r.due_date} done={['submitted', 'accepted'].includes(r.status)} /></Td>
                  <Td align="right">{files || '—'}</Td>
                  <Td><RequestBadge v={r.status} /></Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {adding && <NewRequestDialog audit={audit} members={members} onClose={() => setAdding(false)} />}
      {open && <RequestDialog audit={audit} request={open} members={members} canManage={canManage} locked={locked} onClose={() => setOpenId(null)} />}
    </Section>
  )
}

function NewRequestDialog({ audit, members, onClose }) {
  const [f, setF] = useState({ title: '', description: '', requested_from: '', due_date: '', scope_item_id: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!f.title.trim()) { setError('Say what is being requested.'); return }
    if (!f.requested_from) { setError('Choose who should provide it.'); return }
    setBusy(true); setError('')
    try {
      await audit.addRequest({ title: f.title.trim(), description: f.description.trim() || null, requested_from: f.requested_from,
        due_date: f.due_date || null, scope_item_id: f.scope_item_id || null })
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} title="Request evidence" subtitle="The person asked is notified and can answer from their Audits page."
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><SubmitButton busy={busy} onClick={save}>Send request</SubmitButton></>}>
      <Field label="What is needed" required>
        <input className="risys-input" value={f.title} onChange={set('title')} autoFocus placeholder="e.g. Export of Conditional Access policies" />
      </Field>
      <Field label="Detail">
        <textarea className="risys-input" rows={3} value={f.description} onChange={set('description')}
                  placeholder="Format, period covered, the population it must come from…" />
      </Field>
      <Grid cols={2}>
        <Field label="Asked of" required>
          <SelectField className="w-full" value={f.requested_from} onChange={set('requested_from')}
            options={[{ value: '', label: 'Choose a person' }, ...members.filter((m) => m.role !== 'viewer').map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]} />
        </Field>
        <Field label="Due"><DateField value={f.due_date} onChange={set('due_date')} /></Field>
      </Grid>
      <Field label="For scope item">
        <SelectField className="w-full" value={f.scope_item_id} onChange={set('scope_item_id')}
          options={[{ value: '', label: 'Not tied to one item' }, ...audit.scope.map((x) => ({ value: x.id, label: x.title }))]} />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}

function RequestDialog({ audit, request: r, members, canManage, locked, onClose }) {
  const { user } = useAuth()
  const isAssignee = r.requested_from === user.id
  const canRespond = !locked && isAssignee && ['open', 'rejected'].includes(r.status)
  const canReview = !locked && canManage && r.status === 'submitted'
  const [note, setNote] = useState(r.response_note ?? '')
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const files = audit.files.filter((f) => f.request_id === r.id)

  const run = (key, fn) => async () => {
    setBusy(key); setError('')
    try { await fn(); onClose() } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const scopeItem = audit.scope.find((x) => x.id === r.scope_item_id)

  return (
    <Dialog open onClose={onClose} width={620} title={r.title} subtitle={<RequestBadge v={r.status} />}
      footer={<>
        {canManage && !locked && r.status === 'open' && (
          <button className="btn-ghost" style={{ marginRight: 'auto' }} onClick={run('del', async () => {
            if (window.confirm('Withdraw this request?')) await audit.deleteRequest(r.id)
          })}><Trash2 size={13} /> Withdraw</button>
        )}
        <button className="btn-secondary" onClick={onClose}>Close</button>
        {canReview && <>
          <SubmitButton busy={busy === 'rej'} onClick={run('rej', () => {
            if (!review.trim()) throw new Error('Say what is missing so the person can resubmit.')
            return audit.updateRequest(r.id, { status: 'rejected', review_note: review.trim() })
          })}><Undo2 size={13} /> Return</SubmitButton>
          <SubmitButton busy={busy === 'acc'} onClick={run('acc', () => audit.updateRequest(r.id, { status: 'accepted', review_note: review.trim() || null }))}>
            <Check size={13} /> Accept
          </SubmitButton>
        </>}
        {canRespond && (
          <SubmitButton busy={busy === 'sub'} disabled={!files.length && !note.trim()}
            onClick={run('sub', () => audit.updateRequest(r.id, { status: 'submitted', response_note: note.trim() || null }))}>
            <Send size={13} /> Submit to auditor
          </SubmitButton>
        )}
      </>}>
      <Facts rows={[
        ['Asked of', personName(members, r.requested_from)],
        ['Due', <DueText key="d" date={r.due_date} done={['submitted', 'accepted'].includes(r.status)} />],
        scopeItem && ['For', scopeItem.title],
        ['Detail', r.description],
        r.submitted_at && ['Submitted', fmtDateTime(r.submitted_at)],
        r.reviewed_at && [r.status === 'accepted' ? 'Accepted' : 'Returned', `${fmtDateTime(r.reviewed_at)} by ${personName(members, r.reviewed_by)}`],
        r.review_note && ['Auditor’s note', r.review_note],
      ]} />

      <div>
        <div className="field-label">Files</div>
        <EvidenceList audit={audit} files={files} locked={locked}
          canUpload={canRespond || (canManage && !locked)} onUpload={(file) => audit.uploadEvidence(file, { requestId: r.id, scopeItemId: r.scope_item_id })} />
      </div>

      {canRespond ? (
        <Field label="Your response" help="Explain what the files show, or why something cannot be provided.">
          <textarea className="risys-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      ) : r.response_note ? (
        <Facts rows={[['Response', r.response_note]]} />
      ) : null}

      {canReview && (
        <Field label="Review note" help="Required when returning the request; optional when accepting.">
          <textarea className="risys-input" rows={2} value={review} onChange={(e) => setReview(e.target.value)} />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}
