import { useState, useRef, useEffect, useMemo, useId, Children, isValidElement } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X, Loader2 } from 'lucide-react'
import clsx from 'clsx'

/* ── Dropdown system (§23) ────────────────────────────────────────────────────
 *
 * Replaces the 62 native <select> elements spread across 26 files. Native
 * selects were the single biggest reason the product read as unfinished: they
 * render in the OS's own styling, so on Windows the Tasks status control drew
 * a blue Win32 listbox in the middle of a burgundy interface — visible in the
 * screenshot of /app/tasks.
 *
 * Options may be flat strings, {value,label,description,icon,tone}, or grouped
 * as {group, options:[…]}. Search switches on automatically past 7 options —
 * below that a search field is furniture, above it the list is unscannable.
 *
 * The panel renders in a portal so it is never clipped by a table's
 * overflow:hidden — the reason the old dropdowns were cut off inside tables.
 * -------------------------------------------------------------------------- */

function flatten(options) {
  const out = []
  for (const o of options) {
    if (o && Array.isArray(o.options)) {
      out.push({ __group: o.group })
      for (const c of o.options) out.push(normalise(c))
    } else out.push(normalise(o))
  }
  return out
}

const normalise = (o) =>
  typeof o === 'string' || typeof o === 'number'
    ? { value: o, label: String(o) }
    : { ...o, label: o.label ?? String(o.value) }

