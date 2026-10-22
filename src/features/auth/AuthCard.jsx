import { RisysLogo } from '@/components/ui/RisysLogo'
import { LanguageSwitch } from '@/components/ui/LanguageSwitch'

/* The card every signed-out page sits in: sign in, forgot password, reset
 * password. One shell so the three read as one flow. */
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f7f7' }}>
      <LanguageSwitch variant="floating" />
      <div className="w-full max-w-md rounded-xl p-8" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="mb-7"><RisysLogo size="lg" tagline /></div>
        {title && <h1 className="text-lg font-medium mb-1" style={{ color: '#1a1314' }}>{title}</h1>}
        {subtitle && <p className="text-xs mb-6" style={{ color: '#8a7070', lineHeight: 1.6 }}>{subtitle}</p>}
        {children}
        {footer && <div className="mt-5 text-center">{footer}</div>}
      </div>
    </div>
  )
}

/* Inline notices inside the card. */
export function Notice({ tone = 'info', children }) {
  const t = {
    info:    { bg: '#f6eeec', bd: '#e9dad7', fg: '#4d3e3e' },
    success: { bg: '#ECF4EE', bd: '#C8DECD', fg: '#2F6B3C' },
    error:   { bg: '#FBEAEA', bd: '#F0CECE', fg: '#8C1616' },
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      style={{ background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
