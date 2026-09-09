import { useState } from 'react'
import { BookCheck, ChevronRight, TrendingUp } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import {
  FRAMEWORKS,
  STATUS_CONFIG,
  useFrameworkRequirements,
  useComplianceStatuses,
  useFrameworkMappings,
  computeFrameworkScore,
} from '@/hooks/useCompliance'
import { ComplianceFrameworkPage } from './ComplianceFrameworkPage'

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 56 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 75 ? '#166534' : score >= 50 ? '#92400e' : score >= 25 ? '#b45309' : '#991b1b'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ fill: color, fontSize: size * 0.26, fontWeight: 700, transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}%
      </text>
    </svg>
  )
}

// ── Framework summary card ────────────────────────────────────────────────────
function FrameworkCard({ fw, onSelect }) {
  const { requirements, loading: reqLoading } = useFrameworkRequirements(fw.id)
  const { statuses } = useComplianceStatuses(fw.id)
  const { mappings, controls } = useFrameworkMappings(fw.id)

  const score = reqLoading ? null : computeFrameworkScore(requirements, statuses, mappings, controls, fw)
  const mainReqs = requirements.filter(r => r.control_type !== 'Sub-Control')

  const bars = score ? [
    { key: 'compliant',     value: score.compliant,     color: '#22c55e' },
    { key: 'partial',       value: score.partial,        color: '#eab308' },
    { key: 'in_progress',   value: score.inProgress,     color: '#3b82f6' },
    { key: 'not_compliant', value: score.notCompliant,   color: '#ef4444' },
    { key: 'not_started',   value: score.notStarted,     color: '#e5e7eb' },
  ] : []

  return (
    <button
      onClick={() => onSelect(fw.id)}
      className="card"
      style={{
        padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%',
        transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,19,20,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      {/* Top accent */}
      <div style={{ height: 4, background: fw.color, borderRadius: '12px 12px 0 0' }} />

      <div style={{ padding: '18px 20px', flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{fw.label}</span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                color: fw.color, background: fw.bg, border: `1px solid ${fw.color}22`,
              }}>{fw.tag}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{fw.fullName}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fw.version}</p>
          </div>
          {score !== null && <ScoreRing score={score.score} />}
        </div>

        {/* Progress bar */}
        {score && mainReqs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2)', gap: 1 }}>
              {bars.filter(b => b.value > 0).map(b => (
                <div key={b.key} style={{
                  height: '100%',
                  width: `${(b.value / (score.total - score.na)) * 100}%`,
                  background: b.color,
                  transition: 'width 0.5s ease',
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {score ? [
            { label: 'Compliant',   value: score.compliant,   color: STATUS_CONFIG.compliant.color },
            { label: 'Partial',     value: score.partial,     color: STATUS_CONFIG.partial.color },
            { label: 'Gap',         value: score.notCompliant + score.notStarted, color: STATUS_CONFIG.not_compliant.color },
            { label: 'N/A',         value: score.na,          color: 'var(--text-3)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.label}</p>
            </div>
          )) : (
            <div style={{ gridColumn: '1/-1', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 60, height: 6, background: 'var(--surface-2)', borderRadius: 99, animation: 'pulse 1.5s infinite' }} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{mainReqs.length} requirements</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: fw.color, fontWeight: 500 }}>
          View details <ChevronRight size={13} />
        </div>
      </div>
    </button>
  )
}

// ── Main Compliance Page ──────────────────────────────────────────────────────
export function CompliancePage() {
  const { organization } = useAuth()
  const [activeFramework, setActiveFramework] = useState(null)

  // Drill into a framework
  if (activeFramework) {
    return (
      <ComplianceFrameworkPage
        frameworkId={activeFramework}
        onBack={() => setActiveFramework(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Compliance" subtitle={organization?.name} />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Framework Compliance
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 640 }}>
            Track your compliance posture across Saudi regulatory frameworks. Select a framework to map controls, set statuses, and view gap analysis.
          </p>
        </div>

        {/* Framework grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {FRAMEWORKS.map(fw => (
            <FrameworkCard key={fw.id} fw={fw} onSelect={setActiveFramework} />
          ))}
        </div>
      </div>
    </div>
  )
}
