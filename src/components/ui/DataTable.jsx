import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal,
  Columns3, Rows3, ChevronLeft, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { Skeleton } from './Skeleton'

/* ── Table system (§31) ───────────────────────────────────────────────────────
 *
 * Every list in the product drew its own <table>. They disagreed on row height,
 * header casing, hover, and whether a row was clickable — so Findings and the
 * Risk Register, which do the same job, felt like different software.
 *
 * Density is a first-class setting, not a style choice (§31). GRC users fall
 * into two groups: an analyst triaging 400 findings wants compact, a manager
 * reviewing 12 risks wants comfortable. Forcing one loses the other.
 *
 * Sorting is uncontrolled by default but can be lifted (sort/onSortChange) when
 * the server does the ordering.
 * -------------------------------------------------------------------------- */

const DENSITY = {
  compact:     { py: '5px',  fs: 'var(--t-sm)',   h: 30 },
  comfortable: { py: '9px',  fs: 'var(--t-body)', h: 40 },
}

/**
 * columns: [{
 *   key, header, width, align, sortable, mono, hideBelow, render(row), sortValue(row)
 * }]
 * `hideBelow` drops the column under a pixel width (§36 — collapse secondary
 * columns rather than shrinking everything).
 */
export function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  loading = false,
  empty,
  onRowClick,
  selectable = false,
  selected = [],
  onSelectedChange,
  rowActions,
  density: densityProp,
  onDensityChange,
  defaultDensity = 'comfortable',
  sort: sortProp,
  onSortChange,
  stickyHeader = true,
  bulkActions,
  page, pageSize, total, onPageChange,
  className,
}) {
  const [densityState, setDensityState] = useState(defaultDensity)
  const [sortState, setSortState] = useState(null)
  const [hiddenCols, setHiddenCols] = useState([])
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400)

  const density = densityProp ?? densityState
  const setDensity = onDensityChange ?? setDensityState
  const sort = sortProp !== undefined ? sortProp : sortState
  const setSort = onSortChange ?? setSortState
  const d = DENSITY[density] || DENSITY.comfortable

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const visible = useMemo(
    () => columns.filter((c) => !hiddenCols.includes(c.key) && !(c.hideBelow && width < c.hideBelow)),
    [columns, hiddenCols, width]
  )

  const sorted = useMemo(() => {
    if (!sort || onSortChange) return rows            // server-ordered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const get = col.sortValue || ((r) => r[col.key])
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x == null) return 1
      if (y == null) return -1
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort.dir === 'desc' ? -cmp : cmp
    })
  }, [rows, sort, columns, onSortChange])

  const toggleSort = (key) => {
    if (!sort || sort.key !== key) return setSort({ key, dir: 'asc' })
    if (sort.dir === 'asc') return setSort({ key, dir: 'desc' })
    return setSort(null)
  }

  const allKeys = sorted.map(rowKey)
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.includes(k))
  const someSelected = selected.length > 0 && !allSelected

  const toggleAll = () =>
    onSelectedChange?.(allSelected ? [] : allKeys)

  const toggleOne = (k) =>
    onSelectedChange?.(selected.includes(k) ? selected.filter((s) => s !== k) : [...selected, k])

  return (
    <div className={clsx('section', className)} style={{ overflow: 'hidden' }}>

      {/* Bulk action bar — replaces the header row rather than stacking on top
          of it, so the table does not jump when a row is ticked. */}
      {selectable && selected.length > 0 && bulkActions && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--crimson-wash)',
        }}>
          <span style={{ fontSize: 'var(--t-sm)', color: 'var(--crimson)', fontWeight: 500 }}>
            {selected.length} selected
          </span>
          <div className="flex items-center gap-1.5">
            {bulkActions}
            <button className="btn-ghost" onClick={() => onSelectedChange?.([])} style={{ fontSize: 'var(--t-meta)' }}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table toolbar: density and column visibility. Quiet by design — these
          are power-user affordances, not primary actions. */}
      {(onDensityChange !== undefined || true) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }} className="tnum">
            {loading ? 'Loading…' : `${total ?? rows.length} ${(total ?? rows.length) === 1 ? 'row' : 'rows'}`}
          </span>
          <div className="flex items-center gap-1">
            <IconToggle
              title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            >
              <Rows3 size={13} />
            </IconToggle>
            <ColumnMenu columns={columns} hidden={hiddenCols} onChange={setHiddenCols} />
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead
            className="table-head"
            style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 2 } : undefined}
          >
            <tr>
              {selectable && (
                <th style={{ width: 34, padding: `${d.py} 0 ${d.py} 12px` }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                    style={{ accentColor: 'var(--crimson)', cursor: 'pointer' }}
                  />
                </th>
              )}
              {visible.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={{
                      textAlign: c.align || 'left',
                      padding: `${d.py} 12px`,
                      width: c.width,
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {c.sortable ? (
                      <button
                        onClick={() => toggleSort(c.key)}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
                          color: active ? 'var(--crimson)' : 'inherit',
                        }}
                      >
                        {c.header}
                        {active
                          ? (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                          : <ChevronsUpDown size={11} style={{ opacity: 0.35 }} />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
              {rowActions && <th style={{ width: 40, borderBottom: '1px solid var(--border)' }} />}
            </tr>
          </thead>

          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {selectable && <td style={{ padding: `${d.py} 12px` }} />}
                {visible.map((c) => (
                  <td key={c.key} style={{ padding: `${d.py} 12px` }}>
                    <Skeleton width={c.width ? undefined : '70%'} height={11} />
                  </td>
                ))}
                {rowActions && <td />}
              </tr>
            ))}

            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={visible.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  {empty}
                </td>
              </tr>
            )}

            {!loading && sorted.map((row) => {
              const k = rowKey(row)
              const isSel = selected.includes(k)
              return (
                <tr
                  key={k}
                  className={onRowClick ? 'row-hover' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onRowClick(row) }
                  } : undefined}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    background: isSel ? 'var(--crimson-wash)' : undefined,
                    borderBottom: '1px solid var(--border-3)',
                  }}
                >
                  {selectable && (
                    <td style={{ padding: `${d.py} 0 ${d.py} 12px` }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(k)}
                        aria-label="Select row"
                        style={{ accentColor: 'var(--crimson)', cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      className={c.mono ? 'mono' : undefined}
                      style={{
                        padding: `${d.py} 12px`,
                        textAlign: c.align || 'left',
                        fontSize: c.mono ? 'var(--t-sm)' : d.fs,
                        color: c.muted ? 'var(--text-3)' : 'var(--text-2)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {c.render ? c.render(row) : row[c.key] ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                  ))}
                  {rowActions && (
                    <td style={{ padding: `${d.py} 8px` }} onClick={(e) => e.stopPropagation()}>
                      <RowMenu>{rowActions(row)}</RowMenu>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {page != null && total > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      )}
    </div>
  )
}

function IconToggle({ children, title, onClick, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--r)', border: '1px solid transparent',
        background: active ? 'var(--surface)' : 'transparent',
        color: 'var(--text-3)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function ColumnMenu({ columns, hidden, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconToggle title="Columns" active={open} onClick={() => setOpen((o) => !o)}>
        <Columns3 size={13} />
      </IconToggle>
      {open && (
        <div className="anim-pop" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 190,
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)', padding: 5,
        }}>
          <div className="eyebrow" style={{ padding: '4px 7px 6px' }}>Columns</div>
          {columns.map((c) => (
            <label key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px',
              fontSize: 'var(--t-sm)', color: 'var(--text-2)', cursor: 'pointer', borderRadius: 'var(--r)',
            }}>
              <input
                type="checkbox"
                checked={!hidden.includes(c.key)}
                onChange={() => onChange(hidden.includes(c.key) ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])}
                style={{ accentColor: 'var(--crimson)' }}
              />
              {c.header}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* Row context menu (§14). Portalled so it escapes the table's overflow. */
export function RowMenu({ children }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const f = (e) => {
      if (btn.current?.contains(e.target) || panel.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btn}
        onClick={toggle}
        aria-label="Row actions"
        aria-expanded={open}
        style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--r)', background: open ? 'var(--surface)' : 'transparent',
          border: 'none', color: 'var(--text-3)', cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panel}
          className="anim-pop"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', top: pos.top, right: pos.right, minWidth: 168,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--e-3)',
            zIndex: 'var(--z-popover)', padding: 4,
          }}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}

export function MenuItem({ children, onClick, danger, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '6px 9px', borderRadius: 'var(--r)', border: 'none', background: 'transparent',
        fontSize: 'var(--t-sm)', color: danger ? 'var(--critical)' : 'var(--text-2)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  )
}

export function Pagination({ page, pageSize, total, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', borderTop: '1px solid var(--border)',
    }}>
      <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}
          style={{ padding: '4px 8px' }} aria-label="Previous page">
          <ChevronLeft size={13} />
        </button>
        <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', padding: '0 8px' }}>
          {page} / {pages}
        </span>
        <button className="btn-secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}
          style={{ padding: '4px 8px' }} aria-label="Next page">
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
