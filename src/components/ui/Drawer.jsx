import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/* Drawer (§26). The rule the brief sets, and the one this enforces:
 *
 *   Drawer  — quick preview, small edit, contextual information.
 *   Page    — Add Risk, any detail view, assessments, large forms.
 *
 * The drawer deliberately does not span the viewport. Leaving the list visible
 * on the left is the whole point: an analyst triaging findings peeks at one,
 * dismisses it, and moves down the list without losing their place. A modal
 * cannot do that, which is why 28 files reaching for Modal was the problem.
 *
 * Every drawer ends in a link to the full record, so the preview is never a
 * dead end. */
export function Drawer({ open, onClose, title, subtitle, width = 460, footer, children }) {
  const panel = useRef(null)
  const restore = useRef(null)

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => panel.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      restore.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer)', display: 'flex', justifyContent: 'flex-end' }}>
      {/* Scrim is light — the list behind stays legible, which is the reason
          to use a drawer at all. */}
      <div
        className="anim-fade"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(41,32,33,0.18)' }}
      />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-drawer"
        style={{
          position: 'relative', width, maxWidth: '92vw', height: '100%',
          background: 'var(--bg-2)', borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--e-4)', display: 'flex', flexDirection: 'column', outline: 'none',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.35 }}>
              {title}
            </h2>
            {subtitle && <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '3px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--r)', border: 'none', background: 'transparent',
            color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
          }}>
            <X size={15} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>

        {footer && (
          <footer style={{
            padding: '11px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg-2)',
          }}>{footer}</footer>
        )}
      </aside>
    </div>,
    document.body
  )
}

/* Label/value rows are the bulk of every drawer and overview panel. Defined
 * once so the label column lines up identically everywhere. */
export function DetailRow({ label, children, mono }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border-3)' }}>
      <span style={{ width: 120, flexShrink: 0, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{label}</span>
      <span className={mono ? 'mono' : undefined} style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', minWidth: 0, flex: 1 }}>
        {children ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
      </span>
    </div>
  )
}
