import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldAlert, Pencil, Send, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { Stepper } from '@/components/ui/Stepper'
import { fmtDateTime } from '@/lib/reports/models'
import { useAuditPage, Field, SubmitButton, ErrorText, Section, RatingBadge, FindingStatusBadge, DueText, Facts, personName } from './parts'
import { DONE } from './FindingsTab'
import { tx } from '@/lib/i18n'

const LIFECYCLE = [
  { value: 'draft', label: tx('Draft') },
  { value: 'open', label: tx('Issued') },
  { value: 'in_remediation', label: tx('In remediation') },
  { value: 'ready_for_validation', label: tx('Awaiting validation') },
  { value: 'closed', label: tx('Closed') },
]

/* /app/audits/:id/findings/:findingId — one audit finding.
 *
 * The audit team writes and issues it; the owner in management responds with
 * an action plan and moves it through remediation; only the audit team
 * validates the fix and closes it, or records that management accepted the
 * risk instead (audit_finding_guard enforces this in the database). */
export function FindingPage() {
  const { findingId } = useParams()
  const { user } = useAuth()
  const { id, audit, e, members, perms, canManage, locked, navigate, toTab } = useAuditPage()
  const f = audit.findings.find((x) => x.id === findingId)
  const [resp, setResp] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (f && resp === null) setResp({ management_response: f.management_response ?? '', action_plan: f.action_plan ?? '' })
  }, [f, resp])

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!f || (f.status === 'draft' && !canManage)) {
    return <PageNotFound title={tx('Finding not found')} back={{ label: e.ref, onClick: () => toTab('findings') }}>{tx('It may have been deleted, or it has not been issued yet.')}</PageNotFound>
  }

  const r = resp ?? { management_response: '', action_plan: '' }
  const isOwner = f.response_owner === user.id
  const editable = canManage && !locked
  const canRespond = !locked && (isOwner || canManage) && ['open', 'in_remediation', 'ready_for_validation'].includes(f.status)
  const run = (key, fn) => async () => {
    setBusy(key); setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const saveResponse = (extra = {}) => audit.updateFinding(f.id, {
    management_response: r.management_response.trim() || null, action_plan: r.action_plan.trim() || null, ...extra,
  })

  const step = f.status === 'risk_accepted' ? 4 : Math.max(0, LIFECYCLE.findIndex((s) => s.value === f.status))
  const steps = f.status === 'risk_accepted' ? [...LIFECYCLE.slice(0, 4), { value: 'risk_accepted', label: tx('Risk accepted') }] : LIFECYCLE

  const next = {
    draft: canManage ? tx('Only the audit team can see this draft. Issue it to management when the facts are agreed.') : null,
    open: isOwner ? tx('Write your response: do you agree, and what will be done by when? Then start remediation.') : `${tx('Waiting for')} ${personName(members, f.response_owner) ?? tx('an owner')} ${tx('to respond.')}`,
    in_remediation: isOwner ? tx('When the fix is in place, mark it ready for validation so the audit team can check it.') : tx('Management is fixing it.'),
    ready_for_validation: canManage ? tx('Check the fix — re-perform the test if you can. Close the finding if it holds, or send it back.') : tx('Waiting for the audit team to validate the fix.'),
    closed: tx('Validated and closed.'),
    risk_accepted: tx('Management formally accepted the risk instead of fixing it.'),
  }[f.status]

  const Part = ({ label, children }) => (
    <div className="rp-block">
      <p className="rp-label">{label}</p>
      <p className="rp-text" style={{ color: children ? 'var(--text)' : 'var(--text-3)' }}>{children || tx('Not written.')}</p>
    </div>
  )

  return (
    <RecordPage
      title={`${f.ref} — ${f.title}`}
      meta={<><RatingBadge v={f.rating} /><FindingStatusBadge v={f.status} /></>}
      description={`${tx('Audit finding')} · ${e.ref} — ${e.title}`}
      back={{ label: e.ref, onClick: () => toTab('findings') }}
      actions={editable && !DONE.includes(f.status) && (
        <button className="btn-secondary" onClick={() => navigate(`/app/audits/${id}/findings/${f.id}/edit`)}><Pencil size={13} /> {tx('Edit finding')}</button>
      )}
      aside={<>
        <Section title={tx('Details')}>
          <Facts rows={[
            ['Owner', personName(members, f.response_owner)],
            ['Remediation due', <DueText key="d" date={f.due_date} done={DONE.includes(f.status)} />],
            f.requirement_id && ['Requirement', `${f.framework ?? ''} ${f.requirement_id}`],
            f.scope_item_id && ['From test', (() => { const s = audit.scope.find((x) => x.id === f.scope_item_id); return s ? <Link key="s" to={`/app/audits/${id}/scope/${s.id}`} style={{ color: 'var(--crimson)' }}>{s.title}</Link> : null })()],
            f.risk && ['Linked risk', <Link key="r" to={`/app/risks/${f.risk.id}`} style={{ color: 'var(--crimson)' }}>{f.risk.risk_id} {f.risk.title}</Link>],
            f.validated_at && ['Validated', `${fmtDateTime(f.validated_at)} · ${personName(members, f.validated_by)}`],
          ]} />
        </Section>
        {next && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.55 }}>{next}</p>}

        {editable && f.status === 'draft' && (
          <SubmitButton busy={busy === 'issue'} onClick={run('issue', () => {
            if (!f.condition || !f.recommendation) throw new Error(tx('Add a condition and a recommendation before issuing.'))
            if (!f.response_owner) throw new Error(tx('Choose a management owner before issuing.'))
            return audit.updateFinding(f.id, { status: 'open' })
          })}><Send size={13} className="rtl-flip" /> {tx('Issue to management')}</SubmitButton>
        )}
        {editable && f.status === 'ready_for_validation' && <>
          <SubmitButton busy={busy === 'close'} onClick={run('close', () => audit.updateFinding(f.id, { status: 'closed' }))}>{tx('Validate & close')}</SubmitButton>
          <button className="btn-secondary" disabled={!!busy} onClick={run('back', () => audit.updateFinding(f.id, { status: 'in_remediation' }))}>{tx('Not yet resolved')}</button>
        </>}
        {editable && perms.canCreateRisk && !f.risk_id && f.status !== 'draft' && (
          <button className="btn-secondary" disabled={!!busy} onClick={run('risk', async () => {
            const risk = await audit.raiseRisk(f)
            if (risk?.id) navigate(`/app/risks/${risk.id}`)
          })}><ShieldAlert size={13} /> {tx('Raise as risk')}</button>
        )}
        {editable && ['open', 'in_remediation'].includes(f.status) && (
          <InlineConfirm variant="panel" tone="neutral" triggerClassName="btn-ghost"
            message={tx('Record that management accepts this risk?')}
            detail={tx('Use this when management has decided, at the right level of authority, not to remediate. The finding closes as “risk accepted” and says so in the report.')}
            confirmLabel={tx('Record risk acceptance')}
            onConfirm={() => audit.updateFinding(f.id, { status: 'risk_accepted' })}>
            {tx('Management accepts the risk…')}
          </InlineConfirm>
        )}
        {editable && f.status === 'draft' && (
          <InlineConfirm variant="panel" triggerClassName="btn-ghost" message={tx('Delete this draft finding?')}
            detail={tx('Drafts have not been seen by management, so nothing else refers to them.')} confirmLabel={tx('Delete draft')}
            onConfirm={async () => { await audit.deleteFinding(f.id); toTab('findings') }}>
            <Trash2 size={13} /> {tx('Delete draft')}
          </InlineConfirm>
        )}
        <ErrorText>{error}</ErrorText>
      </>}
    >
      <div style={{ marginBottom: 18, overflowX: 'auto' }}>
        <Stepper steps={steps} current={step} />
      </div>

      <Section title={tx('The finding')}>
        <Part label={tx('Condition — what we found')}>{f.condition}</Part>
        <Part label={tx('Criteria — what is required')}>{f.criteria}</Part>
        <Part label={tx('Cause')}>{f.cause}</Part>
        <Part label={tx('Effect — why it matters')}>{f.effect}</Part>
        <Part label={tx('Recommendation')}>{f.recommendation}</Part>
      </Section>

      {f.status !== 'draft' && (
        <Section title={tx('Management response')}>
          {canRespond ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label={tx('Response')} help={tx('Agree or disagree with the finding, and why. This is printed in the audit report as written.')}>
                <textarea className="risys-input" rows={4} value={r.management_response} onChange={(ev) => setResp({ ...r, management_response: ev.target.value })} />
              </Field>
              <Field label={tx('Action plan')} help={tx('What will be done, by whom, by when.')}>
                <textarea className="risys-input" rows={3} value={r.action_plan} onChange={(ev) => setResp({ ...r, action_plan: ev.target.value })} />
              </Field>
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                {f.status === 'open' && (
                  <SubmitButton busy={busy === 'start'} disabled={!r.management_response.trim()}
                    onClick={run('start', () => saveResponse({ status: 'in_remediation' }))}>{tx('Save and start remediation')}</SubmitButton>
                )}
                {f.status === 'in_remediation' && (
                  <SubmitButton busy={busy === 'ready'} onClick={run('ready', () => saveResponse({ status: 'ready_for_validation' }))}>{tx('Save and mark ready for validation')}</SubmitButton>
                )}
                <button className="btn-secondary" disabled={!!busy} onClick={run('resp', () => saveResponse())}>{tx('Save response')}</button>
              </div>
            </div>
          ) : (
            <>
              <Part label={tx('Response')}>{f.management_response}</Part>
              <Part label={tx('Action plan')}>{f.action_plan}</Part>
            </>
          )}
        </Section>
      )}
    </RecordPage>
  )
}
