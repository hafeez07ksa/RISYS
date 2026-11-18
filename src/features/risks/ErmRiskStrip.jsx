import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Timer, Megaphone, CalendarClock } from 'lucide-react'
import { DateField } from '@/components/ui/DateField'
import { extendRiskAssessment, useSubmissionForRisk } from '@/hooks/useErm'
import { daysUntil, dayPlus } from '@/lib/erm'
import { fmtDate } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── ERM strip on the risk page ───────────────────────────────────────────────
 *
 *   Assessment deadline   while a risk is registered and waiting to be scored:
 *                         the date the database set at admission, and, for a
 *                         risk manager, moving it with a reason (at most 90
 *                         days ahead; logged).
 *   Raised through        when the risk came from a raised risk (SUB-), a link
 *                         back to what the person originally wrote.
 * -------------------------------------------------------------------------- */

export function ErmRiskStrip({ risk, perms, onChanged }) {
  const sub = useSubmissionForRisk(risk.source === 'Risk submission' ? risk.id : null)
  const [moving, setMoving] = useState(false)
  const [due, setDue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const waiting = risk.workflow_state === 'registered' && risk.assessment_due_at
  if (!waiting && !sub) return null

  const d = waiting ? daysUntil(risk.assessment_due_at) : null
  const late = d !== null && d < 0
  const tone = late ? { bg: 'var(--critical-bg)', bd: 'var(--critical-bd)', fg: 'var(--critical)' }
    : d !== null && d <= 7 ? { bg: 'var(--medium-bg)', bd: 'var(--medium-bd)', fg: 'var(--medium)' }
      : { bg: 'var(--bg-2)', bd: 'var(--border)', fg: 'var(--text-2)' }

  const save = async () => {
    setBusy(true); setError('')
    try { await extendRiskAssessment(risk.id, due, reason.trim()); setMoving(false); setReason(''); onChanged && onChanged() }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ margin: '8px 28px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {waiting && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: tone.bg, border: `1px solid ${tone.bd}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Timer size={14} style={{ color: tone.fg, flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--text)', margin: 0, flex: 1 }}>
              <strong style={{ color: tone.fg }}>
                {late ? tx('Assessment overdue by {{n}} days', { n: -d }) : d === 0 ? tx('Assessment due today') : tx('Assessment due in {{n}} days', { n: d })}
              </strong>
              {' · '}{fmtDate(risk.assessment_due_at)}
              <span style={{ color: 'var(--text-3)' }}>{' — '}{tx('set when the risk was admitted. Scoring the risk stops the clock.')}</span>
            </p>
            {perms?.isManager && !moving && (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setMoving(true); setDue(dayPlus(Math.max(d ?? 0, 0) + 14)); setError('') }}>
                <CalendarClock size={12} /> {tx('Move deadline')}
              </button>
            )}
          </div>
          {moving && (
            <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) auto', gap: 8, alignItems: 'end', marginTop: 10 }}>
              <div>
                <p className="field-label">{tx('New date')}</p>
                <DateField value={due} onChange={(e) => setDue(e.target.value)} aria-label={tx('New date')} />
              </div>
              <div>
                <p className="field-label">{tx('Reason')} <span className="field-req">*</span></p>
                <input className="risys-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tx('Why the assessment needs more time')} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} disabled={busy || !due || reason.trim().length < 10} onClick={save}>{tx('Save')}</button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setMoving(false)}>{tx('Cancel')}</button>
              </div>
              {error && <p style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--critical)', margin: 0 }}>{error}</p>}
            </div>
          )}
        </div>
      )}
      {sub && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <Megaphone size={13} style={{ color: 'var(--rose)' }} />
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
            {tx('Raised through')} <Link to={`/app/risks/intake/${sub.id}`}>{sub.ref}</Link> {tx('on')} {fmtDate(sub.submitted_at)}
          </p>
        </div>
      )}
    </div>
  )
}
