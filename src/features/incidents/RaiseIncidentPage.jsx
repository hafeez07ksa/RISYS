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
      <FormSection title={tx('What happened')} description={tx('What is known right now. The record can be updated as the investigation goes on.')}
        tips={[
          tx('Raise it early. An incident record with partial facts beats a perfect one written next week.'),
          tx('In the description, note when it was noticed, how, what is affected, and what has been done so far.'),
          tx('Keep facts and speculation apart — say “under investigation” rather than guessing a cause.'),
          tx('Name systems and accounts precisely; this record becomes the evidence of how you responded.'),
        ]}>
        <Field label={tx('Title')} required>
          <input className="risys-input" value={form.title} onChange={set('title')} autoFocus placeholder={tx('e.g. Unauthorized access attempt on production server')} />
        </Field>
        <Field label={tx('Description')}>
          <textarea className="risys-input" rows={5} value={form.description} onChange={set('description')}
                    placeholder={tx('Describe what happened, impact, and any initial findings...')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Classification')} description={tx(
        'How serious this is, where it stands, and who is handling it. NCA ECC 2-13 expects incidents to be classified.'
      )}
        tips={[
          tx('Severity sets the response deadline, so classify on impact, not on how loud the reporter was.'),
          tx('Critical or high: live attacker, data loss, or a system the business stops without. Medium: contained, with a workaround. Low: no service or data impact.'),
          tx('Raise the severity later if it turns out worse — do not start high “to be safe”, or the deadlines stop meaning anything.'),
          tx('Assign one owner. Shared ownership is how incidents go quiet.'),
        ]}
        note={tx('Personal data possibly affected? PDPL Article 24 notification may apply within 72 hours — escalate immediately, do not wait for the investigation to finish.')}>
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
