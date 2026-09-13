import { ShieldCheck, ShieldAlert, ShieldQuestion, Clock, CalendarX, Inbox, ChevronRight } from 'lucide-react'
import { bandForScore, bandMeta, BAND_ORDER } from '@/lib/matrix'
import { WORKFLOW_STATES, isReviewOverdue, normalizeWorkflowState } from '@/lib/risks'
import { treatmentSLA } from '@/lib/gate'

// ============================================================
// REGISTER OVERVIEW
//
// The top of the register answers three questions in order, before
// anyone reads a single row:
//
//   1. How much risk are we carrying?        band distribution
//   2. Is any of it outside the line?        the gate
//   3. What needs someone's attention now?   the work the gate created
//
// Then the lifecycle pipeline shows where every risk sits in the
// process. Every number on this screen is also a filter.
// ============================================================

/** The score a risk actually carries: residual once scored, inherent until then. */
export function currentScore(r) {
  return r.residual_score || r.inherent_score || r.risk_score || 0
}

export function currentBand(r, matrix) {
  return bandForScore(currentScore(r), matrix)
}

function Panel({ title, caption, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
      padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 0, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <p className="eyebrow">{title}</p>
        {caption && <p style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{caption}</p>}
      </div>
      {children}
    </div>
  )
}

