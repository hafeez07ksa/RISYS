import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { tx } from '@/lib/i18n'

/* ── Inline confirmation ──────────────────────────────────────────────────────
 *
 * Replaces "Are you sure?" dialogs and window.confirm(). The button itself
 * turns into the question, in the place the person was already looking, and
 * nothing is laid over the page:
 *
 *   [Remove]  →  Remove “MFA enforced” from scope?  [Remove]  [Keep]
 *
 * Two shapes:
 *   - strip  (default) — one line, for table rows and toolbars.
 *   - panel            — a block with room for an explanation and, for
 *                        irreversible actions, a typed confirmation.
 *
 * `onConfirm` may be async; its error is shown in place and the question stays
 * open so the person can try again or back out.
 * -------------------------------------------------------------------------- */

export function InlineConfirm({
  children,              // the trigger's content: text and/or icon
  message,               // the question
  detail,                // panel only: a sentence of consequence
  confirmLabel = tx('Confirm'),
  cancelLabel = tx('Cancel'),
  onConfirm,
  tone = 'danger',       // 'danger' | 'neutral'
  variant = 'strip',     // 'strip' | 'panel'
  requireText,           // panel only: the exact text the person must type
  triggerClassName = 'btn-ghost',
  triggerTitle,
  triggerStyle,
  disabled,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')

  const close = () => { setOpen(false); setError(''); setTyped('') }
  const go = async () => {
    setBusy(true); setError('')
    try { await onConfirm?.(); close() } catch (e) { setError(e.message || tx('That did not work.')) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button type="button" className={triggerClassName} title={triggerTitle} style={triggerStyle}
        disabled={disabled} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        {children}
      </button>
    )
  }

  const confirmClass = tone === 'danger' ? 'btn-danger' : 'btn-primary'
  const blocked = busy || (requireText != null && typed.trim() !== requireText)

  if (variant === 'panel') {
    return (
      <div className={`ic-panel${tone === 'neutral' ? ' is-neutral' : ''}`} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>{message}</p>
        {detail && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.55 }}>{detail}</p>}
        {requireText != null && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
            <span>{tx('Type')} <strong style={{ color: 'var(--text)' }}>{requireText}</strong> {tx('to confirm')}</span>
            <input className="risys-input" value={typed} autoFocus onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        {error && <p className="field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={confirmClass} disabled={blocked} onClick={go}>
            {busy && <Spinner size="sm" />}{confirmLabel}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={close}>{cancelLabel}</button>
        </div>
      </div>
    )
  }

  return (
    <span className={`ic-strip${tone === 'neutral' ? ' is-neutral' : ''}`} onClick={(e) => e.stopPropagation()} role="group">
      <span style={{ whiteSpace: 'normal' }}>{message}</span>
      <button type="button" className={confirmClass} style={{ padding: '4px 10px' }} disabled={busy} onClick={go} autoFocus>
        {busy && <Spinner size="sm" />}{confirmLabel}
      </button>
      <button type="button" className="btn-ghost" style={{ padding: '4px 8px' }} disabled={busy} onClick={close}>{cancelLabel}</button>
      {error && <span className="field-error" role="alert" style={{ margin: 0, flexBasis: '100%' }}>{error}</span>}
    </span>
  )
}
