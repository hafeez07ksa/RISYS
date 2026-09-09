import { getSeverity, getStatus } from '@/lib/incidents'

export function SeverityBadge({ value }) {
  const s = getSeverity(value)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium border"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      {s.label}
    </span>
  )
}

export function StatusBadge({ value }) {
  const s = getStatus(value)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium border"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      {s.label}
    </span>
  )
}
