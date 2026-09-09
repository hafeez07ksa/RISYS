import clsx from 'clsx'

export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-surface text-subtle',
    connected: 'badge-connected',
    disconnected: 'badge-disconnected',
    danger: 'badge-danger',
    warning: 'badge-warning',
    success: 'badge-success',
  }

  return (
    <span className={clsx('badge', variants[variant], className)}>
      {children}
    </span>
  )
}
