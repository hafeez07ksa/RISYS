import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCheck, FilePlus2, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { TEST_RESULTS } from '@/hooks/useAudits'
import { fmtDateTime } from '@/lib/reports/models'
import { useAuditPage, Field, SubmitButton, ResultBadge, personName } from './parts'
import { EvidenceList } from './EvidenceList'
import { useFrameworkRequirements, RequirementText } from './scopeData'
import { tx } from '@/lib/i18n'

const n = (v) => (v === '' || v == null ? null : Number(v))

/* /app/audits/:id/scope/:itemId — perform and record one test.
 *
 * The tester writes the result; a different member of the audit team reviews
 * it (the database refuses a self-review). Changing the result clears any
 * earlier review. A failed test leads straight to raising a finding. */
export function ScopeTestPage() {
  const { itemId } = useParams()
  const { user } = useAuth()
  const { id, audit, e, members, canManage, locked, navigate, toTab } = useAuditPage()
  const item = audit.scope.find((x) => x.id === itemId)
  const reqs = useFrameworkRequirements(item?.requirement_id ? item.framework : null)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!item || f) return
    setF({
      test_procedure: item.test_procedure ?? '', population_size: item.population_size ?? '', sample_size: item.sample_size ?? '',
      exceptions_found: item.exceptions_found ?? '', result: item.result, result_notes: item.result_notes ?? '',
    })
  }, [item, f])

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!item || !f) {
    return <PageNotFound title={tx('Scope item not found')} back={{ label: e.ref, onClick: () => toTab('scope') }}>
      {tx('It may have been removed from scope.')}</PageNotFound>
  }

  const editable = canManage && !locked
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const canReview = editable && item.result !== 'not_tested' && !item.reviewed_by && item.tested_by !== user.id
  const failed = ['ineffective', 'partially_effective'].includes(item.result)
  const linkedFindings = audit.findings.filter((x) => x.scope_item_id === item.id)

  const save = async () => {
    if (n(f.sample_size) != null && n(f.population_size) != null && n(f.sample_size) > n(f.population_size)) { setError(tx('The sample is larger than the population.')); return }
    if (n(f.exceptions_found) != null && n(f.sample_size) != null && n(f.exceptions_found) > n(f.sample_size)) { setError(tx('More exceptions than items sampled.')); return }
    if (f.result !== 'not_tested' && f.result !== 'not_applicable' && !f.result_notes.trim()) { setError(tx('Say what was found — the result needs its facts.')); return }
    setBusy('save'); setError('')
    try {
      await audit.updateScopeItem(item.id, {
        test_procedure: f.test_procedure.trim() || null, population_size: n(f.population_size), sample_size: n(f.sample_size),
        exceptions_found: n(f.exceptions_found), result: f.result, result_notes: f.result_notes.trim() || null,
      })
      toTab('scope')
    } catch (err) { setError(err.message); setBusy('') }
  }
  const review = async () => {
    setBusy('review'); setError('')
    try { await audit.reviewScopeItem(item.id) } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const subtitle = [item.requirement_id && `${item.framework ?? ''} ${item.requirement_id}`, item.control && `${tx('Control')} ${item.control.control_id ?? ''} ${item.control.name}`]
    .filter(Boolean).join(' · ')

  return (
    <FormPage
      title={item.title}
      meta={<ResultBadge v={item.result} />}
      description={subtitle || `${e.ref} — ${e.title}`}
      back={{ label: e.ref, onClick: () => toTab('scope') }}
      onSubmit={editable ? save : undefined}
      error={error}
      note={editable ? tx('Changing the result clears any earlier review.') : undefined}
      footer={editable ? <>
        <button className="btn-secondary" disabled={!!busy} onClick={() => toTab('scope')}>{tx('Cancel')}</button>
        <SubmitButton busy={busy === 'save'} onClick={save}>{tx('Save result')}</SubmitButton>
      </> : <button className="btn-secondary" onClick={() => toTab('scope')}>{tx('Back to scope')}</button>}
    >
      <FormSection title={tx('Criteria')} description={tx('What the control is tested against. The requirement text is the regulator’s own wording.')}
        tips={[
          tx('Test against the wording shown here, not your memory of it — the sub-clauses often carry the real requirement.'),
          tx('If the requirement does not apply to this organisation, use the Not applicable result and say why, rather than passing it.'),
        ]}>
        {item.requirement_id
          ? <RequirementText reqs={reqs} id={item.requirement_id} framework={item.framework} />
          : <p className="rp-text" style={{ color: 'var(--text-3)' }}>{tx('Not tied to a framework requirement.')}</p>}
        {item.control && <p className="rp-text">{tx('Organisation control')}: {item.control.control_id ?? ''} {item.control.name}</p>}
      </FormSection>

      <FormSection title={tx('Test procedure')} description={tx('What the tester did. If the plan changed during fieldwork, update it so the working papers match what was actually done.')}
        tips={[
          tx('If the plan changed during fieldwork, update it here so the working papers match what was actually done.'),
          tx('Never edit the procedure to match a result you have already found. That is the one change an external reviewer looks for.'),
        ]}>
        <Field label={tx('Procedure')}>
          <textarea className="risys-input" rows={4} value={f.test_procedure} onChange={set('test_procedure')} disabled={!editable} />
        </Field>
      </FormSection>

      <FormSection title={tx('Sample')} description={tx(
        'What you actually checked, in numbers. This is what turns an impression into a testable fact in the report.'
      )}
        tips={[
          tx('Population is everything the test could have picked from — get it from a complete export, not a list someone hands you.'),
          tx('Sample is how many you checked; exceptions are how many of those failed.'),
          tx('“7 of 25 failed” can be argued with. “Some accounts failed” cannot be used at all.'),
          tx('Tested the whole population? Put the same number in both boxes (61 of 61) so the report shows it was complete.'),
        ]}>
        <div className="fp-grid-3">
          <Field label={tx('Population')}><input className="risys-input" type="number" min="0" value={f.population_size} onChange={set('population_size')} disabled={!editable} /></Field>
          <Field label={tx('Sample')}><input className="risys-input" type="number" min="0" value={f.sample_size} onChange={set('sample_size')} disabled={!editable} /></Field>
          <Field label={tx('Exceptions')}><input className="risys-input" type="number" min="0" value={f.exceptions_found} onChange={set('exceptions_found')} disabled={!editable} /></Field>
        </div>
      </FormSection>

      <FormSection title={tx('Result')} description={tx(
        'Your conclusion on this one item, and the facts behind it. It feeds the numbers and the opinion in the audit report.'
      )}
        tips={[
          tx('Effective: no exceptions, or none that matter. Partially effective: the control works with gaps. Ineffective: it does not achieve its purpose.'),
          tx('Judge design and operation separately. A control nobody designed fails even if nothing has gone wrong yet.'),
          tx('Few exceptions can still mean ineffective — if no policy enforces the control at all, the gap is in the design.'),
          tx('Write the facts and the numbers in “What was found”; save the judgement for the finding.'),
        ]}
        note={tx('Changing the result clears any earlier review, because the reviewer approved the old conclusion.')}>
        <Field label={tx('Result')}>
          <SelectField className="w-full" value={f.result} onChange={set('result')} options={TEST_RESULTS} disabled={!editable} />
        </Field>
        <Field label={tx('What was found')} required={f.result !== 'not_tested' && f.result !== 'not_applicable'}>
          <textarea className="risys-input" rows={4} value={f.result_notes} onChange={set('result_notes')} disabled={!editable}
                    placeholder={tx('7 of 25 sampled accounts had no MFA method registered…')} />
        </Field>
        {failed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--r)' }}>
            <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', flex: 1, minWidth: 220 }}>
              {linkedFindings.length
                ? `${tx('Findings raised from this test')}: ${linkedFindings.map((x) => x.ref).join(', ')}`
                : tx('A test that is not effective normally becomes a finding, so management is asked to fix it.')}
            </span>
            {editable && (
              <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/findings/new?scope=${item.id}`)}>
                <FilePlus2 size={13} /> {tx('Raise a finding from this test')}</button>
            )}
          </div>
        )}
      </FormSection>

      <FormSection title={tx('Working papers')} description={tx(
        'The evidence behind the result, kept with the engagement.'
      )}
        tips={[
          tx('Attach what a stranger would need to reach your conclusion: the export, the screenshot, the sample list with your selections marked.'),
          tx('Screenshots should show the system, the setting and the date — a cropped fragment proves little.'),
          tx('Each file is fingerprinted (SHA-256) at upload, so it can be shown later to be unchanged.'),
        ]}>
        <EvidenceList audit={audit} files={audit.files.filter((x) => x.scope_item_id === item.id)} locked={locked}
          canUpload={editable} onUpload={(file) => audit.uploadEvidence(file, { scopeItemId: item.id })} />
      </FormSection>

      <FormSection title={tx('Review')} description={tx(
        'The second pair of eyes on this test. Both names appear against the item in the audit report.'
      )}
        tips={[
          tx('The reviewer checks that the evidence supports the result, the sample was drawn properly, and the procedure was followed.'),
          tx('RISYS refuses a review by the person who tested — the report shows two names for every tested item.'),
          tx('If the reviewer disagrees, fix the result or the evidence rather than the review.'),
        ]}>
        <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, margin: 0, fontSize: 'var(--t-sm)' }}>
          <dt style={{ color: 'var(--text-3)' }}>{tx('Tested by')}</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }}>{item.tested_by ? `${personName(members, item.tested_by)}, ${fmtDateTime(item.tested_at)}` : '—'}</dd>
          <dt style={{ color: 'var(--text-3)' }}>{tx('Reviewed by')}</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }}>{item.reviewed_by ? `${personName(members, item.reviewed_by)}, ${fmtDateTime(item.reviewed_at)}` : tx('Not reviewed')}</dd>
        </dl>
        {canReview && (
          <div><button className="btn-secondary" disabled={!!busy} onClick={review}><CheckCheck size={13} /> {tx('Mark reviewed')}</button></div>
        )}
        {editable && item.result !== 'not_tested' && !item.reviewed_by && item.tested_by === user.id && (
          <p className="field-help" style={{ margin: 0 }}>{tx('You performed this test, so another member of the audit team must review it.')}</p>
        )}
      </FormSection>

      {editable && (
        <FormSection title={tx('Remove from scope')} description={tx('Takes the item out of the engagement, with its test result and review.')}
        tips={[
          tx('Remove an item only if it should never have been in scope. If it was tested and failed, keep it and explain the result.'),
          tx('Dropping items that produced bad results is scope manipulation, and the audit log records the removal.'),
        ]}>
          <div>
            <InlineConfirm variant="panel" triggerClassName="btn-secondary"
              message={`${tx('Remove')} “${item.title}” ${tx('from scope?')}`}
              detail={tx('The test result and its review are deleted.')}
              confirmLabel={tx('Remove from scope')}
              onConfirm={async () => { await audit.deleteScopeItem(item.id); toTab('scope') }}>
              <Trash2 size={13} /> {tx('Remove from scope')}
            </InlineConfirm>
          </div>
        </FormSection>
      )}
    </FormPage>
  )
}
