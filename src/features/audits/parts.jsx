import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtDate } from '@/lib/reports/models'
import { labelOf, TEST_RESULTS, FINDING_RATINGS, FINDING_STATUSES, REQUEST_STATUSES, ENGAGEMENT_STATUSES, OPINIONS } from '@/hooks/useAudits'

/* Small shared pieces for the audit screens. Kept together so the engagement
 * list, the detail tabs and the dialogs read as one module. */

export const personName = (members, id) => {
  if (!id) return null
  const m = members.find((x) => x.user_id === id)
  return m?.full_name || m?.email || 'Former member'
}

export const isOverdue = (d, done) => !!d && !done && new Date(`${d}T23:59:59`) < new Date()

export function Dialog({ open, onClose, title, subtitle, children, footer, width = 640 }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
         onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="w-full rounded-xl shadow-xl flex flex-col"
           style={{ maxWidth: width, maxHeight: '90vh', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '3px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }} aria-label="Close"><X size={16} /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        {footer && (
          <div className="flex justify-end" style={{ gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, required, help, children }) {
  return (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <label className="field-label">{label}{required && <span className="field-req">*</span>}</label>
      {children}
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

export const Grid = ({ cols = 2, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12 }}>{children}</div>
)

export function SubmitButton({ busy, disabled, onClick, children }) {
  return (
    <button className="btn-primary" disabled={busy || disabled} onClick={onClick}>
      {busy ? <Spinner size="sm" /> : null}{children}
    </button>
  )
}

export const ErrorText = ({ children }) => children
  ? <p className="field-error" style={{ margin: 0 }}>{children}</p> : null

export function Section({ title, actions, children, pad = true }) {
  return (
    <section className="section" style={{ marginBottom: 16 }}>
      {(title || actions) && (
        <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h3>
          <div className="flex items-center" style={{ gap: 6 }}>{actions}</div>
        </div>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </section>
  )
}

export function Facts({ rows }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 8, columnGap: 12, margin: 0 }}>
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{k}</dt>
          <dd style={{ fontSize: 'var(--t-body)', color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

const RESULT_TONE = { effective: 'low', partially_effective: 'medium', ineffective: 'critical', not_tested: 'neutral', not_applicable: 'neutral' }
const RATING_TONE = { high: 'critical', medium: 'medium', low: 'low', observation: 'info' }
const FSTATUS_TONE = { draft: 'neutral', open: 'critical', in_remediation: 'info', ready_for_validation: 'medium', closed: 'low', risk_accepted: 'neutral' }
const REQ_TONE = { open: 'neutral', submitted: 'info', accepted: 'low', rejected: 'critical' }
const STAGE_TONE = { planned: 'neutral', fieldwork: 'info', reporting: 'medium', closed: 'low', cancelled: 'neutral' }
const OPINION_TONE = { effective: 'low', partially_effective: 'medium', ineffective: 'critical' }

export const ResultBadge = ({ v }) => <StatusBadge tone={RESULT_TONE[v]} label={labelOf(TEST_RESULTS, v)} />
export const RatingBadge = ({ v }) => <StatusBadge tone={RATING_TONE[v]} label={labelOf(FINDING_RATINGS, v)} />
export const FindingStatusBadge = ({ v }) => <StatusBadge tone={FSTATUS_TONE[v]} label={labelOf(FINDING_STATUSES, v)} />
export const RequestBadge = ({ v }) => <StatusBadge tone={REQ_TONE[v]} label={labelOf(REQUEST_STATUSES, v)} />
export const StageBadge = ({ v }) => <StatusBadge tone={STAGE_TONE[v]} label={labelOf(ENGAGEMENT_STATUSES, v)} />
export const OpinionBadge = ({ v }) => v
  ? <StatusBadge tone={OPINION_TONE[v]} label={labelOf(OPINIONS, v)} />
  : <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>Not given</span>

export function DueText({ date, done }) {
  if (!date) return <span style={{ color: 'var(--text-3)' }}>—</span>
  const late = isOverdue(date, done)
  return <span style={{ color: late ? 'var(--critical)' : 'var(--text-2)', fontWeight: late ? 600 : 400 }}>{fmtDate(date)}{late ? ' · overdue' : ''}</span>
}

export function Th({ children, align, width }) {
  return <th className="table-head" style={{ textAlign: align ?? 'left', padding: '8px 12px', width }}>{children}</th>
}
export function Td({ children, align, style }) {
  return <td style={{ padding: '9px 12px', fontSize: 'var(--t-sm)', color: 'var(--text-2)', verticalAlign: 'top', textAlign: align ?? 'left', borderTop: '1px solid var(--border)', ...style }}>{children}</td>
}

export function Empty({ title, children, action }) {
  return (
    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--text-2)', margin: '0 0 4px' }}>{title}</p>
      {children && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: 0, maxWidth: 460, marginInline: 'auto' }}>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}
