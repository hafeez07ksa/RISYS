import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { useBlocker, useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { tx } from '@/lib/i18n'

/* ── Leave guard ──────────────────────────────────────────────────────────────
 *
 * Asks before leaving a page on which someone has started entering something,
 * so a stray click on the sidebar, a breadcrumb or the browser's back button
 * does not throw away a half-written risk, task or finding.
 *
 * It only asks when work has actually started. A form page is "in progress"
 * once the person types, picks a value, ticks a box or uploads a file inside a
 * <LeaveGuardRegion>. Opening a form and leaving untouched never asks.
 *
 * Leaving through the form's own controls — Save, Cancel, the back link — is
 * deliberate and never asks: a click inside [data-guard-allow], the form
 * footer (.fp-foot) or header (.fp-head) opens a short window in which the
 * navigation that follows (usually after the save completes) goes through.
 *
 * No dialog: the question appears as a bar at the bottom of the screen, like
 * every other confirmation in RISYS. Closing or reloading the tab uses the
 * browser's own prompt — the only thing a page is allowed to do there.
 * -------------------------------------------------------------------------- */

const Ctx = createContext(null)
const ALLOW_MS = 20_000

export function useLeaveGuard() {
  return useContext(Ctx)
}

/* For editors that already know whether they hold unsaved changes (a draft
 * object, a changed flag): report it and the guard asks exactly then. */
export function useUnsavedChanges(isDirty) {
  const g = useContext(Ctx)
  const id = useId()
  useEffect(() => {
    if (!g) return
    g.setFlag(id, !!isDirty)
    return () => g.setFlag(id, false)
  }, [g, id, isDirty])
}

export function LeaveGuardProvider({ children }) {
  const location = useLocation()
  const dirtyRef = useRef(false)
  const autoRef = useRef(false)          // started by typing/picking in a region
  const flagsRef = useRef(new Set())     // explicit: useUnsavedChanges(true)
  const allowUntil = useRef(0)
  const [dirty, setDirty] = useState(false)

  const recompute = useCallback(() => {
    const d = autoRef.current || flagsRef.current.size > 0
    dirtyRef.current = d
    setDirty(d)
  }, [])

  const markDirty = useCallback(() => {
    // Editing again after a save attempt (a validation error kept the page
    // open) closes the window a Save click opened.
    allowUntil.current = 0
    if (!autoRef.current) { autoRef.current = true; recompute() }
  }, [recompute])
  const clear = useCallback(() => { autoRef.current = false; recompute() }, [recompute])
  const allowLeave = useCallback(() => { allowUntil.current = Date.now() + ALLOW_MS }, [])
  const setFlag = useCallback((id, on) => {
    const had = flagsRef.current.has(id)
    if (on && !had) flagsRef.current.add(id)
    else if (!on && had) flagsRef.current.delete(id)
    else return
    recompute()
  }, [recompute])

  // A new page starts clean.
  useEffect(() => { clear(); allowUntil.current = 0 }, [location.pathname, clear])

  const shouldBlock = useCallback(({ currentLocation, nextLocation }) =>
    dirtyRef.current
    && Date.now() > allowUntil.current
    && currentLocation.pathname !== nextLocation.pathname, [])
  const blocker = useBlocker(shouldBlock)

  // Closing the tab or reloading.
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  return (
    <Ctx.Provider value={{ dirty, markDirty, clear, allowLeave, setFlag }}>
      {children}
      {blocker.state === 'blocked' && (
        <LeaveBar
          onStay={() => blocker.reset()}
          onLeave={() => { clear(); flagsRef.current.clear(); recompute(); blocker.proceed() }}
        />
      )}
    </Ctx.Provider>
  )
}

/* Wrap the part of a page where work is entered.
 *   picks="all"     — any button inside counts as starting work (form pages,
 *                     where every button is a choice: likelihood 1–5, tabs of a
 *                     wizard, upload).
 *   picks="pickers" — only typing, ticking, uploading and choosing from a
 *                     dropdown or calendar count (a form embedded in a record
 *                     page, where other buttons just expand or navigate). */
export function LeaveGuardRegion({ children, picks = 'all', className, style, ...rest }) {
  const g = useLeaveGuard()

  const onInput = (e) => {
    if (!g) return
    const t = e.target
    if (t?.closest?.('[data-guard-ignore]')) return
    g.markDirty()
  }

  const onClick = (e) => {
    if (!g) return
    const t = e.target
    if (!t?.closest) return
    if (t.closest('[data-guard-allow], .fp-foot, .fp-head')) { g.allowLeave(); return }
    if (t.closest('[data-guard-ignore]')) return
    // Choices made in portalled pickers (Combobox options, calendar days, time
    // slots) arrive here through React's tree even though they render in <body>.
    const picked = t.closest('[role="option"], [role="dialog"] button, [data-time], [aria-pressed]')
    if (picked) { g.markDirty(); return }
    if (picks === 'all' && t.closest('button, [role="button"], [role="radio"], [role="checkbox"]')) g.markDirty()
  }

  return (
    <div
      className={className}
      style={style}
      onInputCapture={onInput}
      onChangeCapture={onInput}
      onClickCapture={onClick}
      {...rest}
    >
      {children}
    </div>
  )
}

function LeaveBar({ onStay, onLeave }) {
  const stayRef = useRef(null)
  useEffect(() => {
    stayRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onStay() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStay])

  // Centred by a full-width flex row, not by translateX(-50%) on the bar: the
  // entrance animation sets `transform`, which would replace the centring
  // while it runs and make the bar start off to one side and then jump.
  return (
    <div style={{
      position: 'fixed', insetInline: 0, bottom: 24, zIndex: 'var(--z-popover)',
      display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none',
    }}>
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={tx('Unsaved changes')}
      className="anim-pop"
      style={{
        pointerEvents: 'auto', transformOrigin: 'bottom center',
        width: 'min(620px, 100%)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '14px 16px', borderRadius: 12,
        background: '#1f1718', color: '#f6eeec',
        boxShadow: '0 18px 40px rgba(31,23,24,0.35)',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: 'rgba(246,238,236,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <AlertTriangle size={15} style={{ color: '#f4c27a' }} />
      </div>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{tx('Leave this page?')}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#cdbdb9', lineHeight: 1.5 }}>
          {tx('You have started filling this in. If you leave now, what you entered will not be saved.')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginInlineStart: 'auto' }}>
        <button type="button" onClick={onLeave} style={{
          fontSize: 12.5, fontWeight: 500, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'transparent', color: '#e9d9d6', border: '1px solid rgba(246,238,236,0.25)',
        }}>{tx('Leave without saving')}</button>
        <button type="button" ref={stayRef} onClick={onStay} style={{
          fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          background: '#f6eeec', color: '#1f1718', border: 'none',
        }}>{tx('Stay and keep editing')}</button>
      </div>
    </div>
    </div>
  )
}
