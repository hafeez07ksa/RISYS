import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { tx, appLocale } from '@/lib/i18n'

/* ── Date and time field ──────────────────────────────────────────────────────
 *
 * Replaces <input type="datetime-local">. The native control draws an OS
 * picker the page cannot style or close — the calendar on one side, a hour and
 * minute spinner on the other, with am/pm, looking nothing like the rest of
 * RISYS. This owns the popup instead, in the same style as DateField:
 *
 *   calendar on the start side · a list of times in 15-minute steps on the end
 *   side · quick picks along the top (In 1 hour, Tomorrow 09:00, …)
 *
 * Same contract as the native input: value and onChange's target.value are
 * local "yyyy-mm-ddThh:mm" strings, so call sites keep their handlers and the
 * browser still converts to the user's time zone when it is saved.
 * -------------------------------------------------------------------------- */

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const STEP = 15
const PANEL_W = 440
const PANEL_H = 376

const pad = (n) => String(n).padStart(2, '0')
const toValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const timeKey = (h, m) => `${pad(h)}:${pad(m)}`

function fromValue(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || ''))
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 9), +(m[5] ?? 0))
  return Number.isNaN(d.getTime()) ? null : d
}

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

const TIMES = Array.from({ length: (24 * 60) / STEP }, (_, i) => [Math.floor((i * STEP) / 60), (i * STEP) % 60])

function roundUp(d, step = STEP) {
  const x = new Date(d)
  x.setSeconds(0, 0)
  const extra = (step - (x.getMinutes() % step)) % step
  x.setMinutes(x.getMinutes() + extra)
  return x
}

function quickPicks(now = new Date()) {
  const at = (days, h, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m)
  const nextMonday = (() => { const add = ((8 - now.getDay()) % 7) || 7; return at(add, 9) })()
  return [
    { label: 'In 1 hour', value: roundUp(new Date(now.getTime() + 3600_000)) },
    { label: 'Later today', value: at(0, 15), hide: now.getHours() >= 14 },
    { label: 'Tomorrow 09:00', value: at(1, 9) },
    { label: 'Monday 09:00', value: nextMonday },
  ].filter(p => !p.hide)
}

