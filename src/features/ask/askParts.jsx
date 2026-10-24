import markDark from '@/assets/risys-mark.png'
import markLight from '@/assets/risys-mark-light.png'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUp, ArrowRight, ExternalLink, ChevronDown, ChevronUp,
  ShieldAlert, Bug, CalendarClock, ListChecks, Lightbulb, Gauge,
} from 'lucide-react'
import { tx, appLocale } from '@/lib/i18n'
import './ask.css'

/* ── Ask RISYS — shared chat parts ────────────────────────────────────────────
 * Used by the workspace page (/app/ask) and the floating assistant, so an
 * answer looks and behaves the same in both.
 * -------------------------------------------------------------------------- */

/* Suggested questions: a short label on the chip, the full question sent. */
export const STARTERS = [
  { icon: ShieldAlert,  label: 'Open high risks',          q: 'Which high and critical risks are open, and what is driving them?' },
  { icon: Bug,          label: 'Critical findings',        q: 'List the critical findings and how to fix them.' },
  { icon: CalendarClock, label: 'Overdue work',            q: 'Which tasks and incidents are overdue?' },
  { icon: ListChecks,   label: 'Compliance by framework',  q: 'Where are we weakest against NCA ECC right now?' },
  { icon: Lightbulb,    label: 'Suggested risks',          q: 'Which suggested risks are waiting for review, and why were they raised?' },
  { icon: Gauge,        label: 'Posture summary',          q: 'Summarise our risk posture in three sentences.' },
]

/** "5 minutes ago", "yesterday" — in the interface language. */
export function relTime(iso) {
  if (!iso) return ''
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  let rtf
  try { rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: 'auto' }) } catch { return '' }
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day')
  if (abs < 86400 * 35) return rtf.format(Math.round(diff / (86400 * 7)), 'week')
  return new Date(iso).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Answer rendering ─────────────────────────────────────────────────────────
 * A deliberately small Markdown subset — paragraphs, headings, bullet and
 * numbered lists, **bold**, `code`, simple tables — built as React elements,
 * never as HTML, so nothing the model writes can inject markup. A [REF] the
 * answer cites becomes a link when it matches one of the sources. */

