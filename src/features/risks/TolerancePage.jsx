import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronRight, ShieldAlert, Save, Info, UserPlus, X, Scale } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { SelectField } from '@/components/ui/Combobox'
import { Spinner } from '@/components/ui/Spinner'
import { BackLink } from '@/components/ui/BackLink'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useRisks } from '@/hooks/useRisks'
import { useRiskTolerances, useRiskMatrix } from '@/hooks/useRiskGate'
import { GATE_METRICS, GATE_OPERATORS, metricMeta, operatorLabel, evaluateGate, buildSignals } from '@/lib/gate'
import { RISK_CATEGORIES, RISK_APPETITES } from '@/lib/risks'
import { BAND_ORDER, bandMeta } from '@/lib/matrix'
import { usePeople } from '@/hooks/usePeople'
import { useAuthorityHolders } from '@/hooks/useTreatment'
import { AUTHORITY_TIERS, BAND_AUTHORITY, EXCEPTION_FLOOR, tierMeta } from '@/lib/authority'

// ============================================================
// TOLERANCE CONFIGURATION
//
// Appetite is direction. Tolerance is the line.
//
// "Low appetite for cyber risk on internet-facing assets" is a board
// statement — useful, but nothing can evaluate it. The tolerance next to
// it has to be a rule a machine can read, because the gate re-runs on
// every score change and no human is in that loop.
//
// The breach counts shown beside each rule are the point of this screen:
// a threshold typed into a settings page is abstract until you can see
// how many risks it just put outside the line.
// ============================================================

const BLANK_RULE = { metric: 'residual_score', operator: '<=', value: 8, label: '' }

function RuleEditor({ rule, onChange, onRemove, breachCount }) {
  const meta = metricMeta(rule.metric)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px',
      borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg-2)',
    }}>
      <div style={{ flex: 2, minWidth: 0 }}>
        <SelectField label="Metric" size="sm" value={rule.metric}
          onChange={e => onChange({ ...rule, metric: e.target.value })}>
          {GATE_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </SelectField>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <SelectField label="Must be" size="sm" value={rule.operator}
          onChange={e => onChange({ ...rule, operator: e.target.value })}>
          {GATE_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
      </div>
      <div style={{ width: 78 }}>
        <p className="field-label">Value</p>
        <input className="risys-input tnum" type="number" value={rule.value} style={{ width: '100%' }}
          onChange={e => onChange({ ...rule, value: Number(e.target.value) })} />
      </div>

      <div style={{ minWidth: 96, textAlign: 'right', paddingBottom: 8 }}>
        {breachCount > 0 ? (
          <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)', fontWeight: 600 }}>
            {breachCount} would breach
          </span>
        ) : (
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>none breach</span>
        )}
      </div>

      <button onClick={onRemove} className="btn-ghost" style={{ padding: 6, marginBottom: 4 }} title="Remove rule">
        <Trash2 size={13} />
      </button>

      <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }}>{meta.hint}</span>
    </div>
  )
}

