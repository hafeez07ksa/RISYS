import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, MessageSquare, ShieldCheck, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { useAiSettings, useConversations, useConversation } from '@/hooks/useAskRisys'
import { tx } from '@/lib/i18n'
import { STARTERS, relTime, Message, Thinking, ErrorNote, Composer, AskMark } from './askParts'

/* ── Ask RISYS (AI phase 0) ───────────────────────────────────────────────────
 *
 * Ask a question about the workspace in English or Arabic; RISYS answers from
 * the records it can read on your behalf and lists them as sources.
 *
 * What it is not: it changes nothing. There is no tool that writes, so it can
 * explain a risk but not approve it, and point at a requirement but not mark
 * it compliant. Every answer is a draft for a person to check against the
 * sources, which open the record itself.
 *
 * Two views on one route:
 *   /app/ask                   the workspace: question, suggestions, recent
 *   /app/ask/:conversationId   one conversation (its own URL, so a reload or
 *                              a shared link returns to it)
 * -------------------------------------------------------------------------- */

const COLUMN = { width: '100%', maxWidth: 780, marginInline: 'auto' }

function Disclaimer() {
  return (
    <p style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', margin: '9px 0 0', fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center' }}>
      <ShieldCheck size={12} style={{ flexShrink: 0 }} />
      {tx('AI-generated from your workspace records. Check the sources before you rely on an answer.')}
    </p>
  )
}

function OffState() {
  return (
    <div style={{ ...COLUMN, maxWidth: 560, padding: '90px var(--gutter)', textAlign: 'center' }}>
      <span className="ask-mark" style={{ width: 64, height: 64, marginBottom: 20 }}><Lock size={24} /></span>
      <p className="ask-eyebrow" style={{ margin: '0 0 8px' }}>{tx('Ask RISYS')}</p>
      <h1 className="ask-hero-title" style={{ fontSize: 26 }}>{tx('Ask RISYS is off for this workspace')}</h1>
      <p style={{ margin: '12px 0 0', color: 'var(--text-3)', fontSize: 14, lineHeight: 1.6 }}>
        {tx('AI is off unless your organisation asks for it. Your RISYS contact can turn it on; until then nothing is sent to any AI model.')}
      </p>
    </div>
  )
}

