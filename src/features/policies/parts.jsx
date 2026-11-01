import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  labelOf, TONES, POLICY_STATUSES, VERSION_STATUSES, CRITICALITY, EXCEPTION_STATUSES, EVIDENCE_REVIEW,
  AUTHORITIES, openLibraryFile, fileSize,
} from '@/lib/policies'
import { tx } from '@/lib/i18n'

/* Badges and small pieces shared by the policy, exception and evidence pages. */

export const PolicyStatusBadge = ({ v }) => <StatusBadge tone={TONES.policy[v]} label={labelOf(POLICY_STATUSES, v)} />
export const VersionStatusBadge = ({ v }) => <StatusBadge tone={TONES.policy[v]} label={labelOf(VERSION_STATUSES, v)} />
export const CriticalityBadge = ({ v }) => <StatusBadge tone={TONES.criticality[v]} label={labelOf(CRITICALITY, v)} />
export const ExceptionStatusBadge = ({ v }) => <StatusBadge tone={TONES.exception[v]} label={labelOf(EXCEPTION_STATUSES, v)} />
export const EvidenceReviewBadge = ({ v }) => <StatusBadge tone={TONES.evidence[v]} label={labelOf(EVIDENCE_REVIEW, v)} />
export const AttestationBadge = ({ v }) => (
  <StatusBadge tone={TONES.attestation[v]} label={{ pending: tx('Pending'), accepted: tx('Accepted'), excused: tx('Excused') }[v] ?? v} />
)
export const authorityLabel = (v) => labelOf(AUTHORITIES, v)

/** Opens a stored file in a new tab through a short-lived signed URL. */
export function FileChip({ file, onError }) {
  const [busy, setBusy] = useState(false)
  if (!file?.path) return null
  return (
    <button type="button" className="btn-secondary" disabled={busy} style={{ padding: '4px 9px' }}
      onClick={async () => { setBusy(true); try { await openLibraryFile(file) } catch (e) { onError?.(e.message) } finally { setBusy(false) } }}>
      <Paperclip size={12} /> {file.name}{file.size ? <span style={{ color: 'var(--text-3)' }}> · {fileSize(file.size)}</span> : null}
    </button>
  )
}

/** Attestation progress as a bar plus "accepted / expected". */
export function RateBar({ accepted = 0, expected = 0, excused = 0 }) {
  const denom = Math.max(0, expected - excused)
  const pct = denom ? Math.round((100 * accepted) / denom) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? 'var(--low)' : pct >= 60 ? 'var(--medium)' : 'var(--critical)' }} />
      </div>
      <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{accepted}/{denom} · {pct}%</span>
    </div>
  )
}

/** Policy text as written: paragraphs and line breaks kept, nothing interpreted. */
export function PolicyText({ text, rtl }) {
  if (!text) return <p style={{ color: 'var(--text-3)', margin: 0 }}>{tx('No text written.')}</p>
  return (
    <div dir={rtl ? 'rtl' : undefined} lang={rtl ? 'ar' : undefined}
      style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--t-body)', lineHeight: 1.65, color: 'var(--text)' }}>{text}</div>
  )
}

export const shortHash = (h) => (h ? `${h.slice(0, 12)}…${h.slice(-6)}` : '—')
