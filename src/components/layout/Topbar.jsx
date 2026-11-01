import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Bell, CheckCheck, Search, HelpCircle, ChevronDown, LogOut, Settings, Mail, Check, MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { roleLabel } from '@/lib/roles'
import { ICONS } from './Sidebar'
import './nav.css'
import { useNotifications, useEmailPreference } from '@/hooks/useRisks'
import { useAuth } from '@/hooks/useAuth'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { tx, appLocale } from '@/lib/i18n'
import { LanguageSwitch } from '@/components/ui/LanguageSwitch'

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
  const rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: 'auto', style: 'narrow' })
  if (s < 60) return tx('just now')
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour')
  return rtf.format(-Math.floor(s / 86400), 'day')
}

/* Route → breadcrumb. Derived centrally so every page gets a trail without
 * having to remember to build one (§44). Detail pages append their own record
 * label via the PageHeader `breadcrumb` prop. */
const SEGMENT_LABELS = {
  app: null,
  dashboard: 'Dashboard', incidents: 'Incidents', findings: 'Findings',
  risks: 'Risk Register', controls: 'Controls', compliance: 'Compliance',
  tasks: 'Tasks', people: 'People', audit: 'Audit Log', audits: 'Audits', reports: 'Reports', settings: 'Settings',
  frameworks: 'Frameworks', new: 'New', tolerances: 'Tolerances', edit: 'Edit', assess: 'Assessment', triage: 'Triage',
  scope: 'Scope & testing', requests: 'Evidence requests', opinion: 'Opinion', report: 'Audit report', record: 'Record presentation',
  invite: 'Invite', escalate: 'Escalate', limits: 'Limits', activation: 'Activation link', companies: 'Companies',
  reviews: 'Review calendar',
  suggestions: 'Suggested risks',
  ask: 'Ask RISYS',
  policies: 'Policies', coverage: 'ECC coverage', versions: 'Versions', 'my-policies': 'My policies',
  exceptions: 'Exceptions', evidence: 'Evidence library',
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
    // The report pages reuse segment names that mean something else at the top level (audit).
    const REPORT_SEG = { board: 'Board report', ecc: 'ECC status report', audit: 'Audit reports', new: 'Generate' }
    const label = parts[1] === 'reports' && i === 2 && REPORT_SEG[p] ? REPORT_SEG[p] : SEGMENT_LABELS[p]
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

    // A record id is meaningless to a reader. Name the kind of record
    // instead; the page itself carries the human reference (e.g. RSK-0002).
    const isRecordId = label === undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p)
    const RECORD_KIND = { risks: tx('Risk'), controls: tx('Control'), incidents: tx('Incident'), tasks: tx('Task'),
      audits: tx('Engagement'), findings: tx('Finding'), requests: tx('Request'), scope: tx('Scope item'), reports: tx('Report'),
      suggestions: tx('Suggested risk'), ask: tx('Conversation'),
      policies: tx('Policy'), 'my-policies': tx('Attestation'), exceptions: tx('Exception'), evidence: tx('Evidence') }
    const recordLabel = isRecordId ? (RECORD_KIND[parts[i - 1]] || tx('Details')) : null
    items.push({ label: recordLabel ?? label ?? decodeURIComponent(p), to: acc })
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
          position: 'absolute', top: -3, insetInlineEnd: -3, minWidth: 15, height: 15, padding: '0 4px',
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
  const email = useEmailPreference()
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
      <IconButton title={tx('Notifications')} badge={unread} onClick={() => setOpen((o) => !o)}>
        <Bell size={14} style={{ color: unread > 0 ? 'var(--crimson)' : 'var(--text-3)' }} />
      </IconButton>

      {open && (
        <div className="anim-pop" style={{
          position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', width: 350, maxHeight: 430,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          zIndex: 'var(--z-popover)', boxShadow: 'var(--e-3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{tx('Notifications')}</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)',
                color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer',
              }}>
                <CheckCheck size={12} /> {tx('Mark all read')}</button>
            )}
          </div>

          <div style={{ overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Nothing needs your attention')}</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'start', padding: '9px 12px', cursor: 'pointer',
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

          {/* Email copies: one switch, in the place people look at notifications. */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            borderTop: '1px solid var(--border)', cursor: email.loading ? 'default' : 'pointer',
            fontSize: 'var(--t-meta)', color: 'var(--text-2)', background: 'var(--bg-2)',
          }}>
            <Mail size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tx('Email me these notifications')}</span>
            <input
              type="checkbox"
              checked={email.enabled}
              disabled={email.loading || email.saving}
              onChange={(e) => email.setEmail(e.target.checked)}
              aria-label={tx('Email me these notifications')}
            />
          </label>
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
        aria-label={tx('Account menu')}
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
          position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', width: 208,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)', padding: 5,
        }}>
          <div style={{ padding: '7px 9px 9px', borderBottom: '1px solid var(--border-3)', marginBottom: 4 }}>
            <p className="truncate" style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{name}</p>
            <p className="truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 1 }}>
              {organization?.name}
            </p>
          </div>
          <LanguageSwitch variant="menu" />
          <MenuLink icon={Settings} to="/app/settings" onClick={() => setOpen(false)}>{tx('Settings')}</MenuLink>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'start',
              padding: '6px 9px', borderRadius: 'var(--r)', border: 'none', background: 'transparent',
              fontSize: 'var(--t-sm)', color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            <LogOut size={13} className='rtl-flip' /> {tx('Sign out')}</button>
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

