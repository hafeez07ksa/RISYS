import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { FileDown, ChevronDown, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { tx, isRtl } from '@/lib/i18n'

/* ── Export PDF ───────────────────────────────────────────────────────────────
 *
 * The whole risk as a report, through the same pipeline as every other RISYS
 * report (report_risk_data → model → PDF in the browser). For people who may
 * file reports (risk, compliance, audit and admin roles) the file is also
 * fingerprinted and archived under Reports → Archive; anyone else who can see
 * the risk still gets the PDF, marked on the cover as not archived.
 *
 * By default the evidence goes in too: images in an appendix, PDFs appended
 * after it. The menu beside the button exports without evidence.
 *
 * The menu and the result message are portalled to <body> with fixed
 * positions: the risk header card clips its overflow, which cut the menu off.
 *
 * The generator and the PDF renderer are loaded on first click, not with the
 * risk page.
 * -------------------------------------------------------------------------- */

const MENU_W = 260
const NOTE_W = 290
const safe = (s) => String(s || 'risk').replace(/[^\p{L}\p{N}\s.-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 80)

/** Fixed-position box under the anchor, aligned to its end edge (right in
 *  English, left in Arabic) and kept inside the viewport. */
function placeUnder(rect, width) {
  const margin = 8
  const start = isRtl() ? rect.left : rect.right - width
  return {
    top: rect.bottom + 6,
    left: Math.max(margin, Math.min(start, window.innerWidth - width - margin)),
  }
}

export function ExportRiskPdf({ risk }) {
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [filed, setFiled] = useState(null)
  const [menu, setMenu] = useState(false)
  const [rect, setRect] = useState(null)
  const anchor = useRef(null)
  const panel = useRef(null)

  const note = !!(error || filed)
  const measure = useCallback(() => {
    if (anchor.current) setRect(anchor.current.getBoundingClientRect())
  }, [])

  // Keep the floating boxes under the button while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!menu && !note) return undefined
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [menu, note, measure])

  useEffect(() => {
    if (!menu) return undefined
    const close = (e) => {
      if (!anchor.current?.contains(e.target) && !panel.current?.contains(e.target)) setMenu(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [menu])

  const run = async (includeEvidence = true) => {
    setMenu(false); setError(''); setFiled(null); setStage(tx('Starting'))
    try {
      const { generateReport } = await import('@/lib/reports/generate')
      const name = user?.user_metadata?.full_name || user?.email
      const { run: saved, blob } = await generateReport({
        type: 'risk_report', organization, user: { id: user.id, name },
        risk: { id: risk.id }, archive: !!perms.canGenerateReports, includeEvidence, onStage: setStage,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safe(risk.risk_id)}-${safe(risk.title)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setFiled(saved)
    } catch (e) {
      setError(e.message || tx('The report could not be generated.'))
    } finally { setStage('') }
  }

  const options = [
    { evidence: true, label: tx('With evidence'), hint: tx('Images in an appendix; PDFs added at the end') },
    { evidence: false, label: tx('Without evidence'), hint: tx('Evidence listed only; a smaller file') },
  ]

  return (
    <div ref={anchor} style={{ display: 'flex' }}>
      <button onClick={() => run(true)} disabled={!!stage}
        title={perms.canGenerateReports
          ? tx('Download the whole risk as a PDF report; a copy is filed in the report archive')
          : tx('Download the whole risk as a PDF report')}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px', borderStartStartRadius: 7, borderEndStartRadius: 7, background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border-2)', cursor: stage ? 'wait' : 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {stage ? <Spinner size="sm" /> : <FileDown size={12} />} {stage || tx('Export PDF')}
      </button>
      <button onClick={() => setMenu((v) => !v)} disabled={!!stage} aria-label={tx('Export options')} aria-haspopup="menu" aria-expanded={menu}
        style={{ display: 'flex', alignItems: 'center', padding: '6px 6px', borderStartEndRadius: 7, borderEndEndRadius: 7, background: menu ? 'var(--bg)' : 'var(--bg-2)', color: 'var(--text-3)', border: '1px solid var(--border-2)', borderInlineStart: 'none', cursor: stage ? 'wait' : 'pointer' }}>
        <ChevronDown size={12} />
      </button>

      {menu && rect && createPortal(
        <div ref={panel} role="menu" className="anim-pop"
          style={{ position: 'fixed', ...placeUnder(rect, MENU_W), width: MENU_W, padding: 4, borderRadius: 8,
                   background: 'var(--bg-2)', border: '1px solid var(--border)', boxShadow: 'var(--e-3)', zIndex: 'var(--z-popover)' }}>
          {options.map((o) => (
            <button key={String(o.evidence)} role="menuitem" onClick={() => run(o.evidence)}
              style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'start', padding: '8px 8px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
              <span style={{ width: 12, flexShrink: 0, paddingTop: 2, color: 'var(--crimson)' }}>{o.evidence ? <Check size={12} /> : null}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.35 }}>{o.hint}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {!menu && note && rect && createPortal(
        <div role="status"
          style={{ position: 'fixed', ...placeUnder(rect, NOTE_W), width: NOTE_W, zIndex: 'var(--z-popover)', display: 'flex', gap: 8,
                   padding: '8px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.4,
                   background: error ? 'var(--critical-bg)' : 'var(--bg-2)', border: `1px solid ${error ? 'var(--critical-bd)' : 'var(--border)'}`,
                   color: error ? 'var(--critical)' : 'var(--text-2)', boxShadow: 'var(--e-3)' }}>
          <span style={{ flex: 1 }}>
            {error || <>{tx('Downloaded and filed in the report archive.')} <Link to="/app/reports">{tx('Open the archive')}</Link></>}
          </span>
          <button onClick={() => { setError(''); setFiled(null) }} aria-label={tx('Close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, lineHeight: 1, alignSelf: 'flex-start' }}>×</button>
        </div>,
        document.body,
      )}
    </div>
  )
}
