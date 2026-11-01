import { useSearchParams } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { IntegrationsPage } from './integrations/IntegrationsPage'
import { MembersSettings } from './MembersSettings'
import { NotificationSettings } from './NotificationSettings'
import { OrganizationSettings } from './OrganizationSettings'
import { BusinessUnitsSettings } from './BusinessUnitsSettings'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'
import { tx } from '@/lib/i18n'

// Settings is already behind RequireRole(admin) in routes,
// but we also scope the tabs to what makes sense for admins.
const TABS = [
  { id: 'integrations', label: tx('Integrations') },
  { id: 'organization', label: tx('Organization') },
  { id: 'units',        label: tx('Business units') },
  { id: 'members',      label: tx('Members') },
  { id: 'notifications',label: tx('Notifications') },
]

export function SettingsPage() {
  // The tab lives in the query string so other pages can link to it
  // (Compliance → "Set the CCC scope" opens ?tab=organization).
  const [params, setParams] = useSearchParams()
  const active = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'integrations'
  const setActive = (id) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (id === 'integrations') next.delete('tab'); else next.set('tab', id)
    return next
  }, { replace: true })
  const { organization } = useAuth()

  const content = {
    integrations:  <IntegrationsPage />,
    organization:  <OrganizationSettings />,
    units:         <BusinessUnitsSettings />,
    members:       <MembersSettings />,
    notifications: <NotificationSettings />,
  }

  return (
    <div>
      <Topbar title={tx('Settings')} subtitle={organization?.name} />
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
