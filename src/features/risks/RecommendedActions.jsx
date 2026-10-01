import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, CheckCircle2, Circle, ExternalLink, ListPlus, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── Recommended actions ──────────────────────────────────────────────────────
 *
 * On a risk RISYS raised itself (approved from a suggested risk): what it
 * found, turned into a to-do list.
 *
 *   • Baseline — the evidence when the risk was approved.
 *   • Live     — the same area's evidence, refreshed after every scan.
 *   An action is done when its finding or measurement no longer appears; a
 *   problem first seen after approval shows as new. Nothing here is ticked by
 *   hand: the connected system decides, so the list cannot claim a fix that
 *   did not happen.
 *
 * Each open action can become a task linked to this risk, pre-filled with the
 * fix.
 * -------------------------------------------------------------------------- */

const CONNECTOR = { m365: 'Microsoft 365', defender: 'Microsoft Defender', sharepoint: 'SharePoint', entra: 'Microsoft Entra ID' }
const keyOf = (e) => `${e.kind}:${e.ref}:${e.control}`

export function RecommendedActions({ risk, canCreateTasks }) {
  const navigate = useNavigate()
  const [s, setS] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    let live = true
    if (!risk?.id) return
    supabase.from('risk_suggestions')
      .select('id, area_id, area_name, evidence, evidence_at_approval, last_evaluated_at, decided_at')
      .eq('risk_id', risk.id)
      .maybeSingle()
      .then(({ data }) => { if (live) { setS(data || null); setLoaded(true) } })
    return () => { live = false }
  }, [risk?.id])

  const actions = useMemo(() => {
    if (!s) return { open: [], done: [] }
    const now = Array.isArray(s.evidence) ? s.evidence : []
    const base = Array.isArray(s.evidence_at_approval) ? s.evidence_at_approval : []
    const nowKeys = new Set(now.map(keyOf))
    const baseKeys = new Set(base.map(keyOf))
    const sev = (e) => (e.severity === 'critical' ? 0 : 1)
    const open = now.map(e => ({ ...e, isNew: base.length > 0 && !baseKeys.has(keyOf(e)) }))
      .sort((a, b) => sev(a) - sev(b) || (a.isNew === b.isNew ? 0 : a.isNew ? -1 : 1))
    const done = base.filter(e => !nowKeys.has(keyOf(e)))
    return { open, done }
  }, [s])

  if (!loaded || !s) return null

  const total = actions.open.length + actions.done.length
  const pct = total ? Math.round((actions.done.length / total) * 100) : 100

  const createTask = (e) => {
    const title = e.kind === 'finding'
      ? e.title
      : String(e.title || '').split(' — ')[0]
    const description = [
      e.recommendation,
      '',
      `${e.kind === 'finding' ? tx('Finding') : tx('Measurement')}: ${e.title}`,
      `${CONNECTOR[e.connector] || e.connector} · NCA ECC ${e.control}`,
      tx('Raised by RISYS for {{risk}}. It is marked done automatically when the next scan no longer reports it.', { risk: risk.risk_id || risk.title }),
    ].filter(v => v !== undefined && v !== null).join('\n')
    const q = new URLSearchParams({
      risk: risk.id,
      title: title.slice(0, 200),
      description,
      priority: e.severity === 'critical' ? 'high' : 'medium',
    })
    navigate(`/app/tasks/new?${q.toString()}`)
  }

  return (
    <section className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <Sparkles size={15} style={{ color: 'var(--crimson)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{tx('Recommended actions')}</p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
            {tx('What RISYS found in ECC {{area}}, as things to fix. Each one is ticked off automatically when the next scan no longer reports it.', { area: s.area_id })}
            {' '}{tx('Last checked {{when}}.', { when: fmtDateTime(s.last_evaluated_at) })}
          </p>
        </div>
        <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: actions.open.length ? 'var(--text-2)' : '#2F6B3C', whiteSpace: 'nowrap' }}>
          {tx('{{done}} of {{total}} done', { done: actions.done.length, total })}
        </span>
      </div>

      <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--border-3)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#2F6B3C', transition: 'width 300ms' }} />
      </div>

      {actions.open.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: '#2F6B3C', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={15} /> {tx('Everything RISYS found here has been fixed. Consider re-scoring the residual risk.')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {actions.open.map((e, n) => (
            <div key={keyOf(e)} style={{ display: 'flex', gap: 10, padding: '11px 0', borderTop: n ? '1px solid var(--border-3)' : 'none' }}>
              <Circle size={15} style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>
                  {e.title}
                  {e.isNew && <span style={{ marginInlineStart: 8, fontSize: 10.5, fontWeight: 600, color: 'var(--medium)' }}>{tx('New since approval')}</span>}
                </p>
                {e.recommendation && (
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{e.recommendation}</p>
                )}
                <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>
                    {e.kind === 'finding' ? tx('Finding') : tx('Measurement')} · {CONNECTOR[e.connector] || e.connector} · ECC {e.control}
                    {' · '}<span style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)' }}>
                      {e.severity === 'critical' ? tx('Critical') : tx('Warning')}
                    </span>
                  </span>
                  {e.kind === 'finding'
                    ? <Link to={`/app/findings/${e.connector}`} style={{ color: 'var(--crimson)', fontWeight: 500 }}>{tx('View finding')}</Link>
                    : <Link to={`/app/compliance/${encodeURIComponent('NCA ECC')}/${e.control}`} style={{ color: 'var(--crimson)', fontWeight: 500 }}>{tx('View control')}</Link>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" style={{ color: 'var(--crimson)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {tx('Open in Microsoft')} <ExternalLink size={10} />
                    </a>
                  )}
                </p>
              </div>
              {canCreateTasks && (
                <button type="button" className="btn-secondary" onClick={() => createTask(e)}
                  style={{ fontSize: 12, padding: '5px 10px', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  <ListPlus size={12} />{tx('Create task')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {actions.done.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-3)', paddingTop: 10 }}>
          <button type="button" onClick={() => setShowDone(v => !v)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
            color: '#2F6B3C', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <ChevronDown size={13} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
            {tx('{{n}} fixed since approval', { n: actions.done.length })}
          </button>
          {showDone && (
            <div style={{ marginTop: 6 }}>
              {actions.done.map(e => (
                <div key={keyOf(e)} style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={14} style={{ color: '#2F6B3C', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    {e.title}
                    <span style={{ display: 'block', fontSize: 11.5 }}>{CONNECTOR[e.connector] || e.connector} · ECC {e.control} · {tx('no longer reported')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
