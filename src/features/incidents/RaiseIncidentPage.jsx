import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { SEVERITIES, STATUSES } from '@/lib/incidents'
import { SLA_DEFAULTS } from '@/lib/sla'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection } from '@/components/ui/FormPage'
import { Field, SubmitButton } from '@/features/audits/parts'
import { logAudit, AUDIT } from '@/lib/audit'
import { tx } from '@/lib/i18n'

/* /app/incidents/new — log an incident by hand (Jira and Defender raise theirs automatically). */
export function RaiseIncidentPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', status: 'open', assigned_to: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const back = { label: tx('Incidents'), onClick: () => navigate('/app/incidents') }

  const save = async () => {
    if (!form.title.trim()) { setError(tx('Title is required')); return }
    setBusy(true); setError('')
    try {
      const { data, error: err } = await supabase.from('incidents').insert({
        org_id: organization.id, connector_id: 'manual',
        title: form.title.trim(), description: form.description.trim() || null,
        severity: form.severity, status: form.status, assigned_to: form.assigned_to || null,
      }).select('id').single()
      if (err) throw err
      await logAudit(organization.id, AUDIT.INC_CREATED, 'incident', data?.id ?? null, form.title.trim(), { severity: form.severity, source: 'manual' })
      navigate(data?.id ? `/app/incidents/${data.id}` : '/app/incidents')
    } catch (err) { setError(err.message || tx('Failed to create incident')); setBusy(false) }
  }

  const sla = SLA_DEFAULTS?.[form.severity]

  return (
    <FormPage
      title={tx('Raise incident')}
      description={tx('Log an incident by hand. Incidents from Jira and high-severity Defender alerts are raised automatically.')}
      back={back}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={back.onClick}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Raise incident')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('What happened')} description={tx('Record what is known now; it can be updated as the investigation goes on. Note when it was noticed and what is affected.')}>
        <Field label={tx('Title')} required>
          <input className="risys-input" value={form.title} onChange={set('title')} autoFocus placeholder={tx('e.g. Unauthorized access attempt on production server')} />
        </Field>
        <Field label={tx('Description')}>
          <textarea className="risys-input" rows={5} value={form.description} onChange={set('description')}
                    placeholder={tx('Describe what happened, impact, and any initial findings...')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Classification')} description={tx(
        'Severity sets the response deadline (SLA). NCA ECC 2-13 expects incidents to be classified; if personal data is affected, PDPL Art. 24 notification may apply within 72 hours.'
      )}>
        <div className="fp-grid-2">
          <Field label={tx('Severity')} help={sla ? `${tx('Default response target')}: ${sla.label}` : undefined}>
            <SelectField className="w-full" value={form.severity} onChange={set('severity')} options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
          <Field label={tx('Status')}>
            <SelectField className="w-full" value={form.status} onChange={set('status')} options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
        </div>
        <Field label={tx('Assign to')}>
          <SelectField className="w-full" value={form.assigned_to} onChange={set('assigned_to')}
            options={[{ value: '', label: tx('Unassigned') }, ...members.map((m) => ({ value: m.user_id, label: m.full_name || m.email || m.user_id?.slice(0, 8), description: m.role }))]} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
