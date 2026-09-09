import clsx from 'clsx'

export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <span className={clsx('inline-block rounded-full border-2 animate-spin', sizes[size], className)}
      style={{ borderColor: '#e5e0e0', borderTopColor: '#5D0F0F' }} />
  )
}
