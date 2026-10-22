import { useEffect, useState } from 'react'
import './charts.css'

/* ── Chart primitives (dashboard and platform console) ───────────────────────────────────────────────
 *
 * Hand-drawn SVG, no chart library: the shapes are simple, the bundle stays
 * small, and every mark can carry a <title> so the number behind it is one
 * hover away. Colour is never the only carrier — every chart sits beside a
 * legend that repeats the figures in text.
 *
 * Rings use a circle whose circumference is 100 (r = 15.9155), so a segment's
 * dash length is simply its percentage.
 * -------------------------------------------------------------------------- */

const R = 15.9155

/** Becomes true one frame after mount, so marks animate in from zero. */
export function useDrawIn() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return on
}

/**
 * Segmented ring. `segments` is [{ key, value, color, label }]. Zero-value
 * segments are skipped; a hairline gap separates the rest.
 */
export function Donut({ segments, size = 148, thickness = 3.6, children, label }) {
  const on = useDrawIn()
  const total = segments.reduce((n, s) => n + s.value, 0)
  const visible = segments.filter(s => s.value > 0)
  const gap = visible.length > 1 ? 0.8 : 0
  let offset = 0

  return (
    <div className="chart-donut" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 36 36" width={size} height={size}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
        {total > 0 && visible.map(s => {
          const pct = (s.value / total) * 100
          const len = Math.max(pct - gap, 0.4)
          const el = (
            <circle key={s.key} cx="18" cy="18" r={R} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={on ? `${len} ${100 - len}` : `0 100`}
              strokeDashoffset={-offset}
              className="chart-donut-seg">
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          )
          offset += pct
          return el
        })}
      </svg>
      <div className="chart-donut-center">{children}</div>
    </div>
  )
}

/** Single-value progress ring. */
export function Ring({ value, size = 56, thickness = 3.4, color = 'var(--crimson)', children }) {
  const on = useDrawIn()
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="chart-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" width={size} height={size}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
        {v > 0 && (
          <circle cx="18" cy="18" r={R} fill="none" stroke={color} strokeWidth={thickness}
            strokeLinecap="round" strokeDasharray={on ? `${v} ${100 - v}` : '0 100'}
            className="chart-donut-seg" />
        )}
      </svg>
      <div className="chart-donut-center">{children}</div>
    </div>
  )
}

/** Horizontal stacked bar. Flows from the inline start, so it mirrors in RTL. */
export function StackBar({ segments, height = 8, rounded = true, label }) {
  const on = useDrawIn()
  const total = segments.reduce((n, s) => n + s.value, 0)
  return (
    <div className="chart-stack" style={{ height, borderRadius: rounded ? height : 2 }} role="img" aria-label={label}>
      {total > 0 && segments.filter(s => s.value > 0).map(s => (
        <span key={s.key} title={`${s.label}: ${s.value}`}
          style={{ width: on ? `${(s.value / total) * 100}%` : '0%', background: s.color }} />
      ))}
    </div>
  )
}

/** One-value meter bar. */
export function Meter({ value, color, height = 8 }) {
  const on = useDrawIn()
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="chart-meter" style={{ height, borderRadius: height }}>
      <span style={{ width: on ? `${v}%` : '0%', background: color }} />
    </div>
  )
}
