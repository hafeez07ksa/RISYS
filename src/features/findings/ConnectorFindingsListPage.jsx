import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Search, CheckCircle, Settings, ExternalLink,
  AlertTriangle, ShieldAlert, AlertCircle, FileWarning, Siren,
  Mail, Globe, Users, Shield, MonitorSmartphone, Cloud, Fingerprint, Share2, FileX, Bug,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { useFindingTriage } from '@/hooks/useTriage'
import { useConnectorScans } from '@/hooks/useConnectorScans'
import { Spinner } from '@/components/ui/Spinner'
import { FINDING_PROVIDERS, SEVERITY_CONFIG, SEVERITY_RANK, findingDisplayTitle } from '@/lib/findings'
import { CreateFindingIncidentModal } from '@/features/findings/FindingActionModals'
import { ScanHealthBanner } from '@/features/findings/ScanHealth'
import { toTriageState, closeReasonMeta } from '@/lib/triage'
import { ControlReferences } from '@/components/ui/ControlReferences'

// Findings list for connectors whose findings are not about individual users
// (M365, Defender, SharePoint). Entra keeps its per-user view in FindingsPlatformPage.
//
// "Raise incident" is offered only where a finding describes something that is
// happening or exposed now (an alert, a public file, mail leaving the org).
// Configuration and vulnerability findings are weaknesses: they go to triage.

const CONNECTOR_VIEWS = {
  m365: {
    title:        'Microsoft 365 Security',
    subtitle:     'Security Findings · Data Exposure',
    settingsPath: '/app/settings/m365',
    settingsName: 'M365 Security',
    canRaiseIncident: f => f.subject.meta === 'exchange',
    categories: {
      exchange:   { label: 'Exchange Online', Icon: Mail,  color: '#0078D4' },
      sharepoint: { label: 'SharePoint',      Icon: Globe, color: '#038387' },
      guests:     { label: 'Guest Access',    Icon: Users, color: '#6264A7' },
    },
  },
  defender: {
    title:        'Microsoft Defender',
    subtitle:     'Security Findings · Alerts, Posture, Vulnerabilities',
    settingsPath: '/app/settings/defender',
    settingsName: 'Defender',
    portalName:   'Defender portal',
    scans:        true,
    canRaiseIncident: f => f.source === 'alert' || (f.source === 'device' && f.severity === 'critical'),
    categories: {
      posture:       { label: 'Secure Score',  Icon: Shield,            color: '#00B4D8' },
      vulnerability: { label: 'Vulnerability', Icon: Bug,               color: '#b45309' },
      device:        { label: 'Device Health', Icon: MonitorSmartphone, color: '#0F5A8A' },
      endpoint:      { label: 'Endpoint Alert', Icon: MonitorSmartphone, color: '#b91c1c' },
      identity:      { label: 'Identity Alert', Icon: Fingerprint,      color: '#6264A7' },
      office:        { label: 'Email Alert',    Icon: Mail,             color: '#0078D4' },
      cloud:         { label: 'Cloud Alert',    Icon: Cloud,            color: '#2B5797' },
      threat:        { label: 'Threat Alert',   Icon: AlertTriangle,    color: '#b91c1c' },
    },
  },
  sharepoint: {
    title:        'SharePoint Security',
    subtitle:     'Security Findings · Sharing & Access',
    settingsPath: '/app/settings/sharepoint',
    settingsName: 'SharePoint',
    portalName:   'SharePoint',
    scans:        true,
    // An "Anyone" link or an external share is data exposed now; policy and group findings go to triage.
    canRaiseIncident: f => f.subject.meta === 'public_file' || f.subject.meta === 'external_share',
    categories: {
      public_file:       { label: '"Anyone" Links',   Icon: FileX,  color: '#b91c1c' },
      external_share:    { label: 'External Shares',  Icon: Share2, color: '#b45309' },
      tenant_policy:     { label: 'Sharing Policy',   Icon: Shield, color: '#5D0F0F' },
      guest_access:      { label: 'Guest Access',     Icon: Users,  color: '#6264A7' },
      public_group:      { label: 'Public Groups',    Icon: Users,  color: '#0F5A8A' },
      org_wide_link:     { label: 'Org-wide Links',   Icon: Globe,  color: '#038387' },
      external_sharing:  { label: 'External Sharing', Icon: Share2, color: '#b45309' },
      internal_exposure: { label: 'Exposure',         Icon: Globe,  color: '#038387' },
    },
  },
}

