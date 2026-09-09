export function ConnectorLogo({ connector, size = 40, muted = false }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 10,
      background: muted ? '#f0efee' : '#f5f3f3',
      border: '1px solid #e5e0e0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.42,
      fontWeight: 700,
      color: muted ? '#b0a8a8' : connector.logoColor,
      fontFamily: "'DM Sans', sans-serif",
      flexShrink: 0,
      transition: 'color 0.2s',
    }}>
      {connector.logoText}
    </div>
  )
}