/** Where you are, as a trail under the top bar. Rendered once by AppLayout. */
export function RouteBreadcrumb() {
  const crumbs = useRouteBreadcrumb()
  // A top-level page needs no trail: the sidebar already shows where you are.
  if (crumbs.length < 2) return null
  return (
    <div style={{ padding: '10px var(--gutter) 0', flexShrink: 0 }}>
      <Breadcrumb items={crumbs} />
    </div>
  )
}

/* ── Workspace switcher ───────────────────────────────────────────────────────
 * A user can belong to several organisations (an advisory firm running its
 * clients, a RISYS staff account). With one membership it is a plain label. */
function WorkspaceSwitcher() {
  const { organization, memberships, switchOrganization } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const many = (memberships?.length || 0) > 1
  useEffect(() => {
    if (!open) return
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => many && setOpen((o) => !o)}
        aria-haspopup={many ? 'listbox' : undefined}
        aria-expanded={many ? open : undefined}
        title={organization?.name}
        className="ws-switch"
        style={{ cursor: many ? 'pointer' : 'default' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--taupe)', flexShrink: 0 }} />
        <span className="truncate" style={{ maxWidth: 140 }}>{organization?.name || tx('Workspace')}</span>
        {many && <ChevronDown size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      </button>
      {open && many && (
        <div role="listbox" className="anim-pop" style={{
          position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', minWidth: 230,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)', padding: 5,
        }}>
          <p style={{ fontSize: 'var(--t-micro)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '6px 8px 4px', margin: 0 }}>{tx('Workspaces')}</p>
          {memberships.map((o) => {
            const active = o.id === organization?.id
            return (
              <button key={o.id} role="option" aria-selected={active}
                onClick={() => { setOpen(false); if (!active) switchOrganization(o.id) }}
                className="menu-row" style={{ background: active ? 'var(--surface)' : undefined }}>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'start' }}>
                  <span className="block truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--text)' }}>{o.name}</span>
                  <span className="block truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{roleLabel(o.memberRole)}</span>
                </span>
                {active && <Check size={13} style={{ color: 'var(--crimson)', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Module tabs ──────────────────────────────────────────────────────────────
 * The first navigation level. Clicking a module opens its first page; the
 * module's own pages are in the sidebar. Tabs that do not fit fold into
 * "More", so a narrow window or the longer Arabic labels never wrap the bar. */
function ModuleTabs({ modules, active }) {
  const navigate = useNavigate()
  const wrap = useRef(null)
  const [fit, setFit] = useState(modules.length)
  const [more, setMore] = useState(false)
  const moreRef = useRef(null)

  // Measure every tab once (hidden copies), then show as many as fit.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const widths = [...el.querySelectorAll('[data-measure]')].map((n) => n.offsetWidth + 2)
      const room = el.clientWidth - 84
      let used = 0; let n = 0
      for (const w of widths) { if (used + w > room) break; used += w; n += 1 }
      setFit(n >= widths.length ? widths.length : Math.max(1, n))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [modules])

  useEffect(() => {
    if (!more) return
    const f = (e) => { if (!moreRef.current?.contains(e.target)) setMore(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [more])

  const go = (m) => { setMore(false); navigate(`/app/${m.pages[0].path}`) }
  const Tab = ({ m, measure }) => {
    const Icon = ICONS[m.icon]
    const on = m.id === active?.id
    return (
      <button type="button" data-measure={measure ? '' : undefined} tabIndex={measure ? -1 : undefined} aria-hidden={measure || undefined}
        onClick={measure ? undefined : () => go(m)} aria-current={on && !measure ? 'page' : undefined}
        className={clsx('module-tab', on && 'active')}>
        {Icon && <Icon size={14} strokeWidth={1.7} />}<span>{m.label}</span>
      </button>
    )
  }
  const shown = modules.slice(0, fit)
  const hidden = modules.slice(fit)

  return (
    <nav ref={wrap} aria-label={tx('Modules')} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
      <div aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: 2, insetInlineStart: 0, top: 0 }}>
        {modules.map((m) => <Tab key={m.id} m={m} measure />)}
      </div>
      {shown.map((m) => <Tab key={m.id} m={m} />)}
      {hidden.length > 0 && (
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMore((o) => !o)} aria-expanded={more}
            className={clsx('module-tab', hidden.some((m) => m.id === active?.id) && 'active')}>
            <MoreHorizontal size={14} /><span>{tx('More')}</span>
          </button>
          {more && (
            <div className="anim-pop" style={{
              position: 'absolute', insetInlineStart: 0, top: 'calc(100% + 6px)', minWidth: 200,
              background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
              boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)', padding: 5,
            }}>
              {hidden.map((m) => {
                const Icon = ICONS[m.icon]
                return (
                  <button key={m.id} className="menu-row" onClick={() => go(m)} style={{ fontWeight: m.id === active?.id ? 600 : 400 }}>
                    {Icon && <Icon size={13} />}<span style={{ flex: 1, textAlign: 'start' }}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}

/** The global bar: logo, modules, workspace, search, help, notifications, account.
 *  Rendered once by AppLayout. The logo block keeps the sidebar's width so the
 *  two read as one dark column. */
export function AppTopbar({ onOpenSearch, modules, active, collapsed, hasSidebar }) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
  const logoW = collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'

  return (
    <header style={{ height: 'var(--topbar-h)', flexShrink: 0, display: 'flex', alignItems: 'stretch', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
      <Link to="/app/dashboard" aria-label={tx('Dashboard')} style={{
        width: logoW, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 0 : '0 14px',
        background: 'var(--ink)', borderBottom: hasSidebar ? '1px solid rgba(255,255,255,0.07)' : 'none',
        transition: 'width var(--dur-3) var(--ease)',
      }}>
        <RisysLogo size={collapsed ? 'xs' : 'sm'} tone="light" showText={!collapsed} />
      </Link>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 var(--gutter) 0 14px' }}>
        <ModuleTabs modules={modules} active={active} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <WorkspaceSwitcher />
          {/* §6 — search presents as a field, not an icon. An icon hides the
              fact that the product is searchable at all. */}
          <button onClick={onOpenSearch} className="search-field" aria-label={tx('Search anything…')}>
            <Search size={13} />
            <span className="search-label" style={{ flex: 1, textAlign: 'start' }}>{tx('Search anything…')}</span>
            <kbd className="search-kbd">{isMac ? '⌘' : tx('Ctrl')} K</kbd>
          </button>
          <IconButton title={tx('Help')}>
            <HelpCircle size={14} />
          </IconButton>
          <NotificationsBell />
          <ProfileMenu />
        </div>
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
  // The workspace name is already in the top bar; repeating it under every
  // page title says nothing.
  const { organization } = useAuth()
  if (subtitle && subtitle === organization?.name) subtitle = null
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
