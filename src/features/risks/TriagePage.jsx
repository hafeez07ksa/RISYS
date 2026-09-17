import { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Link2, FilePlus2, XCircle, CheckCircle2, Info, RotateCcw, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useRisks, notify } from '@/hooks/useRisks'
import { useFindingTriage } from '@/hooks/useTriage'
import { findCandidates, CLOSE_REASON_CODES, draftRiskFromFinding, TRIAGE_DISPOSITIONS, closeReasonMeta } from '@/lib/triage'
import { SEVERITY_CONFIG, findingDisplayTitle } from '@/lib/findings'
import { logAudit, AUDIT } from '@/lib/audit'
import { getWorkflowState } from '@/lib/risks'
import { bandForScore, bandMeta } from '@/lib/matrix'
import { Spinner } from '@/components/ui/Spinner'
import { ControlReferences } from '@/components/ui/ControlReferences'
import { SelectField } from '@/components/ui/Combobox'

// ============================================================
// TRIAGE — a page, not a dialog
//
// A finding is a fact. It becomes a risk only when a human decides that
// no existing risk already covers it. The page puts the likely duplicates
// first, because attaching to an existing risk is the outcome most often
// missed — and a register with the same weakness recorded three times
// cannot be scored, owned or reported honestly.
// ============================================================

function Panel({ title, icon: Icon, tone = 'var(--crimson)', hint, children }) {
  return (
    <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-3)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={14} style={{ color: tone }} />}
          <h2 style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
        </div>
        {hint && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 4, maxWidth: 640 }}>{hint}</p>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  )
}

