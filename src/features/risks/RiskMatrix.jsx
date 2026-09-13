import { useState } from 'react'
import { X } from 'lucide-react'
import { DEFAULT_MATRIX, bandFor, bandMeta, matrixAxes, scalePoint, BAND_ORDER } from '@/lib/matrix'

/**
 * The 5x5 heatmap.
 *
 * Cell colour comes from the org's band lookup, never from l * i. That
 * matters because the lookup can be asymmetric on purpose: a tenant may
 * band L=1 x I=5 as High while L=5 x I=1 stays Medium, even though both
 * score 5. Deriving the colour from the product would quietly overrule
 * that configuration.
 */

// Plot position. Residual is the honest position once it exists, because
// that is the risk actually being carried; inherent is the fallback.
function plotCoords(r, mode) {
  const l = mode === 'inherent'
    ? (r.inherent_likelihood || r.likelihood)
    : (r.residual_likelihood || r.inherent_likelihood || r.likelihood)
  const i = mode === 'inherent'
    ? (r.inherent_impact || r.impact)
    : (r.residual_impact || r.inherent_impact || r.impact)
  return (l >= 1 && i >= 1) ? [l, i] : null
}

export function RiskMatrix({ risks = [], onRiskClick, onCellClick, matrix = DEFAULT_MATRIX }) {
  const [selectedCell, setSelectedCell] = useState(null) // { l, i, risks }
  const [mode, setMode] = useState('residual')

  const { rows, cols } = matrixAxes(matrix)
  const likelihoodScale = matrix?.likelihood_scale || DEFAULT_MATRIX.likelihood_scale
  const impactScale = matrix?.impact_scale || DEFAULT_MATRIX.impact_scale

  const riskMap = {}
  risks.forEach(r => {
    const coords = plotCoords(r, mode)
    if (!coords) return
    const key = `${coords[0]}-${coords[1]}`
    if (!riskMap[key]) riskMap[key] = []
    riskMap[key].push(r)
  })

  const plotted = Object.values(riskMap).reduce((n, list) => n + list.length, 0)
  const unplotted = risks.length - plotted

  const handleCell = (l, i, cellRisks) => {
    if (!cellRisks.length) return
    if (onCellClick) { onCellClick(cellRisks); return }
    if (cellRisks.length === 1 && onRiskClick) { onRiskClick(cellRisks[0]); return }
    setSelectedCell({ l, i, risks: cellRisks })
  }

  const pointLabel = (scale, v) => scalePoint(scale, v)?.label || String(v)

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)' }}>Risk Matrix</p>
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
            Likelihood × Impact · bands from matrix v{matrix?.version || 1}
            {unplotted > 0 && ` · ${unplotted} unscored`}
          </p>
        </div>
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border-2)' }}>
          {[['residual', 'Residual'], ['inherent', 'Inherent']].map(([v, label]) => (
            <button key={v} onClick={() => { setMode(v); setSelectedCell(null) }}
              style={{
                fontSize: 'var(--t-meta)', padding: '4px 10px', border: 'none', cursor: 'pointer',
                background: mode === v ? 'var(--crimson)' : 'var(--bg-2)',
                color: mode === v ? '#fff' : 'var(--text-2)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4" style={{ background: 'var(--bg-2)' }}>
        <div className="flex gap-1">
          <div className="flex flex-col justify-center items-center" style={{ width: 20 }}>
            <span className="eyebrow" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Likelihood
            </span>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {rows.map(l => (
              <div key={l} className="flex gap-1 items-center">
                <span className="text-right pr-2 flex-shrink-0"
                  style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', width: 76 }}>
                  {pointLabel(likelihoodScale, l)}
                </span>
                {cols.map(i => {
                  const key = `${l}-${i}`
                  const cellRisks = riskMap[key] || []
                  const isSelected = selectedCell && selectedCell.l === l && selectedCell.i === i
                  const meta = bandMeta(bandFor(l, i, matrix))
                  return (
                    <div key={i}
                      onClick={() => handleCell(l, i, cellRisks)}
                      title={`${pointLabel(likelihoodScale, l)} × ${pointLabel(impactScale, i)} — ${meta.label} · ${l * i}`}
                      className="flex-1 h-10 rounded flex items-center justify-center transition-transform hover:scale-105"
                      style={{
                        background: meta.border,
                        cursor: cellRisks.length ? 'pointer' : 'default',
                        minWidth: 40,
                        outline: isSelected ? '2px solid var(--crimson)' : 'none',
                        outlineOffset: -2,
                      }}>
                      {cellRisks.length > 0 && (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center tnum"
                          style={{ background: 'rgba(255,255,255,0.85)', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                          {cellRisks.length}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            <div className="flex gap-1 items-center mt-1">
              <div style={{ width: 76 }} />
              {cols.map(i => (
                <div key={i} className="flex-1 text-center" style={{ minWidth: 40 }}>
                  <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>
                    {pointLabel(impactScale, i)}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-center mt-1">
              <span className="eyebrow">Impact →</span>
            </div>
          </div>
        </div>

        {/* Band legend — the matrix is meaningless without it */}
        <div className="flex items-center gap-3 mt-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--border-3)' }}>
          {BAND_ORDER.slice().reverse().map(b => {
            const meta = bandMeta(b)
            return (
              <span key={b} className="flex items-center gap-1.5" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: meta.border, display: 'inline-block' }} />
                {meta.label}
              </span>
            )
          })}
        </div>

        {selectedCell && (
          <div className="mt-3 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text)' }}>
                {pointLabel(likelihoodScale, selectedCell.l)} × {pointLabel(impactScale, selectedCell.i)}
                {' — '}{selectedCell.risks.length} risk{selectedCell.risks.length > 1 ? 's' : ''}
              </span>
              <button onClick={() => setSelectedCell(null)} style={{ color: 'var(--text-3)' }}><X size={13} /></button>
            </div>
            {selectedCell.risks.map(r => {
              const meta = bandMeta(bandFor(selectedCell.l, selectedCell.i, matrix))
              const score = selectedCell.l * selectedCell.i
              return (
                <button key={r.id} onClick={() => onRiskClick?.(r)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left row-hover"
                  style={{ borderBottom: '1px solid var(--border-3)', background: 'transparent', border: 'none', cursor: onRiskClick ? 'pointer' : 'default' }}>
                  <span className="mono flex-shrink-0" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{r.risk_id}</span>
                  <span className="flex-1 truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--text)' }}>{r.title}</span>
                  <span className="rounded-full border flex-shrink-0 tnum"
                    style={{ fontSize: 'var(--t-micro)', padding: '2px 7px', fontWeight: 500, color: meta.color, background: meta.bg, borderColor: meta.border }}>
                    {meta.label} · {score}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
