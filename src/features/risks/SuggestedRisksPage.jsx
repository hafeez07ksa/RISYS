import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, RefreshCw, ChevronRight, Check, ExternalLink } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { MetricStrip } from '@/components/ui/Metric'
import { FilterBar } from '@/components/ui/Filters'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useRiskSuggestions } from '@/hooks/useRiskSuggestions'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'
import { CONNECTOR, VIEW_STATES, ScoreBadge } from './suggestionParts'

/* ── Suggested risks ──────────────────────────────────────────────────────────
 *
 * RISYS reads the connected systems and turns what it finds into risks that
 * are already written, scored and mapped to NCA ECC — one per ECC area with
 * open findings or failing measurements. The person's job is to approve them.
 *
 * The list shows each suggestion with a one-click Approve to register. Opening
 * a row goes to its own page (/app/risks/suggestions/:id) to edit every field,
 * read the evidence, add it as a draft or dismiss it with a reason.
 *
 * Suggestions refresh after every scan and nightly, and retire themselves when
 * the findings behind them are fixed.
 * -------------------------------------------------------------------------- */

function SuggestionRow({ s, riskRefs, perms, api }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = s.status === 'pending'
  const added = s.risk_id ? riskRefs[s.risk_id] : null
  const open = () => navigate(`/app/risks/suggestions/${s.id}`)

  const approve = async (e) => {
    e.stopPropagation()
    setBusy(true); setError('')
    try { const riskId = await api.accept(s.id, true); navigate(`/app/risks/${riskId}`) }
    catch (err) { setError(err.message || tx('That did not work.')); setBusy(false) }
  }

  return (
    <div className="card row-hover" role="link" tabIndex={0}
      onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}
      style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}>
      <ScoreBadge l={s.inherent_likelihood} i={s.inherent_impact} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999,
            background: 'var(--rose-bg, #f6ecea)', color: 'var(--crimson)',
          }}>ECC {s.area_id}{s.area_name ? ` · ${tx(s.area_name)}` : ''}</span>
          {s.reraised_at && pending && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--medium)' }}>{tx('Raised again — new findings')}</span>
          )}
          {s.edited && pending && <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{tx('Edited')}</span>}
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{s.title}</p>
        <p className="tnum" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
          {[
            s.open_findings > 0 && tx('{{n}} findings', { n: s.open_findings }) + (s.critical_findings ? ` (${tx('{{n}} critical', { n: s.critical_findings })})` : ''),
            s.failing_signals > 0 && tx('{{n}} failing measurements', { n: s.failing_signals }),
            (s.connectors || []).map(c => CONNECTOR[c] || c).join(', '),
          ].filter(Boolean).join(' · ')}
        </p>
        {s.status === 'dismissed' && s.dismiss_reason && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>{tx('Dismissed')}: {s.dismiss_reason}</p>
        )}
        {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--critical)' }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {pending && perms.canApprove && (
          <button type="button" className="btn-primary" disabled={busy} onClick={approve}
            style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy ? <Spinner size="sm" /> : <Check size={13} />}{tx('Approve to register')}
          </button>
        )}
        {s.status === 'added' && added && (
          <Link to={`/app/risks/${s.risk_id}`} onClick={(e) => e.stopPropagation()} className="btn-secondary"
            style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            {tx('Open')} {added.risk_id} <ExternalLink size={12} />
          </Link>
        )}
        <ChevronRight size={16} className="rtl-flip" style={{ color: 'var(--text-3)' }} aria-hidden />
      </div>
    </div>
  )
}

export function SuggestedRisksPage() {
  const { organization } = useAuth()
  const p = usePermissions()
  const api = useRiskSuggestions()
  const [picked, setPicked] = useState(null)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState('')
  const [search, setSearch] = useState('')

  const perms = { canApprove: !!p.canApproveReject, canEdit: !!p.canTriageFindings }

  const counts = useMemo(() => Object.fromEntries(VIEW_STATES.map(s => [s, api.rows.filter(r => r.status === s).length])), [api.rows])
  const view = picked ?? (counts.pending > 0 || !api.rows.length ? 'pending' : 'added')
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return api.rows
      .filter(r => r.status === view)
      .filter(r => !q || [r.title, r.area_id, r.area_name].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.inherent_likelihood * b.inherent_impact) - (a.inherent_likelihood * a.inherent_impact)
        || b.critical_findings - a.critical_findings)
  }, [api.rows, view, search])

  const lastChecked = api.rows.reduce((m, r) => (!m || r.last_evaluated_at > m ? r.last_evaluated_at : m), null)

  const checkNow = async () => {
    setChecking(true); setCheckMsg('')
    try {
      const r = await api.checkNow()
      setCheckMsg(r?.new
        ? tx('{{n}} new suggested risks found.', { n: r.new })
        : tx('Up to date — no new risks in the latest findings.'))
    } catch (e) { setCheckMsg(e.message) } finally { setChecking(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title={tx('Suggested risks')}
        subtitle={organization?.name}
        actions={perms.canEdit && (
          <button type="button" className="btn-secondary" onClick={checkNow} disabled={checking}
            style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {checking ? <Spinner size="sm" /> : <RefreshCw size={13} />}{tx('Check now')}
          </button>
        )}
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, maxWidth: 860 }}>
          <Sparkles size={16} style={{ color: 'var(--crimson)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
            {tx('RISYS reads your connected systems and turns what it finds into risks — written, scored and mapped to NCA ECC. Approve them into the register, adjust anything first, or dismiss them with a reason. Suggestions update after every scan and retire themselves when the findings behind them are fixed.')}
            {lastChecked && <span style={{ color: 'var(--text-3)' }}> {tx('Last checked {{when}}.', { when: fmtDateTime(lastChecked) })}</span>}
            {checkMsg && <strong style={{ color: 'var(--text)', fontWeight: 600 }}> {checkMsg}</strong>}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Awaiting approval'), value: counts.pending, tone: counts.pending ? 'medium' : undefined },
            { label: tx('Approved'), value: counts.added },
            { label: tx('Dismissed'), value: counts.dismissed },
            { label: tx('Fixed before approval'), value: counts.resolved },
          ]} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={tx('Search suggested risks…')}
            views={[
              { value: 'pending', label: 'Awaiting approval', count: counts.pending },
              { value: 'added', label: 'Approved', count: counts.added },
              { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
              { value: 'resolved', label: 'Fixed before approval', count: counts.resolved },
            ]}
            activeView={view}
            onViewChange={setPicked}
          />
        </div>

        {api.loading && !api.rows.length ? (
          <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Sparkles}
              title={view === 'pending' ? tx('No risks waiting for approval') : tx('Nothing here')}
              description={view === 'pending'
                ? tx('RISYS raises a suggested risk when a connected system reports problems in an NCA ECC area. Connect Microsoft 365 and run a scan, or use Check now.')
                : tx('Suggested risks you decide on appear here.')}
              filtered={!!search}
              onClearFilters={() => setSearch('')}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(s => (
              <SuggestionRow key={s.id} s={s} riskRefs={api.riskRefs} perms={perms} api={api} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
