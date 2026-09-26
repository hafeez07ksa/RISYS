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
