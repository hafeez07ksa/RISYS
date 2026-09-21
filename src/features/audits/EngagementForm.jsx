import { useState } from 'react'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { ROLE_SETS } from '@/lib/roles'
import { AUDIT_TYPES } from '@/hooks/useAudits'
import { Dialog, Field, Grid, SubmitButton, ErrorText } from './parts'

const FRAMEWORKS = [
  { value: '', label: 'Not tied to a framework' },
  // Frameworks whose requirements are in framework_requirements_v, so scope
  // items and findings can point at a clause. Add others as they are loaded.
  { value: 'NCA ECC', label: 'NCA ECC-2:2024' },
]

/** Create or edit an engagement's plan. Opinion and stage are set elsewhere. */
export function EngagementForm({ open, onClose, initial, members, onSave }) {
  const [f, setF] = useState(() => ({
    title: '', audit_type: 'internal', framework: 'NCA ECC', objective: '', scope_summary: '', methodology: '',
    period_start: '', period_end: '', planned_start: '', planned_end: '', lead_auditor_id: '',
    ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ''])),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const leads = members.filter((m) => ROLE_SETS.auditWriter.includes(m.role))

  const save = async () => {
    if (!f.title.trim()) { setError('Give the engagement a title.'); return }
    if (f.period_start && f.period_end && f.period_end < f.period_start) { setError('The audit period ends before it starts.'); return }
    setBusy(true); setError('')
    try {
      await onSave({
        title: f.title.trim(), audit_type: f.audit_type, framework: f.framework || null,
        objective: f.objective.trim() || null, scope_summary: f.scope_summary.trim() || null, methodology: f.methodology.trim() || null,
        period_start: f.period_start || null, period_end: f.period_end || null,
        planned_start: f.planned_start || null, planned_end: f.planned_end || null,
        lead_auditor_id: f.lead_auditor_id || null,
      })
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} width={680}
      title={initial?.id ? `Edit ${initial.ref}` : 'New audit engagement'}
      subtitle="The plan: what is being audited, why, over which period and how."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <SubmitButton busy={busy} onClick={save}>{initial?.id ? 'Save changes' : 'Create engagement'}</SubmitButton>
      </>}>
      <Field label="Title" required>
        <input className="risys-input" value={f.title} onChange={set('title')} autoFocus
               placeholder="e.g. Identity and access management controls review" />
      </Field>
      <Grid cols={3}>
        <Field label="Type">
          <SelectField className="w-full" value={f.audit_type} onChange={set('audit_type')} options={AUDIT_TYPES} />
        </Field>
        <Field label="Framework">
          <SelectField className="w-full" value={f.framework} onChange={set('framework')} options={FRAMEWORKS} />
        </Field>
        <Field label="Lead auditor">
          <SelectField className="w-full" value={f.lead_auditor_id} onChange={set('lead_auditor_id')}
            options={[{ value: '', label: 'Not assigned' }, ...leads.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]} />
        </Field>
      </Grid>
      <Field label="Objective" help="What the audit will conclude on. The opinion answers this.">
        <textarea className="risys-input" rows={2} value={f.objective} onChange={set('objective')}
                  placeholder="To assess whether the controls required by NCA ECC 2-2 are designed appropriately and operating effectively." />
      </Field>
      <Field label="Scope" help="Systems, locations and processes in scope — and what is explicitly out of scope.">
        <textarea className="risys-input" rows={2} value={f.scope_summary} onChange={set('scope_summary')} />
      </Field>
      <Field label="Approach">
        <textarea className="risys-input" rows={2} value={f.methodology} onChange={set('methodology')}
                  placeholder="Inquiry, inspection of configuration, re-performance on a sample…" />
      </Field>
      <Grid cols={2}>
        <Field label="Period under audit — from"><DateField value={f.period_start} onChange={set('period_start')} /></Field>
        <Field label="to"><DateField value={f.period_end} onChange={set('period_end')} /></Field>
        <Field label="Fieldwork — from"><DateField value={f.planned_start} onChange={set('planned_start')} /></Field>
        <Field label="to"><DateField value={f.planned_end} onChange={set('planned_end')} /></Field>
      </Grid>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}
