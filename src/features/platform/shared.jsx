import { useState } from 'react'
import { useNavigate, Navigate, useLocation, Link } from 'react-router-dom'
import { TowerControl, LogOut, Check, Copy, Search, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { usePlatform } from '@/hooks/usePlatform'
import { RisysLogo } from '@/components/ui/RisysLogo'

/* Platform console chrome.
 *
 * The console is an internal tool for RISYS staff, deliberately unlike the
 * tenant app: dark header, dense tables, no guidance panels. It is operated by
 * people who know the product. It is also the only place in RISYS that can
 * destroy a customer, so the surfaces here lead with facts — seats, activity,
 * who did what — rather than with prose.
 *
 * This file is not translated: the console is English-only. */

export const PLANS = ['standard', 'professional', 'enterprise']

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

// ── Chips ────────────────────────────────────────────────────────────────────
const TONES = {
  green:   { bg: '#ECF4EE', bd: '#C8DECD', fg: '#2F6B3C' },
  amber:   { bg: '#FDF4E7', bd: '#F0DCB8', fg: '#8A5A12' },
  red:     { bg: '#FBEAEA', bd: '#F0CECE', fg: '#8C1616' },
  blue:    { bg: '#EDF2F9', bd: '#CBD9EC', fg: '#2B4C7E' },
  neutral: { bg: 'var(--surface)', bd: 'var(--border)', fg: 'var(--text-2)' },
}

export function Chip({ children, tone = 'neutral', title }) {
  const t = TONES[tone] ?? TONES.neutral
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
    }}>{children}</span>
  )
}

export const StatusChip = ({ status }) =>
  <Chip tone={status === 'active' ? 'green' : 'red'}>{status === 'active' ? 'Active' : 'Suspended'}</Chip>

export const PlanChip = ({ plan }) =>
  <Chip tone={plan === 'enterprise' ? 'blue' : plan === 'professional' ? 'amber' : 'neutral'}>
    {plan ? plan[0].toUpperCase() + plan.slice(1) : '—'}
  </Chip>

// ── Header and navigation ────────────────────────────────────────────────────
const NAV = [
  { to: '/platform',           label: 'Overview',  end: true },
  { to: '/platform/companies', label: 'Companies' },
  { to: '/platform/staff',     label: 'Staff' },
  { to: '/platform/activity',  label: 'Activity' },
]

export function PlatformHeader() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, signOut } = useAuthStore()
  const active = (item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))

  return (
    <header style={{ background: '#292021', position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ padding: '0 28px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => navigate('/platform')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#5D0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TowerControl size={14} style={{ color: '#F3E7E4' }} />
          </div>
          <RisysLogo size="sm" tone="light" />
          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#A98D8C', padding: '3px 8px', border: '1px solid #3a2f30', borderRadius: 20 }}>
            Platform Console
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: '#b9a5a2' }}>{user?.email}</span>
          <button onClick={async () => { await signOut(); navigate('/platform/login') }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#b9a5a2', background: 'none', border: '1px solid #3a2f30', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
            <LogOut size={12} className="rtl-flip" /> Sign out
          </button>
        </div>
      </div>
      <nav style={{ padding: '0 28px', display: 'flex', gap: 2, borderTop: '1px solid #3a2f30' }}>
        {NAV.map((item) => {
          const on = active(item)
          return (
            <Link key={item.to} to={item.to} style={{
              fontSize: 12.5, fontWeight: on ? 600 : 500, padding: '10px 14px', textDecoration: 'none',
              color: on ? '#F3E7E4' : '#A98D8C', borderBottom: `2px solid ${on ? '#8C2D2D' : 'transparent'}`,
            }}>{item.label}</Link>
          )
        })}
      </nav>
    </header>
  )
}

/* Shared shell: header, platform-admin gate, and a consistent page frame.
 * Anyone who is not platform staff is sent to the console sign-in; every RPC
 * behind these pages checks again in the database. */
