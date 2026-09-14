import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

/* ── Date field ───────────────────────────────────────────────────────────────
 *
 * Replaces <input type="date"> where the calendar needs to behave like every
 * other popup in the product. The native control opens an OS-drawn picker that
 * the page cannot close: clicking the field a second time dismisses and
 * immediately reopens it, so the calendar appears stuck. There is no
 * hidePicker() to call — the only fix is to own the popup.
 *
 * Same contract as SelectField: onChange receives { target: { value } } with an
 * ISO yyyy-mm-dd string, so call sites keep their existing handlers.
 * -------------------------------------------------------------------------- */

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/* Parsed as local midnight. `new Date('2026-03-05')` is parsed as UTC, which in
 * any negative-offset timezone renders as the 4th. */
function fromISO(s) {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** The 42 cells of a month grid, weeks running Monday to Sunday. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  // getDay() is Sunday-first; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

export function DateField({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a date',
  className,
  style,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const selected = useMemo(() => fromISO(value), [value])
  const [cursor, setCursor] = useState(() => selected || new Date())
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  const today = new Date()

  // Re-centre on the selected month each time the calendar opens, so reopening
  // after picking a distant date does not land on whatever was browsed last.
  useEffect(() => {
    if (open) setCursor(selected || new Date())
  }, [open])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const PANEL_H = 310, PANEL_W = 268, M = 8
      const below = window.innerHeight - r.bottom - M
      const flip = below < PANEL_H && r.top - M > below
      setRect({
        top: flip ? Math.max(M, r.top - PANEL_H - 4) : r.bottom + 4,
        left: Math.max(M, Math.min(r.left, window.innerWidth - PANEL_W - M)),
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

  // Outside click and Escape both close, from anywhere on the page — the
  // trigger's own onClick handles the second-click-to-close case.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const emit = (v) => onChange?.({ target: { value: v } })

  const pick = (d) => {
    emit(toISO(d))
    setOpen(false)
    btnRef.current?.focus()
  }

  const shiftMonth = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth())

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || 'Choose a date'}
        className="risys-input"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          color: selected ? 'var(--text)' : 'var(--text-3)',
          borderColor: open ? 'var(--rose)' : undefined,
        }}
      >
        <span className="tnum truncate">
          {selected ? selected.toLocaleDateString('en-GB') : placeholder}
        </span>
        <Calendar size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          className="anim-pop"
          style={{
            position: 'fixed', top: rect.top, left: rect.left, width: 268,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--e-3)',
            zIndex: 'var(--z-popover)', padding: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
              style={navBtn}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
              style={navBtn}><ChevronRight size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {WEEKDAYS.map((d) => (
              <span key={d} style={{
                textAlign: 'center', fontSize: 'var(--t-micro)', color: 'var(--text-3)',
                fontWeight: 500, padding: '2px 0 4px',
              }}>{d}</span>
            ))}

            {cells.map((d) => {
              const outside = d.getMonth() !== cursor.getMonth()
              const isSelected = sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button
                  key={toISO(d)}
                  type="button"
                  onClick={() => pick(d)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  className="tnum"
                  style={{
                    height: 28, borderRadius: 'var(--r)', cursor: 'pointer',
                    fontSize: 'var(--t-meta)',
                    fontWeight: isSelected || isToday ? 600 : 400,
                    border: isToday && !isSelected ? '1px solid var(--border-2)' : '1px solid transparent',
                    background: isSelected ? 'var(--crimson)' : 'transparent',
                    color: isSelected ? '#fff' : outside ? 'var(--text-3)' : 'var(--text)',
                    opacity: outside && !isSelected ? 0.45 : 1,
                    transition: 'background var(--dur-2) var(--ease)',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--hover)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 8,
            marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-3)',
          }}>
            <button type="button" onClick={() => pick(new Date())} style={linkBtn}>Today</button>
            <button type="button" onClick={() => { emit(''); setOpen(false); btnRef.current?.focus() }}
              style={{ ...linkBtn, color: 'var(--text-3)' }}>Clear</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const navBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 'var(--r)', cursor: 'pointer',
  border: 'none', background: 'transparent', color: 'var(--text-2)',
}

const linkBtn = {
  fontSize: 'var(--t-meta)', color: 'var(--crimson)', background: 'none',
  border: 'none', cursor: 'pointer', padding: 0,
}
