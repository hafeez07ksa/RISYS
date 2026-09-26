import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { usePeople } from '@/hooks/usePeople'
import { useControls, CONTROL_TYPES, CONTROL_FREQUENCIES } from '@/hooks/useControls'
import { Field, SubmitButton } from '@/features/audits/parts'
import { ClausePickerField } from './FrameworkClausePicker'
import { tx } from '@/lib/i18n'

const EMPTY = {
  name: '', description: '', control_type: 'Preventive', control_frequency: 'Continuous',
  owner_id: '', effectiveness: 3, is_automated: false, framework_ref: '', notes: '', status: 'active', next_test_date: '',
}
const EFFECTIVENESS = [
  { value: 1, label: tx('1 — Very Low') }, { value: 2, label: tx('2 — Low') }, { value: 3, label: tx('3 — Moderate') },
  { value: 4, label: tx('4 — High') }, { value: 5, label: tx('5 — Very High') },
]
const STATUS = [
  { value: 'active', label: tx('Active') }, { value: 'inactive', label: tx('Inactive') }, { value: 'under_review', label: tx('Under Review') },
]

/* /app/controls/new and /app/controls/:id/edit */
export function ControlFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { members } = usePeople()
  const { createControl, updateControl } = useControls()
  const [form, setForm] = useState(editing ? null : EMPTY)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) return
    supabase.from('risk_controls').select('*').eq('id', id).maybeSingle().then(({ data: c }) => {
      if (!c) { setMissing(true); return }
      setForm({
        name: c.name || '', description: c.description || '', control_type: c.control_type || 'Preventive',
        control_frequency: c.control_frequency || 'Continuous', owner_id: c.owner_id || '', effectiveness: c.effectiveness || 3,
        is_automated: c.is_automated || false, framework_ref: c.framework_ref || '', notes: c.notes || '',
        status: c.status || 'active', next_test_date: c.next_test_date ? c.next_test_date.split('T')[0] : '',
      })
    })
  }, [editing, id])

  const back = { label: editing ? tx('Control') : tx('Controls'), onClick: () => navigate(editing ? `/app/controls/${id}` : '/app/controls') }
  if (missing) return <PageNotFound title={tx('Control not found.')} back={{ label: tx('Controls'), onClick: () => navigate('/app/controls') }} />
  if (!form) return <PageLoading />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    if (!form.name.trim()) { setError(tx('Control name is required.')); return }
    setBusy(true); setError('')
    try {
      const payload = {
        ...form, name: form.name.trim(), effectiveness: parseInt(form.effectiveness), owner_id: form.owner_id || null,
        next_test_date: form.next_test_date || null, framework_ref: form.framework_ref || null,
        notes: form.notes || null, description: form.description || null,
      }
      if (editing) { await updateControl(id, payload); navigate(`/app/controls/${id}`) }
      else { const c = await createControl(payload); navigate(c?.id ? `/app/controls/${c.id}` : '/app/controls') }
    } catch (err) { setError(err.message || tx('Failed to save control.')); setBusy(false) }
  }

  return (
    <FormPage
      title={editing ? `${tx('Edit control')} — ${form.name}` : tx('Add control')}
      description={tx('A control is something the organisation does to reduce a risk or meet a requirement. Controls are mapped to risks and framework clauses, and tested.')}
      back={back}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={back.onClick}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{editing ? tx('Save changes') : tx('Add control')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The control')} description={tx('What this control is and how it is implemented.')}
        tips={[
          tx('Name it by what it does and to what: “MFA enforced on all privileged accounts”.'),
          tx('One control, one thing. If the name needs “and”, it is probably two controls.'),
          tx('Write it so a tester could check it without asking you what you meant.'),
          tx('In the description, say how it is implemented and where — the system, the policy, the schedule.'),
        ]}>
        <Field label={tx('Control name')} required>
          <input className="risys-input" value={form.name} onChange={set('name')} autoFocus placeholder={tx('e.g. MFA enforced on all privileged accounts')} />
        </Field>
        <Field label={tx('Description')}>
          <textarea className="risys-input" rows={4} value={form.description} onChange={set('description')} placeholder={tx('What does this control do and how is it implemented?')} />
        </Field>
      </FormSection>

      <FormSection title={tx('How it operates')} description={tx(
        'How this control works and how much you can rely on it today.'
      )}
        tips={[
          tx('Preventive stops a problem (MFA); detective finds it (log review); corrective fixes it (restore from backup); compensating covers for a control you cannot implement.'),
          tx('Frequency is how often it runs. Continuous means enforced by the system rather than by someone remembering.'),
          tx('Effectiveness lowers the residual score of every risk this control is mapped to, so do not rate it high until it has been tested.'),
          tx('Automated controls fail less and are easier to evidence, but still need testing — a rule can be switched off.'),
        ]}>
        <div className="fp-grid-2">
          <Field label={tx('Type')}><SelectField className="w-full" value={form.control_type} onChange={set('control_type')} options={CONTROL_TYPES} /></Field>
          <Field label={tx('Frequency')}><SelectField className="w-full" value={form.control_frequency} onChange={set('control_frequency')} options={CONTROL_FREQUENCIES} /></Field>
          <Field label={tx('Effectiveness')}><SelectField className="w-full" value={form.effectiveness} onChange={set('effectiveness')} options={EFFECTIVENESS} /></Field>
          <Field label={tx('Status')}><SelectField className="w-full" value={form.status} onChange={set('status')} options={STATUS} /></Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--t-body)', color: 'var(--text-2)' }}>
          <input type="checkbox" checked={form.is_automated} onChange={(e) => setForm((f) => ({ ...f, is_automated: e.target.checked }))}
                 style={{ accentColor: 'var(--crimson)', width: 14, height: 14 }} />
          {tx('This control is automated (no manual steps required)')}
        </label>
      </FormSection>

      <FormSection title={tx('Ownership and testing')} description={tx('Who is accountable for it, and when it gets checked next.')}
        tips={[
          tx('The owner answers for the control working, and is who the auditor will ask.'),
          tx('Pick a test date that matches the risk: quarterly for access controls, annually for a policy review.'),
          tx('Overdue tests are flagged on the dashboard, so an empty date hides the control rather than helping it.'),
        ]}>
        <div className="fp-grid-2">
          <Field label={tx('Owner')}>
            <SelectField className="w-full" value={form.owner_id} onChange={set('owner_id')}
              options={[{ value: '', label: tx('Unassigned') }, ...members.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]} />
          </Field>
          <Field label={tx('Next test date')}><input type="date" className="risys-input" value={form.next_test_date} onChange={set('next_test_date')} /></Field>
        </div>
      </FormSection>

      <FormSection title={tx('Framework reference')} description={tx('Optional. The clause this control primarily meets. Mappings to more clauses are made from Compliance.')}
        tips={[
          tx('Set the clause this control primarily meets. It is what lets the ECC status report show coverage.'),
          tx('One control often serves several clauses — map the extra ones from Compliance, where a requirement can hold many controls.'),
          tx('Leave it empty for controls that manage a business risk with no framework requirement behind it.'),
        ]}>
        <ClausePickerField value={form.framework_ref} onChange={(ref) => setForm((f) => ({ ...f, framework_ref: ref }))} />
        <Field label={tx('Notes')}>
          <textarea className="risys-input" rows={3} value={form.notes} onChange={set('notes')} placeholder={tx('Implementation notes, testing guidance, or context…')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