export const LIST_VIEW_CONNECTORS = Object.keys(CONNECTOR_VIEWS)

const FALLBACK_CATEGORY = { Icon: ShieldAlert, color: '#5D0F0F' }
const PAGE_SIZE = 50

const TRIAGE_BADGE = {
  created:  { label: 'Risk created',       color: '#5D0F0F', bg: '#F6EBE8', bd: '#e8cfc9' },
  attached: { label: 'Attached to a risk', color: '#5D0F0F', bg: '#F6EBE8', bd: '#e8cfc9' },
  closed:   { label: 'Closed',             color: '#6b5555', bg: '#f5f3f3', bd: '#e5e0e0' },
}

function StatCard({ label, value, icon: Icon, tone, active, onClick }) {
  const map = {
    total:    { color: '#1a1314', bd: '#e5e0e0', bg: '#fff',    ic: '#d4cccc' },
    critical: { color: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', ic: '#fca5a5' },
    warning:  { color: '#92400e', bd: '#fde68a', bg: '#fffbeb', ic: '#fcd34d' },
    info:     { color: '#1e40af', bd: '#bfdbfe', bg: '#eff6ff', ic: '#93c5fd' },
  }[tone]
  return (
    <button type="button" onClick={onClick}
      className="rounded-xl p-4 flex flex-col gap-2 transition-all text-left"
      style={{
        background: map.bg, border: `1px solid ${active ? map.color : map.bd}`, cursor: 'pointer',
        boxShadow: active ? `0 0 0 1px ${map.color}` : 'none',
      }}>
      <div className="flex items-center justify-between w-full">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: map.color === '#1a1314' ? '#8a7070' : map.color }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: map.ic }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color: map.color }}>{value}</p>
    </button>
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

