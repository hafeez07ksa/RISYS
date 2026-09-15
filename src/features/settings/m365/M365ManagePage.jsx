import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, RotateCw, CheckCircle,
  Mail, Globe, Users, ShieldAlert, Shield, ToggleLeft, ToggleRight, Save,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { callEdgeFunction } from '@/lib/functions'

// ── Scan scope definitions ────────────────────────────────────────────────────
// Each scope maps to a category in m365_findings and a Graph API permission.
// Customers can enable/disable each independently.
export const M365_SCOPES = [
  {
    id:          'exchange',
    label:       'Exchange Online',
    icon:        Mail,
    color:       '#0078D4',
    permission:  'Mail.ReadBasic.All',
    description: 'Detects inbox rules that auto-forward email to external addresses — a primary data exfiltration vector.',
    control:     'SDAIA PDPL Art.19 · NCA ECC 2-5-1',
    defaultOn:   true,
  },
  {
    id:          'sharepoint',
    label:       'SharePoint',
    icon:        Globe,
    color:       '#038387',
    permission:  'Sites.Read.All',
    description: 'Identifies SharePoint sites with external or anonymous sharing enabled.',
    control:     'SDAIA PDPL Art.19 · NCA ECC 2-5-3',
    defaultOn:   true,
  },
  {
    id:          'guests',
    label:       'Guest Access Review',
    icon:        Users,
    color:       '#6264A7',
    permission:  'Directory.Read.All',
    description: 'Flags guest accounts older than 30 days that have not been reviewed or removed.',
    control:     'NCA ECC 2-1-4 · SDAIA PDPL Art.32',
    defaultOn:   true,
  },
]

const DEFAULT_SCOPES = M365_SCOPES.filter(s => s.defaultOn).map(s => s.id)

