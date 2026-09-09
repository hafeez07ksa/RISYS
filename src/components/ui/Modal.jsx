import { useEffect } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={clsx('w-full rounded-xl p-6 shadow-lg animate-[fadeUp_0.16s_ease]', sizes[size])}
        style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        {(title || onClose) && (
          <div className="flex items-center justify-between mb-5">
            {title && <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>{title}</h2>}
            {onClose && (
              <button onClick={onClose} className="ml-auto transition-colors hover:opacity-70" style={{ color: '#8a7070' }}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
