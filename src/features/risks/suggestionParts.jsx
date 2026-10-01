import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, FileWarning } from 'lucide-react'
import { bandFor, bandMeta } from '@/lib/matrix'
import { tx } from '@/lib/i18n'

/* Shared pieces of the Suggested risks list and the suggestion page. */

export const FULL = { width: '100%', boxSizing: 'border-box' }
export const FULL_TA = { ...FULL, resize: 'vertical', lineHeight: 1.5 }
export const CONNECTOR = { m365: 'Microsoft 365', defender: 'Microsoft Defender', sharepoint: 'SharePoint', entra: 'Microsoft Entra ID' }
export const VIEW_STATES = ['pending', 'added', 'dismissed', 'resolved']

export function ScoreBadge({ l, i, size = 'md' }) {
  const meta = bandMeta(bandFor(l, i))
  const big = size === 'lg'
  return (
    <span title={`${tx('Likelihood')} ${l} × ${tx('Impact')} ${i}`} className="tnum" style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minWidth: big ? 58 : 46, height: big ? 58 : 46, borderRadius: 10, flexShrink: 0,
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    }}>
      <span style={{ fontSize: big ? 20 : 16, fontWeight: 600, lineHeight: 1 }}>{(l || 0) * (i || 0)}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 3 }}>{meta.label}</span>
    </span>
  )
}

export function Scale({ label, value, onChange, scale, disabled }) {
  return (
    <div>
      <p className="field-label" style={{ marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'flex', gap: 4 }}>
        {scale.map(p => {
          const on = Number(value) === p.value
          return (
            <button key={p.value} type="button" disabled={disabled} onClick={() => onChange(p.value)}
              title={`${p.label} — ${p.definition}`} aria-pressed={on}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
                fontSize: 12.5, fontWeight: on ? 600 : 400,
                background: on ? 'var(--crimson)' : 'var(--bg-2)', color: on ? '#fff' : 'var(--text-2)',
                border: `1px solid ${on ? 'var(--crimson)' : 'var(--border)'}`,
              }}>{p.value}</button>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '5px 0 0' }}>
        {scale.find(p => p.value === Number(value))?.label || '—'}
      </p>
    </div>
  )
}

export function Evidence({ items }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  if (!items.length) return <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>{tx('No open evidence.')}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {shown.map((e, n) => {
        const to = e.kind === 'finding'
          ? `/app/findings/${e.connector}`
          : `/app/compliance/${encodeURIComponent('NCA ECC')}/${e.control}`
        return (
          <Link key={`${e.kind}:${e.ref}:${e.control}:${n}`} to={to} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0',
            borderTop: n ? '1px solid var(--border-3)' : 'none', textDecoration: 'none',
          }}>
            {e.kind === 'finding'
              ? <FileWarning size={13} style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)', flexShrink: 0, marginTop: 2 }} />
              : <Activity size={13} style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)', flexShrink: 0, marginTop: 2 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{e.title}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {e.kind === 'finding' ? tx('Finding') : tx('Measurement')} · {CONNECTOR[e.connector] || e.connector} · ECC {e.control}
                {' · '}<span style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)' }}>
                  {e.severity === 'critical' ? (e.kind === 'finding' ? tx('Critical') : tx('Failing')) : (e.kind === 'finding' ? tx('Warning') : tx('Partial'))}
                </span>
              </span>
            </span>
          </Link>
        )
      })}
      {items.length > 6 && (
        <button type="button" onClick={() => setAll(a => !a)} style={{
          alignSelf: 'flex-start', marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--crimson)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>{all ? tx('Show fewer') : tx('Show all {{n}}', { n: items.length })}</button>
      )}
    </div>
  )
}

export function Field({ label, help, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label" style={{ display: 'block', marginBottom: 5 }}>{label}</span>
      {children}
      {help && <span className="field-help" style={{ display: 'block', marginTop: 4 }}>{help}</span>}
    </label>
  )
}

export function pickSuggestion(s) {
  return {
    title: s.title || '', cause: s.cause || '', event: s.event || '', impact_statement: s.impact_statement || '',
    category: s.category || 'Cybersecurity', subcategory: s.subcategory || '',
    inherent_likelihood: s.inherent_likelihood || 3, inherent_impact: s.inherent_impact || 3,
    owner_id: s.owner_id || '', business_unit: s.business_unit || '',
  }
}

