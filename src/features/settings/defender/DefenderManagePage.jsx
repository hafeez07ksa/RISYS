import { Shield, Siren, Bug } from 'lucide-react'
import { ConnectorScanSettings } from '@/features/settings/shared/ConnectorScanSettings'

// Defender settings: what RISYS can read from Microsoft Defender, when it scans,
// and how recent scans went. Findings themselves live under Findings → Defender.

const SOURCES = [
  {
    key: 'posture',
    Icon: Shield,
    permissions: 'Microsoft Graph → SecurityEvents.Read.All',
    requires: 'Any Microsoft 365 tenant (Secure Score is included).',
  },
  {
    key: 'alerts',
    Icon: Siren,
    permissions: 'Microsoft Graph → SecurityAlert.Read.All',
    requires: 'A Microsoft Defender XDR workload, e.g. Defender for Office 365, Endpoint or Identity (Microsoft 365 E5, Business Premium or a Defender add-on).',
    note: 'High-severity alerts are raised as RISYS incidents automatically.',
  },
  {
    key: 'endpoint',
    Icon: Bug,
    permissions: 'WindowsDefenderATP → Machine.Read.All, SecurityRecommendation.Read.All',
    requires: 'Microsoft Defender for Endpoint (Plan 2, Business, or Microsoft 365 E5).',
    howTo: 'In the app registration: API permissions → Add a permission → "APIs my organization uses" → type WindowsDefenderATP in full (partial names return nothing) → Application permissions → tick both → Add → Grant admin consent.',
  },
]

const openTotal = r => {
  const o = r?.counts?.open || {}
  return (o.posture || 0) + (o.alerts || 0) + (o.vulnerabilities || 0) + (o.devices || 0)
}

const changes = r => [
  r.counts?.resolved_this_scan ? `${r.counts.resolved_this_scan} resolved` : null,
  r.counts?.incidents_raised ? `${r.counts.incidents_raised} incident(s)` : null,
].filter(Boolean).join(' · ')

function scanMessage(r) {
  const o = r?.counts?.open || {}
  const parts = [
    `${o.posture ?? 0} posture gaps`,
    `${o.alerts ?? 0} open alerts`,
    `${o.vulnerabilities ?? 0} vulnerabilities`,
    `${o.devices ?? 0} device issues`,
  ]
  if (r?.counts?.resolved_this_scan) parts.push(`${r.counts.resolved_this_scan} resolved since last scan`)
  if (r?.counts?.incidents_raised) parts.push(`${r.counts.incidents_raised} incident(s) raised`)
  return parts.join(' · ')
}

function summaryCards(run) {
  const src = run?.sources || {}
  const score = run?.counts?.secure_score
  const open = run?.counts?.open
  return [
    {
      label: 'Secure Score',
      value: score?.current != null ? `${Math.round((score.current / (score.max || 1)) * 100)}%` : '—',
      sub: score?.current != null ? `${score.current} / ${score.max} points` : 'Not scanned yet',
    },
    { label: 'Open posture gaps', value: open?.posture ?? '—', sub: 'From Secure Score' },
    {
      label: 'Open alerts',
      value: src.alerts?.state === 'ok' ? (open?.alerts ?? 0) : '—',
      sub: src.alerts && src.alerts.state !== 'ok' ? 'Could not be read' : 'From Defender XDR',
      warn: src.alerts && src.alerts.state !== 'ok',
    },
    {
      label: 'Vulnerabilities / devices',
      value: src.endpoint?.state === 'ok' ? `${open?.vulnerabilities ?? 0} / ${open?.devices ?? 0}` : '—',
      sub: src.endpoint && src.endpoint.state !== 'ok' ? 'Could not be read' : 'From Defender for Endpoint',
      warn: src.endpoint && src.endpoint.state !== 'ok',
    },
  ]
}

export function DefenderManagePage() {
  return (
    <ConnectorScanSettings
      connectorId="defender"
      functionName="defender-security"
      title="Microsoft Defender"
      accent="#00B4D8"
      findingsPath="/app/findings/defender"
      sources={SOURCES}
      summaryCards={summaryCards}
      openTotal={openTotal}
      changes={changes}
      scanMessage={scanMessage}
    />
  )
}
