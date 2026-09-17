import { FileWarning, CheckCircle2 } from 'lucide-react'
import { useRiskFindings } from '@/hooks/useTriage'
import { SEVERITY_CONFIG, findingDisplayTitle } from '@/lib/findings'

/**
 * Findings that raised this risk or were attached to it during triage.
 *
 * Findings are evidence, not the risk itself: an attached finding is a
 * fresh sign that a control is failing, and the prompt is to re-assess.
 * Renders nothing when there are none, or before 003 is applied.
 */
export function LinkedFindings({ riskId, member = () => null }) {
  const { links, loading } = useRiskFindings(riskId)
  if (loading || !links.length) return null

  const known = links.filter(l => l.source_status)
  const resolved = known.filter(l => l.source_status === 'resolved')
  const allResolved = known.length > 0 && resolved.length === links.length

  return (
    <div style={{
      margin: '12px 28px 0', borderRadius: 12, background: 'var(--bg-2)',
      border: '1px solid var(--border)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span className="eyebrow">Findings on this risk · {links.length}</span>
        <span style={{ fontSize: 'var(--t-micro)', color: allResolved ? 'var(--low, #166534)' : 'var(--text-3)' }}>
          {allResolved
            ? 'All linked findings are resolved in the source system — re-assess residual risk and consider closing'
            : resolved.length
              ? `${resolved.length} of ${links.length} resolved in the source system — re-assess if they change the picture`
              : 'Evidence of control failure — re-assess if they change the picture'}
        </span>
      </div>
      {links.map((l, idx) => {
        const sev = SEVERITY_CONFIG[l.severity] || SEVERITY_CONFIG.info
        return (
          <div key={l.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
            borderTop: idx === 0 ? 'none' : '1px solid var(--border-3)',
          }}>
            <FileWarning size={13} style={{ color: sev.color, flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text)', flex: 1, minWidth: 0 }} className="truncate">
              {findingDisplayTitle(l.finding_title, l.subject_name)}
            </span>
            {l.source_status === 'resolved' && (
              <span className="badge" title={l.source_resolved_at ? `Resolved ${new Date(l.source_resolved_at).toLocaleString('en-GB')}` : undefined}
                style={{ color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={11} /> Resolved in source
              </span>
            )}
            <span className="badge" style={{ color: sev.color, background: sev.bg, border: `1px solid ${sev.border}` }}>
              {sev.label}
            </span>
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              {l.disposition === 'created' ? 'raised this risk' : 'attached'}
              {' · '}{new Date(l.decided_at).toLocaleDateString('en-GB')}
              {member(l.decided_by) ? ` · ${member(l.decided_by)}` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
