import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare,
  BookCheck, ScrollText, Settings, ChevronDown, LogOut, Users, Users2, CheckSquare2, FileWarning,
  Library, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/hooks/useAuth'
import { NAV_ITEMS } from '@/lib/constants'
import clsx from 'clsx'

/* ── Sidebar (§5) ─────────────────────────────────────────────────────────────
 *
 * Kept dark burgundy; the brief is explicit that the identity stays. What
 * changed is the active state and the density.
 *
 * The old active item filled the full row with --ink-2, which made the current
 * page the single heaviest object in the interface — heavier than the primary
 * action on the page it was pointing at. §40 says not everything should look
 * equally important, and the thing you are already looking at needs the least
 * emphasis of all. It is now a rail plus a 7% tint.
 *
 * Collapse persists to localStorage. On a 1280px laptop the sidebar was 17% of
 * the horizontal space, and a GRC table wants every pixel of it.
 * -------------------------------------------------------------------------- */

const ICONS = {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare,
  BookCheck, ScrollText, Settings, Users, Users2, CheckSquare2, FileWarning, Library,
}

const ADMIN_ONLY_NAV = new Set(['people', 'settings', 'findings'])
const COLLAPSE_KEY = 'risys.sidebar.collapsed'

function NavItem({ to, icon: iconName, label, collapsed }) {
  const Icon = ICONS[iconName]
  const link = (
    <NavLink
      to={to}
      className={({ isActive }) => clsx('nav-item', isActive && 'active')}
      style={collapsed ? { justifyContent: 'center', padding: '7px 0' } : undefined}
      aria-label={collapsed ? label : undefined}
    >
      {Icon && <Icon size={15} strokeWidth={1.6} style={{ flexShrink: 0 }} />}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
  // §5 — the label has to come back somehow once the icon is all that is left.
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link
}

function Section({ title, items, collapsed }) {
  if (items.length === 0) return null
  return (
    <div>
      {!collapsed && <p className="nav-section">{title}</p>}
      {collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 8px' }} />}
      <div className="flex flex-col gap-0.5">
        {items.map((i) => (
          <NavItem key={i.id} to={`/app/${i.id}`} icon={i.icon} label={i.label} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const { user, organization, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* private mode */ }
  }, [collapsed])

  // §36 — below 1100px the sidebar collapses on its own. It does not disappear:
  // losing navigation entirely on a tablet is worse than losing the labels.
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1100) setCollapsed(true) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const role = organization?.memberRole || 'viewer'
  const isAdmin = ['admin', 'owner'].includes(role)
  const roleLabel = role.replace('_', ' ')

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U'

  const visible = (section) =>
    NAV_ITEMS.filter((n) => n.section === section).filter((n) => !ADMIN_ONLY_NAV.has(n.id) || isAdmin)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const w = collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'
  const line = '1px solid rgba(255,255,255,0.07)'

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{ width: w, background: 'var(--ink)', transition: 'width var(--dur-3) var(--ease)' }}
    >
      {/* Wordmark */}
      <div style={{
        height: 'var(--topbar-h)', display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? 0 : '0 14px', borderBottom: line, flexShrink: 0,
      }}>
        <RisysLogo size={collapsed ? 'xs' : 'sm'} tone="light" showText={!collapsed} />
      </div>

      {/* Workspace selector (§5) */}
      <div style={{ padding: collapsed ? '8px 6px' : '8px 10px', borderBottom: line, flexShrink: 0 }}>
        <Tooltip label={collapsed ? (organization?.name || 'Workspace') : null}>
          <button
            className="w-full flex items-center gap-2 rounded-md text-left transition-colors"
            style={{
              padding: collapsed ? '6px 0' : '6px 8px',
              justifyContent: collapsed ? 'center' : undefined,
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--taupe)' }} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--blush)' }}>
                  {organization?.name || 'My Organization'}
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </>
            )}
          </button>
        </Tooltip>
      </div>

      {/* Primary nav */}
      <nav
        className="flex-1 overflow-y-auto flex flex-col gap-5"
        style={{ padding: collapsed ? '12px 8px' : '12px 10px' }}
      >
        <Section title="Workspace" items={visible('workspace')} collapsed={collapsed} />
        <Section title="System" items={visible('system')} collapsed={collapsed} />
      </nav>

      {/* Reference library — pinned below the scrolling nav. ECC is assessed,
          the rest are browsable. */}
      {visible('library').length > 0 && (
        <div style={{ padding: collapsed ? '10px 8px' : '10px', borderTop: line, flexShrink: 0 }}>
          <Section title="Frameworks" items={visible('library')} collapsed={collapsed} />
        </div>
      )}

      {/* Collapse control */}
      <div style={{ padding: collapsed ? '6px 8px' : '6px 10px', borderTop: line, flexShrink: 0 }}>
        <Tooltip label={collapsed ? 'Expand sidebar' : null}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="nav-item w-full"
            style={collapsed ? { justifyContent: 'center', padding: '7px 0' } : undefined}
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.6} /> : <PanelLeftClose size={15} strokeWidth={1.6} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </Tooltip>
      </div>

      {/* User footer */}
      <div style={{ padding: collapsed ? '10px 8px' : '10px', borderTop: line, flexShrink: 0 }}>
        <div className="flex items-center gap-2.5" style={{ justifyContent: collapsed ? 'center' : undefined }}>
          <Tooltip label={collapsed ? `${user?.user_metadata?.full_name || user?.email} · ${roleLabel}` : null}>
            <div
              className="rounded-full flex items-center justify-center flex-shrink-0"
              style={{ width: 26, height: 26, background: 'var(--crimson)', color: 'var(--on-dark)', fontSize: 'var(--t-meta)', fontWeight: 600 }}
            >
              {initials}
            </div>
          </Tooltip>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--on-dark)' }}>
                  {user?.user_metadata?.full_name || user?.email}
                </p>
                <p className="capitalize" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{roleLabel}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1 transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
