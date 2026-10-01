import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles, RefreshCw, ChevronDown, Check, X, RotateCcw, ExternalLink, AlertTriangle, Activity, FileWarning,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { MetricStrip } from '@/components/ui/Metric'
import { FilterBar } from '@/components/ui/Filters'
import { EmptyState } from '@/components/ui/EmptyState'
import { SelectField } from '@/components/ui/Combobox'
import { Spinner } from '@/components/ui/Spinner'
import { useUnsavedChanges } from '@/components/layout/LeaveGuard'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useRiskSuggestions } from '@/hooks/useRiskSuggestions'
import { RISK_CATEGORIES, RISK_SUBCATEGORIES } from '@/lib/risks'
import { bandFor, bandMeta, DEFAULT_LIKELIHOOD_SCALE, DEFAULT_IMPACT_SCALE } from '@/lib/matrix'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── Suggested risks ──────────────────────────────────────────────────────────
 *
 * RISYS reads the connected systems and turns what it finds into risks that
 * are already written, scored and mapped to NCA ECC — one per ECC area with
 * open findings or failing measurements. The person's job is to approve them.
 *
 *   Approve to register  — admitted straight to the register (risk manager /
 *                          admin), findings linked as triaged
 *   Add as draft         — goes to the register as a draft for review
 *   Edit                 — every field, before deciding; edits survive refreshes
 *   Dismiss              — with a reason; comes back only if new problems appear
 *
 * Suggestions refresh after every scan and nightly, and retire themselves when
 * the findings behind them are fixed.
 * -------------------------------------------------------------------------- */

const FULL = { width: '100%', boxSizing: 'border-box' }
const FULL_TA = { ...FULL, resize: 'vertical', lineHeight: 1.5 }
const CONNECTOR = { m365: 'Microsoft 365', defender: 'Microsoft Defender', sharepoint: 'SharePoint', entra: 'Microsoft Entra ID' }
const VIEW_STATES = ['pending', 'added', 'dismissed', 'resolved']

function ScoreBadge({ l, i, size = 'md' }) {
  const meta = bandMeta(bandFor(l, i))
  const big = size === 'lg'
  return (
    <span title={`${tx('Likelihood')} ${l} × ${tx('Impact')} ${i}`} className="tnum" style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minWidth: big ? 58 : 46, height: big ? 58 : 46, borderRadius: 10, flexShrink: 0,
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    }}>
      <span style={{ fontSize: big ? 20 : 16, fontWeight: 600, lineHeight: 1 }}>{(l || 0) * (i || 0)}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 3 }}>{meta.label}</span>
    </span>
  )
}

function Scale({ label, value, onChange, scale, disabled }) {
  return (
    <div>
      <p className="field-label" style={{ marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'flex', gap: 4 }}>
        {scale.map(p => {
          const on = Number(value) === p.value
          return (
            <button key={p.value} type="button" disabled={disabled} onClick={() => onChange(p.value)}
              title={`${p.label} — ${p.definition}`} aria-pressed={on}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
                fontSize: 12.5, fontWeight: on ? 600 : 400,
                background: on ? 'var(--crimson)' : 'var(--bg-2)', color: on ? '#fff' : 'var(--text-2)',
                border: `1px solid ${on ? 'var(--crimson)' : 'var(--border)'}`,
              }}>{p.value}</button>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '5px 0 0' }}>
        {scale.find(p => p.value === Number(value))?.label || '—'}
      </p>
    </div>
  )
}

