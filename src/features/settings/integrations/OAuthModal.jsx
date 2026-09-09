import { useState, useRef } from 'react'
import { useConnectors } from '@/hooks/useConnectors'
import { ConnectorLogo } from './ConnectorLogo'
import { CheckCircle, X } from 'lucide-react'

const PHASE = { CONFIRM: 'confirm', REDIRECTING: 'redirecting', ERROR: 'error' }

export function OAuthModal({ connector, onClose }) {
  const [phase, setPhase]     = useState(PHASE.CONFIRM)
  const [errorMsg, setErrorMsg] = useState('')
  const { connect }           = useConnectors()
  const attemptRef            = useRef(0)

  const handleConnect = async () => {
    const attempt = ++attemptRef.current
    setPhase(PHASE.REDIRECTING)
    setErrorMsg('')
    try {
      await connect(connector.id)
      // If connect() returns it's mock/dev mode (no real client_id).
      // In real OAuth, connect() redirects away and never returns here.
      if (attempt !== attemptRef.current) return
      // Mock success — close modal
      onClose()
    } catch (err) {
      if (attempt !== attemptRef.current) return
      setErrorMsg(err.message || 'Connection failed')
      setPhase(PHASE.ERROR)
    }
  }

  const handleTryAgain = () => {
    setErrorMsg('')
    setPhase(PHASE.CONFIRM)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && phase !== PHASE.REDIRECTING && onClose()}
    >
      <div className="w-full max-w-sm rounded-xl p-6 shadow-xl" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        {phase === PHASE.CONFIRM && (
          <div className="flex flex-col items-center text-center">
            <div className="w-full flex justify-end mb-2">
              <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
            </div>
            <ConnectorLogo connector={connector} size={48} />
            <h2 className="text-base font-medium mt-4 mb-1" style={{ color: '#1a1314' }}>
              Connect {connector.name}
            </h2>
            <p className="text-xs mb-5 leading-relaxed max-w-xs" style={{ color: '#8a7070' }}>
              Sentrix will request the following permissions via OAuth.
            </p>
            <div className="w-full rounded-lg p-4 mb-5 text-left" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#8a7070' }}>
                Permissions requested
              </p>
              {connector.permissions.map(p => (
                <div key={p} className="flex items-start gap-2 mb-2">
                  <span className="text-xs mt-0.5" style={{ color: '#5D0F0F' }}>✓</span>
                  <span className="text-xs" style={{ color: '#4a3a3a' }}>{p}</span>
                </div>
              ))}
            </div>
            <button onClick={handleConnect} className="btn-primary w-full mb-2">
              Authorize with {connector.shortName} →
            </button>
            <button onClick={onClose} className="btn-ghost w-full text-xs">Cancel</button>
          </div>
        )}

        {phase === PHASE.REDIRECTING && (
          <div className="flex flex-col items-center text-center py-8">
            <span className="w-8 h-8 rounded-full border-2 border-[#e5e0e0] border-t-[#5D0F0F] animate-spin mb-4 block" />
            <p className="text-sm font-medium" style={{ color: '#1a1314' }}>
              Redirecting to {connector.shortName}…
            </p>
            <p className="text-xs mt-1" style={{ color: '#8a7070' }}>
              You'll be brought back here automatically
            </p>
          </div>
        )}

        {phase === PHASE.ERROR && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-full flex justify-end mb-2">
              <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
            </div>
            <p className="text-sm font-medium mb-2" style={{ color: '#b91c1c' }}>Connection failed</p>
            <p className="text-xs mb-5" style={{ color: '#8a7070' }}>{errorMsg}</p>
            <button onClick={handleTryAgain} className="btn-secondary w-full">Try again</button>
          </div>
        )}

      </div>
    </div>
  )
}
