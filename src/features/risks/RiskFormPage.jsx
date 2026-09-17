import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Info, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRisks } from '@/hooks/useRisks'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useRiskMatrix, useRiskTolerances } from '@/hooks/useRiskGate'
import { logAudit, AUDIT } from '@/lib/audit'
import {
  RISK_CATEGORIES, RISK_SUBCATEGORIES, RISK_TYPES,
  RISK_DIRECTIONS, REVIEW_FREQUENCIES, RISK_SOURCES,
} from '@/lib/risks'
import { levelFor, DEFAULT_MATRIX } from '@/lib/matrix'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'

// ============================================================
// NEW / EDIT RISK — a page, not a dialog
//
// Raising a risk is a considered act with a dozen fields, four
// accountable roles and a scoring judgement behind it. Putting that in a
// modal with tabs forces the author to hold half the record in their
// head while the rest is hidden, and a modal cannot be linked to,
// returned to, or reviewed alongside anything else.
//
// Note what is NOT asked for here: treatment. You cannot sensibly choose
// between reduce, transfer, avoid and accept before the risk has been
// scored and put through the tolerance gate — that decision belongs on
// the detail page, after the gate has spoken.
// ============================================================

function Section({ step, title, hint, children }) {
  return (
    <section style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
    }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-3)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="tnum" style={{
            width: 19, height: 19, borderRadius: '50%', flexShrink: 0,
            background: 'var(--crimson)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--t-micro)', fontWeight: 600,
          }}>{step}</span>
          <h2 style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
        </div>
        {hint && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 5, paddingLeft: 28, maxWidth: 620 }}>{hint}</p>}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </section>
  )
}

