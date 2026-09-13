import { ShieldCheck, ShieldAlert, ShieldQuestion, Check, X, Minus, Clock, ArrowUpRight, Ban } from 'lucide-react'
import { daysInBreach, treatmentSLA, operatorLabel } from '@/lib/gate'
import { bandMeta } from '@/lib/matrix'
import { tierMeta } from '@/lib/authority'

/**
 * The gate verdict, shown in full.
 *
 * A gate that only says "blocked" is not defensible to a reviewer, so
 * every rule is listed with what was required and what was measured.
 * The breach delta — "16 against a tolerance of 8" — is the number a
 * steering committee actually reads, so it gets the largest type on the
 * panel.
 */

function RuleRow({ rule }) {
  const state = rule.skipped ? 'skipped' : rule.passed ? 'pass' : 'fail'
  const tone = {
    pass:    { icon: Check, color: 'var(--low)',      bg: 'var(--low-bg)' },
    fail:    { icon: X,     color: 'var(--critical)', bg: 'var(--critical-bg)' },
    skipped: { icon: Minus, color: 'var(--text-3)',   bg: 'var(--surface)' },
  }[state]
  const Icon = tone.icon

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
      borderTop: '1px solid var(--border-3)',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: tone.bg, color: tone.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={11} strokeWidth={3} />
      </span>

      <span style={{ flex: 1, fontSize: 'var(--t-sm)', color: 'var(--text)' }}>
        {rule.label}
      </span>

      <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
        required {operatorLabel(rule.operator)} {rule.value}
      </span>

      <span className="tnum" style={{
        fontSize: 'var(--t-sm)', fontWeight: 600, minWidth: 54, textAlign: 'right',
        color: state === 'fail' ? 'var(--critical)' : state === 'pass' ? 'var(--low)' : 'var(--text-3)',
      }}>
        {rule.skipped ? 'not measured' : rule.actual}
      </span>
    </div>
  )
}

