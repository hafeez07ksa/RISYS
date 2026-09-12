import clsx from 'clsx'

/* Tabs (§15, §16). Underline rather than filled pills: a filled tab competes
 * with the primary action button for the eye, and on a detail page the primary
 * action matters more than which section you are reading.
 *
 * counts are shown inline because on Incidents and Findings the number IS the
 * reason to click the tab. */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={clsx('flex items-center', className)}
      style={{ gap: 2, borderBottom: '1px solid var(--border)' }}
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 'var(--t-body)',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--text)' : 'var(--text-3)',
              borderBottom: `2px solid ${active ? 'var(--crimson)' : 'transparent'}`,
              marginBottom: -1,
              transition: 'color var(--dur-2) var(--ease)',
            }}
          >
            {t.label}
            {t.count != null && (
              <span className="tnum" style={{
                fontSize: 'var(--t-micro)', padding: '1px 5px', borderRadius: 'var(--r-full)',
                background: active ? 'var(--crimson-wash)' : 'var(--surface)',
                color: active ? 'var(--crimson)' : 'var(--text-3)',
              }}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