function Field({ label, hint, required, error, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <p className="field-label">
        {label}{required && <span className="field-req"> *</span>}
      </p>
      {hint && <p className="field-help" style={{ marginBottom: 5 }}>{hint}</p>}
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

/** 1–5 rating. The scale point's label carries the meaning; the monetary and
 *  frequency bands behind it are set on the matrix, not restated per field. */
function Rating({ value, onChange, scale }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {scale.map(s => {
        const active = Number(value) === Number(s.value)
        return (
          <button key={s.value} type="button" onClick={() => onChange(s.value)}
            style={{
              flex: 1, padding: '8px 3px', borderRadius: 'var(--r-md)', cursor: 'pointer',
              border: `1px solid ${active ? 'var(--crimson)' : 'var(--border-2)'}`,
              background: active ? 'var(--crimson)' : 'var(--bg-2)',
              color: active ? '#fff' : 'var(--text-2)',
              transition: 'all var(--dur-2) var(--ease)',
            }}>
            <span className="tnum" style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: active ? 600 : 500 }}>{s.value}</span>
            <span style={{ display: 'block', fontSize: 'var(--t-micro)', marginTop: 1, opacity: active ? 0.9 : 0.65 }}>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function UserSelect({ value, onChange, members, placeholder = 'Unassigned' }) {
  return (
    <SelectField value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {members.map(m => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email || m.user_id?.slice(0, 8)} ({m.role})
        </option>
      ))}
    </SelectField>
  )
}

export function RiskFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { createRisk, updateRisk } = useRisks()
  const { user, organization } = useAuth()
  const { members } = usePeople()
  const { matrix } = useRiskMatrix()
  const { toleranceFor } = useRiskTolerances()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  const [form, setForm] = useState({
    title: '', cause: '', event: '', impact_statement: '',
    description: '', risk_drivers: '',
    category: '', subcategory: '', risk_type: 'Operational', business_unit: '',
    source: '', identified_date: new Date().toISOString().split('T')[0],
    framework_ref: '', risk_direction: 'Stable',
    inherent_likelihood: 3, inherent_impact: 3,
    owner_id: user?.id || '', assigned_to: '', reviewer_id: '', approver_id: '',
    review_frequency: 'Quarterly', review_date: '',
  })

  // Load the existing record when editing.
  useEffect(() => {
    if (!isEdit) return
    supabase.from('risks').select('*').eq('id', id).single().then(({ data, error: e }) => {
      if (e || !data) { setError('Could not load this risk.'); setLoading(false); return }
      setForm(f => ({
        ...f,
        ...Object.fromEntries(Object.keys(f).map(k => [k, data[k] ?? f[k]])),
        identified_date: data.identified_date?.split('T')[0] || f.identified_date,
        review_date: data.review_date?.split('T')[0] || '',
        inherent_likelihood: data.inherent_likelihood || data.likelihood || 3,
        inherent_impact: data.inherent_impact || data.impact || 3,
      }))
      setLoading(false)
    })
  }, [id, isEdit])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const lScale = matrix?.likelihood_scale || DEFAULT_MATRIX.likelihood_scale
  const iScale = matrix?.impact_scale || DEFAULT_MATRIX.impact_scale
  const level = levelFor(form.inherent_likelihood, form.inherent_impact, matrix)
  const tolerance = toleranceFor(form.category)
  const subcats = RISK_SUBCATEGORIES[form.category] || []

  const titleError = touched && !form.title.trim() ? 'A title is required' : ''
  const categoryError = touched && !form.category ? 'Pick a category — it decides which tolerance applies' : ''
  const valid = form.title.trim() && form.category

  const statementParts = [form.cause, form.event, form.impact_statement].filter(p => p?.trim()).length

  const save = async () => {
    setTouched(true)
    if (!valid) { setError('Fill in the required fields above.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        risk_statement: statementParts === 3
          ? `There is a risk that ${form.event.trim()} because ${form.cause.trim()}, resulting in ${form.impact_statement.trim()}`
          : undefined,
        owner_id: form.owner_id || null,
        assigned_to: form.assigned_to || null,
        reviewer_id: form.reviewer_id || null,
        approver_id: form.approver_id || null,
        review_date: form.review_date || null,
        identified_date: form.identified_date || null,
        source: form.source || null,
        likelihood: form.inherent_likelihood,
        impact: form.inherent_impact,
      }
      if (isEdit) {
        await updateRisk(id, payload, user?.id)
        await logAudit(organization?.id, AUDIT.RISK_UPDATED, 'risk', id, payload.title)
        navigate(`/app/risks/${id}`)
      } else {
        const risk = await createRisk({ ...payload, status: 'open', workflow_state: 'draft', created_by: user?.id })
        await logAudit(organization?.id, AUDIT.RISK_CREATED, 'risk', risk?.id ?? null, payload.title)
        navigate(`/app/risks/${risk.id}`)
      }
    } catch (e) {
      setError(e.message || 'Could not save this risk')
    } finally { setSaving(false) }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div>
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        padding: 'var(--s-4) var(--gutter)', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)', flexShrink: 0,
      }}>
        <button onClick={() => navigate(isEdit ? `/app/risks/${id}` : '/app/risks')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)',
            color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 7,
          }}>
          <ArrowLeft size={13} /> {isEdit ? 'Back to risk' : 'Back to Risk Register'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)' }}>
              {isEdit ? 'Edit risk' : 'Raise a new risk'}
            </h1>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', marginTop: 2 }}>
              {isEdit
                ? 'Changes are written to the audit trail. Scores are revised through the assessment, not here.'
                : 'It enters the register as a draft. A reviewer admits it, then it is scored and put through the tolerance gate.'}
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 'var(--s-5) var(--gutter) var(--s-10)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 20, alignItems: 'start', maxWidth: 1180 }}>

          {/* ── Form column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Section step={1} title="What is the risk?"
              hint="Write it as Cause → Event → Impact. “Weak passwords” is not a risk; it is a finding. A risk is testable: the cause is what you fix, the event is what you prevent, the impact is what you size.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Title" required error={titleError}>
                  <input className="risys-input" style={{ width: '100%' }} value={form.title} onChange={set('title')}
                    autoFocus placeholder="e.g. MFA not enforced on remote access" aria-invalid={!!titleError} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <Field label="Cause" hint="What is wrong today — this is what the mitigation fixes">
                    <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical' }}
                      value={form.cause} onChange={set('cause')}
                      placeholder="e.g. the legacy VPN concentrator does not support MFA, and no proxy sits in front of it" />
                  </Field>
                  <Field label="Event" hint="What happens as a result — this is what the control prevents">
                    <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical' }}
                      value={form.event} onChange={set('event')}
                      placeholder="e.g. an attacker with stolen credentials authenticates as a privileged user" />
                  </Field>
                  <Field label="Impact" hint="What it costs — this is what you score">
                    <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical' }}
                      value={form.impact_statement} onChange={set('impact_statement')}
                      placeholder="e.g. lateral movement to customer PII, ECC non-compliance, PDPL breach notification" />
                  </Field>
                </div>

                {statementParts === 3 && (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <p className="eyebrow" style={{ marginBottom: 4 }}>Reads as</p>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text)', lineHeight: 1.55 }}>
                      There is a risk that <strong>{form.event.trim()}</strong> because {form.cause.trim()}, resulting in {form.impact_statement.trim()}.
                    </p>
                  </div>
                )}

                <Field label="Additional context" hint="Optional — anything a reviewer needs that the statement does not carry">
                  <textarea className="risys-input" rows={2} style={{ width: '100%', resize: 'vertical' }}
                    value={form.description} onChange={set('description')} placeholder="Background, affected systems, related incidents…" />
                </Field>
              </div>
            </Section>

            <Section step={2} title="Classification"
              hint="The category is not cosmetic — it selects which tolerance rules the gate will hold this risk to.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Category" required error={categoryError}>
                  <SelectField value={form.category} onChange={e => { setVal('category', e.target.value); setVal('subcategory', '') }}
                    placeholder="Select a category">
                    <option value="">Select a category…</option>
                    {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                </Field>
                <Field label="Subcategory">
                  <SelectField value={form.subcategory} onChange={set('subcategory')} disabled={!subcats.length}>
                    <option value="">{subcats.length ? 'Select…' : 'Pick a category first'}</option>
                    {subcats.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                </Field>
                <Field label="Risk type">
                  <SelectField value={form.risk_type} onChange={set('risk_type')}>
                    {RISK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </Field>
                <Field label="Business unit">
                  <input className="risys-input" style={{ width: '100%' }} value={form.business_unit}
                    onChange={set('business_unit')} placeholder="e.g. Infrastructure, Finance" />
                </Field>
                <Field label="Source" hint="Where this came from">
                  <SelectField value={form.source} onChange={set('source')}>
                    <option value="">Select…</option>
                    {RISK_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectField>
                </Field>
                <Field label="Identified on">
                  <DateField value={form.identified_date} onChange={set('identified_date')} aria-label="Identified on" />
                </Field>
                <Field label="Framework reference" hint="Optional clause mapping">
                  <input className="risys-input mono" style={{ width: '100%' }} value={form.framework_ref}
                    onChange={set('framework_ref')} placeholder="e.g. NCA ECC 2-2-3-2" />
                </Field>
                <Field label="Direction">
                  <SelectField value={form.risk_direction} onChange={set('risk_direction')}>
                    {RISK_DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </SelectField>
                </Field>
              </div>
            </Section>

            <Section step={3} title="Inherent assessment"
              hint="Rate as if no controls existed. The question is not “how bad is it today” but “how bad is this class of exposure by nature”. Controls are credited later, in the residual score.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Field label="Likelihood">
                  <Rating value={form.inherent_likelihood} onChange={v => setVal('inherent_likelihood', v)} scale={lScale} />
                </Field>
                <Field label="Impact" hint="Rate financial, regulatory and operational separately, then take the highest">
                  <Rating value={form.inherent_impact} onChange={v => setVal('inherent_impact', v)} scale={iScale} />
                </Field>
              </div>
            </Section>

            <Section step={4} title="Accountability and cadence"
              hint="Four separate roles, deliberately. If the person fixing a risk is also the person confirming it is fixed, there is no independent accountability — and an auditor will say so.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Risk owner" hint="Accountable for the outcome; signs off scores">
                  <UserSelect value={form.owner_id} onChange={v => setVal('owner_id', v)} members={members} />
                </Field>
                <Field label="Assigned to" hint="Delivers the treatment">
                  <UserSelect value={form.assigned_to} onChange={v => setVal('assigned_to', v)} members={members} />
                </Field>
                <Field label="Reviewer (second line)" hint="Admits the risk to the register">
                  <UserSelect value={form.reviewer_id} onChange={v => setVal('reviewer_id', v)} members={members} />
                </Field>
                <Field label="Approver">
                  <UserSelect value={form.approver_id} onChange={v => setVal('approver_id', v)} members={members} />
                </Field>
                <Field label="Review frequency">
                  <SelectField value={form.review_frequency} onChange={set('review_frequency')}>
                    {REVIEW_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </SelectField>
                </Field>
                <Field label="Next review date">
                  <DateField value={form.review_date} onChange={set('review_date')} aria-label="Next review date" />
                </Field>
              </div>

              {form.owner_id && form.owner_id === form.assigned_to && (
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px',
                  borderRadius: 'var(--r-md)', background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)',
                }}>
                  <AlertTriangle size={13} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>
                    The risk owner and the treatment owner are the same person. That is allowed, but it means nobody
                    independent confirms the fix — expect a reviewer to challenge it.
                  </p>
                </div>
              )}
            </Section>

            {error && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)' }}>{error}</p>
            )}
          </div>

          {/* ── Live summary rail ── */}
          <aside style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-3)', background: 'var(--surface)' }}>
                <p className="eyebrow">Inherent score</p>
              </div>
              <div style={{ padding: '16px 14px', textAlign: 'center', background: level.bg }}>
                <p className="tnum" style={{ fontSize: 34, fontWeight: 300, color: level.color, lineHeight: 1 }}>
                  {level.score}
                </p>
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: level.color, marginTop: 4 }}>{level.label}</p>
                <p className="tnum" style={{ fontSize: 'var(--t-micro)', color: level.color, opacity: 0.75, marginTop: 3 }}>
                  L{form.inherent_likelihood} × I{form.inherent_impact}
                </p>
              </div>
              <div style={{ padding: '11px 14px' }}>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Residual risk is scored after controls are mapped. Until then the gate has nothing to judge.
                </p>
              </div>
            </div>

            {/* Which tolerance will govern this risk */}
            <div style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '13px 14px',
            }}>
              <p className="eyebrow" style={{ marginBottom: 7 }}>Tolerance that will apply</p>
              {!form.category ? (
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                  Choose a category to see the rules this risk will be held to.
                </p>
              ) : tolerance ? (
                <>
                  {tolerance.appetite_statement && (
                    <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', fontStyle: 'italic', marginBottom: 7 }}>
                      “{tolerance.appetite_statement}”
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(tolerance.rules || []).map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <Check size={11} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 3 }} />
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                  No tolerance rules are set for {form.category}. The gate will abstain until one is defined.
                </p>
              )}
            </div>

            <div style={{
              display: 'flex', gap: 8, padding: '11px 13px', borderRadius: 'var(--r-md)',
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <Info size={13} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', lineHeight: 1.55 }}>
                Treatment is not chosen here. Reduce, transfer, avoid or accept is decided after the gate has
                judged the residual score — choosing beforehand puts the answer before the question.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--t-sm)', padding: '9px' }}
                onClick={save} disabled={saving}>
                {saving ? <Spinner size="sm" /> : (isEdit ? 'Save changes' : 'Add to register')}
              </button>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--t-sm)' }}
                onClick={() => navigate(isEdit ? `/app/risks/${id}` : '/app/risks')} disabled={saving}>
                Cancel
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
