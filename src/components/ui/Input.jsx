import clsx from 'clsx'

export function Input({ label, error, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>{label}</label>}
      <input className={clsx('sentrix-input', error && 'border-red-400', className)} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Select({ label, error, children, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>{label}</label>}
      <div className="relative">
        <select className={clsx('sentrix-select pr-8', error && 'border-red-400', className)} {...props}>{children}</select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: '#8a7070' }}>▾</span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