function Evidence({ items }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  if (!items.length) return <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>{tx('No open evidence.')}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {shown.map((e, n) => {
        const to = e.kind === 'finding'
          ? `/app/findings/${e.connector}`
          : `/app/compliance/${encodeURIComponent('NCA ECC')}/${e.control}`
        return (
          <Link key={`${e.kind}:${e.ref}:${e.control}:${n}`} to={to} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0',
            borderTop: n ? '1px solid var(--border-3)' : 'none', textDecoration: 'none',
          }}>
            {e.kind === 'finding'
              ? <FileWarning size={13} style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)', flexShrink: 0, marginTop: 2 }} />
              : <Activity size={13} style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)', flexShrink: 0, marginTop: 2 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{e.title}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {e.kind === 'finding' ? tx('Finding') : tx('Measurement')} · {CONNECTOR[e.connector] || e.connector} · ECC {e.control}
                {' · '}<span style={{ color: e.severity === 'critical' ? 'var(--critical)' : 'var(--medium)' }}>
                  {e.severity === 'critical' ? (e.kind === 'finding' ? tx('Critical') : tx('Failing')) : (e.kind === 'finding' ? tx('Warning') : tx('Partial'))}
                </span>
              </span>
            </span>
          </Link>
        )
      })}
      {items.length > 6 && (
        <button type="button" onClick={() => setAll(a => !a)} style={{
          alignSelf: 'flex-start', marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--crimson)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>{all ? tx('Show fewer') : tx('Show all {{n}}', { n: items.length })}</button>
      )}
    </div>
  )
}