export function PlatformShell({ children, title, description, actions, back, width = 1560 }) {
  const { user } = useAuthStore()
  const { isPlatformAdmin } = usePlatform()
  if (!user || isPlatformAdmin === false) return <Navigate to="/platform/login" replace />

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlatformHeader />
      {isPlatformAdmin === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spinner size="lg" /></div>
      ) : (
        <div style={{ flex: 1, width: '100%', maxWidth: width, margin: '0 auto', padding: '24px 28px 70px' }}>
          {(title || back) && (
            <div style={{ marginBottom: 20 }}>
              {back && (
                <Link to={back.to} style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>
                  ‹ {back.label}
                </Link>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h1>
                  {description && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0' }}>{description}</p>}
                </div>
                {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
              </div>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// ── Layout primitives ────────────────────────────────────────────────────────
export function Card({ title, action, children, pad = true, footer }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
          {action}
        </div>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
      {footer && <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>{footer}</div>}
    </section>
  )
}

export function Stat({ label, value, sub, tone, to }) {
  const colour = tone === 'red' ? '#8C1616' : tone === 'amber' ? '#8A5A12' : tone === 'green' ? '#2F6B3C' : 'var(--text)'
  const inner = (
    <>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: 0 }}>{label}</p>
      <p className="tnum" style={{ fontSize: 26, fontWeight: 300, color: colour, margin: '5px 0 0', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0' }}>{sub}</p>}
    </>
  )
  const style = {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
    padding: '14px 16px', display: 'block', textDecoration: 'none', minWidth: 0,
  }
  return to ? <Link to={to} style={{ ...style, cursor: 'pointer' }}>{inner}</Link> : <div style={style}>{inner}</div>
}

export const StatRow = ({ children, min = 170 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>
)

export function Table({ columns, children, empty }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: c.align === 'right' ? 'end' : 'start', padding: '9px 14px',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'var(--text-3)', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap', width: c.width,
              }}>{c.label}</th>
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
  <td style={{
    padding: '11px 14px', fontSize: 12.5, color: 'var(--text-2)', verticalAlign: 'middle',
    textAlign: align === 'right' ? 'end' : 'start', borderBottom: '1px solid var(--border-3)', ...style,
  }}>{children}</td>
)

export const Empty = ({ children }) => (
  <div style={{ padding: '38px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>{children}</div>
)

export function SearchInput({ value, onChange, placeholder, width = 260 }) {
  return (
    <div style={{ position: 'relative', width }}>
      <Search size={13} style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="risys-input" style={{ paddingInlineStart: 30, fontSize: 12.5, width: '100%' }} />
    </div>
  )
}

/* Segmented filter, used for status and plan filters. */
export function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            fontSize: 11.5, fontWeight: on ? 600 : 500, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid ' + (on ? 'var(--border-2)' : 'transparent'),
            background: on ? '#fff' : 'transparent', color: on ? 'var(--text)' : 'var(--text-3)',
          }}>{o.label}{o.count != null && <span className="tnum" style={{ opacity: 0.6 }}> {o.count}</span>}</button>
        )
      })}
    </div>
  )
}

/* Seat usage: the number that decides whether a client can add people. */
export function SeatBar({ used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0
  const tone = pct >= 100 ? '#8C1616' : pct >= 85 ? '#8A5A12' : '#2F6B3C'
  return (
    <div style={{ minWidth: 96 }}>
      <div className="tnum" style={{ fontSize: 12, color: 'var(--text)' }}>{used} / {max}</div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
      </div>
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
    <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
      background: copied ? '#ECF4EE' : 'var(--surface)', color: copied ? '#2F6B3C' : 'var(--crimson)', border: `1px solid ${copied ? '#C8DECD' : 'var(--border)'}` }}>
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : label}
    </button>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div role="alert" style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 14,
      background: '#FBEAEA', border: '1px solid #F0CECE', borderRadius: 'var(--r)', fontSize: 12.5, color: '#8C1616',
    }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{children}
    </div>
  )
}

/* Audit actions, as written by the database. */
export const ACTION_LABELS = {
  'company.provisioned':       ['Company provisioned', 'green'],
  'company.limits_changed':    ['Limits changed', 'neutral'],
  'company.profile_updated':   ['Profile updated', 'neutral'],
  'company.suspended':         ['Company suspended', 'amber'],
  'company.reactivated':       ['Company reactivated', 'green'],
  'company.deleted':           ['Company deleted', 'red'],
  'company.admin_link_issued': ['Activation link issued', 'blue'],
  'company.invitation_revoked':['Invitation revoked', 'neutral'],
  'staff.granted':             ['Console access granted', 'blue'],
  'staff.revoked':             ['Console access revoked', 'amber'],
}

export const ActionChip = ({ action }) => {
  const [label, tone] = ACTION_LABELS[action] ?? [action, 'neutral']
  return <Chip tone={tone}>{label}</Chip>
}

/* Renders the meta jsonb the RPCs record, e.g. {"plan": ["standard","enterprise"]}. */
export function MetaSummary({ meta }) {
  if (!meta || typeof meta !== 'object') return null
  const parts = Object.entries(meta).map(([k, v]) => {
    const key = k.replace(/_/g, ' ')
    if (Array.isArray(v) && v.length === 2) return `${key}: ${v[0]} › ${v[1]}`
    return `${key}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
  })
  if (!parts.length) return null
  return <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{parts.join(' · ')}</span>
}