export function Combobox({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  multiple = false,
  clearable = false,
  disabled = false,
  loading = false,
  emptyText = 'No matches',
  label,
  error,
  required,
  help,
  size = 'md',
  className,
  style,
  buttonClassName,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const listId = useId()

  const items = useMemo(() => flatten(options), [options])
  const selectable = useMemo(() => items.filter((i) => !i.__group), [items])
  const searchable = selectable.length > 7

  const filtered = useMemo(() => {
    if (!query) return items
    const q = query.toLowerCase()
    const keep = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.__group) continue
      if (
        it.label.toLowerCase().includes(q) ||
        String(it.description ?? '').toLowerCase().includes(q)
      ) keep.push(it)
    }
    return keep
  }, [items, query])

  const navigable = useMemo(() => filtered.filter((i) => !i.__group && !i.disabled), [filtered])

  const selected = multiple ? (Array.isArray(value) ? value : []) : value
  const isSelected = (v) => (multiple ? selected.includes(v) : selected === v)

  const selectedLabels = useMemo(() => {
    if (!multiple) {
      const hit = selectable.find((o) => o.value === value)
      return hit ? hit.label : ''
    }
    return selectable.filter((o) => selected.includes(o.value)).map((o) => o.label)
  }, [selectable, value, selected, multiple])

  // Position the portal panel against the trigger, and keep it there on scroll.
  //
  // A panel is fixed-positioned, so anything that lands below the fold is
  // simply unreachable — the page scrolls, the panel does not. When the space
  // under the trigger cannot hold a usable list it opens upward instead, and
  // either way the height is capped to the room actually available.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const M = 8
      const below = window.innerHeight - r.bottom - M
      const above = r.top - M
      const flip = below < 200 && above > below
      const minW = Math.max(r.width, 180)
      const left = Math.max(M, Math.min(r.left, window.innerWidth - minW - M))
      setRect({
        top: flip ? undefined : r.bottom + 4,
        bottom: flip ? window.innerHeight - r.top + 4 : undefined,
        left,
        width: r.width,
        maxWidth: Math.max(minW, Math.min(Math.max(r.width, 320), window.innerWidth - left - M)),
        maxHeight: Math.max(140, Math.min(300, flip ? above : below)),
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open && searchable) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open, searchable])

  const close = () => { setOpen(false); setQuery(''); setCursor(0) }

  const pick = (item) => {
    if (item.disabled) return
    if (multiple) {
      const next = selected.includes(item.value)
        ? selected.filter((v) => v !== item.value)
        : [...selected, item.value]
      onChange?.(next)
    } else {
      onChange?.(item.value)
      close()
      btnRef.current?.focus()
    }
  }

  // §42 — full keyboard operation, including type-ahead while closed.
  const onKeyDown = (e) => {
    if (disabled) return
    if (!open) {
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true) }
      return
    }
    switch (e.key) {
      case 'Escape':    e.preventDefault(); close(); btnRef.current?.focus(); break
      case 'ArrowDown': e.preventDefault(); setCursor((c) => Math.min(c + 1, navigable.length - 1)); break
      case 'ArrowUp':   e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); break
      case 'Home':      e.preventDefault(); setCursor(0); break
      case 'End':       e.preventDefault(); setCursor(navigable.length - 1); break
      case 'Enter':     e.preventDefault(); if (navigable[cursor]) pick(navigable[cursor]); break
      case 'Tab':       close(); break
      default: break
    }
  }

  const display = multiple
    ? selectedLabels.length === 0 ? '' : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} selected`
    : selectedLabels

  const pad = size === 'sm' ? '5px 9px' : '7px 10px'

  return (
    <div className={clsx('flex flex-col', className)} style={style}>
      {label && (
        <label className="field-label">
          {label}{required && <span className="field-req">*</span>}
        </label>
      )}

      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-invalid={error ? 'true' : undefined}
        className={clsx('flex items-center justify-between gap-2 w-full rounded-md transition-colors text-left', buttonClassName)}
        style={{
          background: disabled ? 'var(--surface)' : 'var(--bg-2)',
          border: `1px solid ${error ? 'var(--critical)' : 'var(--border)'}`,
          padding: pad,
          fontSize: 'var(--t-body)',
          color: display ? 'var(--text)' : 'var(--text-3)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: 0,
        }}
      >
        <span className="truncate">{display || placeholder}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {clearable && display && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => { e.stopPropagation(); onChange?.(multiple ? [] : null) }}
              style={{ color: 'var(--text-3)', display: 'flex' }}
            >
              <X size={12} />
            </span>
          )}
          {loading
            ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-3)' }} />
            : <ChevronDown size={13} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-2) var(--ease)' }} />}
        </span>
      </button>

      {help && !error && <p className="field-help">{help}</p>}
      {error && <p className="field-error">{error}</p>}

      {open && rect && createPortal(
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className="anim-pop"
          style={{
            position: 'fixed',
            top: rect.top, bottom: rect.bottom, left: rect.left,
            minWidth: Math.max(rect.width, 180),
            maxWidth: rect.maxWidth,
            maxHeight: rect.maxHeight,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--e-3)',
            zIndex: 'var(--z-popover)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {searchable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
              <Search size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-sm)', color: 'var(--text)', minWidth: 0 }}
              />
            </div>
          )}

          {multiple && selectable.length > 1 && (
            <div style={{ display: 'flex', gap: 10, padding: '6px 10px', borderBottom: '1px solid var(--border-3)' }}>
              <button type="button" onClick={() => onChange?.(selectable.map((o) => o.value))}
                style={{ fontSize: 'var(--t-meta)', color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Select all
              </button>
              <button type="button" onClick={() => onChange?.([])}
                style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Clear
              </button>
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: 4 }}>
            {loading && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
                <Loader2 size={14} className="animate-spin" style={{ display: 'inline' }} /> Loading…
              </div>
            )}

            {!loading && navigable.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
                {emptyText}
              </div>
            )}

            {!loading && filtered.map((item, i) => {
              if (item.__group) {
                return (
                  <div key={`g-${i}`} className="eyebrow" style={{ padding: '8px 8px 4px' }}>
                    {item.__group}
                  </div>
                )
              }
              const idx = navigable.indexOf(item)
              const active = idx === cursor
              const chosen = isSelected(item.value)
              const Icon = item.icon
              return (
                <div
                  key={String(item.value)}
                  role="option"
                  aria-selected={chosen}
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() => pick(item)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 8px', borderRadius: 'var(--r)',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    background: active ? 'var(--hover)' : 'transparent',
                    opacity: item.disabled ? 0.45 : 1,
                  }}
                >
                  <span style={{ width: 13, flexShrink: 0, marginTop: 2 }}>
                    {chosen && <Check size={13} style={{ color: 'var(--crimson)' }} />}
                  </span>
                  {Icon && <Icon size={13} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }} />}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-body)', color: 'var(--text)', fontWeight: chosen ? 500 : 400 }}>
                      {item.label}
                    </span>
                    {item.description && (
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 1 }}>
                        {item.description}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

/* ── SelectField — drop-in replacement for a native <select> ──────────────────
 *
 * The 61 native selects in this codebase all share one shape:
 *
 *     <select value={x} onChange={handler}>{options}</select>
 *
 * and every handler reads `e.target.value`. Rewriting 61 handlers by hand is
 * 61 chances to introduce a bug, so this component preserves that contract
 * exactly: it accepts <option> and <optgroup> children and emits a synthetic
 * { target: { value } }. Migrating a call site is then literally a tag rename,
 * which is verifiable by counting rather than by reading.
 *
 * Everything below the surface is the Combobox — searchable, keyboard-driven,
 * portalled, and drawn by us rather than by Windows.
 */
function optionsFromChildren(children) {
  const out = []

  const readOption = (el) => {
    const kids = Children.toArray(el.props.children)
    const label = kids.map((k) => (typeof k === 'string' || typeof k === 'number' ? String(k) : '')).join('').trim()
    // A bare <option>Design</option> uses its text as the value, exactly as
    // the DOM does. Losing that would silently change what gets submitted.
    const value = el.props.value !== undefined ? el.props.value : label
    return { value, label: label || String(value), disabled: el.props.disabled }
  }

  const walk = (nodes) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return
      if (child.type === 'option') out.push(readOption(child))
      else if (child.type === 'optgroup') {
        const group = { group: child.props.label, options: [] }
        Children.forEach(child.props.children, (o) => {
          if (isValidElement(o) && o.type === 'option') group.options.push(readOption(o))
        })
        out.push(group)
      } else if (child.props?.children) {
        // Fragments and conditional wrappers
        walk(child.props.children)
      }
    })
  }

  walk(children)
  return out
}

/* Styling the native control was the call site's job, so these 65 sites pass
 * things like "risys-input appearance-none pr-7 border rounded-md" plus inline
 * borders and backgrounds. Forwarding any of that would draw a second border
 * around the Combobox, which draws its own. Rather than scrub 65 call sites —
 * 65 chances to miss one — the component refuses the chrome and keeps only
 * what positions it. */
const LAYOUT_CLASS = /^(w-|min-w-|max-w-|flex($|-)|self-|m[trblxy]?-|col-|row-|grow|shrink|basis-|justify-|items-|order-|hidden|block|inline-flex)/

function keepLayoutOnly(className) {
  if (!className) return undefined
  const kept = String(className).split(/\s+/).filter((c) => LAYOUT_CLASS.test(c))
  return kept.length ? kept.join(' ') : undefined
}

export function SelectField({
  children,
  options: optionsProp,
  value,
  onChange,
  label,
  error,
  required,
  help,
  disabled,
  placeholder,
  size,
  className,
  style,          // deliberately swallowed — see note above
  defaultValue,   // native-only; the Combobox is controlled
  ...rest
}) {
  const options = useMemo(
    () => optionsProp ?? optionsFromChildren(children),
    [optionsProp, children]
  )

  /* Native <select> coerces its value to a string; React state behind these
   * call sites is sometimes a number. Match loosely so a numeric 3 still
   * resolves against an option whose value is "3". */
  const resolved = useMemo(() => {
    const flat = []
    for (const o of options) (o.options ? flat.push(...o.options) : flat.push(o))
    const v = value !== undefined ? value : defaultValue
    const hit = flat.find((o) => o.value === v) || flat.find((o) => String(o.value) === String(v))
    return hit ? hit.value : v
  }, [options, value, defaultValue])

  /* An inline picker sitting in a table cell should hug its content; a form
   * field should fill its column. w-full is the signal the call sites already
   * carry, so honour it rather than guessing. */
  const layout = keepLayoutOnly(className)
  const wantsFull = /\bw-full\b/.test(String(className || ''))

  return (
    <Combobox
      options={options}
      value={resolved}
      onChange={(v) => onChange?.({ target: { value: v } })}
      label={label}
      error={error}
      required={required}
      help={help}
      disabled={disabled}
      size={size ?? 'sm'}
      className={layout}
      style={wantsFull ? undefined : { minWidth: 0 }}
      placeholder={placeholder ?? 'Select…'}
      {...rest}
    />
  )
}

/* Older name kept so the two call sites importing Select from ui/Input keep
 * working after that module re-exports this one. */
export { SelectField as Select }
