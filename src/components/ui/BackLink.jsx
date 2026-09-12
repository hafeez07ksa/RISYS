import { ArrowLeft } from 'lucide-react'

/* One back affordance (§44). Three pages had hand-rolled versions at 12px,
 * 12.5px and 13px with different gaps and hover behaviour, so stepping out of
 * the compliance hierarchy meant the control moved slightly at every level.
 *
 * This goes *up the tree*, not back through history. That distinction matters
 * here: arriving at a subcontrol from global search or a shared link and then
 * pressing back should land on its parent control, not return to the search.
 * Chaining it always walks the same path — subcontrol, control, framework,
 * Compliance — which is what makes the hierarchy learnable.
 */
export function BackLink({ to, label, children, style }) {
  return (
    <button
      onClick={to}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', padding: '2px 0',
        cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--text-3)',
        transition: 'color var(--dur-2) var(--ease)',
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--crimson)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
    >
      <ArrowLeft size={13} style={{ flexShrink: 0 }} />
      {children ?? <>Back to {label}</>}
    </button>
  )
}
