import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { OPINIONS, ACTIVE_FINDING } from '@/hooks/useAudits'
import { OPINION } from '@/lib/reports/theme'
import { useAuditPage, Field, SubmitButton, StageBadge } from './parts'
import { tx } from '@/lib/i18n'

/* /app/audits/:id/opinion            — record or revise the overall opinion
 * /app/audits/:id/opinion?close=1    — the same, and close the engagement
 *
 * Closing needs an opinion (a CHECK constraint enforces it) and makes the
 * engagement read-only. The page lists what is still unfinished so closing
 * is a decision taken with the facts in front of the auditor, not a surprise. */
export function OpinionPage() {
  const { id, audit, e, canManage, locked, navigate, toTab } = useAuditPage()
  const [params] = useSearchParams()
  const closing = params.get('close') === '1'
  const [opinion, setOpinion] = useState('')
  const [summary, setSummary] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!e || loaded) return
    setOpinion(e.opinion ?? ''); setSummary(e.opinion_summary ?? ''); setLoaded(true)
  }, [e, loaded])

  const checks = useMemo(() => {
    const tested = audit.scope.filter((x) => x.result !== 'not_tested')
    const untested = audit.scope.length - tested.length
    const unreviewed = tested.filter((x) => !x.reviewed_by).length
    const outstanding = audit.requests.filter((r) => ['open', 'rejected', 'submitted'].includes(r.status)).length
    const drafts = audit.findings.filter((f) => f.status === 'draft').length
    const noResponse = audit.findings.filter((f) => ACTIVE_FINDING.includes(f.status) && !f.management_response).length
    return [
      { ok: audit.scope.length > 0, text: audit.scope.length ? `${audit.scope.length} ${tx('item(s) in scope')}` : tx('Nothing was put in scope') },
      { ok: untested === 0, text: untested ? `${untested} ${tx('item(s) not tested')}` : tx('Every scope item has a result') },
      { ok: unreviewed === 0, text: unreviewed ? `${unreviewed} ${tx('tested item(s) not reviewed by a second person')}` : tx('Every tested item has been reviewed') },
      { ok: outstanding === 0, text: outstanding ? `${outstanding} ${tx('evidence request(s) not yet accepted')}` : tx('All evidence requests are settled') },
      { ok: drafts === 0, text: drafts ? `${drafts} ${tx('draft finding(s) — drafts are left out of the report')}` : tx('No findings left in draft') },
      { ok: noResponse === 0, text: noResponse ? `${noResponse} ${tx('issued finding(s) without a management response')}` : tx('Every issued finding has a management response') },
    ]
  }, [audit.scope, audit.requests, audit.findings])

  if (audit.loading) return <PageLoading />
  if (audit.notFound || !e) return <PageNotFound title={tx('Engagement not found')} back={{ label: tx('Audits'), onClick: () => navigate('/app/audits') }} />
  if (!canManage || locked) {
    return <PageNotFound title={tx('The opinion cannot be changed')} back={{ label: e.ref, onClick: () => toTab() }}>
      {locked ? tx('This engagement is closed. Reopen it from the engagement page to change the opinion.') : tx('Only the audit team records the opinion.')}
    </PageNotFound>
  }

  const save = async () => {
    if (!opinion) { setError(tx('Choose an opinion.')); return }
    if (closing && !summary.trim()) { setError(tx('Write the basis for the opinion before closing — it is the first thing the report reader sees.')); return }
    setBusy(true); setError('')
    try {
      await audit.updateEngagement({ opinion, opinion_summary: summary.trim() || null, ...(closing ? { status: 'closed' } : {}) })
      navigate(closing ? `/app/audits/${id}?tab=reports` : `/app/audits/${id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }
  const open = checks.filter((c) => !c.ok).length

  return (
    <FormPage
      title={closing ? `${tx('Close')} ${e.ref}` : tx('Overall opinion')}
      meta={<StageBadge v={e.status} />}
      description={closing
        ? tx('Closing records the opinion and makes the engagement read-only. Generate the final audit report afterwards — it is the one without “Draft” on every page.')
        : tx('The conclusion on the engagement objective. It can be revised until the engagement is closed.')}
      back={{ label: e.ref, onClick: () => toTab() }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={busy} onClick={() => toTab()}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{closing ? tx('Close engagement') : tx('Save opinion')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('The question')} description={tx('The opinion answers the objective set in the plan — nothing wider.')}
        tips={[
          tx('If this objective no longer matches what you tested, fix the plan before recording an opinion.'),
          tx('The opinion may not go wider than this sentence — you cannot conclude on the whole of cybersecurity from an access-control audit.'),
        ]}>
        <p className="rp-text" style={{ color: e.objective ? 'var(--text)' : 'var(--text-3)' }}>
          {e.objective || tx('No objective was written in the plan. Add one before closing, so the opinion has something to answer.')}
        </p>
      </FormSection>

      <FormSection title={tx('Opinion')} description={tx(
        'Your overall conclusion on the objective. Effective: the controls tested can be relied on. Partially effective: largely in place, but reported weaknesses need action. Ineffective: significant weaknesses until fixed.'
      )}
        tips={[
          tx('Weigh the results, do not count them. One ineffective control over privileged access matters more than three low-rated gaps.'),
          tx('Ask: could management rely on these controls tomorrow? If yes with fixes under way, partially effective. If no, ineffective.'),
          tx('Be consistent with your findings. An “effective” opinion alongside a high-rated finding will be challenged, and should be.'),
        ]}
        note={tx('The opinion can be revised until the engagement is closed. After closing it is read-only.')}>
        <div role="radiogroup" aria-label={tx('Opinion')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OPINIONS.map((o) => {
            const on = opinion === o.value
            const meta = OPINION[o.value]
            return (
              <label key={o.value} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', cursor: 'pointer',
                borderRadius: 'var(--r-md)', border: `1px solid ${on ? meta.border : 'var(--border)'}`,
                background: on ? meta.bg : 'var(--bg-2)',
              }}>
                <input type="radio" name="opinion" value={o.value} checked={on} onChange={() => setOpinion(o.value)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 600, color: on ? meta.color : 'var(--text)' }}>{o.label}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.5, marginTop: 2 }}>{meta.text}</span>
                </span>
              </label>
            )
          })}
        </div>
      </FormSection>

      <FormSection title={tx('Basis for the opinion')} description={tx(
        'The short explanation printed under the opinion in the report.'
      )}
        tips={[
          tx('Two or three sentences a board member can read alone: what works, what does not, and what must change.'),
          tx('Name the specific weaknesses and point to the finding references, so the reader can go deeper if they want.'),
          tx('Avoid jargon. “MFA is not enforced for remote access” travels; “CA policy scope gap” does not.'),
          tx('This paragraph is what makes your judgement checkable by someone who disagrees with it.'),
        ]}>
        <Field label={tx('Basis')} required={closing}>
          <textarea className="risys-input" rows={5} value={summary} onChange={(ev) => setSummary(ev.target.value)}
            placeholder={tx('Privileged access is well controlled. MFA is registered by most users but is not enforced by policy, and 7 of 25 sampled accounts could sign in with a password alone. Until MFA is enforced for all users, identity controls cannot be fully relied on.')} />
        </Field>
      </FormSection>

      {closing && (
        <FormSection title={tx('Before you close')} description={tx(
          'What is still unfinished in this engagement.'
        )}
        tips={[
          tx('Nothing here blocks closing. An auditor may close with items open — but say why in the basis, because the report will show them.'),
          tx('Untested or unreviewed items weaken the opinion most; settle those first if you can.'),
          tx('Draft findings are excluded from the report. Issue them or delete them, rather than leaving them behind.'),
        ]}
        note={tx('After closing, generate the report again — the final report is the one without “Draft” on every page.')}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checks.map((c) => (
              <li key={c.text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)', color: c.ok ? 'var(--text-2)' : 'var(--medium)' }}>
                {c.ok ? <CheckCircle2 size={15} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 1 }} />
                      : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
                {c.text}
              </li>
            ))}
          </ul>
          {open > 0 && <p className="field-help" style={{ margin: 0 }}>{open} {tx('point(s) still open.')}</p>}
        </FormSection>
      )}
    </FormPage>
  )
}
