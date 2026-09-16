import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Search, CheckCircle, Settings,
  AlertTriangle, ShieldAlert, AlertCircle, FileWarning,
  Mail, Globe, Users, Shield, MonitorSmartphone, Cloud, Fingerprint, Share2, FileX,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import { FINDING_PROVIDERS, SEVERITY_CONFIG } from '@/lib/findings'
import { CreateFindingIncidentModal } from '@/features/findings/FindingActionModals'
import { toTriageState } from '@/lib/triage'

// Findings list for connectors whose findings are not about individual users
// (M365, Defender, SharePoint). Entra keeps its per-user view in FindingsPlatformPage.

const CONNECTOR_VIEWS = {
  m365: {
    title:        'Microsoft 365 Security',
    subtitle:     'Security Findings · Data Exposure',
    settingsPath: '/app/settings/m365',
    settingsName: 'M365 Security',
    categories: {
      exchange:   { label: 'Exchange Online', Icon: Mail,  color: '#0078D4' },
      sharepoint: { label: 'SharePoint',      Icon: Globe, color: '#038387' },
      guests:     { label: 'Guest Access',    Icon: Users, color: '#6264A7' },
    },
  },
  defender: {
    title:        'Microsoft Defender',
    subtitle:     'Security Findings · Alerts & Secure Score',
    settingsPath: '/app/settings/defender',
    settingsName: 'Defender',
    categories: {
      posture:  { label: 'Secure Score', Icon: Shield,            color: '#00B4D8' },
      endpoint: { label: 'Endpoint',     Icon: MonitorSmartphone, color: '#0F5A8A' },
      identity: { label: 'Identity',     Icon: Fingerprint,       color: '#6264A7' },
      office:   { label: 'Office 365',   Icon: Mail,              color: '#0078D4' },
      cloud:    { label: 'Cloud',        Icon: Cloud,             color: '#2B5797' },
      threat:   { label: 'Threat',       Icon: AlertTriangle,     color: '#b91c1c' },
    },
  },
  sharepoint: {
    title:        'SharePoint Security',
    subtitle:     'Security Findings · Sharing & Access',
    settingsPath: '/app/settings/sharepoint',
    settingsName: 'SharePoint',
    categories: {
      external_sharing:  { label: 'External Sharing',  Icon: Share2, color: '#b45309' },
      public_file:       { label: 'Public File',       Icon: FileX,  color: '#b91c1c' },
      guest_access:      { label: 'Guest Access',      Icon: Users,  color: '#6264A7' },
      internal_exposure: { label: 'Internal Exposure', Icon: Globe,  color: '#038387' },
    },
  },
}

export const LIST_VIEW_CONNECTORS = Object.keys(CONNECTOR_VIEWS)

const FALLBACK_CATEGORY = { Icon: ShieldAlert, color: '#5D0F0F' }