function Inline({ text, sourceByRef }) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]\n]{1,80}\])/g
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<strong key={k++} style={{ fontWeight: 600 }}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) parts.push(<code key={k++} style={{ fontSize: '0.9em', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>{tok.slice(1, -1)}</code>)
    else {
      const ref = tok.slice(1, -1).trim()
      const src = sourceByRef[ref]
      parts.push(src
        ? <Link key={k++} to={src.link} className="tnum" style={{
            color: 'var(--crimson)', fontWeight: 500, whiteSpace: 'nowrap', fontSize: '0.92em',
            background: 'var(--crimson-wash)', borderRadius: 5, padding: '1px 5px', textDecoration: 'none',
          }}>{ref}</Link>
        : <span key={k++} className="tnum" style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>[{ref}]</span>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const LIST_RE = /^\s*([-*•]|\d+[.)])\s+/

function parseBlocks(content) {
  // Drop the model's own 【source】 marks and any field-name citations such as
  // [risks_open] (older answers); RISYS cites records as [REF].
  const lines = (content || '').replace(/\r/g, '').replace(/\s*【[^】]*】/g, '')
    .replace(/\s*\[[a-z][a-z0-9_]*\]/g, '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^\s*\|/.test(line)) {
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
        i++
      }
      blocks.push({ type: 'table', rows })
      continue
    }
    if (/^#{1,6}\s/.test(line)) {
      blocks.push({ type: 'h', text: line.replace(/^#{1,6}\s+/, '') })
      i++
      continue
    }
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items = []
      while (i < lines.length && (LIST_RE.test(lines[i]) || (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length))) {
        if (LIST_RE.test(lines[i])) items.push(lines[i].replace(LIST_RE, ''))
        else items[items.length - 1] += ' ' + lines[i].trim()
        i++
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^\s*\|/.test(lines[i]) && !LIST_RE.test(lines[i]) && !/^#{1,6}\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: para.join(' ') })
  }
  return blocks
}

export function Answer({ content, sources, compact }) {
  const sourceByRef = Object.fromEntries((sources || []).map(s => [s.ref, s]))
  const blocks = parseBlocks(content)
  const size = compact ? 13.5 : 14.5
  return (
    <div dir="auto" style={{ fontSize: size, color: 'var(--text)', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
      {blocks.map((b, n) => {
        const mt = n ? 10 : 0
        if (b.type === 'h') {
          return <p key={n} style={{ margin: `${n ? 14 : 0}px 0 0`, fontWeight: 600, color: 'var(--text)' }}>
            <Inline text={b.text} sourceByRef={sourceByRef} />
          </p>
        }
        if (b.type === 'p') {
          return <p key={n} style={{ margin: `${mt}px 0 0` }}><Inline text={b.text} sourceByRef={sourceByRef} /></p>
        }
        if (b.type === 'table') {
          const [head, ...body] = b.rows
          return (
            <div key={n} style={{ overflowX: 'auto', marginTop: mt, border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="w-full" style={{ fontSize: compact ? 12 : 13, borderCollapse: 'collapse' }}>
                {head && <thead><tr style={{ background: 'var(--surface)' }}>{head.map((c, j) => (
                  <th key={j} style={{ textAlign: 'start', padding: '7px 10px', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    <Inline text={c} sourceByRef={sourceByRef} />
                  </th>
                ))}</tr></thead>}
                <tbody>{body.map((r, j) => (
                  <tr key={j} style={{ borderTop: '1px solid var(--border-3)' }}>
                    {r.map((c, x) => <td key={x} style={{ padding: '7px 10px', verticalAlign: 'top' }}><Inline text={c} sourceByRef={sourceByRef} /></td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={n} style={{ margin: `${mt}px 0 0`, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span className="tnum" style={{
                    flexShrink: 0, width: 20, height: 20, marginTop: 2, borderRadius: 6, fontSize: 11, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--crimson-wash)', color: 'var(--crimson)',
                  }}>{j + 1}</span>
                  <span style={{ minWidth: 0 }}><Inline text={it} sourceByRef={sourceByRef} /></span>
                </li>
              ))}
            </ol>
          )
        }
        return (
          <ul key={n} style={{ margin: `${mt}px 0 0`, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {b.items.map((it, j) => (
              <li key={j} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 99, background: 'var(--taupe)', marginTop: '0.65em' }} />
                <span style={{ minWidth: 0 }}><Inline text={it} sourceByRef={sourceByRef} /></span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}

/* ── Sources and the next step ────────────────────────────────────────────── */

const KIND = {
  risk:        { one: 'Risk',            area: 'Risk register',      list: '/app/risks',             many: 'View {{n}} risks' },
  requirement: { one: 'ECC requirement', area: 'NCA ECC compliance', list: '/app/compliance',        many: 'View {{n}} requirements' },
  finding:     { one: 'Finding',         area: 'Findings',           list: null,                     many: 'View {{n}} findings' },
  task:        { one: 'Task',            area: 'Tasks',              list: '/app/tasks',             many: 'View {{n}} tasks' },
  incident:    { one: 'Incident',        area: 'Incidents',          list: '/app/incidents',         many: 'View {{n}} incidents' },
  suggestion:  { one: 'Suggested risk',  area: 'Suggested risks',    list: '/app/risks/suggestions', many: 'View {{n}} suggested risks' },
  control:     { one: 'Control',         area: 'Controls',           list: '/app/controls',          many: 'View {{n}} controls' },
  record:      { one: 'Record',          area: 'Workspace records',  list: null,                     many: 'View {{n}} records' },
}
const kindOf = (s) => KIND[s.kind] || KIND.record

/* The one obvious next step: open the record, or the list the records sit in. */
function primaryAction(sources) {
  if (!sources?.length) return null
  if (sources.length === 1) return { to: sources[0].link, label: tx('Open {{ref}}', { ref: sources[0].ref || tx(kindOf(sources[0]).one) }) }
  const counts = {}
  for (const s of sources) counts[s.kind] = (counts[s.kind] || 0) + 1
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  const k = KIND[top] || KIND.record
  const sameLink = sources.filter(s => s.kind === top).every((s, _, a) => s.link === a[0].link)
  const to = sameLink ? sources.find(s => s.kind === top).link : k.list
  if (!to || n < 2) return null
  return { to, label: tx(k.many, { n }) }
}

export function Sources({ sources, createdAt, compact }) {
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  const action = primaryAction(sources)
  const areas = [...new Set(sources.map(s => tx(kindOf(s).area)))].join(', ')
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-3)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        {action && (
          <Link to={action.to} className="ask-action">
            {action.label} <ArrowRight size={13} className="rtl-flip" />
          </Link>
        )}
        <button type="button" className="ask-linkbtn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span>{tx('Source')}: {areas}{createdAt ? ` · ${relTime(createdAt)}` : ''}</span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {sources.map((s, i) => (
            <Link key={`${s.link}-${i}`} to={s.link} className="ask-srcchip" style={{ maxWidth: compact ? '100%' : 380 }}>
              <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{tx(kindOf(s).one)}</span>
              <span className="truncate" dir="auto">{s.label}</span>
              <ExternalLink size={11} style={{ flexShrink: 0, color: 'var(--text-3)' }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Brand mark ─────────────────────────────────────────────────────────────
 * Ask RISYS speaks as RISYS, so it wears the R mark rather than a generic
 * sparkle. The cream cut sits on the wine avatar, button and popup header;
 * the dark cut on the light greeting disc. */

export function AskMark({ size = 16, tone = 'light' }) {
  return (
    <img
      src={tone === 'light' ? markLight : markDark}
      alt="" aria-hidden="true" width={size} height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  )
}

/* ── Messages ─────────────────────────────────────────────────────────────── */

export function Message({ m, compact }) {
  if (m.role === 'user') {
    return <div className="ask-msg" style={{ display: 'flex' }}><div className="ask-user" dir="auto">{m.content}</div></div>
  }
  return (
    <div className="ask-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {!compact && <span className="ask-avatar"><AskMark size={18} /></span>}
      <div className="ask-answer">
        <Answer content={m.content} sources={m.sources} compact={compact} />
        <Sources sources={m.sources} createdAt={m.created_at} compact={compact} />
      </div>
    </div>
  )
}

export function Thinking({ compact }) {
  // After a while the gateway is usually pausing for the provider's
  // per-minute limit; say so rather than look stuck.
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 9000); return () => clearTimeout(t) }, [])
  return (
    <div className="ask-msg" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {!compact && <span className="ask-avatar"><AskMark size={18} /></span>}
      <div className="ask-answer" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <span className="ask-dots"><span /><span /><span /></span>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {slow ? tx('Still working — waiting for the AI provider’s per-minute limit…') : tx('Reading your records…')}
        </span>
      </div>
    </div>
  )
}

export function ErrorNote({ text }) {
  if (!text) return null
  return (
    <div role="alert" style={{ fontSize: 13, color: 'var(--crimson-3)', background: 'var(--crimson-wash)', border: '1px solid #F0CECE', borderRadius: 10, padding: '9px 12px' }}>
      {tx(text)}
    </div>
  )
}

/* ── Composer ─────────────────────────────────────────────────────────────── */

export function Composer({ onAsk, busy, disabled, compact, placeholder, autoFocus }) {
  const [text, setText] = useState('')
  const ref = useRef(null)

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  // Grow with the text, up to the CSS max-height.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const submit = async (e) => {
    e?.preventDefault()
    const q = text.trim()
    if (!q || busy || disabled) return
    setText('')
    const ok = await onAsk(q)
    if (!ok) setText(q) // keep the question if it failed, so it can be retried
  }

  return (
    <form onSubmit={submit} className={`ask-inputbar${compact ? ' compact' : ''}`}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e) }}
        placeholder={placeholder || tx('Ask RISYS a question…')}
        rows={1}
        maxLength={2000}
        disabled={disabled}
        dir="auto"
        aria-label={tx('Ask RISYS a question…')}
      />
      <button type="submit" className="ask-send" disabled={busy || disabled || !text.trim()} aria-label={tx('Ask')}>
        {busy
          ? <span className="inline-block rounded-full border-2 animate-spin" style={{ width: 15, height: 15, borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' }} />
          : <ArrowUp size={compact ? 15 : 17} strokeWidth={2.4} />}
      </button>
    </form>
  )
}
