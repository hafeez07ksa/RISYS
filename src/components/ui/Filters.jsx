import { useState } from 'react'
import { Search, Plus, X, Bookmark } from 'lucide-react'
import { Combobox } from './Combobox'

/* Unified filter system (§24). One behaviour across Risk Register, Incidents,
 * Findings, Controls, Compliance, Tasks, People and Audit Log.
 *
 * The pattern is: search on the left, a small number of inline filters, then
 * applied filters as removable chips on a second line. Chips matter because the
 * common support question in a GRC tool is "why can't I see my risk" and the
 * answer is almost always a filter someone forgot was on. If the active filters
 * are not visible as objects you can dismiss, they are invisible.
 *
 * defs: [{ key, label, options, multiple }]
 * value: { [key]: value | value[] }
 */
export function FilterBar({
  search, onSearchChange, searchPlaceholder = 'Search…',
  defs = [], value = {}, onChange,
  views, activeView, onViewChange,
  onSaveView,
  right,
}) {
  const [added, setAdded] = useState(() => defs.filter((d) => d.pinned).map((d) => d.key))

  const active = Object.entries(value).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== '' && v !== 'all')

  const set = (k, v) => onChange?.({ ...value, [k]: v })
  const clear = (k) => {
    const next = { ...value }
    delete next[k]
    onChange?.(next)
  }
  const clearAll = () => onChange?.({})

  const shown = defs.filter((d) => added.includes(d.key) || active.some(([k]) => k === d.key))
  const addable = defs.filter((d) => !shown.includes(d))

  const labelOf = (def, v) => {
    const hit = (def.options || []).find((o) => (o.value ?? o) === v)
    return hit ? (hit.label ?? hit) : String(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

      {views?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {views.map((v) => {
            const on = v.value === activeView
            return (
              <button key={v.value} onClick={() => onViewChange?.(v.value)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 'var(--r-full)',
                fontSize: 'var(--t-sm)', cursor: 'pointer',
                border: `1px solid ${on ? '#f0dada' : 'transparent'}`,
                background: on ? 'var(--crimson-wash)' : 'transparent',
                color: on ? 'var(--crimson)' : 'var(--text-3)',
                fontWeight: on ? 500 : 400,
              }}>
                {v.label}
                {v.count != null && <span className="tnum" style={{ opacity: 0.7 }}>{v.count}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {onSearchChange && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 220px', maxWidth: 340,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', padding: '6px 10px',
          }}>
            <Search size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              value={search || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-body)', color: 'var(--text)', minWidth: 0 }}
            />
            {search && (
              <button onClick={() => onSearchChange('')} aria-label="Clear search"
                style={{ border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {shown.map((d) => (
          <Combobox
            key={d.key}
            size="sm"
            placeholder={d.label}
            options={d.options}
            multiple={d.multiple}
            clearable
            value={value[d.key] ?? (d.multiple ? [] : null)}
            onChange={(v) => set(d.key, v)}
            className="flex-shrink-0"
            buttonClassName="min-w-[120px]"
          />
        ))}

        {addable.length > 0 && (
          <Combobox
            size="sm"
            placeholder="＋ Filter"
            options={addable.map((d) => ({ value: d.key, label: d.label }))}
            value={null}
            onChange={(k) => k && setAdded((a) => [...a, k])}
            buttonClassName="min-w-[96px]"
          />
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>{right}</div>
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {active.flatMap(([k, v]) => {
            const def = defs.find((d) => d.key === k)
            if (!def) return []
            const vals = Array.isArray(v) ? v : [v]
            return vals.map((one) => (
              <Chip
                key={`${k}-${one}`}
                label={def.label}
                value={labelOf(def, one)}
                onRemove={() => Array.isArray(v) ? set(k, v.filter((x) => x !== one)) : clear(k)}
              />
            ))
          })}
          <button onClick={clearAll} style={{
            fontSize: 'var(--t-meta)', color: 'var(--text-3)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '0 4px', textDecoration: 'underline',
          }}>Clear all</button>
          {onSaveView && (
            <button onClick={onSaveView} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--t-meta)', color: 'var(--crimson)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '0 4px',
            }}>
              <Bookmark size={11} /> Save view
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function Chip({ label, value, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 4px 2px 8px', borderRadius: 'var(--r-full)',
      background: 'var(--surface)', border: '1px solid var(--border)',
      fontSize: 'var(--t-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--text-3)' }}>{label}:</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
      <button onClick={onRemove} aria-label={`Remove ${label} filter`} style={{
        display: 'flex', width: 15, height: 15, alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 999,
      }}>
        <X size={10} />
      </button>
    </span>
  )
}
