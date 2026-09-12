import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

/* Needed chiefly by the collapsed sidebar (§5), where the label is the only
 * thing telling you what an icon means. Delay is deliberate: instant tooltips
 * fire constantly while the cursor crosses a nav column.
 *
 * The wrapper is display:contents so it does not insert a box into the
 * sidebar's flex column. That has one consequence worth stating, because it
 * caused a bug: an element with display:contents generates no box, so calling
 * getBoundingClientRect() on the wrapper itself returns all zeros and every
 * tooltip lands at the top-left of the viewport. Measure the hovered element
 * instead — the wrapper is a handler host, never a measurement target.
 */
export function Tooltip({ label, side = 'right', children, delay = 350 }) {
  const [pos, setPos] = useState(null)
  const timer = useRef(null)
  const ref = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  /* The element that actually occupies space — the wrapper's first real child,
   * i.e. the NavLink or avatar being wrapped. Deliberately not the event
   * target: the cursor is usually over the <svg> icon, and anchoring to the
   * icon rather than the row makes the tooltip jump as you move within a nav
   * item. The row is the stable anchor. */
  const measure = () => {
    const el = ref.current?.firstElementChild
    if (!el || typeof el.getBoundingClientRect !== 'function') return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null   // boxless — bail
    return r
  }

  const show = () => {
    if (!label) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = measure()
      if (!r) return

      const GAP = 8
      let top, left
      if (side === 'right') {
        top = r.top + r.height / 2
        left = r.right + GAP
      } else {
        top = r.bottom + 6
        left = r.left + r.width / 2
      }

      /* Clamp into the viewport. A nav item near the foot of a collapsed
         sidebar would otherwise push its tooltip under the fold. */
      const MARGIN = 6
      top = Math.min(Math.max(top, MARGIN + 10), window.innerHeight - MARGIN - 10)
      left = Math.min(left, window.innerWidth - MARGIN)

      setPos({ top, left })
    }, delay)
  }

  const hide = () => { clearTimeout(timer.current); setPos(null) }

  // Nothing to show: render the children untouched rather than wrapping them
  // in handlers that can only ever no-op. The expanded sidebar passes null.
  if (!label) return children

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'contents' }}
      >
        {children}
      </span>
      {pos && createPortal(
        <span role="tooltip" className="anim-fade" style={{
          position: 'fixed', top: pos.top, left: pos.left,
          transform: side === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
          background: 'var(--ink)', color: 'var(--on-dark)',
          fontSize: 'var(--t-meta)', padding: '4px 8px', borderRadius: 'var(--r)',
          boxShadow: 'var(--e-2)', zIndex: 'var(--z-toast)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>{label}</span>,
        document.body
      )}
    </>
  )
}
