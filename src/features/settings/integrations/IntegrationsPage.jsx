import { useState } from 'react'
import { CONNECTORS, CONNECTOR_CATEGORIES } from '@/lib/constants'
import { ConnectorCard } from './ConnectorCard'
import { useConnectors } from '@/hooks/useConnectors'
import clsx from 'clsx'

export function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState('All')
  const { connections, loading } = useConnectors()
  const filtered = activeCategory === 'All' ? CONNECTORS : CONNECTORS.filter(c => c.category === activeCategory)
  const activeCount = connections.filter(c => c.status === 'active').length

  return (
    <div>
      <div className="mb-5">
        <h2 className="section-title">Integrations & Connectors</h2>
        <p className="section-desc">Connect your platforms to let RISYS automatically capture risks, incidents, and compliance signals.</p>
      </div>

      {activeCount > 0 && (
        <div className="notice-bar">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#5D0F0F' }} />
          {activeCount} connector{activeCount > 1 ? 's' : ''} active — RISYS is monitoring your connected platforms
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-lg w-fit mb-5" style={{ background: '#f5f3f3' }}>
        {CONNECTOR_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={clsx('px-3 py-1.5 rounded-md text-xs transition-colors', activeCategory === cat ? 'font-medium shadow-sm' : '')}
            style={{
              background: activeCategory === cat ? '#fff' : 'transparent',
              color: activeCategory === cat ? '#1a1314' : '#8a7070',
              border: activeCategory === cat ? '1px solid #e5e0e0' : '1px solid transparent',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="w-6 h-6 rounded-full border-2 border-[#e5e0e0] border-t-[#5D0F0F] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(connector => <ConnectorCard key={connector.id} connector={connector} />)}
        </div>
      )}
    </div>
  )
}
