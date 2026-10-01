import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare,
  BookCheck, ScrollText, Settings, ChevronDown, LogOut, Users, Users2, CheckSquare2, FileWarning,
  Library, PanelLeftClose, PanelLeftOpen, Check, ClipboardCheck, FileText, Sparkles,
} from 'lucide-react'
import { usePendingSuggestionCount } from '@/hooks/useRiskSuggestions'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { roleLabel } from '@/lib/roles'
import { NAV_ITEMS } from '@/lib/constants'
import clsx from 'clsx'
import { tx } from '@/lib/i18n'

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
  ClipboardCheck, FileText, Sparkles,
}

/* Which capability a nav item needs. Anything not listed is open to every
   role, read-only ones included. Mirrors the route guards in router/routes.jsx
   and, behind both, the RLS policies. */
const NAV_GATE = {
  findings: (p) => p.canTriageFindings || p.isAuditor,
  people:   (p) => p.canManagePeople,
  settings: (p) => p.canEditOrgSettings,
  audit:    (p) => p.canViewAudit,
  'risks/suggestions': (p) => p.canTriageFindings || p.isAuditor,
}
const COLLAPSE_KEY = 'risys.sidebar.collapsed'

// Pages that live under another item's path but have their own nav entry, so
// the parent does not light up with them (Risk Register vs Suggested risks).
const OWN_ENTRIES = ['/app/risks/suggestions']

function NavItem({ to, icon: iconName, label, collapsed, sub, badge }) {
  const Icon = ICONS[iconName]
  const { pathname } = useLocation()
  const stolen = OWN_ENTRIES.some(p => p !== to && p.startsWith(`${to}/`) && pathname.startsWith(p))
  const link = (
    <NavLink
      to={to}
      className={({ isActive }) => clsx('nav-item', isActive && !stolen && 'active')}
      style={collapsed ? { justifyContent: 'center', padding: '7px 0', position: 'relative' }
        : sub ? { paddingInlineStart: 30 } : undefined}
      aria-label={collapsed ? label : undefined}
    >
      {Icon && <Icon size={sub ? 13 : 15} strokeWidth={1.6} style={{ flexShrink: 0 }} />}
      {!collapsed && <span className="truncate" style={{ flex: 1, fontSize: sub ? 12.5 : undefined }}>{label}</span>}
      {badge > 0 && (
        <span className="tnum" aria-label={tx('{{n}} waiting', { n: badge })} style={collapsed ? {
          position: 'absolute', top: 2, insetInlineEnd: 6, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7,
          background: '#c2410c', color: '#fff', fontSize: 9, fontWeight: 600, lineHeight: '14px', textAlign: 'center',
        } : {
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, flexShrink: 0,
          background: '#c2410c', color: '#fff', fontSize: 10.5, fontWeight: 600, lineHeight: '18px', textAlign: 'center',
        }}>{badge}</span>
      )}
    </NavLink>
  )
  // §5 — the label has to come back somehow once the icon is all that is left.
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link
}

