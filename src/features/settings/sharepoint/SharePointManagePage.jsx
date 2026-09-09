import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, RotateCw, Globe, Share2,
  FileX, Users, AlertTriangle, CheckCircle, X, ExternalLink,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { useConnectors } from '@/hooks/useConnectors'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { SEVERITY_CONFIG } from '@/lib/findings'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_META = {
  external_sharing:  { label: 'External Sharing', Icon: Share2, color: '#dc2626' },
  public_file:       { label: 'Public File',       Icon: FileX,  color: '#b91c1c' },
  guest_access:      { label: 'Guest Access',      Icon: Users,  color: '#d97706' },
  internal_exposure: { label: 'Internal Exposure', Icon: Globe,  color: '#2563eb' },
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_CONFIG[severity]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: '2px 7px',
      borderRadius: 20, whiteSpace: 'nowrap',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, tone }) {
  const map = {
    total:    { color: '#1a1314', bd: '#e5e0e0', bg: '#fff',    ic: '#d4cccc' },
    critical: { color: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', ic: '#fca5a5' },
    warning:  { color: '#92400e', bd: '#fde68a', bg: '#fffbeb', ic: '#fcd34d' },
    info:     { color: '#1e40af', bd: '#bfdbfe', bg: '#eff6ff', ic: '#93c5fd' },
    teal:     { color: '#0f766e', bd: '#99f6e4', bg: '#f0fdfa', ic: '#5eead4' },
  }[tone]
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: map.bg, border: `1px solid ${map.bd}` }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: map.color === '#1a1314' ? '#8a7070' : map.color }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: map.ic }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color: map.color }}>{value}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SharePointManagePage() {
  const navigate               = useNavigate()
  const { organization }       = useAuth()
  const { getValidEntraToken } = useConnectors()

  const [findings, setFindings]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)
  const [syncError, setSyncError] = useState(false)
  const [sevFilter, setSevFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')

  const fetchFindings = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('sharepoint_findings')
      .select('*')
      .eq('org_id', organization.id)
      .order('severity')
    setFindings(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchFindings() }, [fetchFindings])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null); setSyncError(false)
    try {
      await getValidEntraToken()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sharepoint-security`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ org_id: organization.id }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      const parts = [`Scanned ${data.breakdown?.sites_scanned ?? 0} sites · Found ${data.findings_upserted} findings`]
      if (data.breakdown?.external_sharing) parts.push(`External sharing: ${data.breakdown.external_sharing}`)
      if (data.breakdown?.public_files)     parts.push(`Public files: ${data.breakdown.public_files}`)
      if (data.breakdown?.guest_access)     parts.push(`Guest access: ${data.breakdown.guest_access}`)
      setSyncMsg(parts.join(' · '))
      await fetchFindings()
    } catch (err) {
      setSyncMsg(err.message); setSyncError(true)
    } finally {
      setSyncing(false)
    }
  }

  const counts = {
    total:            findings.length,
    critical:         findings.filter(f => f.severity === 'critical').length,
    warning:          findings.filter(f => f.severity === 'warning').length,
    external_sharing: findings.filter(f => f.category === 'external_sharing').length,
    public_files:     findings.filter(f => f.category === 'public_file').length,
    guest_access:     findings.filter(f => f.category === 'guest_access').length,
  }

  const categories = ['all', ...new Set(findings.map(f => f.category))]

  const visible = findings.filter(f => {
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (catFilter !== 'all' && f.category !== catFilter) return false
    return true
  })

  const SEV_TABS = [
    ['all',      `All (${findings.length})`],
    ['critical', `Critical (${counts.critical})`],
    ['warning',  `Warning (${counts.warning})`],
  ]

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="SharePoint Security"
        subtitle="External Sharing · File Exposure · Guest Access"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={fetchFindings}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg flex-shrink-0"
              style={{ background: '#038387', color: '#fff', border: 'none', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? <Spinner size="sm" /> : <RotateCw size={13} />}
              {syncing ? 'Scanning...' : 'Scan Sites'}
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

        {/* Sync message */}
        {syncMsg && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-xs"
            style={{ background: syncError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${syncError ? '#fecaca' : '#bbf7d0'}`, color: syncError ? '#b91c1c' : '#166534' }}>
            {syncError ? <AlertTriangle size={13} /> : <CheckCircle size={13} />}
            {syncMsg}
            <button onClick={() => setSyncMsg(null)} className="ml-auto"><X size={12} /></button>
          </div>
        )}

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Findings"    value={counts.total}            icon={Globe}         tone="total" />
          <StatCard label="Critical"          value={counts.critical}         icon={AlertTriangle} tone="critical" />
          <StatCard label="External Sharing"  value={counts.external_sharing} icon={Share2}        tone="warning" />
          <StatCard label="Guest Access"      value={counts.guest_access}     icon={Users}         tone="teal" />
        </div>

        {/* PDPL callout */}
        <div className="mb-5 px-4 py-3 rounded-xl flex items-start gap-3"
          style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', border: '1px solid #93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Globe size={14} style={{ color: '#1d4ed8' }} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: '#1e3a8a' }}>PDPL & NCA ECC Relevance</p>
            <p className="text-xs leading-relaxed" style={{ color: '#1e40af' }}>
              SharePoint external sharing and publicly accessible files may constitute unauthorised disclosure of personal data under SDAIA PDPL Article 5 and Article 13.
              Findings here map directly to NCA ECC 2-3 (Information Asset Classification) and 2-5 (Data Protection).
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
            {SEV_TABS.map(([val, lbl]) => (
              <button key={val} onClick={() => setSevFilter(val)}
                className="px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background: sevFilter === val ? '#fff' : 'transparent',
                  color:      sevFilter === val ? '#1a1314' : '#8a7070',
                  border:     sevFilter === val ? '1px solid #e5e0e0' : '1px solid transparent',
                  fontWeight: sevFilter === val ? 500 : 400,
                }}>{lbl}</button>
            ))}
          </div>

          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
            {categories.map(cat => {
              const meta = cat === 'all' ? null : CATEGORY_META[cat]
              return (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className="px-3 py-1.5 rounded-md text-xs transition-colors"
                  style={{
                    background: catFilter === cat ? '#fff' : 'transparent',
                    color:      catFilter === cat ? (meta?.color || '#1a1314') : '#8a7070',
                    border:     catFilter === cat ? '1px solid #e5e0e0' : '1px solid transparent',
                    fontWeight: catFilter === cat ? 500 : 400,
                  }}>
                  {cat === 'all' ? 'All categories' : (meta?.label || cat)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <CheckCircle size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#bbf7d0' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
              {findings.length === 0 ? 'No SharePoint findings yet' : 'No findings match this filter'}
            </p>
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {findings.length === 0
                ? 'Click Scan Sites to scan SharePoint for external sharing and file exposure.'
                : 'Try a different severity level or category.'}
            </p>
            {findings.length === 0 && (
              <button onClick={handleSync} disabled={syncing}
                className="mt-4 text-xs px-4 py-2 rounded-lg"
                style={{ background: '#038387', color: '#fff', border: 'none' }}>
                {syncing ? 'Scanning...' : 'Scan Sites'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map(finding => {
              const catMeta = CATEGORY_META[finding.category] || { label: finding.category, Icon: Globe, color: '#5D0F0F' }
              return (
                <div key={finding.finding_id}
                  className="rounded-xl p-4"
                  style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

                  <div className="flex items-start gap-3 mb-3">
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: `${catMeta.color}15`, border: `1px solid ${catMeta.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <catMeta.Icon size={14} style={{ color: catMeta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-medium" style={{ color: '#1a1314' }}>{finding.title}</p>
                        <SeverityBadge severity={finding.severity} />
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                          background: `${catMeta.color}12`, color: catMeta.color,
                          border: `1px solid ${catMeta.color}30`,
                        }}>
                          {catMeta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs" style={{ color: '#8a7070' }}>{finding.subject_name}</p>
                        {finding.subject_url && (
                          <a href={finding.subject_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs"
                            style={{ color: '#038387' }}
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink size={10} /> Open
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed mb-3" style={{ color: '#4a3a3a' }}>
                    {finding.description}
                  </p>

                  <div className="flex flex-col gap-1.5 p-3 rounded-lg" style={{ background: '#f8f7f7', border: '1px solid #f0ecec' }}>
                    <p className="text-[11px] font-semibold" style={{ color: '#5D0F0F' }}>{finding.control}</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#6b5555' }}>{finding.recommendation}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
