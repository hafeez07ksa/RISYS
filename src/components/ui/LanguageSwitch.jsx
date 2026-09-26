import { Languages } from 'lucide-react'
import { language, setLanguage, LANGUAGES } from '@/lib/i18n'

/* One control, two places: a row in the account menu, and a small floating
 * button on the sign-in pages (people choose a language before they have an
 * account). It always names the *other* language in that language — someone
 * who cannot read the current one can still find their way out. */
export function LanguageSwitch({ variant = 'menu' }) {
  const current = language()
  const next = current === 'ar' ? 'en' : 'ar'
  const label = LANGUAGES[next].nativeLabel

  if (variant === 'floating') {
    return (
      <button
        type="button"
        onClick={() => setLanguage(next)}
        lang={next}
        style={{
          position: 'fixed', top: 16, insetInlineEnd: 16, zIndex: 10,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'var(--bg-2)',
          fontSize: 'var(--t-sm)', color: 'var(--text-2)',
        }}
      >
        <Languages size={13} aria-hidden="true" /> {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      lang={next}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'start',
        padding: '6px 9px', borderRadius: 'var(--r)', border: 'none', background: 'transparent',
        fontSize: 'var(--t-sm)', color: 'var(--text-2)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Languages size={13} aria-hidden="true" /> {label}
    </button>
  )
}