function Section({ title, items, collapsed }) {
  const perms = usePermissions()
  const { pathname } = useLocation()
  const showsSuggestions = items.some(i => i.id === 'risks/suggestions')
  const { count: suggestions, refetch } = usePendingSuggestionCount(showsSuggestions && (perms.canTriageFindings || perms.isAuditor))
  // Re-count when the person moves around, so approving clears the badge.
  useEffect(() => { if (showsSuggestions) refetch() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  if (items.length === 0) return null
  return (
    <div>
      {!collapsed && <p className="nav-section">{title}</p>}
      {collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 8px' }} />}
      <div className="flex flex-col gap-0.5">
        {items.map((i) => (
          <NavItem key={i.id} to={`/app/${i.id}`} icon={i.icon} label={i.label} collapsed={collapsed}
            sub={i.sub} badge={i.id === 'risks/suggestions' ? suggestions : 0} />
        ))}
      </div>
    </div>
  )
}


/* ── Workspace switcher ───────────────────────────────────────────────────── */
function WorkspaceSwitcher({ collapsed }) {
  const { organization, memberships, switchOrganization } = useAuth()
  const [open, setOpen] = useState(false)
  const many = (memberships?.length || 0) > 1

  const label = organization?.name || 'My Organization'

  const trigger = (
    <button
      onClick={() => many && setOpen(o => !o)}
      aria-haspopup={many ? 'listbox' : undefined}
      aria-expanded={many ? open : undefined}
      className='w-full flex items-center gap-2 rounded-md text-start transition-colors'
      style={{
        padding: collapsed ? '6px 0' : '6px 8px',
        justifyContent: collapsed ? 'center' : undefined,
        background: 'transparent', border: 'none',
        cursor: many ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => many && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--taupe)' }} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--blush)' }}>
            {label}
          </span>
          {many && <ChevronDown size={12} style={{ color: 'var(--text-3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-2) var(--ease)' }} />}
        </>
      )}
    </button>
  )

  return (
    <div style={{ position: 'relative' }}>
      <Tooltip label={collapsed ? `${label}${many ? ` · ${memberships.length} workspaces` : ''}` : null}>
        {trigger}
      </Tooltip>

      {open && many && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div role="listbox" style={{
            position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, insetInlineEnd: collapsed ? 'auto' : 0,
            minWidth: 230, zIndex: 50, background: 'var(--ink-2, #2b1f20)',
            border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden', padding: 4,
          }}>
            <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '6px 8px 4px' }}>{tx('Workspaces')}</p>
            {memberships.map(o => {
              const active = o.id === organization?.id
              return (
                <button key={o.id} role="option" aria-selected={active}
                  onClick={() => { setOpen(false); if (!active) switchOrganization(o.id) }}
                  className='w-full flex items-center gap-2 rounded-md text-start'
                  style={{
                    padding: '7px 8px', border: 'none', cursor: 'pointer',
                    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="block truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--blush)' }}>{o.name}</span>
                    <span className="block truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{roleLabel(o.memberRole)}</span>
                  </span>
                  {active && <Check size={13} style={{ color: 'var(--taupe)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const { user, organization, signOut } = useAuth()
  const perms = usePermissions()
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

  const roleLabel = perms.roleLabel

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U'

  const visible = (section) =>
    NAV_ITEMS.filter((n) => n.section === section).filter((n) => (NAV_GATE[n.id] ? NAV_GATE[n.id](perms) : true))

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

      {/* Workspace switcher (§5, B5) — a user can belong to several
          organisations (an advisory firm running its clients, a RISYS staff
          account). This is how they move between them. With exactly one
          membership it stays a plain label: no dropdown for a list of one. */}
      <div style={{ padding: collapsed ? '8px 6px' : '8px 10px', borderBottom: line, flexShrink: 0 }}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {/* Primary nav */}
      <nav
        className="flex-1 overflow-y-auto flex flex-col gap-5"
        style={{ padding: collapsed ? '12px 8px' : '12px 10px' }}
      >
        <Section title={tx('Workspace')} items={visible('workspace')} collapsed={collapsed} />
        <Section title={tx('System')} items={visible('system')} collapsed={collapsed} />
      </nav>

      {/* Reference library — pinned below the scrolling nav. ECC is assessed,
          the rest are browsable. */}
      {visible('library').length > 0 && (
        <div style={{ padding: collapsed ? '10px 8px' : '10px', borderTop: line, flexShrink: 0 }}>
          <Section title={tx('Frameworks')} items={visible('library')} collapsed={collapsed} />
        </div>
      )}

      {/* Collapse control */}
      <div style={{ padding: collapsed ? '6px 8px' : '6px 10px', borderTop: line, flexShrink: 0 }}>
        <Tooltip label={collapsed ? tx('Expand sidebar') : null}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? tx('Expand sidebar') : tx('Collapse sidebar')}
            className="nav-item w-full"
            style={collapsed ? { justifyContent: 'center', padding: '7px 0' } : undefined}
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.6} /> : <PanelLeftClose size={15} strokeWidth={1.6} />}
            {!collapsed && <span>{tx('Collapse')}</span>}
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
                title={tx('Sign out')}
                aria-label={tx('Sign out')}
              >
                <LogOut size={13} className='rtl-flip' />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
