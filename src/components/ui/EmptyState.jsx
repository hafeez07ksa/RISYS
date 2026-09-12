import { Inbox } from 'lucide-react'

/* Empty states (§32). Two distinct cases that must never be conflated:
 *
 *   nothing exists yet  → explain what will appear here and offer to create one
 *   nothing MATCHES     → say so and offer to clear the filters
 *
 * Showing "No risks yet — create your first risk" to someone whose filter is
 * simply too narrow is actively wrong: the risks exist, and the suggested
 * action would duplicate one. `filtered` picks the right copy. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  filtered = false,
  onClearFilters,
  compact = false,
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: compact ? '28px 20px' : '52px 20px',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 'var(--r-lg)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}>
        <Icon size={17} style={{ color: 'var(--taupe)' }} />
      </div>
      <p style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
        {title}
      </p>
      {description && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: '5px 0 0', maxWidth: 340, lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        {filtered && onClearFilters && (
          <button className="btn-secondary" onClick={onClearFilters}>Clear filters</button>
        )}
        {action}
      </div>
    </div>
  )
}
