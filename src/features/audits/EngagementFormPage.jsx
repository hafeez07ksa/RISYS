import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { ROLE_SETS } from '@/lib/roles'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useAudits, useAudit, AUDIT_TYPES } from '@/hooks/useAudits'
import { Field, SubmitButton } from './parts'
import { tx } from '@/lib/i18n'

const FRAMEWORKS = [
  { value: '', label: tx('Not tied to a framework') },
  // Frameworks whose requirements are in framework_requirements_v, so scope
  // items and findings can point at a clause. Add others as they are loaded.
  { value: 'NCA ECC', label: 'NCA ECC-2:2024' },
]

const EMPTY = {
  title: '', audit_type: 'internal', framework: 'NCA ECC', objective: '', scope_summary: '', methodology: '',
  period_start: '', period_end: '', planned_start: '', planned_end: '', lead_auditor_id: '',
}

/* /app/audits/new and /app/audits/:id/edit — the engagement plan.
 * Opinion and stage are set elsewhere (the opinion page and the stage button). */
export function EngagementFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const perms = usePermissions()
  const { members } = usePeople()
  const { createEngagement } = useAudits()
  const audit = useAudit(id)
  const e = audit.engagement

  const [f, setF] = useState(EMPTY)
  const [loaded, setLoaded] = useState(!editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing || !e || loaded) return
    setF({ ...EMPTY, ...Object.fromEntries(Object.entries(e).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) })
    setLoaded(true)
  }, [editing, e, loaded])

  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev?.target ? ev.target.value : ev }))
  const leads = members.filter((m) => ROLE_SETS.auditWriter.includes(m.role))
  const back = () => navigate(editing ? `/app/audits/${id}` : '/app/audits')

  const save = async () => {
    if (!f.title.trim()) { setError(tx('Give the engagement a title.')); return }
    if (f.period_start && f.period_end && f.period_end < f.period_start) { setError(tx('The audit period ends before it starts.')); return }
    if (f.planned_start && f.planned_end && f.planned_end < f.planned_start) { setError(tx('Fieldwork ends before it starts.')); return }
    setBusy(true); setError('')
    const values = {
      title: f.title.trim(), audit_type: f.audit_type, framework: f.framework || null,
      objective: f.objective.trim() || null, scope_summary: f.scope_summary.trim() || null, methodology: f.methodology.trim() || null,
      period_start: f.period_start || null, period_end: f.period_end || null,
      planned_start: f.planned_start || null, planned_end: f.planned_end || null,
      lead_auditor_id: f.lead_auditor_id || null,
    }
    try {
      if (editing) { await audit.updateEngagement(values); navigate(`/app/audits/${id}`) }
      else { const created = await createEngagement(values); navigate(`/app/audits/${created.id}`) }
    } catch (err) { setError(err.message); setBusy(false) }
  }

  if (!perms.canManageAudits) {
    return <PageNotFound title={tx('Audit team only')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }}>
      {tx('Planning an engagement needs the audit, risk, compliance or administrator role.')}</PageNotFound>
  }
  if (editing && audit.loading) return <PageLoading />
  if (editing && (audit.notFound || !e)) {
    return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }}>
      {tx('It may have been deleted, or it belongs to another organisation.')}</PageNotFound>
  }

  return (
    <FormPage
      title={editing ? `${tx('Edit plan')} — ${e.ref}` : tx('Plan an audit engagement')}
      description={tx('The plan is the contract for the audit: what will be concluded on, what is covered, over which period and how.')}
      back={{ label: editing ? e.ref : tx('Audits'), onClick: back }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{editing ? tx('Save changes') : tx('Create engagement')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Engagement')} description={tx(
        'A short title the business will recognise, and the kind of audit. The framework decides which requirements can be put in scope.'
      )}>
        <Field label={tx('Title')} required>
          <input className="risys-input" value={f.title} onChange={set('title')} autoFocus
                 placeholder={tx('e.g. Identity and access management controls review')} />
        </Field>
        <div className="fp-grid-3">
          <Field label={tx('Type')}>
            <SelectField className="w-full" value={f.audit_type} onChange={set('audit_type')} options={AUDIT_TYPES} />
          </Field>
          <Field label={tx('Framework')}>
            <SelectField className="w-full" value={f.framework} onChange={set('framework')} options={FRAMEWORKS} />
          </Field>
          <Field label={tx('Lead auditor')}>
            <SelectField className="w-full" value={f.lead_auditor_id} onChange={set('lead_auditor_id')}
              options={[{ value: '', label: tx('Not assigned') }, ...leads.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]} />
          </Field>
        </div>
      </FormSection>

      <FormSection title={tx('Objective')} description={tx(
        'One sentence the audit will answer. The overall opinion at the end is the answer to exactly this question, so write it as something that can be concluded on.'
      )}>
        <Field label={tx('Objective')}>
          <textarea className="risys-input" rows={3} value={f.objective} onChange={set('objective')}
                    placeholder={tx('To assess whether the controls required by NCA ECC 2-2 are designed appropriately and operating effectively.')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Scope and approach')} description={tx(
        'Name the systems, sites and processes covered — and what is deliberately left out, so nobody reads the opinion as covering it. The approach says how evidence will be gathered.'
      )}>
        <Field label={tx('Scope')} help={tx('Systems, locations and processes in scope — and what is explicitly out of scope.')}>
          <textarea className="risys-input" rows={3} value={f.scope_summary} onChange={set('scope_summary')}
                    placeholder={tx('In scope: Microsoft Entra ID tenant, privileged access process, joiner-mover-leaver. Out of scope: on-premises Active Directory.')} />
        </Field>
        <Field label={tx('Approach')}>
          <textarea className="risys-input" rows={3} value={f.methodology} onChange={set('methodology')}
                    placeholder={tx('Inquiry, inspection of configuration, re-performance on a sample…')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Dates')} description={tx(
        'The period under audit is the time the evidence must come from — for example the last quarter. Fieldwork is when the testing itself takes place.'
      )}>
        <div className="fp-grid-2">
          <Field label={tx('Period under audit — from')}><DateField value={f.period_start} onChange={set('period_start')} /></Field>
          <Field label={tx('to')}><DateField value={f.period_end} onChange={set('period_end')} /></Field>
          <Field label={tx('Fieldwork — from')}><DateField value={f.planned_start} onChange={set('planned_start')} /></Field>
          <Field label={tx('to')}><DateField value={f.planned_end} onChange={set('planned_end')} /></Field>
        </div>
      </FormSection>
    </FormPage>
  )
}
