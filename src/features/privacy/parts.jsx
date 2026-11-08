import { StatusBadge } from '@/components/ui/StatusBadge'
import { labelOf } from '@/lib/policies'
import {
  REQUEST_STATUSES, NOTIFIABLE, ASSESSMENT_STATUSES, RATINGS, PRIVACY_TONES,
  requestDue, requestOpen, requestDaysLeft, breachHoursLeft,
} from '@/lib/privacy'
import { fmtDate } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

export const RequestStatusBadge = ({ v }) => <StatusBadge tone={PRIVACY_TONES.request[v]} label={labelOf(REQUEST_STATUSES, v)} />
export const NotifiableBadge = ({ v }) => <StatusBadge tone={PRIVACY_TONES.notifiable[v]} label={labelOf(NOTIFIABLE, v)} />
export const AssessmentStatusBadge = ({ v }) => <StatusBadge tone={PRIVACY_TONES.assessment[v]} label={labelOf(ASSESSMENT_STATUSES, v)} />
export const RatingBadge = ({ v }) => (v ? <StatusBadge tone={PRIVACY_TONES.rating[v]} label={labelOf(RATINGS, v)} /> : <span style={{ color: 'var(--text-3)' }}>—</span>)
export const BreachStatusBadge = ({ v }) => <StatusBadge tone={PRIVACY_TONES.breach[v]} label={v === 'closed' ? tx('Closed') : tx('Open')} />

/** "Due 14 Dec · 5 days left" for a request, red once overdue. */
export function RequestClock({ r }) {
  const due = requestDue(r)
  if (!due) return <span style={{ color: 'var(--text-3)' }}>—</span>
  if (!requestOpen(r)) return <span style={{ color: 'var(--text-2)' }}>{fmtDate(due)}</span>
  const d = requestDaysLeft(r)
  const late = d < 0
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <span className="tnum" style={{ color: late ? 'var(--critical)' : 'var(--text)', fontWeight: late ? 600 : 400 }}>{fmtDate(due)}</span>
      <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: late ? 'var(--critical)' : d <= 7 ? 'var(--medium)' : 'var(--text-3)' }}>
        {late ? tx('{{n}} days overdue', { n: -d }) : d === 0 ? tx('Due today') : tx('{{n}} days left', { n: d })}
        {r.extended_due_on ? ` · ${tx('extended')}` : ''}
      </span>
    </span>
  )
}

/** The 72-hour SDAIA clock for a breach. */
export function BreachClock({ b }) {
  if (b.sdaia_notified_at) {
    const late = new Date(b.sdaia_notified_at) > new Date(b.sdaia_due_at)
    return <span style={{ color: late ? 'var(--medium)' : 'var(--low)' }}>{late ? tx('Notified late') : tx('Notified on time')}</span>
  }
  if (b.notifiable === 'not_notifiable') return <span style={{ color: 'var(--text-3)' }}>{tx('Not notifiable')}</span>
  if (b.status !== 'open') return <span style={{ color: 'var(--text-3)' }}>—</span>
  const h = breachHoursLeft(b)
  const late = h < 0
  return (
    <span className="tnum" style={{ color: late || h < 24 ? 'var(--critical)' : 'var(--medium)', fontWeight: 600 }}>
      {late ? tx('SDAIA deadline passed {{n}} h ago', { n: -h }) : tx('{{n}} h left to notify SDAIA', { n: h })}
    </span>
  )
}

/** A short paragraph quoting the PDPL basis of a page. */
export const LawNote = ({ children }) => (
  <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 760, margin: '0 0 16px', lineHeight: 1.6 }}>{children}</p>
)
