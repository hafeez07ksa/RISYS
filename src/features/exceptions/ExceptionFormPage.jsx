import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageNotFound } from '@/components/ui/FormPage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useExceptions } from '@/hooks/useExceptions'
import { useFrameworkRequirements } from '@/hooks/usePolicies'
import { linkableRequirements, FRAMEWORK_SHORT } from '@/hooks/useCompliance'
import { EXCEPTION_SUBJECTS, CRITICALITY, AUTHORITY_FOR, EXCEPTION_MAX_MONTHS, todayRiyadh, addMonths, labelOf } from '@/lib/policies'
import { Field, SubmitButton } from '@/features/audits/parts'
import { authorityLabel } from '@/features/policies/parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* /app/exceptions/new — request an exception. Opened from a policy, a
 * requirement or a control with ?subject_type=…&subject_id=…&label=…, so the
 * subject arrives filled in. */
export function ExceptionFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { request } = useExceptions()
  const reqs = useFrameworkRequirements()
  const today = todayRiyadh()
  const [f, setF] = useState({
    subject_type: params.get('subject_type') || 'policy', subject_id: params.get('subject_id') || '', subject_label: params.get('label') || '',
    title: '', justification: '', compensating_controls: '', risk_rating: 'medium', starts_on: today, expires_on: addMonths(today, 6),
  })
  const [policies, setPolicies] = useState([])
  const [controls, setControls] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))
  const prefilled = !!params.get('subject_id')

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('policies').select('id, ref, title').eq('org_id', organization.id).neq('status', 'retired').order('ref').then(({ data }) => setPolicies(data || []))
    supabase.from('risk_controls').select('id, control_id, name').eq('org_id', organization.id).order('control_id').then(({ data }) => setControls(data || []))
  }, [organization?.id])

  const linkable = useMemo(() => linkableRequirements(reqs, organization), [reqs, organization])
  const subjectOptions = useMemo(() => ({
    policy: policies.map((p) => ({ value: p.id, label: `${p.ref} ${p.title}` })),
    control: controls.map((c) => ({ value: c.id, label: `${c.control_id || ''} ${c.name}`.trim() })),
    requirement: linkable.map((r) => ({
      value: `${r.framework}|${r.requirement_id}`, label: `${FRAMEWORK_SHORT[r.framework] || r.framework} ${r.requirement_id}`, description: r.requirement_text?.slice(0, 120),
    })),
  }[f.subject_type]), [f.subject_type, policies, controls, linkable])

  const maxMonths = EXCEPTION_MAX_MONTHS[f.risk_rating]
  const latest = f.starts_on ? addMonths(f.starts_on, maxMonths) : null
  const back = () => (prefilled ? navigate(-1) : navigate('/app/exceptions'))

  const save = async () => {
    if (!f.subject_id.trim()) { setError(tx('Say what the exception is from.')); return }
    if (f.title.trim().length < 3) { setError(tx('Give the exception a short title.')); return }
    if (f.justification.trim().length < 20) { setError(tx('The justification needs at least 20 characters.')); return }
    if (f.compensating_controls.trim().length < 10) { setError(tx('Describe the compensating controls in at least 10 characters.')); return }
    if (!f.starts_on || !f.expires_on || f.expires_on <= f.starts_on) { setError(tx('The exception must end after it starts.')); return }
    if (latest && f.expires_on > latest) { setError(`${tx('At this rating an exception can run for at most')} ${maxMonths} ${tx('months')}.`); return }
    setBusy(true); setError('')
    try {
      const id = await request({ ...f, title: f.title.trim(), justification: f.justification.trim(), compensating_controls: f.compensating_controls.trim(), subject_id: f.subject_id.trim(), subject_label: f.subject_label.trim() })
      navigate(`/app/exceptions/${id}`, { replace: true })
    } catch (e) { setError(e.message); setBusy(false) }
  }

  if (perms.isReadOnly) return <PageNotFound title={tx('Read-only role')} back={{ label: tx('Exceptions'), onClick: () => navigate('/app/exceptions') }}>{tx('Viewers and auditors cannot request exceptions.')}</PageNotFound>

  return (
    <FormPage
      title={tx('Request an exception')}
      description={tx('A time-limited, approved departure. It is decided at the authority its risk rating needs, never by the person who asks for it.')}
      back={{ label: prefilled ? (params.get('label') || tx('Exceptions')) : tx('Exceptions'), onClick: back }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Submit for decision')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('From what')} description={tx('The policy, requirement, control, finding or vendor obligation that will not be met.')}>
        {prefilled ? (
          <Field label={labelOf(EXCEPTION_SUBJECTS, f.subject_type)}><input className="risys-input" disabled value={f.subject_label || f.subject_id} /></Field>
        ) : (
          <div className="fp-grid-2">
            <Field label={tx('Type')}><SelectField className="w-full" value={f.subject_type} options={EXCEPTION_SUBJECTS}
              onChange={(e) => setF((x) => ({ ...x, subject_type: val(e), subject_id: '', subject_label: '' }))} /></Field>
            {subjectOptions ? (
              <Field label={tx('Which one')} required>
                <Combobox value={f.subject_id || null} options={subjectOptions} placeholder={tx('Choose')}
                  onChange={(v) => setF((x) => ({ ...x, subject_id: v || '', subject_label: subjectOptions.find((o) => o.value === v)?.label || '' }))} />
              </Field>
            ) : (
              <Field label={tx('Which one')} required help={tx('A reference the reader will recognise, e.g. the finding or vendor name.')}>
                <input className="risys-input" value={f.subject_label} onChange={(e) => setF((x) => ({ ...x, subject_label: e.target.value, subject_id: e.target.value }))} />
              </Field>
            )}
          </div>
        )}
      </FormSection>

      <FormSection title={tx('The exception')} description={tx('What will not be done, why, and what reduces the risk meanwhile.')}
        tips={[
          tx('Justify it with a business reason and a plan to end it: “the legacy payroll system cannot enforce MFA until it is replaced in Q2”.'),
          tx('Compensating controls are what you do instead: extra monitoring, network isolation, a manual check.'),
          tx('The rating is the risk while the exception runs, after the compensating controls.'),
        ]}>
        <Field label={tx('Title')} required><input className="risys-input" value={f.title} onChange={set('title')} placeholder={tx('e.g. MFA not enforced on the legacy payroll system')} /></Field>
        <Field label={tx('Justification')} required><textarea className="risys-input" rows={4} value={f.justification} onChange={set('justification')} /></Field>
        <Field label={tx('Compensating controls')} required><textarea className="risys-input" rows={3} value={f.compensating_controls} onChange={set('compensating_controls')} /></Field>
      </FormSection>

      <FormSection title={tx('Rating and dates')} description={tx('The rating decides who must approve it and how long it may run.')}
        tips={[
          tx('Low: a risk owner, up to 24 months. Medium: the CISO, up to 24 months.'),
          tx('High: a committee, up to 12 months. Critical: the board, up to 6 months.'),
          tx('It ends on its own on the expiry date. Ask again if it is still needed.'),
        ]}>
        <div className="fp-grid-3">
          <Field label={tx('Risk rating')}><SelectField className="w-full" value={f.risk_rating} options={CRITICALITY}
            onChange={(e) => setF((x) => ({ ...x, risk_rating: val(e) }))} /></Field>
          <Field label={tx('Starts')}><DateField value={f.starts_on} onChange={set('starts_on')} /></Field>
          <Field label={tx('Ends')} help={latest ? `${tx('Latest')}: ${latest}` : null}><DateField value={f.expires_on} onChange={set('expires_on')} /></Field>
        </div>
        <p className="field-help" style={{ margin: 0 }}>{tx('Decided by')}: <strong>{authorityLabel(AUTHORITY_FOR[f.risk_rating])}</strong></p>
      </FormSection>
    </FormPage>
  )
}
