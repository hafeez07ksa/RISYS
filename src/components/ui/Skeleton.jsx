/* Loading states (§33). Skeletons rather than spinners for anything with known
 * shape — a table, a detail page, a metric strip. A spinner tells the user to
 * wait; a skeleton tells them what is coming, which reads as faster even when
 * it isn't. Spinner is kept for indeterminate actions (saving, syncing). */
export function Skeleton({ width = '100%', height = 12, radius = 'var(--r-sm)', className, style }) {
  return (
    <span
      className={`skeleton ${className || ''}`}
      aria-hidden="true"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  )
}

export function SkeletonText({ lines = 3, width = '100%' }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={11} width={i === lines - 1 ? '60%' : width} />
      ))}
    </span>
  )
}

/* Mirrors the metric strip so the page does not reflow when numbers land. */
export function SkeletonMetrics({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`, gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg-2)', padding: '11px 14px' }}>
          <Skeleton width={54} height={9} />
          <div style={{ height: 7 }} />
          <Skeleton width={34} height={17} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div><Skeleton width={190} height={17} /><div style={{ height: 8 }} /><Skeleton width={110} height={11} /></div>
      <div className="section"><div className="section-body"><SkeletonText lines={4} /></div></div>
      <div className="section"><div className="section-body"><SkeletonText lines={3} /></div></div>
    </div>
  )
}