function SuggestionCard({ s, members, riskRefs, perms, api, open, onToggle }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => pick(s))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dismissing, setDismissing] = useState(false)
  const [reason, setReason] = useState('')

  // Fresh evidence after a refresh rewrites untouched text; keep local edits.
  useEffect(() => { if (!dirty) setForm(pick(s)) }, [s, dirty])
  useUnsavedChanges(dirty)

  const set = (k) => (e) => { setDirty(true); setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e })) }
  const pending = s.status === 'pending'
  const canEdit = pending && perms.canEdit
  const items = Array.isArray(s.evidence) ? s.evidence : []
  const dup = s.existing_risk_id ? riskRefs[s.existing_risk_id] : null
  const added = s.risk_id ? riskRefs[s.risk_id] : null

  const run = async (what, fn) => {
    setBusy(what); setError('')
    try { await fn() } catch (e) { setError(e.message || tx('That did not work.')) } finally { setBusy('') }
  }
  const saveIfDirty = async () => { if (dirty) { await api.save(s.id, form); setDirty(false) } }
  const approve = (admit) => run(admit ? 'approve' : 'draft', async () => {
    await saveIfDirty()
    const riskId = await api.accept(s.id, admit)
    navigate(`/app/risks/${riskId}`)
  })

  const subs = RISK_SUBCATEGORIES?.[form.category] || []

  return (
    <div className="card" style={{ overflow: 'hidden', borderColor: open ? 'var(--border-2)' : undefined }}>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}
        onClick={onToggle}>
        <ScoreBadge l={s.inherent_likelihood} i={s.inherent_impact} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999,
              background: 'var(--rose-bg, #f6ecea)', color: 'var(--crimson)',
            }}>ECC {s.area_id} · {s.area_name ? tx(s.area_name) : ''}</span>
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
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {pending && perms.canApprove && !open && (
            <button type="button" className="btn-primary" disabled={!!busy} onClick={() => approve(true)}
              style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {busy === 'approve' ? <Spinner size="sm" /> : <Check size={13} />}{tx('Approve to register')}
            </button>
          )}
          {s.status === 'added' && added && (
            <Link to={`/app/risks/${s.risk_id}`} className="btn-secondary" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              {tx('Open')} {added.risk_id} <ExternalLink size={12} />
            </Link>
          )}
          <button type="button" className="btn-ghost" onClick={onToggle} aria-expanded={open}
            style={{ padding: 6 }} title={open ? tx('Collapse') : tx('Review and edit')}>
            <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
          </button>
        </div>
      </div>

      {/* Detail */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border-3)', padding: '16px', background: 'var(--surface)' }}>
          {dup && pending && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', marginBottom: 14,
              borderRadius: 8, background: 'var(--medium-bg)', fontSize: 12.5, color: 'var(--text-2)',
            }}>
              <AlertTriangle size={13} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 2 }} />
              <span>{tx('An existing risk may already cover this area:')}{' '}
                <Link to={`/app/risks/${s.existing_risk_id}`} style={{ color: 'var(--crimson)', fontWeight: 600 }}>{dup.risk_id} — {dup.title}</Link>.
                {' '}{tx('Dismiss this suggestion if it does.')}</span>
            </div>
          )}

          {s.status === 'dismissed' && (
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 14px' }}>
              <strong>{tx('Dismissed')}</strong> {s.decided_at ? fmtDateTime(s.decided_at) : ''}: {s.dismiss_reason}
            </p>
          )}
          {s.status === 'resolved' && (
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 14px' }}>
              {tx('The findings behind this suggestion were fixed before it was approved, so it retired itself. It comes back if they reappear.')}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 24 }}>
            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label={tx('Title')}>
                <input className="risys-input" style={FULL} value={form.title} onChange={set('title')} disabled={!canEdit} />
              </Field>
              <Field label={tx('Cause')} help={tx('A fact about today — includes what RISYS detected.')}>
                <textarea className="risys-input" style={FULL_TA} rows={3} value={form.cause || ''} onChange={set('cause')} disabled={!canEdit} />
              </Field>
              <Field label={tx('Event')} help={tx('What could happen.')}>
                <textarea className="risys-input" style={FULL_TA} rows={2} value={form.event || ''} onChange={set('event')} disabled={!canEdit} />
              </Field>
              <Field label={tx('Impact')} help={tx('The damage if it does.')}>
                <textarea className="risys-input" style={FULL_TA} rows={2} value={form.impact_statement || ''} onChange={set('impact_statement')} disabled={!canEdit} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SelectField label={tx('Category')} value={form.category || ''} disabled={!canEdit}
                  onChange={(e) => { setDirty(true); setForm(f => ({ ...f, category: e.target.value, subcategory: '' })) }}
                  options={RISK_CATEGORIES.map(c => ({ value: c, label: tx(c) }))} className="w-full" />
                <SelectField label={tx('Subcategory')} value={form.subcategory || ''} disabled={!canEdit}
                  onChange={set('subcategory')}
                  options={[{ value: '', label: tx('None') }, ...subs.map(c => ({ value: c, label: tx(c) }))]} className="w-full" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Scale label={tx('Inherent likelihood')} value={form.inherent_likelihood} scale={DEFAULT_LIKELIHOOD_SCALE}
                  disabled={!canEdit} onChange={(v) => { setDirty(true); setForm(f => ({ ...f, inherent_likelihood: v })) }} />
                <Scale label={tx('Inherent impact')} value={form.inherent_impact} scale={DEFAULT_IMPACT_SCALE}
                  disabled={!canEdit} onChange={(v) => { setDirty(true); setForm(f => ({ ...f, inherent_impact: v })) }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SelectField label={tx('Risk owner')} value={form.owner_id || ''} disabled={!canEdit} onChange={set('owner_id')}
                  options={[{ value: '', label: tx('Not assigned yet') }, ...members.map(m => ({ value: m.user_id, label: m.full_name || m.email }))]}
                  className="w-full" />
                <Field label={tx('Business unit')}>
                  <input className="risys-input" style={FULL} value={form.business_unit || ''} onChange={set('business_unit')} disabled={!canEdit}
                    placeholder={tx('e.g. IT, Finance')} />
                </Field>
              </div>
            </div>

            {/* Evidence */}
            <div>
              <p className="field-label" style={{ marginBottom: 4 }}>{tx('Why RISYS raised this')}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.5 }}>
                {tx('Mapped to NCA ECC {{ids}}. Last checked {{when}}.', {
                  ids: (s.controls || []).join(', '), when: fmtDateTime(s.last_evaluated_at),
                })}
              </p>
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 12px' }}>
                <Evidence items={items} />
              </div>
            </div>
          </div>

          {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--critical)', margin: '14px 0 0' }}>{error}</p>}

          {/* Actions */}
          {pending && (perms.canEdit || perms.canApprove) && !dismissing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-3)' }}>
              {perms.canApprove && (
                <button type="button" className="btn-ghost" onClick={() => setDismissing(true)} disabled={!!busy}
                  style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <X size={13} />{tx('Dismiss — not a risk')}
                </button>
              )}
              <span style={{ flex: 1 }} />
              {dirty && perms.canEdit && (
                <button type="button" className="btn-secondary" disabled={!!busy} style={{ fontSize: 12.5 }}
                  onClick={() => run('save', async () => { await api.save(s.id, form); setDirty(false) })}>
                  {busy === 'save' ? <Spinner size="sm" /> : tx('Save changes')}
                </button>
              )}
              {perms.canEdit && (
                <button type="button" className="btn-secondary" disabled={!!busy} style={{ fontSize: 12.5 }} onClick={() => approve(false)}
                  title={tx('Adds it to the register as a draft for a reviewer to admit')}>
                  {busy === 'draft' ? <Spinner size="sm" /> : tx('Add as draft')}
                </button>
              )}
              {perms.canApprove && (
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => approve(true)}
                  style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {busy === 'approve' ? <Spinner size="sm" /> : <Check size={13} />}{tx('Approve to register')}
                </button>
              )}
            </div>
          )}

          {pending && dismissing && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18, padding: '12px 14px',
              borderRadius: 10, background: '#fdf3f2', border: '1px solid #f1d2cf',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{tx('Why is this not a risk?')}</span>
              <input className="risys-input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={tx('e.g. Covered by RSK-0003; external sharing is approved by policy')}
                style={{ flex: '1 1 280px' }} data-guard-ignore />
              <button type="button" className="btn-secondary" style={{ fontSize: 12.5 }} onClick={() => { setDismissing(false); setReason('') }}>{tx('Cancel')}</button>
              <button type="button" className="btn-danger" style={{ fontSize: 12.5 }} disabled={reason.trim().length < 5 || !!busy}
                onClick={() => run('dismiss', async () => { await api.dismiss(s.id, reason.trim()); setDismissing(false); setReason('') })}>
                {busy === 'dismiss' ? <Spinner size="sm" /> : tx('Dismiss')}
              </button>
            </div>
          )}

          {s.status === 'dismissed' && perms.canApprove && (
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn-secondary" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                disabled={!!busy} onClick={() => run('restore', () => api.restore(s.id))}>
                {busy === 'restore' ? <Spinner size="sm" /> : <RotateCcw size={12} />}{tx('Restore to pending')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, help, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label" style={{ display: 'block', marginBottom: 5 }}>{label}</span>
      {children}
      {help && <span className="field-help" style={{ display: 'block', marginTop: 4 }}>{help}</span>}
    </label>
  )
}

function pick(s) {
  return {
    title: s.title || '', cause: s.cause || '', event: s.event || '', impact_statement: s.impact_statement || '',
    category: s.category || 'Cybersecurity', subcategory: s.subcategory || '',
    inherent_likelihood: s.inherent_likelihood || 3, inherent_impact: s.inherent_impact || 3,
    owner_id: s.owner_id || '', business_unit: s.business_unit || '',
  }
}

export function SuggestedRisksPage() {
  const { organization } = useAuth()
  const { members } = usePeople()
  const p = usePermissions()
  const api = useRiskSuggestions()
  const [picked, setPicked] = useState(null)
  const [openId, setOpenId] = useState(null)
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
            onViewChange={(v) => { setPicked(v); setOpenId(null) }}
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
              <SuggestionCard key={s.id} s={s} members={members} riskRefs={api.riskRefs} perms={perms} api={api}
                open={openId === s.id} onToggle={() => setOpenId(id => (id === s.id ? null : s.id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
