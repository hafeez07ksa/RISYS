import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { IntegrationsPage } from './integrations/IntegrationsPage'
import { MembersSettings } from './MembersSettings'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'

// Settings is already behind RequireRole(admin) in routes,
// but we also scope the tabs to what makes sense for admins.
const TABS = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'organization', label: 'Organization' },
  { id: 'members',      label: 'Members' },
  { id: 'notifications',label: 'Notifications' },
]

const Stub = ({ text }) => (
  <div className="py-16 text-center text-xs" style={{ color: '#8a7070' }}>
    {text} — coming soon
  </div>
)

export function SettingsPage() {
  const [active, setActive] = useState('integrations')
  const { organization } = useAuth()

  const content = {
    integrations:  <IntegrationsPage />,
    organization:  <Stub text="Organization settings" />,
    members:       <MembersSettings />,
    notifications: <Stub text="Notification preferences" />,
  }

  return (
    <div>
      <Topbar title="Settings" subtitle={organization?.name} />
      <div className="page-content">
        <div className="flex gap-0 mb-6" style={{ borderBottom: '1px solid #e5e0e0' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActive(tab.id)}
              className={clsx('px-4 py-2.5 text-xs transition-colors -mb-px border-b-2')}
              style={{
                color: active === tab.id ? '#1a1314' : '#8a7070',
                borderBottomColor: active === tab.id ? '#5D0F0F' : 'transparent',
                fontWeight: active === tab.id ? 500 : 400,
              }}>
              {tab.label}
            </button>
          ))}
        </div>
        {content[active]}
      </div>
    </div>
  )
}