function Pill({ color, bg, bd, children, title }) {
  return (
    <span title={title} style={{
      fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap',
      color, background: bg, border: `1px solid ${bd}`,
    }}>{children}</span>
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

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
      {options.map(([val, lbl, color]) => (
        <button key={val} onClick={() => onChange(val)}
          className="px-3 py-1.5 rounded-md text-xs transition-colors"
          style={{
            background: value === val ? '#fff' : 'transparent',
            color:      value === val ? (color || '#1a1314') : '#8a7070',
            border:     value === val ? '1px solid #e5e0e0' : '1px solid transparent',
            fontWeight: value === val ? 500 : 400,
          }}>{lbl}</button>
      ))}
    </div>
  )
}

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function ConnectorFindingsListPage({ connectorId }) {
  const navigate = useNavigate()
  const { organization } = useAuth()

  const view     = CONNECTOR_VIEWS[connectorId]
  const provider = FINDING_PROVIDERS.find(p => p.connectorId === connectorId)
  const { byKey: triageByKey } = useFindingTriage()
  const scans = useConnectorScans(connectorId, { historyLimit: 3 })

  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [findings, setFindings]       = useState([])
  const [statusView, setStatusView]   = useState('open')
  const [sevFilter, setSevFilter]     = useState('all')
  const [catFilter, setCatFilter]     = useState('all')
  const [triageFilter, setTriageFilter] = useState('all')
  const [search, setSearch]           = useState('')
  const [limit, setLimit]             = useState(PAGE_SIZE)
  const [modal, setModal]             = useState(null)

  const categoryMeta = useCallback(
    (cat) => view?.categories[cat] || { ...FALLBACK_CATEGORY, label: cat || 'Other' },
    [view],
  )

  const load = useCallback(async () => {
    if (!organization?.id || !provider) return
    setLoading(true)
    setError(null)
    try {
      const rows = provider.supportsStatus
        ? await provider.fetch(organization.id, { status: statusView })
        : await provider.fetch(organization.id)
      const list = rows.flatMap(r => provider.derive(r))
      list.sort((a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        String(a.title).localeCompare(String(b.title)))
      setFindings(list)
    } catch (e) {
      console.error(`[${connectorId}Findings] load error`, e)
      setError('Could not load findings. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, provider, connectorId, statusView])

  useEffect(() => { load() }, [load])
  useEffect(() => { setLimit(PAGE_SIZE) }, [sevFilter, catFilter, triageFilter, search, statusView])

  const refreshAll = () => { load(); scans.refresh() }

  const counts = useMemo(() => ({
    total:    findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    warning:  findings.filter(f => f.severity === 'warning').length,
    info:     findings.filter(f => f.severity === 'info').length,
    untriaged: findings.filter(f => !triageByKey.get(f.key)).length,
  }), [findings, triageByKey])

  const categories = useMemo(
    () => ['all', ...new Set(findings.map(f => f.subject.meta).filter(Boolean))],
    [findings],
  )

  const visible = useMemo(() => findings.filter(f => {
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (catFilter !== 'all' && f.subject.meta !== catFilter) return false
    const triaged = triageByKey.has(f.key)
    if (triageFilter === 'untriaged' && triaged) return false
    if (triageFilter === 'triaged' && !triaged) return false
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${f.title} ${f.subject.name || ''} ${f.subject.email || ''} ${f.description || ''} ${f.control || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [findings, sevFilter, catFilter, triageFilter, search, triageByKey])

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

  const resolvedView = statusView === 'resolved'

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={view.title}
        subtitle={view.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={refreshAll} title="Refresh"
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

        {view.scans && scans.available && !scans.loading && (
          <ScanHealthBanner
            connectorId={connectorId}
            latestRun={scans.latestRun}
            lastCompletedRun={scans.lastCompletedRun}
            schedule={scans.schedule}
            onOpenSettings={() => navigate(view.settingsPath)}
          />
        )}

        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label={resolvedView ? 'Resolved' : 'Open findings'} value={counts.total} icon={FileWarning} tone="total"
            active={sevFilter === 'all'} onClick={() => setSevFilter('all')} />
          <StatCard label="Critical"      value={counts.critical} icon={AlertTriangle} tone="critical"
            active={sevFilter === 'critical'} onClick={() => setSevFilter(sevFilter === 'critical' ? 'all' : 'critical')} />
          <StatCard label="Warning"       value={counts.warning}  icon={ShieldAlert}   tone="warning"
            active={sevFilter === 'warning'} onClick={() => setSevFilter(sevFilter === 'warning' ? 'all' : 'warning')} />
          <StatCard label="Informational" value={counts.info}     icon={AlertCircle}   tone="info"
            active={sevFilter === 'info'} onClick={() => setSevFilter(sevFilter === 'info' ? 'all' : 'info')} />
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {provider.supportsStatus && (
            <Segmented value={statusView} onChange={setStatusView} options={[
              ['open', 'Open'],
              ['resolved', 'Resolved', '#166534'],
            ]} />
          )}
          {!resolvedView && (
            <Segmented value={triageFilter} onChange={setTriageFilter} options={[
              ['all', 'All'],
              ['untriaged', `Needs triage (${counts.untriaged})`, '#b91c1c'],
              ['triaged', `Triaged (${counts.total - counts.untriaged})`],
            ]} />
          )}
          <div className="flex-1 relative" style={{ minWidth: 200 }}>
            <Search size={12} className="absolute top-1/2 -translate-y-1/2" style={{ color: '#8a7070', insetInlineStart: 12 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search title, affected item or control (e.g. 2-4-3-1)…"
              className="w-full text-xs pr-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314', paddingInlineStart: 32 }} />
          </div>
        </div>

        {categories.length > 2 && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Segmented value={catFilter} onChange={setCatFilter} options={categories.map(cat => {
              const meta = cat === 'all' ? null : categoryMeta(cat)
              const n = cat === 'all' ? findings.length : findings.filter(f => f.subject.meta === cat).length
              return [cat, `${cat === 'all' ? 'All categories' : meta.label} (${n})`, meta?.color]
            })} />
          </div>
        )}

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
              {findings.length > 0 ? 'No findings match these filters'
                : resolvedView ? 'Nothing resolved yet'
                : `No open ${view.settingsName} findings`}
            </p>
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {findings.length > 0 ? 'Try a different severity, category, triage state or search term.'
                : resolvedView ? 'Findings move here automatically when a scan no longer reports them.'
                : `Run a scan from ${view.settingsName} settings to pull findings.`}
            </p>
            {findings.length === 0 && !resolvedView && (
              <button onClick={() => navigate(view.settingsPath)}
                className="mt-4 text-xs px-4 py-2 rounded-lg"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                Go to {view.settingsName} settings
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs mb-2" style={{ color: '#8a7070' }}>
              Showing {Math.min(limit, visible.length)} of {visible.length}
            </p>
            <div className="flex flex-col gap-3">
              {visible.slice(0, limit).map(finding => (
                <FindingCard
                  key={finding.key}
                  finding={finding}
                  view={view}
                  catMeta={categoryMeta(finding.subject.meta)}
                  triage={triageByKey.get(finding.key)}
                  onTriage={() => navigate('/app/risks/triage', { state: { finding: toTriageState(finding) } })}
                  onRaiseIncident={() => setModal({ type: 'incident', finding })}
                  onOpenIncident={() => navigate(`/app/incidents/${finding.incidentId}`)}
                  onOpenRisk={id => navigate(`/app/risks/${id}`)}
                />
              ))}
            </div>
            {visible.length > limit && (
              <div className="flex justify-center mt-4">
                <button onClick={() => setLimit(l => l + PAGE_SIZE)}
                  className="text-xs px-4 py-2 rounded-lg border hover:bg-[#f5f3f3]"
                  style={{ borderColor: '#e5e0e0', color: '#4a3a3a', background: '#fff' }}>
                  Show {Math.min(PAGE_SIZE, visible.length - limit)} more
                </button>
              </div>
            )}
          </>
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

function FindingCard({ finding, view, catMeta, triage, onTriage, onRaiseIncident, onOpenIncident, onOpenRisk }) {
  const resolved = finding.status === 'resolved'
  const showSubject = finding.subject.name && findingDisplayTitle(finding.title, finding.subject.name) !== finding.title
  const triageMeta = triage ? TRIAGE_BADGE[triage.disposition] : null
  const reason = triage?.disposition === 'closed' ? closeReasonMeta(triage.reason_code)?.label : null
  const canIncident = !resolved && !finding.incidentId && view.canRaiseIncident?.(finding)

  return (
    <div className="rounded-xl p-4 transition-all"
      style={{ background: '#fff', border: '1px solid #e5e0e0', opacity: resolved ? 0.85 : 1 }}>

      <div className="flex items-start gap-3 mb-3">
        <CategoryIcon meta={catMeta} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-medium" style={{ color: '#1a1314' }}>{finding.title}</p>
            <SeverityBadge severity={finding.severity} />
            <Pill color={catMeta.color} bg={`${catMeta.color}12`} bd={`${catMeta.color}30`}>{catMeta.label}</Pill>
            {resolved && (
              <Pill color="#166534" bg="#f0fdf4" bd="#bbf7d0">Resolved {fmtDate(finding.resolvedAt)}</Pill>
            )}
            {triageMeta && (
              <Pill color={triageMeta.color} bg={triageMeta.bg} bd={triageMeta.bd}
                title={triage.note || undefined}>
                {triageMeta.label}{reason ? `: ${reason}` : ''}
              </Pill>
            )}
            {finding.incidentId && (
              <Pill color="#b91c1c" bg="#fef2f2" bd="#fecaca">Incident raised</Pill>
            )}
          </div>
          {showSubject && (
            <p className="text-xs" style={{ color: '#8a7070' }}>
              {finding.subject.name}
              {finding.subject.email && finding.subject.email !== finding.subject.name && ` · ${finding.subject.email}`}
            </p>
          )}
        </div>
      </div>

      {finding.description && (
        <p className="text-xs leading-relaxed mb-3" style={{ color: '#4a3a3a' }}>{finding.description}</p>
      )}

      <div className="flex flex-col gap-1.5 mb-3 p-3 rounded-lg" style={{ background: '#f8f7f7', border: '1px solid #f0ecec' }}>
        {finding.control && (
          <ControlReferences control={finding.control} />
        )}
        {finding.recommendation && (
          <p className="text-xs leading-relaxed" style={{ color: '#6b5555', whiteSpace: 'pre-line' }}>{finding.recommendation}</p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {!resolved && (
          <button onClick={onTriage}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#fef2f2]"
            style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
            {triage ? 'Review triage' : 'Triage finding'}
          </button>
        )}
        {triage?.risk_id && (
          <button onClick={() => onOpenRisk(triage.risk_id)}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
            Open risk
          </button>
        )}
        {canIncident && (
          <button onClick={onRaiseIncident}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
            <Siren size={12} /> Raise incident
          </button>
        )}
        {finding.incidentId && (
          <button onClick={onOpenIncident}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#fef2f2]"
            style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
            <Siren size={12} /> Open incident
          </button>
        )}
        {finding.sourceUrl && (
          <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
            <ExternalLink size={12} /> View in {view.portalName || 'source'}
          </a>
        )}
        {finding.firstSeenAt && (
          <span className="text-[11px]" style={{ color: '#a09090', marginInlineStart: 'auto' }}>
            First seen {fmtDate(finding.firstSeenAt)}
          </span>
        )}
      </div>
    </div>
  )
}
