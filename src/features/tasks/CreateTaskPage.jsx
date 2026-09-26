import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTasks } from '@/hooks/useTasks'
import { usePeople } from '@/hooks/usePeople'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { TASK_PRIORITIES } from '@/lib/sla'
import { SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection } from '@/components/ui/FormPage'
import { Field, SubmitButton } from '@/features/audits/parts'
import { logAudit, AUDIT } from '@/lib/audit'
import { tx } from '@/lib/i18n'

/* /app/tasks/new[?incident=<id>|?risk=<id>] — create a task, optionally tied
 * to the incident or risk it came from. Returns to where it was opened from. */
export function CreateTaskPage() {
  const [params] = useSearchParams()
  const incidentId = params.get('incident')
  const riskId = params.get('risk')
  const navigate = useNavigate()
  const { createTask } = useTasks()
  const { members } = usePeople()
  const { user, organization } = useAuth()
  const [linked, setLinked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assigned_to: '', due_at: '', reminder_at: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (incidentId) supabase.from('incidents').select('id, title').eq('id', incidentId).maybeSingle().then(({ data }) => setLinked(data && { kind: tx('Incident'), ...data }))
    else if (riskId) supabase.from('risks').select('id, risk_id, title').eq('id', riskId).maybeSingle().then(({ data }) => setLinked(data && { kind: tx('Risk'), ...data }))
  }, [incidentId, riskId])

  const origin = incidentId ? `/app/incidents/${incidentId}` : riskId ? `/app/risks/${riskId}` : '/app/tasks'
  const back = { label: incidentId ? tx('Incident') : riskId ? tx('Risk') : tx('Tasks'), onClick: () => navigate(origin) }

  const save = async () => {
    if (!form.title.trim()) { setError(tx('Title is required')); return }
    if (form.due_at && form.reminder_at && form.reminder_at > form.due_at) { setError(tx('The reminder is after the due date.')); return }
    setBusy(true); setError('')
    try {
      const task = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, priority: form.priority,
        assigned_to: form.assigned_to || null, created_by: user?.id,
        due_at: form.due_at || null, reminder_at: form.reminder_at || null,
        incident_id: incidentId || null, risk_id: riskId || null, status: 'todo',
      })
      await logAudit(organization.id, AUDIT.TASK_CREATED, 'task', task?.id, form.title.trim(), {
        assigned_to: form.assigned_to || null,
        linked_to: incidentId ? `incident:${incidentId}` : riskId ? `risk:${riskId}` : null,
      })
      navigate(task?.id && !incidentId && !riskId ? `/app/tasks/${task.id}` : origin)
    } catch (err) { setError(err.message || tx('Failed to create task')); setBusy(false) }
  }

  return (
    <FormPage
      title={tx('New task')}
      description={linked ? `${tx('Linked to')} ${linked.kind.toLowerCase()} ${linked.risk_id ?? ''} ${linked.title}` : tx('Standalone task')}
      back={back}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={back.onClick}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Create task')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('What needs doing')} description={tx('The work itself, written so anyone picking it up knows when it is finished.')}
        tips={[
          tx('Start the title with a verb and name the thing: “Enable MFA for the finance team”.'),
          tx('Say in the description what “done” looks like, so nobody has to come back and ask.'),
          tx('One task, one outcome. Break anything bigger into separate tasks with their own owners.'),
        ]}>
        <Field label={tx('Title')} required>
          <input className="risys-input" value={form.title} onChange={set('title')} autoFocus placeholder={tx('e.g. Enable MFA for Ahmed Khan')} />
        </Field>
        <Field label={tx('Description')}>
          <textarea className="risys-input" rows={4} value={form.description} onChange={set('description')} placeholder={tx('Steps, context, acceptance criteria…')} />
        </Field>
      </FormSection>

      <FormSection title={tx('Owner and timing')} description={tx('Who does it, how urgent it is, and when it is due.')}
        tips={[
          tx('One owner. “The IT team” is not an owner.'),
          tx('Set a due date even when it is approximate — tasks without dates are the ones that never close.'),
          tx('The reminder should land with enough time to act, not on the deadline itself.'),
        ]}>
        <div className="fp-grid-2">
          <Field label={tx('Priority')}>
            <SelectField className="w-full" value={form.priority} onChange={set('priority')} options={TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          </Field>
          <Field label={tx('Assign to')}>
            <SelectField className="w-full" value={form.assigned_to} onChange={set('assigned_to')}
              options={[{ value: '', label: tx('Unassigned') }, ...members.map((m) => ({ value: m.user_id, label: m.full_name || m.email || m.user_id?.slice(0, 8), description: m.role }))]} />
          </Field>
          <Field label={tx('Due')}><input type="datetime-local" className="risys-input" value={form.due_at} onChange={set('due_at')} /></Field>
          <Field label={tx('Reminder')}><input type="datetime-local" className="risys-input" value={form.reminder_at} onChange={set('reminder_at')} /></Field>
        </div>
      </FormSection>
    </FormPage>
  )
}