/* ── 1. Band distribution ─────────────────────────────────── */
function BandDistribution({ risks, matrix, quickFilter, onQuickFilter }) {
  const open = risks.filter(r => r.workflow_state !== 'closed')
  const counts = Object.fromEntries(BAND_ORDER.map(b => [b, 0]))
  open.forEach(r => { const b = currentBand(r, matrix); if (b) counts[b]++ })
  const total = open.length || 1
  const bands = BAND_ORDER.slice().reverse()

  return (
    <Panel title="Risk carried" caption="residual where scored, otherwise inherent">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
        <span className="tnum" style={{ fontSize: 30, fontWeight: 300, color: 'var(--text)', lineHeight: 1 }}>{open.length}</span>
        <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>open risk{open.length === 1 ? '' : 's'}</span>
      </div>

      {/* Stacked bar — each segment is a filter */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, background: 'var(--surface)' }}>
        {bands.map(b => counts[b] > 0 && (
          <button key={b} onClick={() => onQuickFilter(`band:${b}`)} title={`${bandMeta(b).label}: ${counts[b]}`}
            style={{
              width: `${(counts[b] / total) * 100}%`, border: 'none', padding: 0, cursor: 'pointer',
              background: bandMeta(b).color,
              opacity: quickFilter && quickFilter !== `band:${b}` ? 0.3 : 1,
              transition: 'width 0.5s var(--ease), opacity var(--dur-2)',
            }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
        {bands.map(b => {
          const meta = bandMeta(b)
          const active = quickFilter === `band:${b}`
          return (
            <button key={b} onClick={() => onQuickFilter(`band:${b}`)}
              className="row-hover"
              style={{
                textAlign: 'left', padding: '6px 8px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                border: `1px solid ${active ? meta.color : 'transparent'}`,
                background: active ? meta.bg : 'transparent',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: meta.color }} />
                <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{meta.label}</span>
              </span>
              <span className="tnum" style={{
                display: 'block', fontSize: 'var(--t-section)', fontWeight: 600, marginTop: 2,
                color: counts[b] ? meta.color : 'var(--text-3)',
              }}>{counts[b]}</span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

/* ── 2. The gate ──────────────────────────────────────────── */
function GateSummary({ risks, quickFilter, onQuickFilter }) {
  const scored = risks.filter(r => r.workflow_state !== 'closed')
  const breached = scored.filter(r => r.tolerance_status === 'breached').length
  const within = scored.filter(r => r.tolerance_status === 'within').length
  const pending = scored.length - breached - within

  // Ring: circumference ~100 at r=15.9 so segment lengths are percentages.
  const total = scored.length || 1
  const pB = (breached / total) * 100
  const pW = (within / total) * 100

  const rows = [
    { key: 'breached', label: 'Outside tolerance', value: breached, color: 'var(--critical)', icon: ShieldAlert },
    { key: 'within', label: 'Within tolerance', value: within, color: 'var(--low)', icon: ShieldCheck },
    { key: 'unjudged', label: 'Not yet judged', value: pending, color: 'var(--text-3)', icon: ShieldQuestion },
  ]

  return (
    <Panel title="Tolerance gate" caption="evaluated on every score change">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
        <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" width="84" height="84" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--surface-2)" strokeWidth="3.2" />
            {pW > 0 && (
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--low)" strokeWidth="3.2"
                strokeDasharray={`${pW} ${100 - pW}`} strokeDashoffset={-pB}
                style={{ transition: 'stroke-dasharray 0.6s ease' }} />
            )}
            {pB > 0 && (
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--critical)" strokeWidth="3.2"
                strokeDasharray={`${pB} ${100 - pB}`}
                style={{ transition: 'stroke-dasharray 0.6s ease' }} />
            )}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span className="tnum" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: breached ? 'var(--critical)' : 'var(--text)' }}>{breached}</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>breached</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {rows.map(r => {
            const Icon = r.icon
            const clickable = r.key === 'breached'
            const active = quickFilter === 'breached' && clickable
            return (
              <button key={r.key} onClick={clickable ? () => onQuickFilter('breached') : undefined}
                className={clickable ? 'row-hover' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 'var(--r)',
                  border: 'none', background: active ? 'var(--critical-bg)' : 'transparent',
                  cursor: clickable ? 'pointer' : 'default', textAlign: 'left',
                }}>
                <Icon size={12} style={{ color: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', flex: 1 }}>{r.label}</span>
                <span className="tnum" style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: r.value ? r.color : 'var(--text-3)' }}>{r.value}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

/* ── 3. What needs attention ──────────────────────────────── */
function Attention({ risks, quickFilter, onQuickFilter }) {
  const items = [
    { key: 'sla', label: 'Treatment plan overdue', hint: 'past the SLA the gate started',
      value: risks.filter(r => treatmentSLA(r)?.overdue).length, icon: Clock, tone: 'var(--critical)' },
    { key: 'overdue', label: 'Review overdue', hint: 'needs recertification',
      value: risks.filter(isReviewOverdue).length, icon: CalendarX, tone: 'var(--high)' },
    { key: 'pending_review', label: 'Awaiting admission', hint: 'drafts a reviewer has not admitted',
      value: risks.filter(r => normalizeWorkflowState(r.workflow_state) === 'draft').length, icon: Inbox, tone: 'var(--info)' },
  ]
  const total = items.reduce((n, i) => n + i.value, 0)

  return (
    <Panel title="Needs attention" caption={total ? `${total} item${total === 1 ? '' : 's'}` : 'all clear'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(item => {
          const Icon = item.icon
          const active = quickFilter === item.key
          return (
            <button key={item.key} onClick={() => onQuickFilter(item.key)} className="row-hover"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', borderRadius: 'var(--r-md)',
                border: `1px solid ${active ? 'var(--crimson)' : 'var(--border-3)'}`,
                background: active ? 'var(--crimson-wash)' : 'transparent', cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{
                width: 26, height: 26, borderRadius: 'var(--r-md)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.value ? 'var(--surface)' : 'transparent',
              }}>
                <Icon size={13} style={{ color: item.value ? item.tone : 'var(--text-3)' }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text)', fontWeight: 500 }}>{item.label}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>{item.hint}</span>
              </span>
              <span className="tnum" style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: item.value ? item.tone : 'var(--text-3)' }}>
                {item.value}
              </span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

export function PostureOverview({ risks, matrix, quickFilter, onQuickFilter }) {
  const toggle = key => onQuickFilter(quickFilter === key ? '' : key)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr)', gap: 12, marginBottom: 12 }}>
      <BandDistribution risks={risks} matrix={matrix} quickFilter={quickFilter} onQuickFilter={toggle} />
      <GateSummary risks={risks} quickFilter={quickFilter} onQuickFilter={toggle} />
      <Attention risks={risks} quickFilter={quickFilter} onQuickFilter={toggle} />
    </div>
  )
}

/* ── Lifecycle pipeline ───────────────────────────────────── */
/**
 * Where every risk sits in the process, left to right. It doubles as the
 * workflow filter, which is more useful than a dropdown because it shows
 * the counts you would be choosing between.
 */
export function LifecyclePipeline({ risks, value, onChange }) {
  const counts = Object.fromEntries(WORKFLOW_STATES.map(s => [s.value, 0]))
  risks.forEach(r => { const k = normalizeWorkflowState(r.workflow_state); if (k in counts) counts[k]++ })

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: 4, marginBottom: 16, overflowX: 'auto',
    }}>
      {WORKFLOW_STATES.map((s, idx) => {
        const active = value === s.value
        const n = counts[s.value]
        return (
          <div key={s.value} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 104 }}>
            <button onClick={() => onChange(active ? '' : s.value)} title={s.desc}
              style={{
                flex: 1, textAlign: 'left', padding: '7px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                border: 'none', background: active ? s.bg : 'transparent',
                boxShadow: active ? `inset 0 0 0 1px ${s.border}` : 'none',
                transition: 'background var(--dur-2)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, opacity: n ? 1 : 0.35 }} />
                <span style={{ fontSize: 'var(--t-micro)', color: active ? s.color : 'var(--text-3)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </span>
              <span className="tnum" style={{
                display: 'block', fontSize: 'var(--t-section)', fontWeight: 600, marginTop: 1,
                color: n ? (active ? s.color : 'var(--text)') : 'var(--border-2)',
              }}>{n}</span>
            </button>
            {idx < WORKFLOW_STATES.length - 1 && (
              <ChevronRight size={12} style={{ color: 'var(--border-2)', flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Row cells ────────────────────────────────────────────── */
/**
 * Inherent and residual as one transition, because the reduction between
 * them is the thing a reader is actually looking for.
 */
export function ScoreTransition({ risk, matrix }) {
  const inh = risk.inherent_score || risk.risk_score || 0
  // Residual is scored only when both coordinates exist; the generated
  // residual_score column echoes the inherent score otherwise.
  const res = risk.residual_likelihood && risk.residual_impact ? risk.residual_score : null
  const inhMeta = bandMeta(bandForScore(inh, matrix))
  const resMeta = bandMeta(bandForScore(res, matrix))

  const chip = (score, meta, muted) => (
    <span className="tnum" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 22,
      padding: '0 6px', borderRadius: 'var(--r)', fontSize: 'var(--t-sm)', fontWeight: 600,
      color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, opacity: muted ? 0.55 : 1,
    }}>{score}</span>
  )

  if (!inh) return <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>—</span>

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} title={`Inherent ${inh} (${inhMeta.label}) → Residual ${res ?? 'not scored'}${res ? ` (${resMeta.label})` : ''}`}>
      {chip(inh, inhMeta, !!res)}
      <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)' }}>→</span>
      {res
        ? chip(res, resMeta, false)
        : <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', fontStyle: 'italic' }}>unscored</span>}
    </span>
  )
}

export function OwnerCell({ name }) {
  if (!name) return <span style={{ fontSize: 'var(--t-meta)', color: 'var(--border-2)' }}>Unassigned</span>
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: 'var(--crimson-wash)',
        color: 'var(--crimson)', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{initials}</span>
      <span className="truncate" style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>{name}</span>
    </span>
  )
}
