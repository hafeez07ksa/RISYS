import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Bell, CheckCheck, Search, HelpCircle, ChevronDown, LogOut, Settings } from 'lucide-react'
import { useNotifications } from '@/hooks/useRisks'
import { useAuth } from '@/hooks/useAuth'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { StatusBadge } from '@/components/ui/StatusBadge'

/* ── Application top bar (§6) ─────────────────────────────────────────────────
 *
 * One persistent bar owned by the layout, not re-implemented per page. It
 * carries the things that are true everywhere — where you are, global search,
 * what needs attention, who you are — and leaves the page itself to own its
 * title, description and actions (§7).
 *
 * Previously each page rendered its own header including its own notification
 * bell, so the bell moved horizontally depending on how many action buttons
 * the page had. Small thing; it is the kind of small thing that makes software
 * feel unfinished.
 * -------------------------------------------------------------------------- */

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/* Route → breadcrumb. Derived centrally so every page gets a trail without
 * having to remember to build one (§44). Detail pages append their own record
 * label via the PageHeader `breadcrumb` prop. */
const SEGMENT_LABELS = {
  app: null,
  dashboard: 'Dashboard', incidents: 'Incidents', findings: 'Findings',
  risks: 'Risk Register', controls: 'Controls', compliance: 'Compliance',
  tasks: 'Tasks', people: 'People', audit: 'Audit Log', settings: 'Settings',
  frameworks: 'Frameworks', new: 'New',
}

/* A dotted requirement id encodes its own ancestry: 1-5-3-1 is a child of
 * 1-5-3. The URL does not contain the parent, so the trail would jump straight
 * from the framework to the leaf and leave no way to reach the clause in
 * between. Expand the chain from the id itself.
 *
 * Only the levels that exist as addressable controls are emitted — ECC nests
 * domain/subdomain/control/subcontrol, so 1-5-3-1 yields 1-5-3 and itself, not
 * 1, 1-5, 1-5-3, 1-5-3-1. */
function expandRequirementAncestry(id) {
  const seg = String(id).split('-')
  if (seg.length <= 3) return [id]
  const out = []
  for (let n = 3; n <= seg.length; n++) out.push(seg.slice(0, n).join('-'))
  return out
}

function useRouteBreadcrumb() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  const items = []
  let acc = ''

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    acc += `/${p}`
    const label = SEGMENT_LABELS[p]
    if (label === null) continue

    // /app/compliance/:frameworkId/:requirementId — the last segment is a
    // requirement id whose ancestors are addressable routes of their own.
    const inCompliance = parts[1] === 'compliance'
    const isRequirement = inCompliance && i === 3
    if (isRequirement) {
      const fwSeg = parts[2]
      for (const anc of expandRequirementAncestry(decodeURIComponent(p))) {
        items.push({
          label: anc,
          to: `/app/compliance/${fwSeg}/${encodeURIComponent(anc)}`,
        })
      }
      continue
    }

    items.push({ label: label ?? decodeURIComponent(p), to: acc })
  }
  return items
}

function IconButton({ children, title, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        position: 'relative', width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--r)', border: '1px solid transparent',
        background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
        transition: 'background var(--dur-2) var(--ease)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
      {badge > 0 && (
        <span className="tnum" style={{
          position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, padding: '0 4px',
          borderRadius: 999, background: 'var(--crimson)', color: '#fff',
          fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center',
          justifyContent: 'center', lineHeight: 1,
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}

function NotificationsBell() {
  const navigate = useNavigate()
  const { notifications, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleClick = async (n) => {
    if (!n.read_at) await markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  /* §34 — notifications are typed, and the type is what decides whether this
   * interrupts someone's afternoon. An overdue critical risk and a completed
   * control assessment are not the same event. */
  const toneOf = (n) => n.type === 'critical' ? 'critical'
    : n.type === 'warning' ? 'medium'
    : n.type === 'success' ? 'low' : 'info'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton title="Notifications" badge={unread} onClick={() => setOpen((o) => !o)}>
        <Bell size={14} style={{ color: unread > 0 ? 'var(--crimson)' : 'var(--text-3)' }} />
      </IconButton>

      {open && (
        <div className="anim-pop" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 350, maxHeight: 430,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          zIndex: 'var(--z-popover)', boxShadow: 'var(--e-3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)',
                color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer',
              }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
                Nothing needs your attention
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', cursor: 'pointer',
                  background: n.read_at ? 'var(--bg-2)' : '#fdf7f7', border: 'none',
                  borderBottom: '1px solid var(--border-3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {!n.read_at && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--crimson)', marginTop: 5, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 'var(--t-sm)', fontWeight: n.read_at ? 500 : 600, color: 'var(--text)' }}>{n.title}</span>
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: 'var(--t-meta)', color: 'var(--text-2)', marginTop: 2,
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>{n.body}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                      <StatusBadge status={n.type || 'info'} tone={toneOf(n)} label={(n.type || 'info').replace(/^\w/, (c) => c.toUpperCase())} />
                      <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { user, organization, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])

  const name = user?.user_metadata?.full_name || user?.email || ''
  const initials = name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 5px 3px 3px',
          borderRadius: 'var(--r-full)', border: '1px solid transparent',
          background: open ? 'var(--surface)' : 'transparent', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 999, background: 'var(--crimson)', color: '#fff',
          fontSize: 'var(--t-micro)', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{initials}</span>
        <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
      </button>

      {open && (
        <div className="anim-pop" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 208,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)', padding: 5,
        }}>
          <div style={{ padding: '7px 9px 9px', borderBottom: '1px solid var(--border-3)', marginBottom: 4 }}>
            <p className="truncate" style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{name}</p>
            <p className="truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 1 }}>
              {organization?.name}
            </p>
          </div>
          <MenuLink icon={Settings} to="/app/settings" onClick={() => setOpen(false)}>Settings</MenuLink>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '6px 9px', borderRadius: 'var(--r)', border: 'none', background: 'transparent',
              fontSize: 'var(--t-sm)', color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ icon: Icon, to, children, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px',
        borderRadius: 'var(--r)', fontSize: 'var(--t-sm)', color: 'var(--text-2)', textDecoration: 'none',
      }}
    >
      <Icon size={13} /> {children}
    </Link>
  )
}

/** The global bar. Rendered once by AppLayout. */
export function AppTopbar({ onOpenSearch }) {
  const crumbs = useRouteBreadcrumb()
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

  return (
    <header
      style={{
        height: 'var(--topbar-h)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '0 var(--gutter)', background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Breadcrumb items={crumbs} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* §6 — search presents as a field, not an icon. An icon hides the fact
            that the product is searchable at all. */}
        <button
          onClick={onOpenSearch}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: 210,
            padding: '5px 9px', borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text-3)', cursor: 'pointer', fontSize: 'var(--t-sm)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <Search size={13} />
          <span style={{ flex: 1, textAlign: 'left' }}>Search anything…</span>
          <kbd style={{
            fontSize: 'var(--t-micro)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            padding: '1px 4px', background: 'var(--bg-2)', color: 'var(--text-3)',
          }}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <IconButton title="Help">
          <HelpCircle size={14} />
        </IconButton>
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  )
}

/* ── Legacy page header ───────────────────────────────────────────────────────
 * Pages that have not yet been migrated to <PageHeader> still call
 * <Topbar title subtitle actions />. Kept working, restyled to the token scale,
 * and stripped of its own notification bell now that the global bar owns it —
 * otherwise every page would render two. */
export function Topbar({ title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
      padding: 'var(--s-5) var(--gutter) 0',
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: '4px 0 0' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}
