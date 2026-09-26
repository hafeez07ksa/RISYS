import { useState } from 'react'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuditPage, Field, SubmitButton } from './parts'
import { useFrameworkRequirements, requirementOptions, useOrgControls, RequirementText } from './scopeData'
import { tx } from '@/lib/i18n'

/* /app/audits/:id/scope/new — put a requirement and/or a control in scope and
 * write down how it will be tested, before testing starts. */
export function ScopeItemFormPage() {
  const { audit, e, canManage, locked, navigate, toTab } = useAuditPage()
  const framework = e?.framework
  const reqs = useFrameworkRequirements(framework)
  const controls = useOrgControls()
  const [f, setF] = useState({ requirement_id: '', control_id: '', title: '', test_procedure: '' })
  const [titleTouched, setTitleTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!canManage || locked) {
    return <PageNotFound title={tx('Scope cannot be changed')} back={{ label: e.ref, onClick: () => toTab('scope') }}>
      {locked ? tx('This engagement is closed.') : tx('Only the audit team changes the scope.')}</PageNotFound>
  }

  const inScope = new Set(audit.scope.map((x) => x.requirement_id).filter(Boolean))
  const pickReq = (id) => {
    const r = reqs.find((x) => x.requirement_id === id)
    setF((v) => ({ ...v, requirement_id: id, title: titleTouched ? v.title : (r ? r.requirement_text.slice(0, 120) : '') }))
  }
  const pickControl = (id) => {
    const c = controls.find((x) => x.id === id)
    setF((v) => ({ ...v, control_id: id, title: titleTouched || v.requirement_id ? v.title : (c ? c.name : '') }))
  }
  const save = async () => {
    if (!f.title.trim()) { setError(tx('Give the item a short title.')); return }
    setBusy(true); setError('')
    try {
      await audit.addScopeItem({
        title: f.title.trim(), test_procedure: f.test_procedure.trim() || null,
        framework: f.requirement_id ? framework : null, requirement_id: f.requirement_id || null,
        control_id: f.control_id || null,
      })
      toTab('scope')
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <FormPage
      title={tx('Add to scope')}
      description={`${e.ref} — ${e.title}`}
      back={{ label: e.ref, onClick: () => toTab('scope') }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={() => toTab('scope')}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Add to scope')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('What is being tested')} description={tx(
        'The requirement, the control, or both — and how the item will be named in the report.'
      )}
        tips={[
          tx('Usual case: pick both. The requirement is what the regulator demands; the control is what your organisation actually runs to meet it.'),
          tx('One scope item should test one thing. If the requirement has several parts, add an item per part so each gets its own result.'),
          tx('Requirements already in scope are marked in the list, so you do not test the same clause twice.'),
          tx('The title is what appears in the report — keep it short and concrete: “MFA enforced for all users”.'),
        ]}>
        {framework && (
          <Field label={`${framework} ${tx('requirement')}`}>
            <SelectField className="w-full" value={f.requirement_id} onChange={(ev) => pickReq(ev.target.value)}
              searchPlaceholder={tx('Search by number or wording…')}
              options={requirementOptions(reqs, { inScope })} />
          </Field>
        )}
        <RequirementText reqs={reqs} id={f.requirement_id} framework={framework} />
        <Field label={tx('Organisation control')} help={controls.length ? undefined : tx('No controls in the library yet — add them under Controls to test them here.')}>
          <SelectField className="w-full" value={f.control_id} onChange={(ev) => pickControl(ev.target.value)}
            options={[{ value: '', label: tx('None') }, ...controls.map((c) => ({ value: c.id, label: `${c.control_id ?? ''} ${c.name}`.trim() }))]} />
        </Field>
        <Field label={tx('Title')} required help={tx('How the item will be named in the report. Keep it short and specific.')}>
          <input className="risys-input" value={f.title} onChange={(ev) => { setTitleTouched(true); setF({ ...f, title: ev.target.value }) }}
                 placeholder={tx('e.g. MFA enforced for all users')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Test procedure')} description={tx(
        'How this item will be tested, written before the testing starts.'
      )}
        tips={[
          tx('Write it before testing. A procedure written afterwards tends to describe whatever you happened to find.'),
          tx('Say four things: the technique, the population, how many you will select, and what makes an item pass.'),
          tx('Prefer testing the whole population when the data allows it (all leavers, all privileged accounts) — it is stronger than any sample.'),
          tx('For samples, 25 items is a common starting point for a frequently operating control; choose them at random, not the convenient ones.'),
        ]}
        note={tx('A colleague should be able to repeat your test from this text alone and reach the same result.')}>
        <Field label={tx('Procedure')}>
          <textarea className="risys-input" rows={5} value={f.test_procedure} onChange={(ev) => setF({ ...f, test_procedure: ev.target.value })}
                    placeholder={tx('Obtain the list of all enabled user accounts. Select 25 at random. For each, inspect the registered authentication methods in Entra ID and confirm a second factor is registered and required by Conditional Access.')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