const SEVERITY_STYLE = {
  critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  warning:  { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  info:     { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
}

const CATEGORY_META = {
  exchange:   { label: 'Exchange Online', icon: Mail,  color: '#0078D4' },
  sharepoint: { label: 'SharePoint',      icon: Globe, color: '#038387' },
  guests:     { label: 'Guest Access',    icon: Users, color: '#6264A7' },
}

// ── Scope toggle component ────────────────────────────────────────────────────
function ScopeToggle({ scope, enabled, onChange, saving }) {
  const Icon = scope.icon
  return (
    <div className="flex items-start gap-4 px-5 py-4"
      style={{ borderBottom: '1px solid #f5f3f3' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: enabled ? `${scope.color}15` : '#f5f3f3',
        border: `1px solid ${enabled ? `${scope.color}30` : '#e5e0e0'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        <Icon size={15} style={{ color: enabled ? scope.color : '#b0a8a8' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium" style={{ color: enabled ? '#1a1314' : '#8a7070' }}>
            {scope.label}
          </p>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '1px 6px', borderRadius: 20,
            background: '#f5f3f3', color: '#8a7070', border: '1px solid #e5e0e0',
            fontFamily: 'var(--font-mono)',
          }}>{scope.permission}</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#8a7070' }}>{scope.description}</p>
        <p className="text-[11px] mt-0.5 font-medium" style={{ color: '#5D0F0F' }}>{scope.control}</p>
      </div>
      <button
        onClick={() => !saving && onChange(scope.id, !enabled)}
        disabled={saving}
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          padding: 4, opacity: saving ? 0.5 : 1,
        }}>
        {enabled
          ? <ToggleRight size={28} style={{ color: '#5D0F0F' }} />
          : <ToggleLeft  size={28} style={{ color: '#d4cccc' }} />}
      </button>
    </div>
  )
}

// ── Finding row ───────────────────────────────────────────────────────────────
function FindingRow({ finding }) {
  const sev = SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.info
  const cat = CATEGORY_META[finding.category] || CATEGORY_META.exchange
  const CatIcon = cat.icon
  return (
    <div className="flex items-start gap-4 px-5 py-4"
      style={{ borderTop: '1px solid #f5f3f3' }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: sev.bg, border: `1px solid ${sev.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ShieldAlert size={15} style={{ color: sev.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '2px 7px', borderRadius: 20,
            background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`,
          }}>{finding.severity}</span>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
            background: '#f5f3f3', color: '#8a7070', border: '1px solid #e5e0e0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <CatIcon size={9} /> {cat.label}
          </span>
        </div>
        <p className="text-sm font-medium mb-0.5" style={{ color: '#1a1314' }}>{finding.title}</p>
        <p className="text-xs leading-relaxed mb-1" style={{ color: '#8a7070' }}>{finding.description}</p>
        <p className="text-[11px] font-medium" style={{ color: '#5D0F0F' }}>{finding.control}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>{finding.subject_name}</p>
        {finding.subject_email && (
          <p className="text-[11px]" style={{ color: '#8a7070' }}>{finding.subject_email}</p>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function M365ManagePage() {
  const navigate = useNavigate()
  const { organization } = useAuth()

  const [tab, setTab]                   = useState('findings')
  const [findings, setFindings]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [syncMsg, setSyncMsg]           = useState(null)
  const [syncError, setSyncError]       = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Scope state — loaded from org_connectors.meta.m365_scopes
  const [enabledScopes, setEnabledScopes] = useState(new Set(DEFAULT_SCOPES))
  const [scopesDirty, setScopesDirty]     = useState(false)
  const [savingScopes, setSavingScopes]   = useState(false)
  const [scopesSaved, setScopesSaved]     = useState(false)

  // Load scopes from DB on mount
  useEffect(() => {
    if (!organization?.id) return
    supabase
      .from('org_connectors')
      .select('meta')
      .eq('org_id', organization.id)
      .eq('connector_id', 'entra')
      .single()
      .then(({ data }) => {
        if (data?.meta?.m365_scopes) {
          setEnabledScopes(new Set(data.meta.m365_scopes))
        }
      })
  }, [organization?.id])

  const fetchFindings = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('m365_findings')
      .select('*')
      .eq('org_id', organization.id)
      .order('severity')
      .order('synced_at', { ascending: false })
    setFindings(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchFindings() }, [fetchFindings])

  // Toggle a scope on/off
  const handleScopeChange = (scopeId, value) => {
    setEnabledScopes(prev => {
      const next = new Set(prev)
      value ? next.add(scopeId) : next.delete(scopeId)
      return next
    })
    setScopesDirty(true)
    setScopesSaved(false)
  }

  // Persist scope choices to org_connectors.meta.m365_scopes
  const handleSaveScopes = async () => {
    setSavingScopes(true)
    try {
      const { data: conn } = await supabase
        .from('org_connectors')
        .select('meta')
        .eq('org_id', organization.id)
        .eq('connector_id', 'entra')
        .single()

      const updatedMeta = { ...(conn?.meta || {}), m365_scopes: [...enabledScopes] }

      await supabase
        .from('org_connectors')
        .update({ meta: updatedMeta })
        .eq('org_id', organization.id)
        .eq('connector_id', 'entra')

      setScopesDirty(false)
      setScopesSaved(true)
      setTimeout(() => setScopesSaved(false), 3000)
    } catch (e) {
      console.error('Failed to save scopes', e)
    } finally {
      setSavingScopes(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null); setSyncError(false)
    try {
      const data = await callEdgeFunction('m365-security', { org_id: organization.id })
      const parts = [`Found ${data.findings_upserted} findings`]
      if (data.breakdown?.exchange  !== undefined) parts.push(`Exchange: ${data.breakdown.exchange}`)
      if (data.breakdown?.sharepoint !== undefined) parts.push(`SharePoint: ${data.breakdown.sharepoint}`)
      if (data.breakdown?.guests    !== undefined) parts.push(`Guests: ${data.breakdown.guests}`)
      if (data.skipped?.length) parts.push(`Skipped (disabled): ${data.skipped.join(', ')}`)
      setSyncMsg(parts.join(' · '))
      await fetchFindings()
    } catch (err) {
      setSyncMsg(err.message); setSyncError(true)
    } finally {
      setSyncing(false)
    }
  }

  const counts = {
    total:      findings.length,
    critical:   findings.filter(f => f.severity === 'critical').length,
    warning:    findings.filter(f => f.severity === 'warning').length,
    exchange:   findings.filter(f => f.category === 'exchange').length,
    sharepoint: findings.filter(f => f.category === 'sharepoint').length,
    guests:     findings.filter(f => f.category === 'guests').length,
  }

  const filtered = categoryFilter === 'all'
    ? findings
    : findings.filter(f => f.category === categoryFilter)

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Microsoft 365 Security"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={fetchFindings}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => navigate('/app/settings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* Connection card */}
        <div className="rounded-xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-4 px-5 py-4">
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={20} style={{ color: '#0078D4' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#1a1314' }}>Microsoft 365 Security</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>● Active</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: '#f5f3f3', color: '#8a7070', border: '1px solid #e5e0e0' }}>
                  {enabledScopes.size} of {M365_SCOPES.length} scans enabled
                </span>
              </div>
              <p className="text-xs" style={{ color: '#8a7070' }}>
                Powered by Microsoft Graph API · Uses Entra ID connection
              </p>
              {syncMsg && (
                <p className="text-[11px] mt-1 font-medium" style={{ color: syncError ? '#b91c1c' : '#166534' }}>
                  {syncError ? '✗ ' : '✓ '}{syncMsg}
                </p>
              )}
            </div>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg flex-shrink-0"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? <Spinner size="sm" /> : <RotateCw size={13} />}
              {syncing ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-5" style={{ borderBottom: '1px solid #e5e0e0' }}>
          {[
            { id: 'findings', label: 'Findings', badge: counts.total > 0 ? counts.total : null },
            { id: 'scopes',   label: 'Scan Scope' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs -mb-px border-b-2 transition-colors"
              style={{
                color: tab === t.id ? '#1a1314' : '#8a7070',
                borderBottomColor: tab === t.id ? '#5D0F0F' : 'transparent',
                fontWeight: tab === t.id ? 500 : 400,
              }}>
              {t.label}
              {t.badge && (
                <span className="ml-1 px-1.5 rounded-full text-[10px] font-semibold"
                  style={{ background: '#fef2f2', color: '#b91c1c' }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── FINDINGS TAB ─────────────────────────────────────────────────── */}
        {tab === 'findings' && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Findings', val: counts.total,      warn: counts.total > 0 },
                { label: 'Critical',       val: counts.critical,   warn: counts.critical > 0 },
                { label: 'Exchange',       val: counts.exchange,   warn: false },
                { label: 'SharePoint',     val: counts.sharepoint, warn: false },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4"
                  style={{ background: '#fff', border: `1px solid ${s.warn && s.val > 0 ? '#fecaca' : '#e5e0e0'}` }}>
                  <p className="text-[10px] uppercase tracking-widest mb-2"
                    style={{ color: s.warn && s.val > 0 ? '#b91c1c' : '#8a7070' }}>{s.label}</p>
                  <p className="text-3xl font-light"
                    style={{ color: s.warn && s.val > 0 ? '#b91c1c' : '#1a1314' }}>{s.val}</p>
                </div>
              ))}
            </div>

            {/* Category filter */}
            <div className="flex gap-1 p-1 rounded-lg mb-4 w-fit" style={{ background: '#f5f3f3' }}>
              {[
                ['all',        'All'],
                ['exchange',   'Exchange'],
                ['sharepoint', 'SharePoint'],
                ['guests',     'Guest Access'],
              ].map(([val, label]) => (
                <button key={val} onClick={() => setCategoryFilter(val)}
                  className="px-3 py-1.5 rounded-md text-xs transition-colors"
                  style={{
                    background: categoryFilter === val ? '#fff' : 'transparent',
                    color:      categoryFilter === val ? '#1a1314' : '#8a7070',
                    border:     categoryFilter === val ? '1px solid #e5e0e0' : '1px solid transparent',
                    fontWeight: categoryFilter === val ? 500 : 400,
                  }}>{label}</button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                <CheckCircle size={30} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
                  {findings.length === 0 ? 'No scan results yet' : 'No findings in this category'}
                </p>
                {findings.length === 0 && (
                  <>
                    <p className="text-xs mb-4" style={{ color: '#8a7070' }}>
                      Click Scan Now to check your enabled scopes
                    </p>
                    <button onClick={handleSync} disabled={syncing}
                      className="text-xs px-4 py-2 rounded-lg"
                      style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                      {syncing ? 'Scanning...' : 'Scan Now'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <div className="px-5 py-3" style={{ background: '#f8f7f7', borderBottom: '1px solid #e5e0e0' }}>
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#8a7070' }}>
                    {filtered.length} finding{filtered.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {filtered.map(f => <FindingRow key={f.id} finding={f} />)}
              </div>
            )}
          </>
        )}

        {/* ── SCAN SCOPE TAB ───────────────────────────────────────────────── */}
        {tab === 'scopes' && (
          <div className="flex flex-col gap-5">

            {/* Notice */}
            <div className="rounded-lg px-4 py-3 flex items-start gap-3"
              style={{ background: '#f0f6ff', border: '1px solid #bfdbfe' }}>
              <Shield size={14} style={{ color: '#1e40af', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: '#1e40af' }}>Customer-controlled scan scope</p>
                <p className="text-xs" style={{ color: '#3b5bdb', lineHeight: 1.6 }}>
                  Enable only the scans your organisation has approved. Each scope maps to a specific
                  Microsoft Graph permission. Disabled scopes are completely skipped — no data is
                  read and no findings are generated. Changes take effect on the next scan.
                </p>
              </div>
            </div>

            {/* Scope toggles */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>
                  Scan Permissions
                </p>
                <p style={{ fontSize: 11, color: '#8a7070' }}>
                  {enabledScopes.size} of {M365_SCOPES.length} enabled
                </p>
              </div>
              {M365_SCOPES.map(scope => (
                <ScopeToggle
                  key={scope.id}
                  scope={scope}
                  enabled={enabledScopes.has(scope.id)}
                  onChange={handleScopeChange}
                  saving={savingScopes}
                />
              ))}
            </div>

            {/* Save button */}
            {(scopesDirty || scopesSaved) && (
              <div className="flex items-center justify-between px-1">
                <p className="text-xs" style={{ color: scopesSaved ? '#166534' : '#8a7070' }}>
                  {scopesSaved ? '✓ Scope preferences saved' : 'You have unsaved changes'}
                </p>
                <button
                  onClick={handleSaveScopes}
                  disabled={savingScopes || !scopesDirty}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg"
                  style={{
                    background: scopesDirty ? '#5D0F0F' : '#f5f3f3',
                    color: scopesDirty ? '#fff' : '#8a7070',
                    border: 'none', opacity: savingScopes ? 0.6 : 1,
                  }}>
                  {savingScopes ? <Spinner size="sm" /> : <Save size={12} />}
                  {savingScopes ? 'Saving…' : 'Save Scope Settings'}
                </button>
              </div>
            )}

            {/* Permission reference */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>
                  Microsoft Graph Permissions Required
                </p>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {M365_SCOPES.map((s, i, arr) => {
                  const Icon = s.icon
                  return (
                    <div key={s.id} style={{
                      display: 'flex', gap: 16, alignItems: 'center', padding: '10px 10px',
                      borderBottom: i < arr.length - 1 ? '1px solid #f5f3f3' : 'none',
                      background: i % 2 === 0 ? '#fafafa' : '#fff',
                      opacity: enabledScopes.has(s.id) ? 1 : 0.45,
                    }}>
                      <Icon size={13} style={{ color: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1a1314', width: 220, flexShrink: 0 }}>
                        {s.permission}
                      </span>
                      <span style={{ fontSize: 12, color: '#8a7070' }}>
                        {s.label} · {enabledScopes.has(s.id) ? 'Active' : 'Disabled — not used'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