export function GatePanel({ verdict, risk, onOpenTreatment, onOpenScoring }) {
  if (!verdict) return null

  // ── Nothing to judge ────────────────────────────────────────────────
  // Says why, plainly. Defaulting to "pass" when the gate has no rules
  // or no residual score would be the single most misleading thing this
  // panel could do.
  if (!verdict.evaluated) {
    return (
      <div style={{
        margin: '12px 28px 0', borderRadius: 12, background: 'var(--bg-2)',
        border: '1px solid var(--border)', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <ShieldQuestion size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
            Tolerance gate has not run
          </p>
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 2 }}>
            {verdict.reason}
            {verdict.reason?.includes('No tolerance rules') &&
              ' Set one under Risk Register → Tolerances and this risk is judged automatically from then on.'}
          </p>
        </div>
        {verdict.reason?.includes('Residual') && onOpenScoring && (
          <button className="btn-secondary" style={{ fontSize: 'var(--t-sm)' }} onClick={onOpenScoring}>
            Score residual
          </button>
        )}
      </div>
    )
  }

  const passed = verdict.passed
  const accent = passed ? 'var(--low)' : 'var(--critical)'
  const accentBg = passed ? 'var(--low-bg)' : 'var(--critical-bg)'
  const accentBd = passed ? 'var(--low-bd)' : 'var(--critical-bd)'
  const Icon = passed ? ShieldCheck : ShieldAlert

  const breachDays = daysInBreach(risk)
  const sla = treatmentSLA(risk)
  const band = bandMeta(verdict.band)

  return (
    <div style={{
      margin: '12px 28px 0', borderRadius: 12, overflow: 'hidden',
      background: 'var(--bg-2)', border: `1px solid ${accentBd}`,
    }}>
      {/* Verdict */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: accentBg }}>
        <Icon size={20} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: accent }}>
              {passed ? 'Within tolerance' : 'Outside tolerance'}
            </span>
            <span className="badge" style={{ color: band.color, background: band.bg, border: `1px solid ${band.border}` }}>
              {band.label}
            </span>
            {!passed && breachDays !== null && (
              <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: accent, fontWeight: 500 }}>
                · {breachDays} day{breachDays === 1 ? '' : 's'} in breach
              </span>
            )}
          </div>

          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', marginTop: 4 }}>
            {passed
              ? 'Residual risk sits inside the line set for this category. The risk stays monitored — KRIs, control tests and the review cadence keep running.'
              : (risk?.workflow_state === 'accepted'
                  ? 'Held outside tolerance under an approved, time-bound exception. It reopens when the exception expires or is revoked.'
                  : 'Treatment is mandatory unless an exception is approved at the authority named below, with compensating controls and an expiry.')}
          </p>

          {verdict.appetiteStatement && (
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 6, fontStyle: 'italic' }}>
              “{verdict.appetiteStatement}”
            </p>
          )}
        </div>

        {/* The delta a committee reads */}
        {!passed && verdict.breachDelta && (
          <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 12 }}>
            <p className="tnum" style={{ fontSize: 'var(--t-metric)', fontWeight: 300, color: accent, lineHeight: 1 }}>
              {verdict.breachDelta.actual}
            </p>
            <p className="tnum" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', marginTop: 3 }}>
              against {verdict.breachDelta.limit}
            </p>
          </div>
        )}
      </div>

      {/* Rules */}
      <div>
        <div style={{
          padding: '7px 14px', background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="eyebrow">Tolerance rules · {risk?.category || 'uncategorised'}</span>
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>
            {verdict.rules.filter(r => r.passed === true).length} of {verdict.rules.length} passing
          </span>
        </div>
        {verdict.rules.map((rule, idx) => <RuleRow key={`${rule.metric}-${idx}`} rule={rule} />)}
      </div>

      {/* What the gate fired */}
      {!passed && (
        <div style={{
          padding: '11px 14px', borderTop: '1px solid var(--border-3)', background: 'var(--bg-2)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          {sla && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)',
              color: sla.overdue ? 'var(--critical)' : 'var(--text-2)', fontWeight: sla.overdue ? 600 : 400,
            }}>
              <Clock size={12} />
              {sla.overdue
                ? `Treatment plan overdue by ${Math.abs(sla.days)} day${Math.abs(sla.days) === 1 ? '' : 's'}`
                : `Approved plan due in ${sla.days} day${sla.days === 1 ? '' : 's'}`}
            </span>
          )}

          {verdict.escalateTo && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text-2)' }}>
              <ArrowUpRight size={12} />
              Escalated to the {verdict.escalateTo}
            </span>
          )}

          {verdict.acceptBlocked && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>
              <Ban size={12} />
              Acceptance needs {tierMeta(verdict.requiredAuthority).label} approval
            </span>
          )}

          {onOpenTreatment && (
            <button className="btn-primary" style={{ fontSize: 'var(--t-sm)', marginLeft: 'auto' }} onClick={onOpenTreatment}>
              Decide treatment
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The same verdict, compressed to one line. Used in list rows where the
 * full panel would not fit but "breached" alone would not be actionable.
 */
export function ToleranceChip({ risk }) {
  const status = risk?.tolerance_status || 'not_evaluated'
  if (status === 'not_evaluated') {
    return <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>—</span>
  }
  const breached = status === 'breached'
  const days = daysInBreach(risk)
  const failed = risk?.gate_failed_rules?.length || 0

  return (
    <span
      title={breached && failed
        ? risk.gate_failed_rules.map(f => `${f.label}: ${f.actual} (needs ${f.operator} ${f.expected})`).join('\n')
        : 'Residual risk is within the tolerance set for this category'}
      className="badge"
      style={{
        color: breached ? 'var(--critical)' : 'var(--low)',
        background: breached ? 'var(--critical-bg)' : 'var(--low-bg)',
        border: `1px solid ${breached ? 'var(--critical-bd)' : 'var(--low-bd)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {breached
        ? `Breached${days !== null ? ` · ${days}d` : ''}`
        : 'Within'}
    </span>
  )
}

/**
 * Coverage gaps among the linked controls.
 *
 * This is the callout the whole risk-to-control model exists to make
 * possible: a control can be effective and still leave the risk wide
 * open because its scope excludes the asset. Without it, a dashboard
 * reads "MFA control: Effective" while 47 people log in with a password.
 */
export function CoverageGapNotice({ gaps = [] }) {
  if (!gaps.length) return null
  const misleading = gaps.filter(g => g.misleading)

  return (
    <div style={{
      borderRadius: 8, border: '1px solid var(--medium-bd)', background: 'var(--medium-bg)',
      padding: '11px 13px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <ShieldAlert size={13} style={{ color: 'var(--medium)' }} />
        <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--medium)' }}>
          {gaps.length} linked control{gaps.length === 1 ? ' does' : 's do'} not fully cover this risk
        </span>
      </div>

      {misleading.length > 0 && (
        <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', marginBottom: 7 }}>
          {misleading.length === 1 ? 'One of them is' : `${misleading.length} of them are`} passing their tests
          while covering none of this risk&rsquo;s scope — effective in the control library, irrelevant here.
          That gap is the risk.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {gaps.map(g => (
          <div key={g.controlId} style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 'var(--t-meta)' }}>
            <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{g.ref}</span>
            <span style={{ color: 'var(--text)' }}>{g.name}</span>
            <span style={{
              color: g.coverage === 'none' ? 'var(--critical)' : 'var(--medium)',
              fontWeight: 600, flexShrink: 0,
            }}>
              {g.coverage === 'none' ? 'no coverage' : 'partial'}
            </span>
            {g.note && <span style={{ color: 'var(--text-3)' }}>— {g.note}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
