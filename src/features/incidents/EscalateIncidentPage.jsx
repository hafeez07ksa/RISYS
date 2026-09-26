import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { Field, SubmitButton } from '@/features/audits/parts'
import { logAudit, AUDIT } from '@/lib/audit'
import { tx } from '@/lib/i18n'

// Starting inherent scores from the incident's severity; the risk owner reassesses.
const SEVERITY_TO_SCORES = {
  critical:      { inherent_likelihood: 5, inherent_impact: 5 },
  high:          { inherent_likelihood: 4, inherent_impact: 4 },
  medium:        { inherent_likelihood: 3, inherent_impact: 3 },
  low:           { inherent_likelihood: 2, inherent_impact: 2 },
  informational: { inherent_likelihood: 1, inherent_impact: 1 },
}
const SCALE = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))

/* /app/incidents/:id/escalate — raise a draft risk from an incident. An
 * incident is something that happened; a risk is the chance of it happening
 * again, which is what the register manages. */
export function EscalateIncidentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const [incident, setIncident] = useState(undefined)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('incidents').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setIncident(data ?? null)
      if (data) setForm({
        title: `Risk: ${data.title}`, description: data.description || '', category: 'Cybersecurity', risk_type: 'Operational',
        ...(SEVERITY_TO_SCORES[data.severity] || SEVERITY_TO_SCORES.medium),
      })
    })
  }, [organization?.id, id])

  const back = { label: tx('Incident'), onClick: () => navigate(`/app/incidents/${id}`) }
  if (incident === undefined) return <PageLoading />
  if (!incident || !form) return <PageNotFound title={tx('Incident not found')} back={{ label: tx('Incidents'), onClick: () => navigate('/app/incidents') }} />
  if (incident.risk_id) return <PageNotFound title={tx('Already escalated')} back={back}>{tx('This incident is already linked to a risk in the register.')}</PageNotFound>

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const score = form.inherent_likelihood * form.inherent_impact

  const save = async () => {
    if (!form.title.trim()) { setError(tx('Give the risk a title.')); return }
    setBusy(true); setError('')
    try {
      const { data: risk, error: err } = await supabase.from('risks').insert({
        org_id: organization.id, title: form.title.trim(), description: form.description || null,
        category: form.category, risk_type: form.risk_type,
        inherent_likelihood: form.inherent_likelihood, inherent_impact: form.inherent_impact,
        likelihood: form.inherent_likelihood, impact: form.inherent_impact,
        status: 'open', workflow_state: 'draft', source: 'Incident', incident_id: incident.id, created_by: user?.id,
      }).select().single()
      if (err) throw err
      await logAudit(organization.id, AUDIT.RISK_CREATED, 'risk', risk.id, risk.title, { from_incident: incident.id })
      navigate(`/app/risks/${risk.id}`)
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <FormPage
      title={tx('Escalate to the risk register')}
      description={`${tx('From incident:')} ${incident.title}`}
      back={back}
      onSubmit={save}
      error={error}
      note={tx('The risk is created as a draft for its owner to assess properly.')}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={back.onClick}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Create risk')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The risk')} description={tx('Describe the risk of this happening again or getting worse — not the incident itself, which stays on its own record.')}>
        <Field label={tx('Risk title')} required>
          <input className="risys-input" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />
        </Field>
        <Field label={tx('Description')}>
          <textarea className="risys-input" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </FormSection>
      <FormSection title={tx('Starting score')} description={tx('Pre-filled from the incident’s severity. It is a starting point; the full assessment happens on the risk.')}>
        <div className="fp-grid-2">
          <Field label={tx('Likelihood (1–5)')}>
            <SelectField className="w-full" value={form.inherent_likelihood} onChange={(e) => set('inherent_likelihood', Number(e.target.value))} options={SCALE} />
          </Field>
          <Field label={tx('Impact (1–5)')}>
            <SelectField className="w-full" value={form.inherent_impact} onChange={(e) => set('inherent_impact', Number(e.target.value))} options={SCALE} />
          </Field>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
          {tx('Inherent risk score')}: <strong style={{ color: score >= 12 ? 'var(--critical)' : 'var(--medium)' }}>{score} / 25</strong>
        </p>
      </FormSection>
    </FormPage>
  )
}
