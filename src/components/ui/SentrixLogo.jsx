export function SentrixLogo({ size = 'md', tone = 'dark' }) {
  const sizes = { sm: { icon: 26, font: 16 }, md: { icon: 32, font: 20 }, lg: { icon: 40, font: 26 } }
  const s = sizes[size]
  return (
    <div className="flex items-center gap-2.5">
      <div style={{ width: s.icon, height: s.icon, background: '#5D0F0F', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={s.icon * 0.55} height={s.icon * 0.55} viewBox="0 0 20 20" fill="none">
          <path d="M10 2L3 7v6l7 5 7-5V7L10 2zm0 2.3l5 3.5v4.4L10 17.7l-5-3.5V7.8L10 4.3z" fill="#fff" />
        </svg>
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: s.font, color: tone === 'light' ? '#F3E7E4' : '#292021', letterSpacing: 0.5 }}>Sentrix</span>
    </div>
  )
}
