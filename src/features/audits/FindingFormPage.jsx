import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { FINDING_RATINGS } from '@/hooks/useAudits'
import { useAuditPage, Field, SubmitButton, FindingStatusBadge, assignable } from './parts'
import { useFrameworkRequirements, requirementOptions, RequirementText } from './scopeData'
import { tx } from '@/lib/i18n'

const EMPTY = {
  title: '', rating: 'medium', condition: '', criteria: '', cause: '', effect: '', recommendation: '',
  requirement_id: '', scope_item_id: '', response_owner: '', due_date: '',
}

const RATING_HELP = {
  high: tx('A weakness that exposes the organisation to significant risk and needs prompt action.'),
  medium: tx('A weakness to be remediated within the agreed plan.'),
  low: tx('An improvement with limited exposure.'),
  observation: tx('Good-practice advice. Not a control failure.'),
}

/* /app/audits/:id/findings/new[?scope=<itemId>]  and  /findings/:findingId/edit
 *
 * A finding is written in five parts — condition, criteria, cause, effect,
 * recommendation — the structure the IIA standards and every audit reader
 * expect. It stays a draft, visible only to the audit team, until it is
 * issued to management. Opened from a failed test (?scope=), it starts
 * pre-filled from that test. */
export function FindingFormPage() {
  const { findingId } = useParams()
  const [params] = useSearchParams()
  const { id, audit, e, members, canManage, locked, navigate, toTab } = useAuditPage()
  const initial = findingId ? audit.findings.find((x) => x.id === findingId) : null
  const reqs = useFrameworkRequirements(e?.framework)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (f || audit.loading) return
    if (findingId) {
      if (!initial) return
      setF({ ...EMPTY, ...Object.fromEntries(Object.entries(initial).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) })
      return
    }
    const item = audit.scope.find((x) => x.id === params.get('scope'))
    if (!item) { setF(EMPTY); return }
    const req = reqs.find((r) => r.requirement_id === item.requirement_id)
    setF({
      ...EMPTY,
      title: '',
      scope_item_id: item.id,
      requirement_id: item.requirement_id ?? '',
      condition: item.result_notes ?? '',
      criteria: req ? `${e.framework} ${req.requirement_id}: ${req.requirement_text}` : '',
      rating: item.result === 'ineffective' ? 'high' : 'medium',
    })
  }, [f, audit.loading, audit.scope, findingId, initial, params, reqs, e])

  // The criteria pre-fill needs the requirement text, which may arrive after the form is set up.
  useEffect(() => {
    if (!f || findingId || f.criteria || !f.requirement_id) return
    const req = reqs.find((r) => r.requirement_id === f.requirement_id)
    if (req) setF((v) => ({ ...v, criteria: `${e.framework} ${req.requirement_id}: ${req.requirement_text}` }))
  }, [reqs]) // eslint-disable-line react-hooks/exhaustive-deps

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (findingId && !initial) return <PageNotFound title={tx('Finding not found')} back={{ label: e.ref, onClick: () => toTab('findings') }} />
  if (!canManage || locked || (initial && ['closed', 'risk_accepted'].includes(initial.status))) {
    return <PageNotFound title={tx('This finding cannot be edited')} back={{ label: e.ref, onClick: () => toTab('findings') }}>
      {locked ? tx('This engagement is closed.') : !canManage ? tx('Only the audit team writes findings.') : tx('The finding is closed.')}</PageNotFound>
  }
  if (!f) return <PageLoading />

  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const isDraft = !initial || initial.status === 'draft'
  const leave = () => (initial ? navigate(`/app/audits/${id}/findings/${initial.id}`) : toTab('findings'))

  const pickScope = (sid) => {
    const s = audit.scope.find((x) => x.id === sid)
    setF((v) => ({ ...v, scope_item_id: sid, requirement_id: v.requirement_id || s?.requirement_id || '' }))
  }
  const payload = () => ({
    title: f.title.trim(), rating: f.rating,
    condition: f.condition.trim() || null, criteria: f.criteria.trim() || null, cause: f.cause.trim() || null,
    effect: f.effect.trim() || null, recommendation: f.recommendation.trim() || null,
    framework: f.requirement_id ? e.framework : null, requirement_id: f.requirement_id.trim() || null,
    scope_item_id: f.scope_item_id || null, response_owner: f.response_owner || null, due_date: f.due_date || null,
  })
  const save = async (issue) => {
    if (!f.title.trim()) { setError(tx('Give the finding a title.')); return }
    if (issue && (!f.condition.trim() || !f.recommendation.trim())) { setError(tx(
      'A finding needs at least a condition and a recommendation before it is issued.'
    )); return }
    if (issue && !f.response_owner) { setError(tx('Choose who in management will respond.')); return }
    setBusy(issue ? 'issue' : 'save'); setError('')
    try {
      const p = payload()
      if (issue && isDraft) p.status = 'open'
      let targetId = initial?.id
      if (initial) await audit.updateFinding(initial.id, p)
      else targetId = (await audit.addFinding(p))?.id
      navigate(targetId ? `/app/audits/${id}/findings/${targetId}` : `/app/audits/${id}?tab=findings`)
    } catch (err) { setError(err.message); setBusy('') }
  }

  return (
    <FormPage
      title={initial ? `${tx('Edit')} ${initial.ref}` : tx('New finding')}
      meta={initial && <FindingStatusBadge v={initial.status} />}
      description={isDraft
        ? tx('Saved as a draft until issued. Drafts are visible only to the audit team and never appear in reports.')
        : tx('This finding has been issued. Changes are visible to the finding owner.')}
      back={{ label: initial ? initial.ref : e.ref, onClick: leave }}
      onSubmit={() => save(false)}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={!!busy} onClick={leave}>{tx('Cancel')}</button>
        {isDraft && <button className="btn-secondary" disabled={!!busy} onClick={() => save(false)}>{tx('Save draft')}</button>}
        <SubmitButton busy={busy === 'issue' || (!isDraft && busy === 'save')} onClick={() => save(isDraft)}>
          {isDraft ? tx('Issue to management') : tx('Save changes')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Headline')} description={tx(
        'The title states the problem, not the topic: “MFA is not enforced by policy”, not “MFA”. The rating says how much it matters.'
      )}>
        <Field label={tx('Title')} required>
          <input className="risys-input" value={f.title} onChange={set('title')} autoFocus placeholder={tx('e.g. MFA is not enforced by policy')} />
        </Field>
        <Field label={tx('Rating')} help={RATING_HELP[f.rating]}>
          <SelectField className="w-full" value={f.rating} onChange={set('rating')} options={FINDING_RATINGS} />
        </Field>
      </FormSection>

      <FormSection title={tx('Condition')} description={tx(
        'What you found — facts only, with the numbers from the test. Someone who was not there should be able to check it.'
      )}>
        <Field label={tx('Condition — what we found')} required>
          <textarea className="risys-input" rows={4} value={f.condition} onChange={set('condition')}
                    placeholder={tx('7 of 25 sampled enabled accounts (28%) had no second authentication factor registered. No Conditional Access policy requires MFA for all users; the only policy in place covers administrators.')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Criteria')} description={tx(
        'What should be the case: the requirement, policy or standard the condition falls short of. The gap between condition and criteria is the finding.'
      )}>
        {e.framework && (
          <Field label={`${e.framework} ${tx('requirement')}`}>
            <SelectField className="w-full" value={f.requirement_id} onChange={set('requirement_id')}
              searchPlaceholder={tx('Search by number or wording…')} options={requirementOptions(reqs)} />
          </Field>
        )}
        <RequirementText reqs={reqs} id={f.requirement_id} framework={e.framework} />
        <Field label={tx('Criteria — what is required')}>
          <textarea className="risys-input" rows={3} value={f.criteria} onChange={set('criteria')} placeholder={tx('The requirement or policy the condition falls short of.')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Cause and effect')} description={tx(
        'Cause is why it happened — fix the cause and the problem does not come back. Effect is why it matters: the risk to the organisation if nothing changes.'
      )}>
        <Field label={tx('Cause')}>
          <textarea className="risys-input" rows={3} value={f.cause} onChange={set('cause')}
                    placeholder={tx('MFA was rolled out by invitation, not enforced by policy, and nobody owns tracking registration.')} />
        </Field>
        <Field label={tx('Effect — why it matters')}>
          <textarea className="risys-input" rows={3} value={f.effect} onChange={set('effect')}
                    placeholder={tx('A stolen or guessed password is enough to sign in to these accounts, including to email and files.')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Recommendation')} description={tx(
        'What management should do. Aim it at the cause, make it specific enough to check later, and leave the “how” to the people who run the system.'
      )}>
        <Field label={tx('Recommendation')} required>
          <textarea className="risys-input" rows={3} value={f.recommendation} onChange={set('recommendation')}
                    placeholder={tx('Enforce MFA for all users through a Conditional Access policy, and assign an owner to report registration coverage monthly.')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Ownership')} description={tx(
        'The manager who will answer for fixing it — they respond to the finding and report progress. Agree the due date with them; it is what “overdue” is measured against.'
      )}>
        <div className="fp-grid-2">
          <Field label={tx('Management owner')} required={isDraft}>
            <SelectField className="w-full" value={f.response_owner} onChange={set('response_owner')}
              options={[{ value: '', label: tx('Choose a person') }, ...assignable(members)]} />
          </Field>
          <Field label={tx('Remediation due')}><DateField value={f.due_date} onChange={set('due_date')} /></Field>
        </div>
        <Field label={tx('Raised from test')}>
          <SelectField className="w-full" value={f.scope_item_id} onChange={(ev) => pickScope(ev.target.value)}
            options={[{ value: '', label: tx('None') }, ...audit.scope.map((x) => ({ value: x.id, label: x.title }))]} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
