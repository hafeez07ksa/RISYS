import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Plus, Trash2, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Stepper } from '@/components/ui/Stepper'
import { SelectField } from '@/components/ui/Combobox'
import { Spinner } from '@/components/ui/Spinner'
import { useRisks, useRiskControls } from '@/hooks/useRisks'
import { useRiskScoring, useGateVerdict } from '@/hooks/useRiskGate'
import { levelFor, scalePoint, DEFAULT_MATRIX } from '@/lib/matrix'
import { residualDropWarning, coverageGaps } from '@/lib/gate'
import { COVERAGE_OPTIONS, REDUCES_OPTIONS } from '@/lib/risks'
import { GatePanel, CoverageGapNotice } from './GatePanel'

// ============================================================
// THE ASSESSMENT, AS A SEQUENCE
//
// The process doc describes seven stages, and the order is not
// cosmetic — each one is only answerable once the previous is done.
// You cannot credit a control before you have mapped it, and you
// cannot judge a residual score before you know what the controls
// actually cover. Running it as a flow makes that dependency visible
// instead of leaving five disconnected fields on a form.
//
//   Statement -> Inherent -> Controls -> Residual -> Gate
//
// Everything up to the gate is measurement. The gate is where the
// system starts doing something.
// ============================================================

const STEPS = [
  { value: 'statement', label: 'Statement' },
  { value: 'inherent',  label: 'Inherent' },
  { value: 'controls',  label: 'Controls' },
  { value: 'residual',  label: 'Residual' },
  { value: 'verdict',   label: 'Gate' },
]

/**
 * A 1–5 picker that shows the written definition for the point being
 * chosen. The arithmetic is trivial; these sentences are what make a
 * "3" mean the same thing to two different assessors.
 */
export function ScorePicker({ label, scale, value, onChange, accent = 'var(--crimson)' }) {
  const point = scalePoint(scale, value)
  return (
    <div>
      <p className="field-label">{label}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {scale.map(s => {
          const active = Number(value) === Number(s.value)
          return (
            <button key={s.value} type="button" onClick={() => onChange(s.value)}
              title={s.definition}
              style={{
                flex: 1, padding: '9px 4px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                border: `1px solid ${active ? accent : 'var(--border-2)'}`,
                background: active ? accent : 'var(--bg-2)',
                color: active ? '#fff' : 'var(--text-2)',
                fontSize: 'var(--t-sm)', fontWeight: active ? 600 : 400,
                transition: 'all var(--dur-2) var(--ease)',
              }}>
              <span className="tnum" style={{ display: 'block', fontSize: 'var(--t-section)' }}>{s.value}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-micro)', marginTop: 2, opacity: active ? 0.9 : 0.7 }}>
                {s.label}
              </span>
            </button>
          )
        })}
      </div>
      <p style={{
        fontSize: 'var(--t-meta)', color: 'var(--text-2)', marginTop: 7, minHeight: 30,
        padding: '6px 9px', background: 'var(--surface)', borderRadius: 'var(--r)',
      }}>
        {point ? point.definition : 'Choose a rating to see its definition.'}
      </p>
    </div>
  )
}

/** Score readout: the number, its band, and where it came from. */
function ScoreReadout({ l, i, matrix, caption }) {
  const level = levelFor(l, i, matrix)
  return (
    <div style={{
      borderRadius: 'var(--r-md)', border: `1px solid ${level.border}`, background: level.bg,
      padding: '12px 14px', textAlign: 'center', minWidth: 132,
    }}>
      <p className="eyebrow" style={{ color: level.color, opacity: 0.8 }}>{caption}</p>
      <p className="tnum" style={{ fontSize: 'var(--t-metric)', fontWeight: 300, color: level.color, lineHeight: 1.1, marginTop: 4 }}>
        {level.score ?? '—'}
      </p>
      <p style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: level.color, marginTop: 2 }}>{level.label}</p>
      {level.score != null && (
        <p className="tnum" style={{ fontSize: 'var(--t-micro)', color: level.color, opacity: 0.75, marginTop: 3 }}>
          L{l} × I{i}
        </p>
      )}
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>{title}</p>
      {hint && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 3, marginBottom: 10, maxWidth: 640 }}>{hint}</p>}
      {children}
    </div>
  )
}

