import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare,
  BookCheck, ScrollText, Settings, ChevronDown, LogOut, Users, Users2, CheckSquare2, FileWarning
} from 'lucide-react'
import { SentrixLogo } from '@/components/ui/SentrixLogo'
import { useAuth } from '@/hooks/useAuth'
import { NAV_ITEMS } from '@/lib/constants'
import clsx from 'clsx'

const ICONS = {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare,
  BookCheck, ScrollText, Settings, Users, Users2, CheckSquare2, FileWarning
}

// Which nav items require admin role
const ADMIN_ONLY_NAV = new Set(['people', 'settings', 'findings'])

function NavItem({ to, icon: iconName, label }) {
  const Icon = ICONS[iconName]
  return (
    <NavLink to={to} className={({ isActive }) => clsx('nav-item', isActive && 'active')}>
      {Icon && <Icon size={15} strokeWidth={1.5} />}
      <span>{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const { user, organization, signOut } = useAuth()
  const navigate = useNavigate()

  const role = organization?.memberRole || 'viewer'
  const isAdmin = ['admin', 'owner'].includes(role)
  const roleLabel = role.replace('_', ' ')

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U'

  // Filter nav items based on role
  const workspaceItems = NAV_ITEMS
    .filter(n => n.section === 'workspace')
    .filter(n => !ADMIN_ONLY_NAV.has(n.id) || isAdmin)

  const systemItems = NAV_ITEMS
    .filter(n => n.section === 'system')
    .filter(n => !ADMIN_ONLY_NAV.has(n.id) || isAdmin)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  return (
    <aside className="w-56 flex flex-col flex-shrink-0" style={{ background: '#292021' }}>
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid #3a2f30' }}>
        <SentrixLogo size="sm" tone="light" />
      </div>
      <div className="px-3 py-3" style={{ borderBottom: '1px solid #3a2f30' }}>
        <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors hover:bg-[#372c2d]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#A98D8C' }} />
          <span className="text-xs flex-1 truncate" style={{ color: '#E9D8D5' }}>{organization?.name || 'My Organization'}</span>
          <ChevronDown size={12} style={{ color: '#97817d' }} className="flex-shrink-0" />
        </button>
      </div>
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        <p className="text-[10px] uppercase px-2 mb-2" style={{ color: '#8a7373', letterSpacing: '0.14em' }}>Workspace</p>
        <div className="flex flex-col gap-0.5">
          {workspaceItems.map(item => <NavItem key={item.id} to={`/app/${item.id}`} icon={item.icon} label={item.label} />)}
        </div>
        {systemItems.length > 0 && (
          <>
            <p className="text-[10px] uppercase px-2 mt-5 mb-2" style={{ color: '#8a7373', letterSpacing: '0.14em' }}>System</p>
            <div className="flex flex-col gap-0.5">
              {systemItems.map(item => <NavItem key={item.id} to={`/app/${item.id}`} icon={item.icon} label={item.label} />)}
            </div>
          </>
        )}
      </nav>
      <div className="px-3 py-3" style={{ borderTop: '1px solid #3a2f30' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ background: '#5D0F0F', color: '#F3E7E4' }}>{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate font-medium" style={{ color: '#F3E7E4' }}>{user?.user_metadata?.full_name || user?.email}</p>
            <p className="text-[11px] capitalize" style={{ color: '#97817d' }}>{roleLabel}</p>
          </div>
          <button onClick={handleSignOut} className="p-1 transition-colors hover:opacity-70" style={{ color: '#97817d' }} title="Sign out">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}
