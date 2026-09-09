import clsx from 'clsx'

export function Button({ children, variant = 'primary', size = 'md', className, disabled, loading, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'border-0 text-white',
    secondary: 'bg-transparent border text-[#4a3a3a] hover:bg-[#f5f3f3] hover:text-[#1a1314]',
    ghost: 'bg-transparent border-0 text-[#8a7070] hover:bg-[#f5f3f3] hover:text-[#4a3a3a]',
    danger: 'bg-transparent border text-red-600 hover:bg-red-50',
  }
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2.5', lg: 'text-sm px-5 py-3' }
  const primaryStyle = variant === 'primary' ? { background: disabled || loading ? '#5D0F0F99' : '#5D0F0F' } : {}
  const secondaryStyle = variant === 'secondary' ? { borderColor: '#d4cccc' } : {}
  const dangerStyle = variant === 'danger' ? { borderColor: '#fca5a5' } : {}

  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled || loading}
      style={{ ...primaryStyle, ...secondaryStyle, ...dangerStyle }} {...props}>
      {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
      {children}
    </button>
  )
}
