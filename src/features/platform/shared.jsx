import { useState } from 'react'
import { useNavigate, Navigate, useLocation, Link } from 'react-router-dom'
import {
  LogOut, Check, Copy, Search, AlertTriangle, LayoutDashboard, Building2, Users, History, Plus, ChevronLeft,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { usePlatform } from '@/hooks/usePlatform'
import { RisysLogo } from '@/components/ui/RisysLogo'
import './console.css'

/* Platform console chrome and building blocks.
 *
 * The console is an internal tool for RISYS staff. It shares the tenant
 * dashboard's visual language (cards, icon chips, rings and bars) but keeps a
 * dark header, so nobody mistakes it for a client workspace. It is also the
 * only place in RISYS that can destroy a customer, so every surface leads with
 * facts: who is inside, what they hold, and what the console has done.
 *
 * English only, by design. */

// ── Formatting ───────────────────────────────────────────────────────────────
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export function ago(d) {
  if (!d) return 'never'
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const days = Math.floor(s / 86400)
  if (days < 31) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function bytes(n) {
  if (!n) return '0 MB'
  const mb = n / 1024 / 1024
  return mb < 1024 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(2)} GB`
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Company state ────────────────────────────────────────────────────────────
/* Where a company is in its life: the one question staff ask most. Derived
 * from the list RPC's counts, so it needs no extra query. */
export function lifecycle(o) {
  if (o.status === 'suspended') return { key: 'suspended', label: 'Suspended', tone: 'red' }
  if (!o.member_count) return o.pending_invites > 0
    ? { key: 'pending', label: 'Awaiting activation', tone: 'amber' }
    : { key: 'expired', label: 'Activation link expired', tone: 'red' }
  const last = o.last_activity || o.last_seen
  if (!last || Date.now() - new Date(last).getTime() > 30 * 86400 * 1000)
    return { key: 'quiet', label: 'Quiet 30+ days', tone: 'neutral' }
  return { key: 'active', label: 'Active', tone: 'green' }
}

// ── Chips ────────────────────────────────────────────────────────────────────
const TONES = {
  green:   { bg: '#ECF4EE', bd: '#C8DECD', fg: '#2F6B3C' },
  amber:   { bg: '#FDF4E7', bd: '#F0DCB8', fg: '#8A5A12' },
  red:     { bg: '#FBEAEA', bd: '#F0CECE', fg: '#8C1616' },
  blue:    { bg: '#EDF2F9', bd: '#CBD9EC', fg: '#2B4C7E' },
  neutral: { bg: 'var(--surface)', bd: 'var(--border)', fg: 'var(--text-2)' },
}

export function Chip({ children, tone = 'neutral', title, dot = false }) {
  const t = TONES[tone] ?? TONES.neutral
  return (
    <span title={title} className="pc-chip" style={{ background: t.bg, borderColor: t.bd, color: t.fg }}>
      {dot && <span className="pc-dot" />}{children}
    </span>
  )
}

export const StatusChip = ({ status }) =>
  <Chip dot tone={status === 'active' ? 'green' : 'red'}>{status === 'active' ? 'Active' : 'Suspended'}</Chip>

export const LifecycleChip = ({ org }) => {
  const l = lifecycle(org)
  return <Chip dot tone={l.tone}>{l.label}</Chip>
}

// ── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLOURS = ['#5D0F0F', '#7A3E2B', '#2F6B4E', '#3D5F86', '#6B4A86', '#8A5A12', '#4C0C25', '#2B5D63']
export function Avatar({ name = '', size = 36 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const bg = AVATAR_COLOURS[h % AVATAR_COLOURS.length]
  return (
    <span className="pc-avatar" style={{ width: size, height: size, borderRadius: size * 0.3, fontSize: size * 0.38, background: `linear-gradient(145deg, ${bg}, ${bg}cc)` }}>
      {initials}
    </span>
  )
}

// ── Header and navigation ────────────────────────────────────────────────────
const NAV = [
  { to: '/platform',           label: 'Overview',  icon: LayoutDashboard, end: true },
  { to: '/platform/companies', label: 'Companies', icon: Building2 },
  { to: '/platform/staff',     label: 'Staff',     icon: Users },
  { to: '/platform/activity',  label: 'Activity',  icon: History },
]

export function PlatformHeader() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, signOut } = useAuthStore()
  const active = (item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))
  const name = user?.user_metadata?.full_name || user?.email || ''

  return (
    <header className="pc-header">
      <div className="pc-header-inner">
        <button className="pc-brand" onClick={() => navigate('/platform')}>
          <RisysLogo size="sm" tone="light" />
          <span className="pc-brand-badge">Console</span>
        </button>
        <nav className="pc-nav">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.to} to={item.to} className={active(item) ? 'is-on' : ''}>
                <Icon size={14} strokeWidth={1.9} /> {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="pc-user">
          <Link to="/platform/companies/new" className="pc-new-btn"><Plus size={13} /> New company</Link>
          <span className="pc-user-chip" title={user?.email}>
            <Avatar name={name} size={24} />
            <span className="pc-user-email">{user?.email}</span>
          </span>
          <button className="pc-icon-btn" title="Sign out" onClick={async () => { await signOut(); navigate('/platform/login') }}>
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}

/* Shared shell: header, platform-admin gate, and the page frame. Anyone who is
 * not platform staff is sent to the console sign-in; every RPC behind these
 * pages checks again in the database. */
export function PlatformShell({ children, title, eyebrow, description, actions, back, width = 1440, display = false }) {
  const { user } = useAuthStore()
  const { isPlatformAdmin } = usePlatform()
  if (!user || isPlatformAdmin === false) return <Navigate to="/platform/login" replace />

  return (
    <div className="pc">
      <PlatformHeader />
      {isPlatformAdmin === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spinner size="lg" /></div>
      ) : (
        <main className="pc-main" style={{ maxWidth: width }}>
          {back && <Link to={back.to} className="pc-back"><ChevronLeft size={13} /> {back.label}</Link>}
          {(title || actions) && (
            <div className="pc-titlebar">
              <div style={{ minWidth: 0 }}>
                {eyebrow && <p className="pc-eyebrow">{eyebrow}</p>}
                {title && <h1 className={`pc-title${display ? '' : ' pc-title--sm'}`}>{title}</h1>}
                {description && <p className="pc-desc">{description}</p>}
              </div>
              {actions && <div className="pc-actions">{actions}</div>}
            </div>
          )}
          <div className="pc-rise">{children}</div>
        </main>
      )}
    </div>
  )
}

// ── Layout primitives ────────────────────────────────────────────────────────
export function Card({ title, icon: Icon, caption, action, children, pad = true, footer, className = '', style }) {
  return (
    <section className={`pc-card ${className}`} style={style}>
      {(title || action) && (
        <div className="pc-card-head">
          <div className="pc-card-title">
            {Icon && <span className="pc-card-icon"><Icon size={14} strokeWidth={1.8} /></span>}
            {title && <h2>{title}</h2>}
            {caption && <span className="pc-card-caption">{caption}</span>}
          </div>
          {action}
        </div>
      )}
      <div className={pad ? 'pc-card-body' : 'pc-card-body pc-card-body--flush'}>{children}</div>
      {footer && <div className="pc-card-foot">{footer}</div>}
    </section>
  )
}

export function Kpi({ icon: Icon, tone = 'wine', label, value, sub, to, alert, children }) {
  const inner = (
    <>
      <div className="pc-kpi-top">
        <span className={`pc-kpi-icon pc-tone-${tone}`}><Icon size={17} strokeWidth={1.8} /></span>
        <span className="pc-kpi-label">{label}</span>
      </div>
      <div className="pc-kpi-value tnum">{value}</div>
      <p className="pc-kpi-sub">{sub}</p>
      {children && <div className="pc-kpi-foot">{children}</div>}
    </>
  )
  const cls = `pc-kpi${alert ? ' pc-kpi--alert' : ''}`
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

/* Small figure tile used on the company page. */
export function Stat({ label, value, sub, icon: Icon, tone = 'neutral' }) {
  return (
    <div className="pc-kpi" style={{ padding: '14px 16px' }}>
      <div className="pc-kpi-top">
        {Icon && <span className={`pc-kpi-icon pc-tone-${tone}`} style={{ width: 30, height: 30, borderRadius: 9 }}><Icon size={14} strokeWidth={1.9} /></span>}
        <span className="pc-kpi-label" style={{ fontSize: 12 }}>{label}</span>
      </div>
      <div className="pc-kpi-value tnum" style={{ fontSize: 24, marginBlockStart: 10 }}>{value}</div>
      {sub && <p className="pc-kpi-sub">{sub}</p>}
    </div>
  )
}

export const StatRow = ({ children, min = 170 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>
)

export function Table({ columns, children, empty }) {
  return (
    <div className="pc-table-wrap">
      <table className="pc-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.align === 'right' ? 'pc-end' : undefined} style={{ width: c.width }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  )
}

export const Td = ({ children, align, style }) => (
  <td className={align === 'right' ? 'pc-end' : undefined} style={style}>{children}</td>
)

export const Empty = ({ children }) => <div className="pc-empty">{children}</div>

export function SearchInput({ value, onChange, placeholder, width = 280 }) {
  return (
    <div style={{ position: 'relative', width, maxWidth: '100%' }}>
      <Search size={13} style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="risys-input" style={{ paddingInlineStart: 30, fontSize: 12.5, width: '100%', borderRadius: 9 }} />
    </div>
  )
}

/* Segmented filter. */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="pc-seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="pc-count tnum">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function CopyBtn({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
      background: copied ? '#ECF4EE' : 'var(--surface)', color: copied ? '#2F6B3C' : 'var(--crimson)', border: `1px solid ${copied ? '#C8DECD' : 'var(--border)'}` }}>
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : label}
    </button>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div role="alert" className="pc-banner pc-banner--red">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />{children}
    </div>
  )
}

/* Audit actions, as written by the database. Limits changes are kept so older
 * entries still read correctly; the console no longer makes them. */
export const ACTION_LABELS = {
  'company.provisioned':       ['Company provisioned', 'green'],
  'company.limits_changed':    ['Limits changed', 'neutral'],
  'company.profile_updated':   ['Profile updated', 'neutral'],
  'company.suspended':         ['Company suspended', 'amber'],
  'company.reactivated':       ['Company reactivated', 'green'],
  'company.deleted':           ['Company deleted', 'red'],
  'company.admin_link_issued': ['Activation link issued', 'blue'],
  'company.invitation_revoked':['Invitation revoked', 'neutral'],
  'company.ai_changed':        ['Ask RISYS changed', 'blue'],
  'staff.granted':             ['Console access granted', 'blue'],
  'staff.revoked':             ['Console access revoked', 'amber'],
}

export const ActionChip = ({ action }) => {
  const [label, tone] = ACTION_LABELS[action] ?? [action, 'neutral']
  return <Chip tone={tone}>{label}</Chip>
}

/* Renders the meta jsonb the RPCs record, e.g. {"name": ["Old","New"]}.
 * Plan, seat and storage values are no longer meaningful, so they are hidden. */
const HIDDEN_META = new Set(['plan', 'max_members', 'storage_gb', 'storage_quota_gb'])
export function MetaSummary({ meta }) {
  if (!meta || typeof meta !== 'object') return null
  const parts = Object.entries(meta).filter(([k]) => !HIDDEN_META.has(k)).map(([k, v]) => {
    const key = k.replace(/_/g, ' ')
    if (Array.isArray(v) && v.length === 2) return `${key}: ${v[0]} › ${v[1]}`
    return `${key}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
  })
  if (!parts.length) return null
  return <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{parts.join(' · ')}</span>
}