/**
 * Where a re-assessment should open.
 *
 * Each step saves as you leave it, so walking a scored risk back through
 * Statement and Inherent just to revise residual would append a duplicate
 * "no change" inherent row to the permanent score history every time. When
 * the statement and inherent score already stand and the risk is past
 * admission, open at Residual; earlier steps remain clickable to revise.
 */
function initialStep(risk) {
  const statementDone = risk.cause?.trim() && risk.event?.trim() && risk.impact_statement?.trim()
  const inherentDone = risk.inherent_likelihood && risk.inherent_impact
  const pastAdmission = ['assessed', 'treatment_required', 'under_treatment', 'accepted', 'monitored']
    .includes(risk.workflow_state)
  return statementDone && inherentDone && pastAdmission ? 3 : 0
}

export function AssessmentFlow({ risk, onClose, onSaved }) {
  const [step, setStep] = useState(() => initialStep(risk))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [verdict, setVerdict] = useState(null)

  const { updateRisk } = useRisks()
  const { controls, allControls, mappings, linkControl, updateMapping, unlinkControl } = useRiskControls(risk.id)
  const { saveScore, matrix } = useRiskScoring(risk, onSaved)

  const [statement, setStatement] = useState({
    cause: risk.cause || '',
    event: risk.event || '',
    impact_statement: risk.impact_statement || '',
  })
  const [inherent, setInherent] = useState({
    l: risk.inherent_likelihood || 3,
    i: risk.inherent_impact || 3,
    justification: '',
  })
  const [residual, setResidual] = useState({
    l: risk.residual_likelihood || risk.inherent_likelihood || 3,
    i: risk.residual_impact || risk.inherent_impact || 3,
    justification: '',
  })

  const cfg = matrix || DEFAULT_MATRIX
  const lScale = cfg.likelihood_scale || DEFAULT_MATRIX.likelihood_scale
  const iScale = cfg.impact_scale || DEFAULT_MATRIX.impact_scale

  const gaps = useMemo(() => coverageGaps(mappings, controls), [mappings, controls])

  // Controls that actually earn credit: linked, covering something, and
  // not failing their last test.
  const creditedControls = useMemo(() => mappings.filter(m => {
    const c = controls.find(x => x.id === m.control_id)
    return c && m.coverage !== 'none' && c.testing_status !== 'Fail'
  }).length, [mappings, controls])

  const dropWarning = useMemo(() => residualDropWarning({
    inherentScore: inherent.l * inherent.i,
    residualScore: residual.l * residual.i,
    creditedControls,
  }), [inherent, residual, creditedControls])

  const liveVerdict = useGateVerdict({
    risk: { ...risk, residual_likelihood: residual.l, residual_impact: residual.i, residual_score: residual.l * residual.i },
    mappings, controls,
  })

  const statementComplete = statement.cause.trim() && statement.event.trim() && statement.impact_statement.trim()

  const next = async () => {
    setError('')
    setSaving(true)
    try {
      if (step === 0) {
        // Keep the legacy single-field statement in step, so anything
        // still reading risk_statement shows the same sentence.
        await updateRisk(risk.id, {
          ...statement,
          risk_statement: `There is a risk that ${statement.event.trim()} because ${statement.cause.trim()}, resulting in ${statement.impact_statement.trim()}`,
        })
      }
      if (step === 1) {
        await saveScore('inherent', { likelihood: inherent.l, impact: inherent.i, justification: inherent.justification })
      }
      if (step === 3) {
        const v = await saveScore('residual', { likelihood: residual.l, impact: residual.i, justification: residual.justification })
        setVerdict(v)
      }
      setStep(s => Math.min(s + 1, STEPS.length - 1))
    } catch (e) {
      setError(e.message || 'Could not save this step')
    } finally { setSaving(false) }
  }

  const canAdvance = () => {
    if (step === 0) return statementComplete
    if (step === 1) return inherent.l && inherent.i && inherent.justification.trim().length >= 10
    if (step === 3) return residual.l && residual.i && residual.justification.trim().length >= 10
    return true
  }

  const unlinked = allControls.filter(c => !mappings.some(m => m.control_id === c.id))

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <header style={{
          padding: 'var(--s-4) var(--gutter)', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)', flexShrink: 0,
        }}>
          <button onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text-3)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 7,
            }}>
            <ArrowLeft size={13} /> Back to risk
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">Risk assessment · {risk.risk_id}</p>
              <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{risk.title}</h1>
            </div>
          </div>
          <div style={{ marginTop: 16, maxWidth: 760 }}>
            <Stepper steps={STEPS} current={step} onStepClick={setStep} />
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 'var(--s-5) var(--gutter)' }}>
          <div style={{ maxWidth: 760 }}>

          {/* ── 1. Statement ─────────────────────────────────────────── */}
          {step === 0 && (
            <>
              <Section
                title="Write it as Cause → Event → Impact"
                hint="“Weak passwords” is not a risk. A risk is testable: the cause is what you fix, the event is what you prevent, the impact is what you size. If any of the three cannot be pointed at, the risk is written badly.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <p className="field-label">Cause <span className="field-req">*</span></p>
                    <p className="field-help" style={{ marginBottom: 5 }}>What is wrong today. This is what the mitigation fixes.</p>
                    <textarea className="risys-input" rows={2} value={statement.cause}
                      onChange={e => setStatement(s => ({ ...s, cause: e.target.value }))}
                      placeholder="e.g. the legacy VPN concentrator does not support SAML or RADIUS-based MFA, and no proxy sits in front of it"
                      style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                  <div>
                    <p className="field-label">Event <span className="field-req">*</span></p>
                    <p className="field-help" style={{ marginBottom: 5 }}>What happens as a result. This is what the control prevents.</p>
                    <textarea className="risys-input" rows={2} value={statement.event}
                      onChange={e => setStatement(s => ({ ...s, event: e.target.value }))}
                      placeholder="e.g. an attacker using stolen credentials authenticates as a legitimate privileged user and gains network-level access"
                      style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                  <div>
                    <p className="field-label">Impact <span className="field-req">*</span></p>
                    <p className="field-help" style={{ marginBottom: 5 }}>What it costs. This is what you score.</p>
                    <textarea className="risys-input" rows={2} value={statement.impact_statement}
                      onChange={e => setStatement(s => ({ ...s, impact_statement: e.target.value }))}
                      placeholder="e.g. lateral movement to customer PII, ransomware deployment, ECC non-compliance and PDPL breach notification to SDAIA"
                      style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                </div>
              </Section>

              {statementComplete && (
                <div style={{ padding: '11px 13px', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="eyebrow" style={{ marginBottom: 4 }}>Reads as</p>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text)', lineHeight: 1.5 }}>
                    There is a risk that <strong>{statement.event.trim()}</strong> because {statement.cause.trim()},
                    resulting in {statement.impact_statement.trim()}.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── 2. Inherent ──────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <Section
                title="Score as if no controls existed"
                hint="The question is not “how bad is it today” but “how bad is this class of exposure by nature”. Controls get credited in the residual score, not here.">
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <ScorePicker label="Likelihood" scale={lScale} value={inherent.l}
                      onChange={v => setInherent(s => ({ ...s, l: v }))} />
                    <ScorePicker label="Impact" scale={iScale} value={inherent.i}
                      onChange={v => setInherent(s => ({ ...s, i: v }))} />
                  </div>
                  <ScoreReadout l={inherent.l} i={inherent.i} matrix={cfg} caption="Inherent" />
                </div>
              </Section>

              <div>
                <p className="field-label">Justification <span className="field-req">*</span></p>
                <p className="field-help" style={{ marginBottom: 5 }}>
                  Recorded permanently against this score. An auditor reads this before the number.
                </p>
                <textarea className="risys-input" rows={3} value={inherent.justification}
                  onChange={e => setInherent(s => ({ ...s, justification: e.target.value }))}
                  placeholder="e.g. Credential stuffing runs continuously against any internet-facing VPN and corporate credentials appear in public breach dumps. Privileged accounts are in scope, so the event leads to domain-level access."
                  style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </>
          )}

          {/* ── 3. Controls ──────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <Section
                title="Map the controls, and say what each one covers"
                hint="A control can be well designed, operating effectively, and completely irrelevant to this risk because its scope excludes the asset. Coverage is recorded on the link, not on the control, because the same control may fully cover one risk and miss another.">
                {gaps.length > 0 && <CoverageGapNotice gaps={gaps} />}

                {mappings.length === 0 && (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', padding: '14px 0' }}>
                    No controls linked yet. A risk with no controls mapped keeps its inherent score as its residual score.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mappings.map(m => {
                    const c = controls.find(x => x.id === m.control_id)
                    if (!c) return null
                    return (
                      <div key={m.control_id} style={{
                        border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', background: 'var(--bg-2)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span className="mono" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{c.control_id}</span>
                          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)', flex: 1 }}>{c.name}</span>
                          <span className="badge badge-neutral">{c.testing_status || 'Not Tested'}</span>
                          <button onClick={() => unlinkControl(m.control_id)} className="btn-ghost" style={{ padding: 4 }} title="Unlink">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <SelectField label="Coverage of this risk" size="sm" value={m.coverage || 'full'}
                            onChange={e => updateMapping(m.control_id, { coverage: e.target.value })}>
                            {COVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </SelectField>
                          <SelectField label="Reduces" size="sm" value={m.reduces || 'both'}
                            onChange={e => updateMapping(m.control_id, { reduces: e.target.value })}>
                            {REDUCES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </SelectField>
                        </div>
                        {(m.coverage === 'partial' || m.coverage === 'none') && (
                          <input className="risys-input" style={{ width: '100%', marginTop: 8 }}
                            defaultValue={m.coverage_note || ''}
                            onBlur={e => updateMapping(m.control_id, { coverage_note: e.target.value })}
                            placeholder="What does it exclude? e.g. SaaS apps only — excludes the VPN" />
                        )}
                      </div>
                    )
                  })}
                </div>

                {unlinked.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <SelectField label="Link an existing control" size="sm" value=""
                        onChange={e => e.target.value && linkControl(e.target.value)}>
                        <option value="">Select a control…</option>
                        {unlinked.map(c => <option key={c.id} value={c.id}>{c.control_id} — {c.name}</option>)}
                      </SelectField>
                    </div>
                    <Plus size={14} style={{ color: 'var(--text-3)', marginBottom: 10 }} />
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ── 4. Residual ──────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <Section
                title="Score again, crediting only the controls that actually apply"
                hint="Credit a control for the part of the scope it covers and no more. A control rated effective but covering none of this risk earns nothing.">
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <ScorePicker label="Likelihood" scale={lScale} value={residual.l}
                      onChange={v => setResidual(s => ({ ...s, l: v }))} />
                    <ScorePicker label="Impact" scale={iScale} value={residual.i}
                      onChange={v => setResidual(s => ({ ...s, i: v }))} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <ScoreReadout l={inherent.l} i={inherent.i} matrix={cfg} caption="Inherent" />
                    <div style={{ textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>↓</div>
                    <ScoreReadout l={residual.l} i={residual.i} matrix={cfg} caption="Residual" />
                  </div>
                </div>

                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 10 }}>
                  {creditedControls === 0
                    ? 'No controls are currently earning credit against this risk.'
                    : `${creditedControls} control${creditedControls === 1 ? '' : 's'} covering this risk and not failing its last test.`}
                </p>

                {dropWarning && (
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '10px 12px',
                    borderRadius: 'var(--r-md)', background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)',
                  }}>
                    <AlertTriangle size={13} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>{dropWarning}</p>
                  </div>
                )}
              </Section>

              <div>
                <p className="field-label">Justification <span className="field-req">*</span></p>
                <p className="field-help" style={{ marginBottom: 5 }}>
                  Name the controls carrying the reduction and what they leave uncovered.
                </p>
                <textarea className="risys-input" rows={3} value={residual.justification}
                  onChange={e => setResidual(s => ({ ...s, justification: e.target.value }))}
                  placeholder="e.g. Lockout and password policy stop naive brute force, but neither stops a valid stolen password and 47 accounts remain exposed. Logging gives post-hoc detection only — no alert rule is configured."
                  style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </>
          )}

          {/* ── 5. Verdict ───────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <Section
                title="The gate"
                hint="Everything above was data entry. Everything below is the consequence, and none of it needed a human to decide it.">
                <div style={{ margin: '0 calc(var(--gutter) * -1)' }}>
                  <GatePanel verdict={verdict || liveVerdict} risk={risk} />
                </div>
              </Section>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
                borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)',
              }}>
                {(verdict || liveVerdict)?.passed
                  ? <ShieldCheck size={15} style={{ color: 'var(--low)', flexShrink: 0 }} />
                  : <ShieldAlert size={15} style={{ color: 'var(--critical)', flexShrink: 0 }} />}
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
                  {(verdict || liveVerdict)?.passed
                    ? 'The risk has moved to Monitored. It will reopen automatically if a KRI breaches, a control test fails, or its evidence expires.'
                    : 'The risk has moved to Treatment Required, the SLA clock has started, and the owner and reviewer have been notified.'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)', marginTop: 12 }}>{error}</p>
          )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px var(--gutter)', borderTop: '1px solid var(--border)', background: 'var(--bg-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0,
        }}>
          <button className="btn-ghost" style={{ fontSize: 'var(--t-sm)', visibility: step === 0 ? 'hidden' : 'visible' }}
            onClick={() => setStep(s => Math.max(0, s - 1))} disabled={saving}>
            <ArrowLeft size={13} /> Back
          </button>

          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
            Step {step + 1} of {STEPS.length}
          </span>

          {step === STEPS.length - 1 ? (
            <button className="btn-primary" style={{ fontSize: 'var(--t-sm)' }} onClick={() => { onSaved?.(); onClose() }}>
              Done
            </button>
          ) : (
            <button className="btn-primary" style={{ fontSize: 'var(--t-sm)', opacity: canAdvance() && !saving ? 1 : 0.5 }}
              onClick={next} disabled={!canAdvance() || saving}>
              {saving ? <Spinner size="sm" /> : <>{step === 3 ? 'Run the gate' : 'Continue'} <ArrowRight size={13} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


/**
 * Route wrapper for /app/risks/:id/assess.
 *
 * The flow itself stays prop-driven so it can still be rendered outside
 * a router — the same convention ComplianceRoutes uses.
 */
export function AssessmentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [risk, setRisk] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase.from('risks').select('*').eq('id', id).single()
      .then(({ data }) => { setRisk(data); setLoading(false) })
  }, [id])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div>
  }
  if (!risk) {
    return (
      <div style={{ padding: '60px var(--gutter)', textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--t-body)', color: 'var(--text-2)' }}>That risk could not be found.</p>
        <button className="btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/app/risks')}>
          Back to Risk Register
        </button>
      </div>
    )
  }

  return (
    <AssessmentFlow
      risk={risk}
      onClose={() => navigate(`/app/risks/${id}`)}
      onSaved={() => supabase.from('risks').select('*').eq('id', id).single().then(({ data }) => data && setRisk(data))}
    />
  )
}
