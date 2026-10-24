import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, Plus, Maximize2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAiSettings, useConversation } from '@/hooks/useAskRisys'
import { tx } from '@/lib/i18n'
import { STARTERS, Message, Thinking, ErrorNote, Composer, AskMark } from './askParts'

/* ── Floating assistant ───────────────────────────────────────────────────────
 *
 * A round button at the inline-end corner of every workspace page opens a
 * compact Ask RISYS card over the page. It is not a dialog: nothing behind it
 * is blocked, the page stays usable, and Esc or the button closes it.
 *
 * The card keeps one conversation going while you move around the app (its id
 * is remembered for the browser tab). "Open in Ask RISYS" continues the same
 * conversation on its full page; the button hides itself there.
 *
 * Shown only when AI is on for the workspace — when it is off, nothing here
 * renders and nothing is sent anywhere.
 * -------------------------------------------------------------------------- */

const KEY = 'risys.ask.widget'

function readSaved(orgId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return v && v.orgId === orgId ? v.conversationId : null
  } catch { return null }
}
function save(orgId, conversationId) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ orgId, conversationId })) } catch { /* storage unavailable */ }
}

function Panel({ orgId, onClose }) {
  const navigate = useNavigate()
  const [conversationId, setConversationId] = useState(() => readSaved(orgId))
  const { messages, loading, asking, error, ask, reset } = useConversation(orgId, conversationId)
  const bodyRef = useRef(null)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, asking])

  const onAsk = async (q) => {
    const id = await ask(q)
    if (!id) return false
    if (id !== conversationId) { setConversationId(id); save(orgId, id) }
    return true
  }

  const startNew = () => { setConversationId(null); save(orgId, null); reset() }

  const openFull = () => {
    onClose()
    navigate(conversationId ? `/app/ask/${conversationId}` : '/app/ask')
  }

  const empty = !loading && messages.length === 0 && !asking

  return (
    <section className="ask-pop" role="region" aria-label={tx('Ask RISYS')}>
      <header className="ask-pop-head">
        <span className="ask-pop-mark"><AskMark size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tx('Ask RISYS')}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--on-dark-2)' }} className="truncate">
            {tx('Answers from your own records')}
          </p>
        </div>
        <button type="button" className="ask-pop-btn" onClick={startNew} disabled={!conversationId && !messages.length} title={tx('New conversation')} aria-label={tx('New conversation')}>
          <Plus size={16} />
        </button>
        <button type="button" className="ask-pop-btn" onClick={openFull} title={tx('Open in Ask RISYS')} aria-label={tx('Open in Ask RISYS')}>
          <Maximize2 size={14} />
        </button>
        <button type="button" className="ask-pop-btn" onClick={onClose} title={tx('Close')} aria-label={tx('Close')}>
          <X size={16} />
        </button>
      </header>

      <div className="ask-pop-body" ref={bodyRef}>
        {loading && <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><span className="ask-dots"><span /><span /><span /></span></div>}

        {empty && (
          <div style={{ padding: '6px 4px 0' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div className="ask-answer" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{tx('Hi — what would you like to know?')}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 12.5 }}>
                  {tx('I read your risks, compliance, findings, tasks and incidents — only what your role can see — and cite every record. I cannot change anything.')}
                </p>
              </div>
            </div>
            <p className="ask-eyebrow" style={{ margin: '18px 2px 8px', fontSize: 10.5 }}>{tx('Try asking')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STARTERS.slice(0, 4).map(s => {
                const Icon = s.icon
                return (
                  <button key={s.label} type="button" className="ask-suggest" onClick={() => onAsk(tx(s.q))} disabled={asking}>
                    <Icon size={14} />
                    <span style={{ flex: 1, minWidth: 0 }} dir="auto">{tx(s.q)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {messages.map(m => <Message key={m.id} m={m} compact />)}
        {asking && <Thinking compact />}
        <ErrorNote text={error} />
      </div>

      <footer className="ask-pop-foot">
        <Composer compact onAsk={onAsk} busy={asking} autoFocus placeholder={tx('Ask a question…')} />
        <p style={{ margin: '6px 2px 0', fontSize: 10.5, color: 'var(--text-3)', textAlign: 'center' }}>
          {tx('AI-generated. Check the sources before you rely on an answer.')}
        </p>
      </footer>
    </section>
  )
}

export function AskRisysWidget() {
  const { organization } = useAuth()
  const orgId = organization?.id
  const { enabled } = useAiSettings(orgId)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  // Once opened, the card stays mounted while hidden, so a question asked just
  // before closing still lands in the conversation.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (open) setMounted(true) }, [open])

  const onAskPage = pathname.startsWith('/app/ask')

  // Esc closes, as for any popover in the app.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { if (onAskPage) setOpen(false) }, [onAskPage])

  if (!enabled || onAskPage || !orgId) return null

  return (
    <>
      {(open || mounted) && (
        <div style={{ display: open ? 'contents' : 'none' }}>
          <Panel key={orgId} orgId={orgId} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        className={`ask-fab${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? tx('Close Ask RISYS') : tx('Ask RISYS')}
        aria-expanded={open}
      >
        <span className="ask-fab-icon" style={{ display: 'inline-flex' }}>
          {open ? <X size={22} /> : <AskMark size={28} />}
        </span>
        <span className="ask-fab-tip">{tx('Ask RISYS')}</span>
      </button>
    </>
  )
}
