import { useState, useRef } from 'react'
import { Check } from 'lucide-react'
import { useConnectors } from '@/hooks/useConnectors'
import { Spinner } from '@/components/ui/Spinner'
import { tx } from '@/lib/i18n'

/* The consent step before an OAuth connection, shown inside the connector's
 * own card: what RISYS will ask for, then Authorize. In a real OAuth flow
 * connect() leaves the page for the provider and returns via /oauth/callback;
 * if it returns here, it was a development connection and simply finished. */
export function ConnectConsent({ connector, onCancel }) {
  const { connect } = useConnectors()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef(0)

  const go = async () => {
    const n = ++attempt.current
    setBusy(true); setError('')
    try {
      await connect(connector.id)
      if (n === attempt.current) onCancel()
    } catch (err) {
      if (n !== attempt.current) return
      setError(err.message || tx('Connection failed')); setBusy(false)
    }
  }

  return (
    <div className="anim-fade" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>{tx('RISYS will request these permissions through')} {connector.shortName}:</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {connector.permissions.map((p) => (
          <li key={p} style={{ display: 'flex', gap: 6, fontSize: 'var(--t-sm)', color: 'var(--text)' }}>
            <Check size={13} style={{ color: 'var(--crimson)', flexShrink: 0, marginTop: 2 }} />{p}
          </li>
        ))}
      </ul>
      {busy && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Redirecting to')} {connector.shortName}… {tx('You\'ll be brought back here automatically')}</p>}
      {error && <p className="field-error" role="alert" style={{ margin: 0 }}>{tx('Connection failed')}: {error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={busy} onClick={go}>{busy && <Spinner size="sm" />}{tx('Authorize with')} {connector.shortName}</button>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>{tx('Cancel')}</button>
      </div>
    </div>
  )
}
