import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnectors } from '@/hooks/useConnectors'
import { ConnectorLogo } from './ConnectorLogo'
import { OAuthModal } from './OAuthModal'
import { Clock } from 'lucide-react'
import clsx from 'clsx'

/*
 * Settings only — connect / disconnect.
 * Findings and user profiles live under /app/findings, not here.
 * "Manage →" on a connected card goes to the connector's settings page
 * (connection info, sync scope, danger zone). Nothing about findings.
 */

const SETTINGS_ROUTES = {
  jira:       '/app/settings/jira',
  entra:      '/app/settings/entra',
  m365:       '/app/settings/m365',
  defender:   '/app/settings/defender',
  sharepoint: '/app/settings/sharepoint',
}

const LIVE_CONNECTORS = new Set(['entra', 'jira', 'm365', 'defender', 'sharepoint'])

const COMING_SOON = {
  google: { eta: 'Q3 2026' },
  notion: { eta: 'Q3 2026' },
  slack:  { eta: 'Q3 2026' },
}

export function ConnectorCard({ connector }) {
  const navigate = useNavigate()
  const { isConnected } = useConnectors()
  const [showConnect, setShowConnect] = useState(false)

  // M365 piggybacks on Entra — it's "connected" when Entra is connected
  const piggybackId   = connector.piggybakcsOn
  const connected     = piggybackId ? isConnected(piggybackId) : isConnected(connector.id)
  const settingsRoute = SETTINGS_ROUTES[connector.id]
  const comingSoon    = COMING_SOON[connector.id]

  return (
    <>
      {showConnect && <OAuthModal connector={connector} onClose={() => setShowConnect(false)} />}

      <div
        className={clsx('rounded-xl p-5 flex flex-col transition-all', connected ? 'ring-1 ring-[#5D0F0F]/20' : '')}
        style={{
          background: comingSoon ? '#fafafa' : '#fff',
          border: connected ? '1px solid #e8d0d0' : comingSoon ? '1px solid #ededec' : '1px solid #e5e0e0',
          opacity: comingSoon ? 0.82 : 1,
        }}>

        {/* Header row */}
        <div className="flex items-start justify-between mb-3.5">
          <ConnectorLogo connector={connector} size={40} muted={!!comingSoon} />
          {connected ? (
            <span className="badge badge-connected">Connected</span>
          ) : comingSoon ? (
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{ background: '#f5f3f3', color: '#8a7070', border: '1px solid #e5e0e0' }}>
              <Clock size={10} /> Coming Soon
            </span>
          ) : (
            <span className="badge badge-disconnected">Not connected</span>
          )}
        </div>

        {/* Name + description */}
        <p className="text-sm font-medium mb-1" style={{ color: comingSoon ? '#8a7070' : '#1a1314' }}>
          {connector.name}
        </p>
        <p className="text-xs leading-relaxed flex-1" style={{ color: '#8a7070' }}>
          {connector.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid #e5e0e0' }}>
          <span className="text-[11px]" style={{ color: '#8a7070' }}>{connector.category}</span>

          <div className="flex items-center gap-2">
            {comingSoon ? (
              <span className="text-[11px]" style={{ color: '#b0a8a8' }}>
                Available {comingSoon.eta}
              </span>
            ) : connected ? (
              /* Manage = connection settings + disconnect. Findings live in /app/findings */
              settingsRoute && (
                <button onClick={() => navigate(settingsRoute)}
                  className="btn-primary text-xs px-3 py-1.5">
                  Manage →
                </button>
              )
            ) : (
              <button onClick={() => setShowConnect(true)} className="btn-primary text-xs px-3 py-1.5">
                Connect →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
