import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/* Breadcrumbs (§44). The product is four levels deep in places — Compliance →
 * NCA ECC → 2-2-3 → 2-2-3-1 — and before this there was no way to tell where
 * you were or climb back out except the browser Back button. For an auditable
 * system the trail is not decoration: it is the record of what you were
 * looking at.
 *
 * items: [{ label, to }]  — the last entry renders as the current page. */
export function Breadcrumb({ items = [] }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            {i > 0 && <ChevronRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0, opacity: 0.6 }} />}
            {last || !item.to ? (
              <span
                aria-current={last ? 'page' : undefined}
                className="truncate"
                style={{ fontSize: 'var(--t-sm)', color: last ? 'var(--text)' : 'var(--text-3)', fontWeight: last ? 500 : 400 }}
              >
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                className="truncate"
                style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--crimson)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
