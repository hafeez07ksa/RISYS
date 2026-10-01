import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, X, RotateCcw, ExternalLink, AlertTriangle, Sparkles } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { SelectField } from '@/components/ui/Combobox'
import { Spinner } from '@/components/ui/Spinner'
import { useLeaveGuard, useUnsavedChanges } from '@/components/layout/LeaveGuard'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useRiskSuggestions } from '@/hooks/useRiskSuggestions'
import { RISK_CATEGORIES, RISK_SUBCATEGORIES } from '@/lib/risks'
import { DEFAULT_LIKELIHOOD_SCALE, DEFAULT_IMPACT_SCALE } from '@/lib/matrix'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'
import { FULL, FULL_TA, CONNECTOR, ScoreBadge, Scale, Evidence, Field, pickSuggestion } from './suggestionParts'

/* ── One suggested risk, on its own page ──────────────────────────────────────
 *
 * /app/risks/suggestions/:id — the risk RISYS wrote, laid out like any other
 * record: the editable risk on the left, why RISYS raised it on the right,
 * and the decision in the header. Approving lands on the new risk.
 * -------------------------------------------------------------------------- */

const STATUS_LABEL = {
  pending:   { label: 'Awaiting approval',     color: '#9C6F0F', bg: '#FAF3E2', border: '#EBDCB6' },
  added:     { label: 'Approved',              color: '#2F6B3C', bg: '#ECF4EE', border: '#C8DECD' },
  dismissed: { label: 'Dismissed',             color: 'var(--text-3)', bg: 'var(--surface)', border: 'var(--border)' },
  resolved:  { label: 'Fixed before approval', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
}

function Card({ title, description, children }) {
  return (
    <section className="card" style={{ padding: '18px 20px' }}>
      {title && <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>}
      {description && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.55 }}>{description}</p>}
      <div style={{ marginTop: title || description ? 14 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

export function SuggestionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const guard = useLeaveGuard()
  const { members } = usePeople()
  const p = usePermissions()
  const api = useRiskSuggestions()
  const s = useMemo(() => api.rows.find(r => r.id === id), [api.rows, id])

  const [form, setForm] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dismissing, setDismissing] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => { if (s && !dirty) setForm(pickSuggestion(s)) }, [s, dirty])
  useUnsavedChanges(dirty)

  const back = { label: tx('Suggested risks'), onClick: () => navigate('/app/risks/suggestions') }

  if (api.loading && !s) return <PageLoading />
  if (!s || !form) {
    return (
      <PageNotFound title={tx('Suggested risk not found')} back={back}>
        {tx('It may belong to another workspace, or you may not have access to suggested risks.')}
      </PageNotFound>
    )
  }

  const perms = { canApprove: !!p.canApproveReject, canEdit: !!p.canTriageFindings }
  const pending = s.status === 'pending'
  const canEdit = pending && perms.canEdit
  const items = Array.isArray(s.evidence) ? s.evidence : []
  const dup = s.existing_risk_id ? api.riskRefs[s.existing_risk_id] : null
  const added = s.risk_id ? api.riskRefs[s.risk_id] : null
  const status = STATUS_LABEL[s.status] || STATUS_LABEL.pending
  const subs = RISK_SUBCATEGORIES?.[form.category] || []

  const set = (k) => (e) => { setDirty(true); setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e })) }
  const run = async (what, fn) => {
    setBusy(what); setError('')
    try { await fn() } catch (e) { setError(e.message || tx('That did not work.')) } finally { setBusy('') }
  }
  const save = () => run('save', async () => { await api.save(s.id, form); setDirty(false) })
  const approve = (admit) => run(admit ? 'approve' : 'draft', async () => {
    if (dirty) await api.save(s.id, form)
    const riskId = await api.accept(s.id, admit)
    setDirty(false)
    guard?.allowLeave()
    navigate(`/app/risks/${riskId}`)
  })

  const actions = (
    <>
      {pending && dirty && perms.canEdit && (
        <button type="button" className="btn-secondary" onClick={save} disabled={!!busy} style={{ fontSize: 12.5 }}>
          {busy === 'save' ? <Spinner size="sm" /> : tx('Save changes')}
        </button>
      )}
      {pending && perms.canEdit && (
        <button type="button" className="btn-secondary" onClick={() => approve(false)} disabled={!!busy} style={{ fontSize: 12.5 }}
          title={tx('Adds it to the register as a draft for a reviewer to admit')}>
          {busy === 'draft' ? <Spinner size="sm" /> : tx('Add as draft')}
        </button>
      )}
      {pending && perms.canApprove && (
        <button type="button" className="btn-primary" onClick={() => approve(true)} disabled={!!busy}
          style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy === 'approve' ? <Spinner size="sm" /> : <Check size={13} />}{tx('Approve to register')}
        </button>
      )}
      {s.status === 'added' && added && (
        <Link to={`/app/risks/${s.risk_id}`} className="btn-primary"
          style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          {tx('Open')} {added.risk_id} <ExternalLink size={12} />
        </Link>
      )}
      {s.status === 'dismissed' && perms.canApprove && (
        <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => run('restore', () => api.restore(s.id))}
          style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy === 'restore' ? <Spinner size="sm" /> : <RotateCcw size={12} />}{tx('Restore to pending')}
        </button>
      )}
    </>
  )

  const meta = (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
        background: status.bg, color: status.color, border: `1px solid ${status.border}`,
      }}>{tx(status.label)}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
        background: 'var(--rose-bg, #f6ecea)', color: 'var(--crimson)',
      }}>ECC {s.area_id}{s.area_name ? ` · ${tx(s.area_name)}` : ''}</span>
    </span>
  )

  const aside = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card" style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'center' }}>
        <ScoreBadge l={form.inherent_likelihood} i={form.inherent_impact} size="lg" />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tx('Inherent score')}</p>
          <p className="tnum" style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {[
              s.open_findings > 0 && tx('{{n}} findings', { n: s.open_findings }) + (s.critical_findings ? ` (${tx('{{n}} critical', { n: s.critical_findings })})` : ''),
              s.failing_signals > 0 && tx('{{n}} failing measurements', { n: s.failing_signals }),
            ].filter(Boolean).join(' · ') || tx('No open evidence.')}
          </p>
        </div>
      </section>

      {dup && pending && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px',
          borderRadius: 10, background: 'var(--medium-bg)', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          <AlertTriangle size={13} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 2 }} />
          <span>{tx('An existing risk may already cover this area:')}{' '}
            <Link to={`/app/risks/${s.existing_risk_id}`} style={{ color: 'var(--crimson)', fontWeight: 600 }}>{dup.risk_id} — {dup.title}</Link>.
            {' '}{tx('Dismiss this suggestion if it does.')}</span>
        </div>
      )}

      <section className="card" style={{ padding: '16px 18px' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} style={{ color: 'var(--crimson)' }} />{tx('Why RISYS raised this')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 6px', lineHeight: 1.5 }}>
          {tx('Mapped to NCA ECC {{ids}}. Last checked {{when}}.', { ids: (s.controls || []).join(', '), when: fmtDateTime(s.last_evaluated_at) })}
          {' '}{(s.connectors || []).map(c => CONNECTOR[c] || c).join(', ')}
        </p>
        <Evidence items={items} />
        {pending && (
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
            {tx('Once approved, these become the risk\'s Recommended actions: each with its fix, ticked off automatically when the next scan no longer reports it.')}
          </p>
        )}
      </section>

      {pending && perms.canApprove && (
        <section className="card" style={{ padding: '14px 18px' }}>
          {!dismissing ? (
            <button type="button" className="btn-ghost" onClick={() => setDismissing(true)} disabled={!!busy}
              style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}>
              <X size={13} />{tx('Dismiss — not a risk')}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="field-label" htmlFor="dismiss-reason">{tx('Why is this not a risk?')}</label>
              <textarea id="dismiss-reason" className="risys-input" style={FULL_TA} rows={3} autoFocus value={reason}
                onChange={(e) => setReason(e.target.value)} data-guard-ignore
                placeholder={tx('e.g. Covered by RSK-0003; external sharing is approved by policy')} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" style={{ fontSize: 12.5 }} onClick={() => { setDismissing(false); setReason('') }}>{tx('Cancel')}</button>
                <button type="button" className="btn-danger" style={{ fontSize: 12.5 }} disabled={reason.trim().length < 5 || !!busy}
                  onClick={() => run('dismiss', async () => {
                    await api.dismiss(s.id, reason.trim()); setDirty(false); guard?.allowLeave(); navigate('/app/risks/suggestions')
                  })}>
                  {busy === 'dismiss' ? <Spinner size="sm" /> : tx('Dismiss')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )

  return (
    <RecordPage
      title={form.title || s.title}
      description={s.description}
      meta={meta}
      back={back}
      actions={actions}
      aside={aside}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: '#fdf3f2', border: '1px solid #f1d2cf', fontSize: 12.5, color: 'var(--critical)' }}>{error}</p>
        )}
        {s.status === 'dismissed' && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
            <strong>{tx('Dismissed')}</strong> {s.decided_at ? fmtDateTime(s.decided_at) : ''}: {s.dismiss_reason}
          </p>
        )}
        {s.status === 'resolved' && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
            {tx('The findings behind this suggestion were fixed before it was approved, so it retired itself. It comes back if they reappear.')}
          </p>
        )}

        <Card title={tx('The risk')} description={tx('Written by RISYS from what it detected. Change anything before you approve it; your edits are kept when the evidence refreshes.')}>
          <Field label={tx('Title')}>
            <input className="risys-input" style={FULL} value={form.title} onChange={set('title')} disabled={!canEdit} />
          </Field>
          <Field label={tx('Cause')} help={tx('A fact about today — includes what RISYS detected.')}>
            <textarea className="risys-input" style={FULL_TA} rows={4} value={form.cause} onChange={set('cause')} disabled={!canEdit} />
          </Field>
          <Field label={tx('Event')} help={tx('What could happen.')}>
            <textarea className="risys-input" style={FULL_TA} rows={2} value={form.event} onChange={set('event')} disabled={!canEdit} />
          </Field>
          <Field label={tx('Impact')} help={tx('The damage if it does.')}>
            <textarea className="risys-input" style={FULL_TA} rows={2} value={form.impact_statement} onChange={set('impact_statement')} disabled={!canEdit} />
          </Field>
        </Card>

        <Card title={tx('Classification and score')} description={tx('Inherent score: before any control is credited. The assessment after approval produces the residual score.')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SelectField label={tx('Category')} value={form.category || ''} disabled={!canEdit} className="w-full"
              onChange={(e) => { setDirty(true); setForm(f => ({ ...f, category: e.target.value, subcategory: '' })) }}
              options={RISK_CATEGORIES.map(c => ({ value: c, label: tx(c) }))} />
            <SelectField label={tx('Subcategory')} value={form.subcategory || ''} disabled={!canEdit} className="w-full"
              onChange={set('subcategory')}
              options={[{ value: '', label: tx('None') }, ...subs.map(c => ({ value: c, label: tx(c) }))]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Scale label={tx('Inherent likelihood')} value={form.inherent_likelihood} scale={DEFAULT_LIKELIHOOD_SCALE}
              disabled={!canEdit} onChange={(v) => { setDirty(true); setForm(f => ({ ...f, inherent_likelihood: v })) }} />
            <Scale label={tx('Inherent impact')} value={form.inherent_impact} scale={DEFAULT_IMPACT_SCALE}
              disabled={!canEdit} onChange={(v) => { setDirty(true); setForm(f => ({ ...f, inherent_impact: v })) }} />
          </div>
        </Card>

        <Card title={tx('Ownership')} description={tx('Who answers for this risk once it is in the register.')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SelectField label={tx('Risk owner')} value={form.owner_id || ''} disabled={!canEdit} onChange={set('owner_id')} className="w-full"
              options={[{ value: '', label: tx('Not assigned yet') }, ...members.map(m => ({ value: m.user_id, label: m.full_name || m.email }))]} />
            <Field label={tx('Business unit')}>
              <input className="risys-input" style={FULL} value={form.business_unit} onChange={set('business_unit')} disabled={!canEdit}
                placeholder={tx('e.g. IT, Finance')} />
            </Field>
          </div>
        </Card>
      </div>
    </RecordPage>
  )
}