function StatCard({ label, value, icon: Icon, tone, onClick }) {
  const map = {
    total:    { color: '#1a1314', bd: '#e5e0e0', bg: '#fff',    ic: '#d4cccc' },
    critical: { color: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', ic: '#fca5a5' },
    warning:  { color: '#92400e', bd: '#fde68a', bg: '#fffbeb', ic: '#fcd34d' },
    info:     { color: '#1e40af', bd: '#bfdbfe', bg: '#eff6ff', ic: '#93c5fd' },
  }[tone]
  return (
    <div onClick={onClick}
      className="rounded-xl p-4 flex flex-col gap-2 transition-all"
      style={{ background: map.bg, border: `1px solid ${map.bd}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: map.color === '#1a1314' ? '#8a7070' : map.color }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: map.ic }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color: map.color }}>{value}</p>
    </div>
  )
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info
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

function CategoryIcon({ meta }) {
  const { Icon, color } = meta
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: `${color}15`, border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={14} style={{ color }} />
    </div>
  )
}

export function ConnectorFindingsListPage({ connectorId }) {
  const navigate = useNavigate()
  const { organization } = useAuth()

  const view     = CONNECTOR_VIEWS[connectorId]
  const provider = FINDING_PROVIDERS.find(p => p.connectorId === connectorId)

  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [findings, setFindings]   = useState([])
  const [sevFilter, setSevFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [search, setSearch]       = useState('')
  const [modal, setModal]         = useState(null)

  const categoryMeta = useCallback(
    (cat) => view?.categories[cat] || { ...FALLBACK_CATEGORY, label: cat || 'Other' },
    [view],
  )

  const load = useCallback(async () => {
    if (!organization?.id || !provider) return
    setLoading(true)
    setError(null)
    try {
      const rows = await provider.fetch(organization.id)
      setFindings(rows.flatMap(r => provider.derive(r)))
    } catch (e) {
      console.error(`[${connectorId}Findings] load error`, e)
      setError('Could not load findings. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, provider, connectorId])

  // Reset filters when switching between connectors.
  useEffect(() => { setSevFilter('all'); setCatFilter('all'); setSearch('') }, [connectorId])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total:    findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    warning:  findings.filter(f => f.severity === 'warning').length,
    info:     findings.filter(f => f.severity === 'info').length,
  }), [findings])

  const categories = useMemo(
    () => ['all', ...new Set(findings.map(f => f.subject.meta).filter(Boolean))],
    [findings],
  )

  const visible = useMemo(() => findings.filter(f => {
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (catFilter !== 'all' && f.subject.meta !== catFilter) return false
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${f.title} ${f.subject.name || ''} ${f.description || ''} ${f.control || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [findings, sevFilter, catFilter, search])

  if (!view || !provider) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Findings" />
        <div className="page-content">
          <p className="text-sm" style={{ color: '#8a7070' }}>Unknown connector.</p>
        </div>
      </div>
    )
  }

  const SEV_TABS = [
    ['all',      `All (${counts.total})`],
    ['critical', `Critical (${counts.critical})`],
    ['warning',  `Warning (${counts.warning})`],
    ['info',     `Info (${counts.info})`],
  ]

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={view.title}
        subtitle={view.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => navigate(view.settingsPath)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <Settings size={13} /> Scan settings
            </button>
            <button onClick={() => navigate('/app/findings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back to Findings
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Findings" value={counts.total}    icon={FileWarning}   tone="total"    onClick={() => setSevFilter('all')} />
          <StatCard label="Critical"       value={counts.critical} icon={AlertTriangle} tone="critical" onClick={() => setSevFilter('critical')} />
          <StatCard label="Warning"        value={counts.warning}  icon={ShieldAlert}   tone="warning"  onClick={() => setSevFilter('warning')} />
          <StatCard label="Informational"  value={counts.info}     icon={AlertCircle}   tone="info"     onClick={() => setSevFilter('info')} />
        </div>

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

          {categories.length > 2 && (
            <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
              {categories.map(cat => {
                const meta = cat === 'all' ? null : categoryMeta(cat)
                return (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    className="px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{
                      background: catFilter === cat ? '#fff' : 'transparent',
                      color:      catFilter === cat ? (meta?.color || '#1a1314') : '#8a7070',
                      border:     catFilter === cat ? '1px solid #e5e0e0' : '1px solid transparent',
                      fontWeight: catFilter === cat ? 500 : 400,
                    }}>
                    {cat === 'all' ? 'All categories' : meta.label}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex-1 relative" style={{ minWidth: 180 }}>
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search findings or controls…"
              className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314' }} />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <div className="rounded-xl py-10 text-center text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
            {error}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
            <CheckCircle size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#bbf7d0' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
              {findings.length === 0 ? `No ${view.settingsName} findings yet` : 'No findings match this filter'}
            </p>
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {findings.length === 0
                ? `Run a scan from ${view.settingsName} settings to pull findings.`
                : 'Try a different severity level, category or search term.'}
            </p>
            {findings.length === 0 && (
              <button onClick={() => navigate(view.settingsPath)}
                className="mt-4 text-xs px-4 py-2 rounded-lg"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                Go to {view.settingsName} settings
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map(finding => {
              const catMeta = categoryMeta(finding.subject.meta)
              // Posture findings use the control title as the subject; don't repeat it.
              const showSubject = finding.subject.name && finding.subject.name !== finding.title
              return (
                <div key={finding.key}
                  className="rounded-xl p-4 transition-all"
                  style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

                  <div className="flex items-start gap-3 mb-3">
                    <CategoryIcon meta={catMeta} />
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
                      {showSubject && (
                        <p className="text-xs" style={{ color: '#8a7070' }}>
                          {finding.subject.name}
                          {finding.subject.email && ` · ${finding.subject.email}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {finding.description && (
                    <p className="text-xs leading-relaxed mb-3" style={{ color: '#4a3a3a' }}>
                      {finding.description}
                    </p>
                  )}

                  <div className="flex flex-col gap-1.5 mb-3 p-3 rounded-lg" style={{ background: '#f8f7f7', border: '1px solid #f0ecec' }}>
                    {finding.control && (
                      <p className="text-[11px] font-semibold" style={{ color: '#5D0F0F' }}>{finding.control}</p>
                    )}
                    <p className="text-xs leading-relaxed" style={{ color: '#6b5555', whiteSpace: 'pre-line' }}>{finding.recommendation}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate('/app/risks/triage', { state: { finding: toTriageState(finding) } })}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#fef2f2]"
                      style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
                      Triage finding
                    </button>
                    <button
                      onClick={() => setModal({ type: 'incident', finding })}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#f5f3f3]"
                      style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
                      Raise Incident
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal?.type === 'incident' && (
        <CreateFindingIncidentModal
          finding={modal.finding}
          onClose={() => setModal(null)}
          onCreated={() => setModal(null)}
        />
      )}
    </div>
  )
}