function RecentConversations({ conversations }) {
  const [all, setAll] = useState(false)
  if (!conversations.length) return null
  const shown = all ? conversations : conversations.slice(0, 4)
  return (
    <section className="ask-recent" style={{ marginTop: 34, textAlign: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{tx('Recent conversations')}</p>
        {conversations.length > 4 && (
          <button type="button" className="ask-linkbtn" style={{ color: 'var(--crimson)', fontWeight: 500 }} onClick={() => setAll(a => !a)}>
            {all ? tx('Show fewer') : tx('View all')} {!all && <ArrowRight size={12} className="rtl-flip" />}
          </button>
        )}
      </div>
      <div style={{ maxHeight: all ? 360 : undefined, overflowY: all ? 'auto' : undefined }}>
        {shown.map(c => (
          <Link key={c.id} to={`/app/ask/${c.id}`} className="ask-recent-row">
            <span className="ask-recent-icon"><MessageSquare size={14} /></span>
            <span className="truncate" dir="auto" style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)' }}>
              {c.title || tx('Untitled')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{relTime(c.updated_at)}</span>
            <ArrowRight size={14} className="ask-recent-go rtl-flip" />
          </Link>
        ))}
      </div>
      <p style={{ margin: 0, padding: '9px 16px', borderTop: '1px solid var(--border-3)', fontSize: 11.5, color: 'var(--text-3)', background: 'var(--bg)' }}>
        {tx('Conversations are private to you.')}
      </p>
    </section>
  )
}

function Home({ conversations, onAsk, asking }) {
  const { user } = useAuth()
  const first = (user?.user_metadata?.full_name || '').trim().split(/\s+/)[0]
  return (
    <div style={{ ...COLUMN, padding: '56px var(--gutter) 24px', textAlign: 'center', flex: 1 }}>
      <span className="ask-mark" style={{ width: 64, height: 64, marginBottom: 20 }}><AskMark size={34} tone="dark" /></span>
      <p className="ask-eyebrow" style={{ margin: '0 0 10px' }}>
        {tx('Ask RISYS')}{first ? ` · ${tx('Hello, {{name}}', { name: first })}` : ''}
      </p>
      <h1 className="ask-hero-title">{tx('What would you like to know about your GRC posture?')}</h1>
      <p style={{ margin: '12px auto 0', maxWidth: 560, color: 'var(--text-3)', fontSize: 14.5, lineHeight: 1.6 }}>
        {tx('Ask questions, get answers, and take action — all in one place.')}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 26 }}>
        {STARTERS.map(s => {
          const Icon = s.icon
          return (
            <button key={s.label} type="button" className="ask-chip" disabled={asking} onClick={() => onAsk(tx(s.q))}>
              <Icon size={14} /> {tx(s.label)}
            </button>
          )
        })}
      </div>

      <RecentConversations conversations={conversations} />

      <p style={{ margin: '22px auto 0', maxWidth: 600, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
        {tx('RISYS reads your risk register, NCA ECC compliance, connector findings, tasks and incidents — only what your role can already see — and cites each record it uses. It cannot change anything.')}
      </p>
    </div>
  )
}

export function AskRisysPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const orgId = organization?.id
  const { enabled, loading: settingsLoading } = useAiSettings(orgId)
  const { conversations, refetch } = useConversations(orgId)
  const { messages, loading, asking, error, ask } = useConversation(orgId, conversationId)
  const endRef = useRef(null)

  const inThread = !!conversationId || messages.length > 0 || asking
  const title = conversations.find(c => c.id === conversationId)?.title

  useEffect(() => {
    if (inThread) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length, asking, inThread])

  const onAsk = async (q) => {
    const id = await ask(q)
    if (!id) return false
    refetch()
    if (id !== conversationId) navigate(`/app/ask/${id}`, { replace: !conversationId })
    return true
  }

  if (settingsLoading) {
    return <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  }
  if (!enabled) return <div className="ask-page"><OffState /></div>

  return (
    <div className="ask-page">
      {inThread ? (
        <>
          <div style={{ ...COLUMN, padding: '18px var(--gutter) 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/app/ask" className="ask-linkbtn" style={{ fontSize: 12.5, flexShrink: 0 }}>
              <ArrowLeft size={13} className="rtl-flip" /> {tx('Ask RISYS')}
            </Link>
            <span style={{ color: 'var(--border-2)' }}>/</span>
            <span className="truncate" dir="auto" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
              {title || tx('Conversation')}
            </span>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/ask')} style={{ flexShrink: 0 }}>
              <Plus size={13} /> {tx('New conversation')}
            </button>
          </div>

          <div style={{ ...COLUMN, padding: '22px var(--gutter) 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {loading && <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner /></div>}
            {!loading && !asking && conversationId && messages.length === 0 && (
              <p style={{ margin: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                {tx('Nothing was saved in this conversation. Ask a question below to continue it, or start a new one.')}
              </p>
            )}
            {messages.map(m => <Message key={m.id} m={m} />)}
            {asking && <Thinking />}
            <ErrorNote text={error} />
            <div ref={endRef} />
          </div>
        </>
      ) : (
        <Home conversations={conversations} onAsk={onAsk} asking={asking} />
      )}

      <div className="ask-dock">
        <div style={COLUMN}>
          {!inThread && error && <div style={{ marginBottom: 10 }}><ErrorNote text={error} /></div>}
          <Composer
            onAsk={onAsk}
            busy={asking}
            autoFocus
            placeholder={inThread ? tx('Ask a follow-up…') : tx('Ask RISYS a question…')}
          />
          <Disclaimer />
        </div>
      </div>
    </div>
  )
}
