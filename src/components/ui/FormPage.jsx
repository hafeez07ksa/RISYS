import { useEffect } from 'react'
import { Lightbulb } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { Spinner } from '@/components/ui/Spinner'
import { tx } from '@/lib/i18n'
import { LeaveGuardRegion, useLeaveGuard } from '@/components/layout/LeaveGuard'

/* ── Full-page forms ──────────────────────────────────────────────────────────
 *
 * Creating or changing a record happens on its own page, with its own URL,
 * not in a dialog laid over another page. That is what lets the browser's
 * back button, a bookmarked link and a page reload all do what people expect,
 * and it gives long forms (an audit finding, an engagement plan) the room to
 * explain themselves.
 *
 *   <FormPage title back={{ label, onClick }} onSubmit footer={…}>
 *     <FormSection title description> fields </FormSection>
 *   </FormPage>
 *
 * Ctrl/⌘+Enter runs onSubmit from anywhere on the page. Escape deliberately
 * does nothing: on a full page it would throw away a half-written form.
 * -------------------------------------------------------------------------- */

export function FormPage({ title, description, meta, back, onSubmit, footer, note, error, children, width }) {
  const guard = useLeaveGuard()
  useEffect(() => {
    if (!onSubmit) return
    const onKey = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guard?.allowLeave(); onSubmit() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSubmit, guard])

  // The whole form is a leave-guard region: once someone starts entering
  // something, leaving by any route other than Save / Cancel / Back asks first.
  return (
    <LeaveGuardRegion className="fp-root">
      <PageHead title={title} description={description} meta={meta} back={back} />
      <div className="fp-body">
        <div className="fp-inner" style={width ? { maxWidth: width } : undefined}>{children}</div>
      </div>
      {footer && (
        <div className="fp-foot">
          <span className={`fp-foot-note${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
            {error || note || (onSubmit ? <span className="hide-mobile">{tx('Ctrl + Enter to save')}</span> : null)}
          </span>
          {footer}
        </div>
      )}
    </LeaveGuardRegion>
  )
}

/* One titled part of a form, in three columns:
 *   left   — what this part is and why it exists
 *   middle — the fields
 *   right  — `tips`: how to do it well, as short points, plus an optional note
 *
 * RISYS is new to the people using it and much of this work (audit testing,
 * ECC mapping, incident classification) is unfamiliar, so the guidance sits
 * beside the field it is about rather than in a manual nobody opens.
 *
 *   <FormSection title description tips={['…', '…']} note="…">
 */
export function FormSection({ title, description, tips, note, tipsTitle, children }) {
  const hasTips = (tips && tips.length > 0) || note
  return (
    <section className={`fp-section${hasTips ? '' : ' no-tips'}`}>
      <div>
        <h2 className="fp-section-title">{title}</h2>
        {description && <p className="fp-section-desc">{description}</p>}
      </div>
      <div className="fp-fields">{children}</div>
      {hasTips && (
        <aside className="fp-tips">
          <p className="fp-tips-head"><Lightbulb size={12} aria-hidden="true" />{tipsTitle || tx('How to do this well')}</p>
          {tips?.length > 0 && <ul>{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          {note && <p className="fp-tips-note">{note}</p>}
        </aside>
      )}
    </section>
  )
}

/* Header shared by form pages and record pages: back link, title, meta, description. */
export function PageHead({ title, description, meta, back, actions }) {
  return (
    <div className="fp-head">
      {back && (
        <div style={{ marginBottom: 10 }}>
          <BackLink to={back.onClick} label={back.label} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.35 }}>{title}</h1>
            {meta}
          </div>
          {description && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: '5px 0 0', maxWidth: 680, lineHeight: 1.55 }}>{description}</p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  )
}

/* A record shown on its own page: content column plus a sticky side column
 * for facts and the next action. Used for things that were read in a dialog
 * before — an evidence request, an audit finding. */
export function RecordPage({ title, description, meta, back, actions, aside, children }) {
  return (
    <div className="fp-root">
      <PageHead title={title} description={description} meta={meta} back={back} actions={actions} />
      <div className="fp-body">
        <div className="rp-layout">
          <div style={{ minWidth: 0 }}>{children}</div>
          {aside && <aside className="rp-aside">{aside}</aside>}
        </div>
      </div>
    </div>
  )
}

/* Loading and not-found states for pages that fetch their record by URL. */
export function PageLoading() {
  return <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
}

export function PageNotFound({ title, children, back }) {
  return (
    <div className="fp-root">
      <PageHead title={title} back={back} />
      <div className="fp-body">
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: 0, maxWidth: 520 }}>{children}</p>
      </div>
    </div>
  )
}
