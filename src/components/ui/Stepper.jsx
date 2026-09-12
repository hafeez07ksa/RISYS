import { Check } from 'lucide-react'

/* Horizontal stepper for multi-step workflows (§9). Completed steps are
 * clickable, steps ahead are not: you can go back and revise, but you cannot
 * skip an assessment you have not done. That is a GRC constraint, not a UI
 * preference — a risk with a treatment but no assessment is not a record
 * anyone can sign off. */
export function Stepper({ steps, current, onStepClick, completed = [] }) {
  return (
    <nav aria-label="Progress" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((s, i) => {
        const active = i === current
        const done = completed.includes(i) || i < current
        const reachable = done || i === current
        return (
          <div key={s.value ?? i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : '0 0 auto', minWidth: 0 }}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onStepClick?.(i)}
              aria-current={active ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
                padding: '4px 2px', cursor: reachable ? 'pointer' : 'default', minWidth: 0,
              }}
            >
              <span style={{
                width: 21, height: 21, borderRadius: 999, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--t-meta)', fontWeight: 600,
                background: active ? 'var(--crimson)' : done ? 'var(--crimson-wash)' : 'var(--surface)',
                color: active ? '#fff' : done ? 'var(--crimson)' : 'var(--text-3)',
                border: `1px solid ${active ? 'var(--crimson)' : done ? '#f0dada' : 'var(--border)'}`,
                transition: 'all var(--dur-2) var(--ease)',
              }}>
                {done && !active ? <Check size={11} /> : i + 1}
              </span>
              <span className="truncate" style={{
                fontSize: 'var(--t-sm)',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : done ? 'var(--text-2)' : 'var(--text-3)',
              }}>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span style={{ flex: 1, height: 1, background: done ? 'var(--blush)' : 'var(--border)', margin: '0 10px', minWidth: 14 }} />
            )}
          </div>
        )
      })}
    </nav>
  )
}
