import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, CornerDownLeft, ShieldAlert, AlertTriangle, FileWarning,
  CheckSquare, CheckSquare2, Users, BookCheck, ScrollText, Library, ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/* ── Global search (§46) ──────────────────────────────────────────────────────
 *
 * ⌘K / Ctrl-K from anywhere. Results are grouped by entity type because in a
 * GRC product the same string legitimately appears as a risk, a control and a
 * finding — "MFA" is the example in the brief and it is a real one in this
 * data. A flat result list would make the user guess which "MFA" they found.
 *
 * Two kinds of result, deliberately mixed:
 *   - Navigation: jump to a page. Always available, works offline, zero latency.
 *   - Records:    queried live, debounced, capped per type.
 *
 * Navigation results rank first on short queries. Someone typing "ri" almost
 * always wants the Risk Register, not a risk whose description contains "ri".
 * -------------------------------------------------------------------------- */

const PAGES = [
  { label: 'Dashboard',     to: '/app/dashboard',   icon: CheckSquare2, keywords: 'home overview' },
  { label: 'Incidents',     to: '/app/incidents',   icon: AlertTriangle, keywords: 'incident breach' },
  { label: 'Findings',      to: '/app/findings',    icon: FileWarning,  keywords: 'finding detection' },
  { label: 'Risk Register', to: '/app/risks',       icon: ShieldAlert,  keywords: 'risk register' },
  { label: 'Controls',      to: '/app/controls',    icon: CheckSquare,  keywords: 'control library' },
  { label: 'Compliance',    to: '/app/compliance',  icon: BookCheck,    keywords: 'compliance ecc nca' },
  { label: 'Tasks',         to: '/app/tasks',       icon: CheckSquare2, keywords: 'task todo' },
  { label: 'People',        to: '/app/people',      icon: Users,        keywords: 'people users identity' },
  { label: 'Audit Log',     to: '/app/audit',       icon: ScrollText,   keywords: 'audit trail history' },
  { label: 'Frameworks',    to: '/app/frameworks',  icon: Library,      keywords: 'framework iso soc ecc' },
]

const TYPE_META = {
  page:       { label: 'Go to',      icon: ArrowRight },
  risk:       { label: 'Risks',      icon: ShieldAlert },
  incident:   { label: 'Incidents',  icon: AlertTriangle },
  control:    { label: 'Controls',   icon: CheckSquare },
  task:       { label: 'Tasks',      icon: CheckSquare2 },
  person:     { label: 'People',     icon: Users },
}

export function CommandSearch({ open, onClose }) {
  const [q, setQ] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const { organization } = useAuth()
  const inputRef = useRef(null)
  const orgId = organization?.id

  useEffect(() => {
    if (open) {
      setQ(''); setRecords([]); setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced record lookup. Each entity queried separately and capped, so one
  // noisy table cannot crowd the others out of the result list.
  useEffect(() => {
    if (!open || !orgId || q.trim().length < 2) { setRecords([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      const like = `%${q.trim()}%`
      const safe = async (fn) => { try { return (await fn())?.data ?? [] } catch { return [] } }

      const [risks, incidents, controls, tasks] = await Promise.all([
        safe(() => supabase.from('risks').select('id,title,risk_code,status,inherent_score').eq('org_id', orgId).ilike('title', like).limit(4)),
        safe(() => supabase.from('incidents').select('id,title,severity,status').eq('org_id', orgId).ilike('title', like).limit(4)),
        safe(() => supabase.from('controls').select('id,name,control_code,status').eq('org_id', orgId).ilike('name', like).limit(4)),
        safe(() => supabase.from('tasks').select('id,title,priority,status').eq('org_id', orgId).ilike('title', like).limit(4)),
      ])
      if (cancelled) return

      setRecords([
        ...risks.map((r) => ({ type: 'risk', id: r.id, label: r.title, hint: r.risk_code || r.status, to: `/app/risks/${r.id}` })),
        ...incidents.map((r) => ({ type: 'incident', id: r.id, label: r.title, hint: r.severity, to: `/app/incidents/${r.id}` })),
        ...controls.map((r) => ({ type: 'control', id: r.id, label: r.name, hint: r.control_code || r.status, to: `/app/controls/${r.id}` })),
        ...tasks.map((r) => ({ type: 'task', id: r.id, label: r.title, hint: r.priority, to: `/app/tasks/${r.id}` })),
      ])
      setLoading(false)
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open, orgId])

  const pages = useMemo(() => {
    if (!q.trim()) return PAGES.map((p) => ({ ...p, type: 'page' }))
    const s = q.toLowerCase()
    return PAGES.filter((p) => p.label.toLowerCase().includes(s) || p.keywords.includes(s))
      .map((p) => ({ ...p, type: 'page' }))
  }, [q])

  const all = useMemo(() => [...pages, ...records], [pages, records])

  const grouped = useMemo(() => {
    const g = {}
    for (const item of all) (g[item.type] ||= []).push(item)
    return g
  }, [all])

  useEffect(() => { setCursor(0) }, [all.length])

  const go = (item) => { onClose(); navigate(item.to) }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, all.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && all[cursor]) { e.preventDefault(); go(all[cursor]) }
  }

  if (!open) return null

  let flatIndex = -1

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', display: 'flex', justifyContent: 'center', paddingTop: '11vh' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="anim-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(41,32,33,0.30)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="anim-pop"
        style={{
          position: 'relative', width: 580, maxWidth: '92vw', maxHeight: '66vh',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--e-4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <Search size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search risks, findings, controls, people…"
            aria-label="Search"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', minWidth: 0 }}
          />
          <kbd style={{
            fontSize: 'var(--t-micro)', color: 'var(--text-3)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '2px 5px', background: 'var(--surface)', flexShrink: 0,
          }}>ESC</kbd>
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {all.length === 0 && !loading && (
            <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
              {q.trim().length < 2 ? 'Type to search across your workspace' : `No matches for "${q}"`}
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type] || TYPE_META.page
            return (
              <div key={type}>
                <div className="eyebrow" style={{ padding: '8px 9px 5px' }}>{meta.label}</div>
                {items.map((item) => {
                  flatIndex += 1
                  const i = flatIndex
                  const Icon = item.icon || meta.icon
                  const active = i === cursor
                  return (
                    <div
                      key={`${type}-${item.id ?? item.to}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px',
                        borderRadius: 'var(--r)', cursor: 'pointer',
                        background: active ? 'var(--hover)' : 'transparent',
                      }}
                    >
                      <Icon size={14} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
                      <span className="truncate" style={{ flex: 1, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="truncate" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', flexShrink: 0, maxWidth: 130 }}>
                          {item.hint}
                        </span>
                      )}
                      {active && <CornerDownLeft size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>Searching…</div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '7px 14px',
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
          fontSize: 'var(--t-micro)', color: 'var(--text-3)',
        }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Registers the ⌘K / Ctrl-K shortcut. Used once, by the layout. */
export function useCommandSearch() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { open, setOpen }
}
