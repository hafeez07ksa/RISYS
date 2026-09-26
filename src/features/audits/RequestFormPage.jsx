import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuditPage, Field, SubmitButton, assignable } from './parts'
import { tx } from '@/lib/i18n'

/* /app/audits/:id/requests/new[?scope=<itemId>] — ask the business for evidence. */
export function RequestFormPage() {
  const [params] = useSearchParams()
  const { audit, e, members, canManage, locked, navigate, toTab } = useAuditPage()
  const [f, setF] = useState({ title: '', description: '', requested_from: '', due_date: '', scope_item_id: params.get('scope') ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!canManage || locked) {
    return <PageNotFound title={tx('Evidence cannot be requested')} back={{ label: e.ref, onClick: () => toTab('requests') }}>
      {locked ? tx('This engagement is closed.') : tx('Only the audit team requests evidence.')}</PageNotFound>
  }

  const save = async () => {
    if (!f.title.trim()) { setError(tx('Say what is being requested.')); return }
    if (!f.requested_from) { setError(tx('Choose who should provide it.')); return }
    setBusy(true); setError('')
    try {
      await audit.addRequest({ title: f.title.trim(), description: f.description.trim() || null, requested_from: f.requested_from,
        due_date: f.due_date || null, scope_item_id: f.scope_item_id || null })
      toTab('requests')
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <FormPage
      title={tx('Request evidence')}
      description={`${e.ref} — ${e.title}`}
      back={{ label: e.ref, onClick: () => toTab('requests') }}
      onSubmit={save}
      error={error}
      note={tx('The person asked is notified and answers from their Audits page.')}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={() => toTab('requests')}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Send request')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('What is needed')} description={tx(
        'Be exact, so the first answer is the right one: the system it comes from, the format, the period it must cover and the population it must include. Vague requests produce evidence that cannot be tested.'
      )}>
        <Field label={tx('Request')} required>
          <input className="risys-input" value={f.title} onChange={set('title')} autoFocus placeholder={tx('e.g. Export of Conditional Access policies')} />
        </Field>
        <Field label={tx('Detail')}>
          <textarea className="risys-input" rows={5} value={f.description} onChange={set('description')}
                    placeholder={tx('Export from the Entra admin centre as JSON, showing every policy with its state (on / off / report-only), as configured today. Include policies that are switched off.')} />
        </Field>
        <Field label={tx('For scope item')} help={tx('Tie the request to the test it supports, so the files appear with that test’s working papers.')}>
          <SelectField className="w-full" value={f.scope_item_id} onChange={set('scope_item_id')}
            options={[{ value: '', label: tx('Not tied to one item') }, ...audit.scope.map((x) => ({ value: x.id, label: x.title }))]} />
        </Field>
      </FormSection>

      <FormSection title={tx('Who and when')} description={tx(
        'Ask the person who owns the system or process, not whoever is easiest to reach. A due date lets RISYS show the request as overdue.'
      )}>
        <div className="fp-grid-2">
          <Field label={tx('Asked of')} required>
            <SelectField className="w-full" value={f.requested_from} onChange={set('requested_from')}
              options={[{ value: '', label: tx('Choose a person') }, ...assignable(members)]} />
          </Field>
          <Field label={tx('Due')}><DateField value={f.due_date} onChange={set('due_date')} /></Field>
        </div>
      </FormSection>
    </FormPage>
  )
}