function formatDisplay(d) {
  return `${d.toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DateTimeField({
  value,
  onChange,
  disabled = false,
  placeholder = 'Pick a date and time',
  min,
  className,
  style,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const selected = useMemo(() => fromValue(value), [value])
  const minDate = useMemo(() => fromValue(min), [min])
  const [cursor, setCursor] = useState(() => selected || new Date())
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)

  const today = new Date()

  useEffect(() => { if (open) setCursor(selected || new Date()) }, [open])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const M = 8
      const below = window.innerHeight - r.bottom - M
      const flip = below < PANEL_H && r.top - M > below
      const rtl = document.documentElement.dir === 'rtl'
      const anchor = rtl ? r.right - PANEL_W : r.left
      setRect({
        top: flip ? Math.max(M, r.top - PANEL_H - 4) : r.bottom + 4,
        left: Math.max(M, Math.min(anchor, window.innerWidth - PANEL_W - M)),
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

  // Bring the chosen time (or the next quarter hour) into view in the list.
  useEffect(() => {
    if (!open || !rect) return
    const ref = selected || roundUp(new Date())
    const el = listRef.current?.querySelector(`[data-time="${timeKey(ref.getHours(), ref.getMinutes() - (ref.getMinutes() % STEP))}"]`)
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2
  }, [open, rect, value])

  const emit = (d) => onChange?.({ target: { value: d ? toValue(d) : '' } })

  // Picking a day keeps the time already chosen (or the next quarter hour today, 09:00 otherwise).
  const pickDay = (d) => {
    const base = selected || (sameDay(d, today) ? roundUp(new Date(Date.now() + 3600_000)) : new Date(0, 0, 0, 9, 0))
    emit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()))
  }

  // Picking a time completes the choice and closes.
  const pickTime = (h, m) => {
    const day = selected || cursor
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m))
    setOpen(false)
    btnRef.current?.focus()
  }

  const pickQuick = (d) => { emit(d); setOpen(false); btnRef.current?.focus() }

  const isPast = (d) => minDate && d < minDate
  const dayBeforeMin = (d) => minDate && new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59) < minDate

  const shiftMonth = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const selKey = selected ? timeKey(selected.getHours(), selected.getMinutes()) : null
  const offGrid = selected && selected.getMinutes() % STEP !== 0

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          ref={btnRef}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel || tx('Choose a date and time')}
          className="risys-input"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', textAlign: 'start', cursor: disabled ? 'not-allowed' : 'pointer',
            color: selected ? 'var(--text)' : 'var(--text-3)',
            borderColor: open ? 'var(--rose)' : undefined,
            paddingInlineEnd: selected ? 34 : undefined,
          }}
        >
          <CalendarClock size={14} style={{ color: selected ? 'var(--crimson)' : 'var(--text-3)', flexShrink: 0 }} />
          <span className="tnum truncate" style={{ flex: 1 }}>
            {selected ? formatDisplay(selected) : tx(placeholder)}
          </span>
        </button>
        {selected && !disabled && (
          <button type="button" onClick={() => emit(null)} aria-label={tx('Clear')}
            style={{
              position: 'absolute', insetInlineEnd: 6, top: '50%', transform: 'translateY(-50%)',
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', borderRadius: 'var(--r)', cursor: 'pointer',
              color: 'var(--text-3)',
            }}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={tx('Choose a date and time')}
          className="anim-pop"
          style={{
            position: 'fixed', top: rect.top, left: rect.left, width: PANEL_W,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--e-3)',
            zIndex: 'var(--z-popover)', overflow: 'hidden',
          }}
        >
          {/* Quick picks */}
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px',
            borderBottom: '1px solid var(--border-3)', background: 'var(--surface)',
          }}>
            {quickPicks().map(p => (
              <button key={p.label} type="button" disabled={isPast(p.value)} onClick={() => pickQuick(p.value)}
                style={{
                  fontSize: 'var(--t-meta)', padding: '4px 9px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap',
                  border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-2)',
                  cursor: isPast(p.value) ? 'not-allowed' : 'pointer', opacity: isPast(p.value) ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rose)'; e.currentTarget.style.color = 'var(--crimson)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
              >{tx(p.label)}</button>
            ))}
          </div>

          <div style={{ display: 'flex' }}>
            {/* Calendar */}
            <div style={{ flex: 1, padding: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button type="button" onClick={() => shiftMonth(-1)} aria-label={tx('Previous month')} style={navBtn}>
                  <ChevronLeft size={14} className="rtl-flip" />
                </button>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
                  {tx(MONTHS[cursor.getMonth()])} {cursor.getFullYear()}
                </span>
                <button type="button" onClick={() => shiftMonth(1)} aria-label={tx('Next month')} style={navBtn}>
                  <ChevronRight size={14} className="rtl-flip" />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {WEEKDAYS.map((d) => (
                  <span key={d} style={{
                    textAlign: 'center', fontSize: 'var(--t-micro)', color: 'var(--text-3)',
                    fontWeight: 500, padding: '2px 0 4px',
                  }}>{tx(d)}</span>
                ))}
                {cells.map((d) => {
                  const outside = d.getMonth() !== cursor.getMonth()
                  const isSel = sameDay(d, selected)
                  const isToday = sameDay(d, today)
                  const blocked = dayBeforeMin(d)
                  return (
                    <button
                      key={d.toDateString()}
                      type="button"
                      disabled={blocked}
                      onClick={() => pickDay(d)}
                      aria-current={isToday ? 'date' : undefined}
                      aria-pressed={isSel}
                      className="tnum"
                      style={{
                        height: 30, borderRadius: 'var(--r)', cursor: blocked ? 'not-allowed' : 'pointer',
                        fontSize: 'var(--t-meta)', fontWeight: isSel || isToday ? 600 : 400,
                        border: isToday && !isSel ? '1px solid var(--border-2)' : '1px solid transparent',
                        background: isSel ? 'var(--crimson)' : 'transparent',
                        color: isSel ? '#fff' : outside ? 'var(--text-3)' : 'var(--text)',
                        opacity: blocked ? 0.25 : outside && !isSel ? 0.45 : 1,
                        transition: 'background var(--dur-2) var(--ease)',
                      }}
                      onMouseEnter={(e) => { if (!isSel && !blocked) e.currentTarget.style.background = 'var(--hover)' }}
                      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time */}
            <div style={{ width: 104, borderInlineStart: '1px solid var(--border-3)', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.1em',
                color: 'var(--text-3)', fontWeight: 500, padding: '12px 12px 6px',
              }}>{tx('Time')}</div>
              <div ref={listRef} style={{ flex: 1, overflowY: 'auto', maxHeight: 272, padding: '0 6px 8px', position: 'relative' }}>
                {offGrid && (
                  <button type="button" onClick={() => pickTime(selected.getHours(), selected.getMinutes())}
                    className="tnum" style={{ ...timeBtn, background: 'var(--crimson)', color: '#fff', fontWeight: 600 }}>
                    {selKey}
                  </button>
                )}
                {TIMES.map(([h, m]) => {
                  const key = timeKey(h, m)
                  const on = key === selKey
                  const day = selected || cursor
                  const past = isPast(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m))
                  return (
                    <button key={key} data-time={key} type="button" disabled={past}
                      onClick={() => pickTime(h, m)} className="tnum"
                      style={{
                        ...timeBtn,
                        background: on ? 'var(--crimson)' : 'transparent',
                        color: on ? '#fff' : m === 0 ? 'var(--text)' : 'var(--text-2)',
                        fontWeight: on ? 600 : m === 0 ? 500 : 400,
                        opacity: past ? 0.3 : 1, cursor: past ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={(e) => { if (!on && !past) e.currentTarget.style.background = 'var(--hover)' }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}
                    >{key}</button>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderTop: '1px solid var(--border-3)', background: 'var(--surface)',
          }}>
            <span className="tnum" style={{ fontSize: 'var(--t-meta)', color: selected ? 'var(--text-2)' : 'var(--text-3)' }}>
              {selected ? formatDisplay(selected) : tx('Pick a day, then a time')}
            </span>
            <span style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => { emit(null); setOpen(false) }} style={{ ...linkBtn, color: 'var(--text-3)' }}>{tx('Clear')}</button>
              <button type="button" disabled={!selected} onClick={() => { setOpen(false); btnRef.current?.focus() }}
                style={{ ...linkBtn, opacity: selected ? 1 : 0.4 }}>{tx('Done')}</button>
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const navBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 'var(--r)', cursor: 'pointer',
  border: 'none', background: 'transparent', color: 'var(--text-2)',
}

const timeBtn = {
  display: 'block', width: '100%', height: 28, marginBottom: 2,
  borderRadius: 'var(--r)', border: 'none', fontSize: 'var(--t-meta)',
  textAlign: 'center', transition: 'background var(--dur-2) var(--ease)',
}

const linkBtn = {
  fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--crimson)', background: 'none',
  border: 'none', cursor: 'pointer', padding: 0,
}
