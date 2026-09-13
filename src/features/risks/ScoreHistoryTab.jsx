import { TrendingDown, TrendingUp, Minus, Clock } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useScoreHistory } from '@/hooks/useRiskGate'
import { bandMeta } from '@/lib/matrix'

/**
 * The score history.
 *
 * Append-only, and deliberately not editable from anywhere in the UI:
 * a history you can revise is not a history. Every row carries who
 * scored, when, the old and new value, the matrix version it was scored
 * under, and the justification — which is the set of things an external
 * auditor asks for first.
 *
 * Recording the matrix version matters more than it looks. If a tenant
 * migrates from 5x5 to 6x6, a bare "16" from last year stops meaning
 * anything without knowing which grid produced it.
 */

function Delta({ from, to }) {
  if (from == null || from === to) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
        <Minus size={11} /> {from == null ? 'first assessment' : 'no change'}
      </span>
    )
  }
  const down = to < from
  return (
    <span className="tnum" style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', fontWeight: 600,
      color: down ? 'var(--low)' : 'var(--critical)',
    }}>
      {down ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
      {from} → {to}
    </span>
  )
}

export function ScoreHistoryTab({ risk, memberName = () => null }) {
  const { history, loading } = useScoreHistory(risk?.id)

  if (loading) {
    return <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  }

  if (!history.length) {
    return (
      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <Clock size={22} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)' }}>No scores recorded yet</p>
        <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 4, maxWidth: 380, margin: '4px auto 0' }}>
          Run an assessment to record an inherent and residual score. Each one is written here permanently,
          with its justification and the matrix version it was scored under.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginBottom: 12 }}>
        {history.length} assessment{history.length === 1 ? '' : 's'} on record. Scores are appended, never overwritten.
      </p>

      <div className="card" style={{ overflow: 'hidden' }}>
        {history.map((h, idx) => {
          const meta = bandMeta(h.band)
          const who = memberName(h.assessed_by)
          return (
            <div key={h.id} style={{
              display: 'flex', gap: 14, padding: '14px 16px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--border-3)',
            }}>
              {/* Score chip */}
              <div style={{
                flexShrink: 0, width: 62, textAlign: 'center', padding: '8px 0',
                borderRadius: 'var(--r-md)', background: meta.bg, border: `1px solid ${meta.border}`,
              }}>
                <p className="tnum" style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: meta.color, lineHeight: 1.1 }}>
                  {h.score}
                </p>
                <p style={{ fontSize: 'var(--t-micro)', color: meta.color, marginTop: 1 }}>{meta.label}</p>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
                    color: h.score_type === 'inherent' ? 'var(--rose)' : 'var(--crimson)',
                  }}>
                    {h.score_type}
                  </span>
                  <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                    L{h.likelihood} × I{h.impact}
                  </span>
                  <Delta from={h.prev_score} to={h.score} />
                </div>

                {h.justification && (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', marginTop: 5, lineHeight: 1.5 }}>
                    {h.justification}
                  </p>
                )}

                <p style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', marginTop: 6 }}>
                  {who ? `${who} · ` : ''}
                  {new Date(h.assessed_at).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                  {' · matrix v'}{h.matrix_version}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
