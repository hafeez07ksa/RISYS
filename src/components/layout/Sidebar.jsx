import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare, BookCheck, ScrollText, Settings, Users,
  CheckSquare2, FileWarning, Library, PanelLeftClose, PanelLeftOpen, ClipboardCheck, FileText, Sparkles,
  MessagesSquare, ShieldOff, FolderOpen, FilePen, ListChecks, Gauge, CalendarClock, Radar, Landmark, ShieldCheck, Archive,
  ChevronRight, Fingerprint, UserRoundSearch, Siren, Database, Scale,
} from 'lucide-react'
import { usePendingSuggestionCount } from '@/hooks/useRiskSuggestions'
import { Tooltip } from '@/components/ui/Tooltip'
import { usePermissions } from '@/hooks/usePermissions'
import { activePage } from '@/lib/navigation'
// The mark image, not askParts: no Ask RISYS code ships when VITE_ASK_RISYS is off.
import markLight from '@/assets/risys-mark-light.png'
import clsx from 'clsx'
import { tx } from '@/lib/i18n'

/* ── Module sidebar ───────────────────────────────────────────────────────────
 *
 * The second navigation level. The top bar picks the module; this lists the
 * pages of that module only, so the sidebar stays short however many modules
 * RISYS grows. A module with a single page has no sidebar at all.
 *
 * Collapse (icons only) persists, and below 1100px it collapses on its own;
 * the state lives in AppLayout because the logo block in the top bar keeps
 * the same width as the sidebar.
 * -------------------------------------------------------------------------- */

export const ICONS = {
  LayoutDashboard, ShieldAlert, AlertTriangle, CheckSquare, BookCheck, ScrollText, Settings, Users,
  CheckSquare2, FileWarning, Library, ClipboardCheck, FileText, Sparkles, MessagesSquare, ShieldOff,
  FolderOpen, FilePen, ListChecks, Gauge, CalendarClock, Radar, Landmark, ShieldCheck, Archive,
  Fingerprint, UserRoundSearch, Siren, Database, Scale,
}

function NavItem({ to, icon, label, active, collapsed, badge }) {
  const Icon = ICONS[icon]
  const link = (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={clsx('nav-item', active && 'active')}
      style={collapsed ? { justifyContent: 'center', padding: '7px 0', position: 'relative' } : undefined}
      aria-label={collapsed ? label : undefined}
    >
      {Icon && <Icon size={15} strokeWidth={1.6} style={{ flexShrink: 0 }} />}
      {!collapsed && <span className="truncate" style={{ flex: 1 }}>{label}</span>}
      {badge > 0 && (
        <span className="tnum" aria-label={tx('{{n}} waiting', { n: badge })} style={collapsed ? {
          position: 'absolute', top: 2, insetInlineEnd: 6, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7,
          background: '#c2410c', color: '#fff', fontSize: 9, fontWeight: 600, lineHeight: '14px', textAlign: 'center',
        } : {
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, flexShrink: 0,
          background: '#c2410c', color: '#fff', fontSize: 10.5, fontWeight: 600, lineHeight: '18px', textAlign: 'center',
        }}>{badge}</span>
      )}
    </Link>
  )
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link
}

/* Ask RISYS, in the same place in every module: at the foot of the sidebar.
 * It opens the card beside the sidebar; it never covers the page's buttons. */
function AskEntry({ collapsed, open, onToggle }) {
  const btn = (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={tx('Ask RISYS')}
      className={clsx('ask-entry', open && 'open', collapsed && 'collapsed')}>
      <span className="ask-entry-mark"><img src={markLight} alt="" aria-hidden="true" width={18} height={18} style={{ objectFit: 'contain' }} /></span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'start' }}>
            <span className="block truncate" style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--on-dark)' }}>{tx('Ask RISYS')}</span>
            <span className="block truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--on-dark-2)' }}>{tx('Your AI GRC assistant')}</span>
          </span>
          <ChevronRight size={14} className="rtl-flip" style={{ color: 'var(--on-dark-2)', flexShrink: 0 }} />
        </>
      )}
    </button>
  )
  return (
    <div style={{ padding: collapsed ? '10px 8px' : '10px', flexShrink: 0 }}>
      {collapsed ? <Tooltip label={tx('Ask RISYS')}>{btn}</Tooltip> : btn}
    </div>
  )
}

export function Sidebar({ module, collapsed, onToggle, ask }) {
  const perms = usePermissions()
  const { pathname } = useLocation()
  const withSuggestions = !!module?.pages.some((i) => i.badge === 'suggestions')
  const { count: suggestions, refetch } = usePendingSuggestionCount(withSuggestions && (perms.canTriageFindings || perms.isAuditor))
  // Re-count when the person moves around, so approving clears the badge.
  useEffect(() => { if (withSuggestions) refetch() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!module) return null
  const current = activePage(module, pathname)
  const line = '1px solid rgba(255,255,255,0.07)'

  return (
    <aside
      aria-label={module.label}
      className="flex flex-col flex-shrink-0"
      style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)', background: 'var(--ink)', transition: 'width var(--dur-3) var(--ease)' }}
    >
      <nav className="flex-1 overflow-y-auto flex flex-col" style={{ padding: collapsed ? '14px 8px' : '14px 10px', gap: 2 }}>
        {!collapsed && <p className="nav-section" style={{ marginBottom: 8 }}>{module.label}</p>}
        {module.items.map((i, k) => i.group ? (
          collapsed
            ? <div key={`g${k}`} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 8px' }} />
            : <p key={`g${k}`} className="nav-section" style={{ marginTop: 14 }}>{i.group}</p>
        ) : (
          <NavItem key={i.path} to={`/app/${i.path}`} icon={i.icon} label={i.label} collapsed={collapsed}
            active={current?.path === i.path} badge={i.badge === 'suggestions' ? suggestions : 0} />
        ))}
      </nav>

      {ask?.available && <AskEntry collapsed={collapsed} open={ask.open} onToggle={ask.onToggle} />}

      <div style={{ padding: collapsed ? '6px 8px' : '6px 10px', borderTop: line, flexShrink: 0 }}>
        <Tooltip label={collapsed ? tx('Expand sidebar') : null}>
          <button
            onClick={onToggle}
            aria-label={collapsed ? tx('Expand sidebar') : tx('Collapse sidebar')}
            className="nav-item w-full"
            style={collapsed ? { justifyContent: 'center', padding: '7px 0' } : undefined}
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.6} className="rtl-flip" /> : <PanelLeftClose size={15} strokeWidth={1.6} className="rtl-flip" />}
            {!collapsed && <span>{tx('Collapse')}</span>}
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