export function TriagePage() {
  const { state } = useLocation()
  const finding = state?.finding || null
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { risks, loading: risksLoading, createRisk } = useRisks()
  const { byKey, loading: triageLoading, migrated, recordTriage, reopen } = useFindingTriage()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachNote, setAttachNote] = useState('')
  const [draft, setDraft] = useState(() => ({
    title: finding ? findingDisplayTitle(finding.title, finding.subject?.name) : '',
    likelihood: finding?.severity === 'critical' ? 4 : 3,
    impact: finding?.severity === 'critical' ? 4 : 3,
  }))
  const [closeForm, setCloseForm] = useState({ reason_code: '', note: '' })

  const candidates = useMemo(() => (finding ? findCandidates({ finding, risks }) : []), [finding, risks])
  const existing = finding ? byKey.get(finding.key) : null
  const decided = !!existing
  const canAct = perms.canCreateRisk && migrated && !decided

  const goBack = () => navigate(-1)

  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message || 'Something went wrong') } finally { setBusy(false) }
  }

  const attach = (r) => run(async () => {
    await recordTriage({ finding, disposition: 'attached', riskId: r.id, note: attachNote })
    if (r.owner_id && r.owner_id !== user?.id) {
      await notify(organization.id, r.owner_id, {
        type: 'workflow',
        title: `New finding attached: ${r.risk_id || ''}`,
        body: `"${finding.title}" on ${finding.subject?.name || 'an asset'} was attached to "${r.title}". Re-assess whether residual still holds.`,
        link: `/app/risks/${r.id}`,
      })
    }
    navigate(`/app/risks/${r.id}`)
  })

  const createNew = () => run(async () => {
    if (!draft.title.trim()) throw new Error('A title is required.')
    const risk = await createRisk(draftRiskFromFinding(finding, {
      title: draft.title.trim(), likelihood: draft.likelihood, impact: draft.impact,
      userId: user?.id, orgId: organization.id,
    }))
    await logAudit(organization.id, AUDIT.FINDING_RISK, 'risk', risk.id, risk.title, {
      finding: finding.title, connector: finding.connectorId, subject: finding.subject?.name || null,
    })
    await recordTriage({ finding, disposition: 'created', riskId: risk.id })
    navigate(`/app/risks/${risk.id}`)
  })

  const close = () => run(async () => {
    if (!closeForm.reason_code) throw new Error('A reason code is mandatory when closing a finding.')
    if (closeForm.reason_code === 'compensating_control' && !closeForm.note.trim()) {
      throw new Error('Name the compensating control and where its evidence is.')
    }
    await recordTriage({ finding, disposition: 'closed', reasonCode: closeForm.reason_code, note: closeForm.note })
  })

  // ── No finding in hand ──────────────────────────────────────────────
  if (!finding) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ padding: '60px var(--gutter)', textAlign: 'center' }}>
        <ShieldAlert size={28} strokeWidth={1.2} style={{ color: 'var(--border-2)', marginBottom: 12 }} />
        <p style={{ fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--text)' }}>No finding selected</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', marginTop: 4, maxWidth: 380 }}>
          Triage starts from a finding. Open one from Findings and choose “Triage finding”.
        </p>
        <button className="btn-secondary" style={{ marginTop: 14 }} onClick={() => navigate('/app/findings')}>Go to Findings</button>
      </div>
    )
  }

  const sev = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info
  const linkedRisk = existing?.risk_id ? risks.find(r => r.id === existing.risk_id) : null

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <header style={{ padding: 'var(--s-4) var(--gutter)', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', flexShrink: 0 }}>
        <button onClick={goBack} style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text-3)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 7,
        }}>
          <ArrowLeft size={13} /> Back to findings
        </button>
        <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)' }}>Triage finding</h1>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', marginTop: 2 }}>
          A finding is a fact, not a risk yet. Decide whether an existing risk covers it, whether it needs a new risk, or whether it is not a risk at all.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ padding: 'var(--s-5) var(--gutter) var(--s-10)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start', maxWidth: 1180 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* The finding */}
            <div style={{ borderRadius: 'var(--r-lg)', background: sev.bg, border: `1px solid ${sev.border}`, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="badge" style={{ color: sev.color, background: 'var(--bg-2)', border: `1px solid ${sev.border}` }}>{sev.label}</span>
                <span style={{ fontSize: 'var(--t-meta)', color: sev.color }}>{finding.connectorName}</span>
              </div>
              <p style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>{finding.title}</p>
              {finding.subject?.name && finding.subject.name !== finding.title && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', marginTop: 2 }}>
                  {finding.subject.name}{finding.subject.email ? ` · ${finding.subject.email}` : ''}
                </p>
              )}
              {finding.description && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', marginTop: 8, lineHeight: 1.55 }}>{finding.description}</p>}
              {finding.control && <div style={{ marginTop: 8 }}><ControlReferences control={finding.control} /></div>}
              {finding.sourceUrl && (
                <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', fontSize: 'var(--t-meta)', color: 'var(--text-2)', marginTop: 8, textDecoration: 'underline' }}>
                  View in source system
                </a>
              )}
            </div>

            {!migrated && (
              <div style={{ padding: '11px 13px', borderRadius: 'var(--r-md)', background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)' }}>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
                  Triage decisions need <span className="mono">supabase/migrations/003_treatment_acceptance_triage.sql</span>. Apply it in the Supabase SQL editor, then reload.
                </p>
              </div>
            )}

            {/* Already decided */}
            {existing && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 'var(--r-lg)',
                background: 'var(--bg-2)', border: '1px solid var(--border)',
              }}>
                <CheckCircle2 size={16} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
                    Already triaged: {TRIAGE_DISPOSITIONS[existing.disposition]?.label}
                  </p>
                  <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 2 }}>
                    {existing.reason_code && `${closeReasonMeta(existing.reason_code)?.label}. `}
                    {existing.note && `“${existing.note}” `}
                    {new Date(existing.decided_at).toLocaleDateString('en-GB')}
                  </p>
                  {linkedRisk && (
                    <button className="btn-ghost" style={{ fontSize: 'var(--t-meta)', padding: '4px 0', marginTop: 4 }}
                      onClick={() => navigate(`/app/risks/${linkedRisk.id}`)}>
                      Open {linkedRisk.risk_id} — {linkedRisk.title}
                    </button>
                  )}
                </div>
                {perms.isManager && (
                  <button className="btn-secondary" style={{ fontSize: 'var(--t-meta)' }} disabled={busy}
                    onClick={() => run(() => reopen(existing))}>
                    <RotateCcw size={12} /> Re-open triage
                  </button>
                )}
              </div>
            )}

            {/* A. Existing risk */}
            <Panel title="Does an existing risk already cover this?" icon={Link2}
              hint="Matched on asset, requirement and wording. Nothing is merged automatically — attach only if the risk genuinely describes this weakness.">
              {(risksLoading || triageLoading) ? <Spinner /> : candidates.length === 0 ? (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
                  No open risk shares this finding’s asset, requirement or rule. That points to a new risk.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidates.map(({ risk: r, reasons }) => {
                    const wf = getWorkflowState(r.workflow_state)
                    const score = r.residual_likelihood && r.residual_impact ? r.residual_score : r.inherent_score
                    const band = bandMeta(bandForScore(score))
                    return (
                      <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="mono" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{r.risk_id}</span>
                          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>{r.title}</span>
                          {score ? <span className="badge tnum" style={{ color: band.color, background: band.bg, border: `1px solid ${band.border}` }}>{band.label} · {score}</span> : null}
                          <span className="badge" style={{ color: wf.color, background: wf.bg, border: `1px solid ${wf.border}` }}>{wf.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                          {reasons.map(reason => (
                            <span key={reason} style={{ fontSize: 'var(--t-micro)', padding: '2px 7px', borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text-2)' }}>{reason}</span>
                          ))}
                        </div>
                        {canAct && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 9, alignItems: 'center' }}>
                            <input className="risys-input" style={{ flex: 1, fontSize: 'var(--t-sm)' }} value={attachNote}
                              onChange={e => setAttachNote(e.target.value)} placeholder="Optional note — what this adds to the risk" />
                            <button className="btn-primary" style={{ fontSize: 'var(--t-sm)' }} disabled={busy} onClick={() => attach(r)}>
                              Attach to {r.risk_id}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>

            {/* B. New risk */}
            <Panel title="No existing risk covers it — create a new risk" icon={FilePlus2}
              hint="It enters the register as a draft. Write the cause, event and impact on the risk before a reviewer admits it.">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 110px', gap: 10, alignItems: 'end' }}>
                <div>
                  <p className="field-label">Title</p>
                  <input className="risys-input" style={{ width: '100%' }} value={draft.title} disabled={!canAct}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                </div>
                <SelectField label="Likelihood" size="sm" value={draft.likelihood} disabled={!canAct}
                  onChange={e => setDraft(d => ({ ...d, likelihood: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </SelectField>
                <SelectField label="Impact" size="sm" value={draft.impact} disabled={!canAct}
                  onChange={e => setDraft(d => ({ ...d, impact: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </SelectField>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-primary" style={{ fontSize: 'var(--t-sm)' }} disabled={!canAct || busy} onClick={createNew}>
                  Create draft risk
                </button>
              </div>
            </Panel>

            {/* C. Not a risk */}
            <Panel title="Not a risk — close it" icon={XCircle} tone="var(--text-3)"
              hint="The reason code is mandatory and audited. A closed finding stays closed when the same rule fires again for the same subject.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CLOSE_REASON_CODES.map(r => {
                  const active = closeForm.reason_code === r.value
                  return (
                    <button key={r.value} type="button" disabled={!canAct}
                      onClick={() => setCloseForm(f => ({ ...f, reason_code: r.value }))}
                      style={{
                        textAlign: 'left', padding: '9px 11px', borderRadius: 'var(--r-md)', cursor: canAct ? 'pointer' : 'default',
                        border: `1px solid ${active ? 'var(--crimson)' : 'var(--border)'}`,
                        background: active ? 'var(--crimson-wash)' : 'var(--bg-2)',
                      }}>
                      <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)' }}>{r.label}</span>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 1 }}>{r.desc}</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 10 }}>
                <p className="field-label">
                  Note{closeForm.reason_code === 'compensating_control' && <span className="field-req"> *</span>}
                </p>
                <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical' }} disabled={!canAct}
                  value={closeForm.note} onChange={e => setCloseForm(f => ({ ...f, note: e.target.value }))}
                  placeholder={closeForm.reason_code === 'compensating_control'
                    ? 'Which control, and where is its evidence? e.g. CTL-033 account lockout, evidenced in EVD-0142'
                    : 'Optional context for the audit trail'} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-secondary" style={{ fontSize: 'var(--t-sm)' }} disabled={!canAct || busy} onClick={close}>
                  Close finding
                </button>
              </div>
            </Panel>

            {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)' }}>{error}</p>}
          </div>

          <aside style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Info size={13} style={{ color: 'var(--rose)' }} />
                <p className="eyebrow">Three outcomes</p>
              </div>
              {[
                ['Attach', 'The weakness is already on the register. The finding becomes evidence that a control is failing — re-assess that risk.'],
                ['Create', 'Nothing on the register describes it. It becomes a draft risk for a reviewer to admit.'],
                ['Close', 'It is not a risk. Record why, so the decision survives the next sync and the next audit.'],
              ].map(([h, t]) => (
                <div key={h} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{h}</p>
                  <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>{t}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