function CategoryCard({ category, tolerance, risks, matrix, canEdit, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const current = draft || {
    appetite: tolerance?.appetite || 'Cautious',
    appetite_statement: tolerance?.appetite_statement || '',
    rules: tolerance?.rules?.length ? tolerance.rules : [BLANK_RULE],
    max_accept_band: tolerance?.max_accept_band || 'medium',
    treatment_sla_days: tolerance?.treatment_sla_days ?? 10,
    escalate_to: tolerance?.escalate_to || '',
  }

  const categoryRisks = useMemo(
    () => risks.filter(r => r.category === category && r.workflow_state !== 'closed'),
    [risks, category]
  )

  // How many risks each individual rule would put outside the line.
  // Computed against the risks as they stand right now, which is what
  // turns a number in a form into a decision.
  const breachPerRule = useMemo(() => current.rules.map(rule => {
    const single = { ...current, rules: [rule] }
    return categoryRisks.filter(r => {
      const v = evaluateGate({ risk: r, tolerance: single, signals: buildSignals({ risk: r }), matrix })
      return v.evaluated && !v.passed
    }).length
  }), [current, categoryRisks, matrix])

  // What the gate has actually recorded. This must agree with the register,
  // so it reads the persisted verdict rather than re-evaluating — drafts
  // have not been through the gate and are not "outside" anything yet.
  const recordedBreaches = useMemo(
    () => categoryRisks.filter(r => r.tolerance_status === 'breached').length,
    [categoryRisks]
  )

  // A preview of what these rules would catch against current scores,
  // including risks not yet assessed. Labelled as a preview, never as fact.
  const wouldBreach = useMemo(() => categoryRisks.filter(r => {
    const v = evaluateGate({ risk: r, tolerance: current, signals: buildSignals({ risk: r }), matrix })
    return v.evaluated && !v.passed
  }).length, [current, categoryRisks, matrix])

  const update = (patch) => setDraft({ ...current, ...patch })

  const save = async () => {
    setSaving(true); setError('')
    try {
      await onSave(category, {
        ...current,
        rules: current.rules.filter(r => r.metric && r.operator && r.value !== '' && r.value !== null)
          .map(r => ({ ...r, label: r.label || `${metricMeta(r.metric).label} ${operatorLabel(r.operator)} ${r.value}` })),
      })
      setDraft(null)
    } catch (e) {
      setError(e.message || 'Could not save. If the tolerance table does not exist yet, apply 002_risk_gate.sql first.')
    } finally { setSaving(false) }
  }


  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />}

        <span style={{ fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--text)', flex: 1 }}>
          {category}
        </span>

        {!tolerance && (
          <span className="badge badge-neutral">No rules set</span>
        )}
        {tolerance && (
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
            {tolerance.rules?.length || 0} rule{(tolerance.rules?.length || 0) === 1 ? '' : 's'}
          </span>
        )}

        <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', minWidth: 62, textAlign: 'right' }}>
          {categoryRisks.length} risk{categoryRisks.length === 1 ? '' : 's'}
        </span>

        {/* Two different numbers, kept visually distinct: what the gate has
            recorded (matches the register), and what these rules would
            catch once the remaining risks are assessed (a preview). */}
        {recordedBreaches > 0 && (
          <span className="badge" title="Recorded outside tolerance by the gate"
            style={{ color: 'var(--critical)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)' }}>
            {recordedBreaches} outside
          </span>
        )}
        {wouldBreach > recordedBreaches && (
          <span className="badge"
            title="Risks these rules would catch against their current scores once they are assessed"
            style={{ color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {wouldBreach - recordedBreaches} would breach once assessed
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border-3)' }}>

          {/* Appetite — prose, deliberately */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginTop: 14 }}>
            <SelectField label="Appetite" size="sm" value={current.appetite} disabled={!canEdit}
              onChange={e => update({ appetite: e.target.value })}>
              {RISK_APPETITES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </SelectField>
            <div>
              <p className="field-label">Appetite statement</p>
              <input className="risys-input" style={{ width: '100%' }} disabled={!canEdit}
                value={current.appetite_statement}
                onChange={e => update({ appetite_statement: e.target.value })}
                placeholder="e.g. Low appetite for cyber risk on internet-facing assets." />
            </div>
          </div>
          <p className="field-help" style={{ marginTop: 5 }}>
            Direction, for the board. Nothing evaluates this — the rules below are what the gate reads.
          </p>

          {/* Tolerance — the evaluable part */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p className="eyebrow">Tolerance rules — all must pass</p>
              {canEdit && (
                <button className="btn-ghost" style={{ fontSize: 'var(--t-meta)' }}
                  onClick={() => update({ rules: [...current.rules, { ...BLANK_RULE }] })}>
                  <Plus size={12} /> Add rule
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {current.rules.map((rule, idx) => (
                <RuleEditor key={idx} rule={rule} breachCount={breachPerRule[idx]}
                  onChange={r => update({ rules: current.rules.map((x, k) => k === idx ? r : x) })}
                  onRemove={() => update({ rules: current.rules.filter((_, k) => k !== idx) })} />
              ))}
              {current.rules.length === 0 && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', padding: '10px 0' }}>
                  No rules. The gate will abstain for this category and no risk in it can breach.
                </p>
              )}
            </div>
          </div>

          {/* Consequences */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 18 }}>
            <div>
              <p className="field-label">Who can accept</p>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                Set by band, not by category — see <strong>Acceptance authority</strong> above. Outside this tolerance an acceptance is an exception and needs at least the Steering Committee.
              </p>
            </div>
            <div>
              <p className="field-label">Treatment SLA (days)</p>
              <input className="risys-input tnum" type="number" style={{ width: '100%' }} disabled={!canEdit}
                value={current.treatment_sla_days}
                onChange={e => update({ treatment_sla_days: Number(e.target.value) })} />
              <p className="field-help" style={{ marginTop: 4 }}>Clock starts the moment the gate fails.</p>
            </div>
            <div>
              <p className="field-label">Escalate to</p>
              <input className="risys-input" style={{ width: '100%' }} disabled={!canEdit}
                value={current.escalate_to}
                onChange={e => update({ escalate_to: e.target.value })}
                placeholder="e.g. Cybersecurity Steering Committee" />
              <p className="field-help" style={{ marginTop: 4 }}>Named on every breach notification.</p>
            </div>
          </div>

          {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)', marginTop: 12 }}>{error}</p>}

          {canEdit && draft && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" style={{ fontSize: 'var(--t-sm)' }} onClick={() => { setDraft(null); setError('') }}>
                Discard
              </button>
              <button className="btn-primary" style={{ fontSize: 'var(--t-sm)' }} onClick={save} disabled={saving}>
                {saving ? <Spinner size="sm" /> : <><Save size={12} /> Save tolerance</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TolerancePage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { risks, loading: risksLoading } = useRisks()
  const { loading, migrated, toleranceFor, saveTolerance } = useRiskTolerances()
  const { matrix } = useRiskMatrix()

  const totalOutside = risks.filter(r => r.tolerance_status === 'breached').length

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Risk Tolerances"
        subtitle={organization?.name}
        actions={
          <button className="btn-secondary" style={{ fontSize: 'var(--t-sm)' }} onClick={() => navigate('/app/risks')}>
            Back to register
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">
        <BackLink to={() => navigate('/app/risks')} label="Risk Register" style={{ marginBottom: 12 }} />

        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 'var(--r-md)',
          background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 18,
        }}>
          <Info size={15} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text)', lineHeight: 1.6 }}>
              These rules are the only thing standing between a register and a spreadsheet. Every time a residual
              score changes, a control test fails or evidence expires, each risk is re-checked against the rules for
              its category. Failing one makes treatment mandatory, disables Accept, starts the SLA clock and
              notifies the escalation path — with nobody pressing a button.
            </p>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 6 }}>
              {totalOutside > 0
                ? `${totalOutside} risk${totalOutside === 1 ? '' : 's'} currently sit outside tolerance.`
                : 'No risks are currently recorded as outside tolerance.'}
            </p>
          </div>
        </div>

        {!migrated && (
          <div style={{
            display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 'var(--r-md)',
            background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)', marginBottom: 18,
          }}>
            <ShieldAlert size={14} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
              The <span className="mono">risk_tolerances</span> table is not readable yet. Apply
              {' '}<span className="mono">supabase/migrations/002_risk_gate.sql</span> in the Supabase SQL editor —
              it seeds a sensible default for every category, which you can then tune here.
            </p>
          </div>
        )}

        <AuthorityPanel canEdit={perms.isAdmin} />

        {(loading || risksLoading) ? (
          <div style={{ padding: '48px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RISK_CATEGORIES.map(cat => (
              <CategoryCard
                key={cat}
                category={cat}
                tolerance={toleranceFor(cat)}
                risks={risks}
                matrix={matrix}
                canEdit={perms.isManager}
                onSave={saveTolerance}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Who holds each rung of the acceptance ladder.
 *
 * The ladder itself is fixed by band; what varies per organisation is who
 * the CISO is and who sits on the committee and the board. Without these
 * assignments nobody can sign an acceptance above Low.
 */
function AuthorityPanel({ canEdit }) {
  const { members } = usePeople()
  const { holders, migrated, addHolder, removeHolder } = useAuthorityHolders()
  const [picks, setPicks] = useState({})
  const [error, setError] = useState('')

  const nameOf = uid => {
    const m = members.find(x => x.user_id === uid)
    return m?.full_name || m?.email || (uid ? uid.slice(0, 8) : '')
  }
  const bandsFor = tier => Object.entries(BAND_AUTHORITY).filter(([, t]) => t === tier).map(([b]) => bandMeta(b))

  const add = async tier => {
    const uid = picks[tier]
    if (!uid) return
    setError('')
    try { await addHolder(tier, uid); setPicks(p => ({ ...p, [tier]: '' })) } catch (e) { setError(e.message) }
  }

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <Scale size={14} style={{ color: 'var(--crimson)' }} />
        <p style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)' }}>Acceptance authority</p>
      </div>
      <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginBottom: 12, maxWidth: 760 }}>
        Who may sign an acceptance depends on the band of the residual score. Outside tolerance an acceptance is an
        exception, and needs at least the {tierMeta(EXCEPTION_FLOOR).label} whatever the band.
      </p>

      {!migrated && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)', borderRadius: 'var(--r-md)', padding: '8px 10px', marginBottom: 10 }}>
          Authority holders need <span className="mono">003_treatment_acceptance_triage.sql</span> applied.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {AUTHORITY_TIERS.map((t, idx) => {
          const tierHolders = holders.filter(h => h.tier === t.value)
          const assigned = new Set(tierHolders.map(h => h.user_id))
          return (
            <div key={t.value} style={{
              display: 'grid', gridTemplateColumns: '170px 150px minmax(0,1fr)', gap: 12, alignItems: 'center',
              padding: '10px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--border-3)',
            }}>
              <div>
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{t.label}</p>
                <p style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{t.desc}</p>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>Accepts</span>
                {bandsFor(t.value).map(b => (
                  <span key={b.band} className="badge" style={{ color: b.color, background: b.bg, border: `1px solid ${b.border}` }}>{b.label}</span>
                ))}
              </div>
              {t.value === 'risk_owner' ? (
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>Each risk's own owner — no assignment needed.</p>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {tierHolders.length === 0 && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>Nobody assigned</span>}
                  {tierHolders.map(h => (
                    <span key={h.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', padding: '3px 8px',
                      borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text-2)',
                    }}>
                      {nameOf(h.user_id)}
                      {canEdit && (
                        <button onClick={() => removeHolder(h).catch(e => setError(e.message))} title="Remove"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-3)', display: 'flex' }}>
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && migrated && (
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginLeft: 'auto' }}>
                      <SelectField size="sm" value={picks[t.value] || ''} onChange={e => setPicks(p => ({ ...p, [t.value]: e.target.value }))}>
                        <option value="">Add a member…</option>
                        {members.filter(m => !assigned.has(m.user_id)).map(m => (
                          <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>
                        ))}
                      </SelectField>
                      <button className="btn-secondary" style={{ fontSize: 'var(--t-meta)', padding: '5px 8px' }}
                        disabled={!picks[t.value]} onClick={() => add(t.value)}>
                        <UserPlus size={12} />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)', marginTop: 8 }}>{error}</p>}
    </div>
  )
}
