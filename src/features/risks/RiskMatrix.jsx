import { useState } from 'react'
import { X } from 'lucide-react'
import { LIKELIHOOD_LABELS, IMPACT_LABELS, getRiskLevel } from '@/lib/risks'

function getCellColor(l, i) {
  const score = l * i
  if (score >= 20) return '#F0CECE'
  if (score >= 12) return '#F0D4C2'
  if (score >= 6)  return '#EBDCB6'
  return '#C8DECD'
}

// Plot position: residual if assessed, otherwise inherent, otherwise legacy fields
function plotCoords(r) {
  const l = r.residual_likelihood || r.inherent_likelihood || r.likelihood
  const i = r.residual_impact || r.inherent_impact || r.impact
  return (l >= 1 && i >= 1) ? [l, i] : null
}

export function RiskMatrix({ risks = [], onRiskClick, onCellClick }) {
  const [selectedCell, setSelectedCell] = useState(null) // { l, i, risks }

  const riskMap = {}
  risks.forEach(r => {
    const coords = plotCoords(r)
    if (!coords) return
    const key = `${coords[0]}-${coords[1]}`
    if (!riskMap[key]) riskMap[key] = []
    riskMap[key].push(r)
  })

  const handleCell = (l, i, cellRisks) => {
    if (!cellRisks.length) return
    if (onCellClick) { onCellClick(cellRisks); return }
    if (cellRisks.length === 1 && onRiskClick) { onRiskClick(cellRisks[0]); return }
    setSelectedCell({ l, i, risks: cellRisks })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e9dad7' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #e9dad7', background: '#f6eeec' }}>
        <p className="text-xs font-medium" style={{ color: '#292021' }}>Risk Matrix</p>
        <p className="text-[11px]" style={{ color: '#97817d' }}>Likelihood × Impact — plotted on residual scores where assessed, otherwise inherent</p>
      </div>
      <div className="p-4" style={{ background: '#fff' }}>
        <div className="flex gap-1">
          {/* Y axis label */}
          <div className="flex flex-col justify-center items-center" style={{ width: 20 }}>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#97817d', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Likelihood
            </span>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {/* Grid — likelihood 5 to 1 (top to bottom) */}
            {[5, 4, 3, 2, 1].map(l => (
              <div key={l} className="flex gap-1 items-center">
                <span className="text-[10px] w-16 text-right pr-2 flex-shrink-0" style={{ color: '#97817d' }}>
                  {LIKELIHOOD_LABELS[l]}
                </span>
                {[1, 2, 3, 4, 5].map(i => {
                  const key = `${l}-${i}`
                  const cellRisks = riskMap[key] || []
                  const isSelected = selectedCell && selectedCell.l === l && selectedCell.i === i
                  return (
                    <div key={i}
                      onClick={() => handleCell(l, i, cellRisks)}
                      className="flex-1 h-10 rounded flex items-center justify-center text-xs font-medium transition-transform hover:scale-105"
                      style={{
                        background: getCellColor(l, i),
                        cursor: cellRisks.length ? 'pointer' : 'default',
                        minWidth: 40,
                        outline: isSelected ? '2px solid #5D0F0F' : 'none',
                        outlineOffset: -2,
                      }}>
                      {cellRisks.length > 0 && (
                        <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-[11px] font-semibold"
                          style={{ color: '#292021' }}>
                          {cellRisks.length}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            {/* X axis labels */}
            <div className="flex gap-1 items-center mt-1">
              <div className="w-16" />
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex-1 text-center" style={{ minWidth: 40 }}>
                  <span className="text-[10px]" style={{ color: '#97817d' }}>{IMPACT_LABELS[i].split(' ')[0]}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#97817d' }}>Impact →</span>
            </div>
          </div>
        </div>

        {/* Cell drill-down panel */}
        {selectedCell && (
          <div className="mt-3 rounded-lg" style={{ border: '1px solid #e9dad7', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #e9dad7' }}>
              <span className="text-[11px] font-medium" style={{ color: '#292021' }}>
                {LIKELIHOOD_LABELS[selectedCell.l]} × {IMPACT_LABELS[selectedCell.i]} — {selectedCell.risks.length} risk{selectedCell.risks.length > 1 ? 's' : ''}
              </span>
              <button onClick={() => setSelectedCell(null)} style={{ color: '#97817d' }}><X size={13} /></button>
            </div>
            {selectedCell.risks.map(r => {
              const score = (r.residual_score ?? r.inherent_score ?? (r.likelihood * r.impact)) || 0
              const level = getRiskLevel(score)
              return (
                <button key={r.id} onClick={() => onRiskClick?.(r)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white"
                  style={{ borderBottom: '1px solid #f0ecec', background: 'transparent', border: 'none', cursor: onRiskClick ? 'pointer' : 'default' }}>
                  <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#97817d' }}>{r.risk_id}</span>
                  <span className="text-xs flex-1 truncate" style={{ color: '#292021' }}>{r.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0"
                    style={{ color: level.color, background: level.bg, borderColor: level.border }}>
                    {level.label} {score}
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
