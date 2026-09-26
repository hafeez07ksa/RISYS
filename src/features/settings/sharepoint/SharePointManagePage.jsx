import { Shield, Users, Share2 } from 'lucide-react'
import { ConnectorScanSettings } from '@/features/settings/shared/ConnectorScanSettings'
import { tx } from '@/lib/i18n'

// SharePoint settings: what RISYS can read from SharePoint and OneDrive, when it
// scans, and how recent scans went. Findings live under Findings → SharePoint.

const SOURCES = [
  {
    key: 'tenant',
    Icon: Shield,
    permissions: 'Microsoft Graph → SharePointTenantSettings.Read.All',
    requires: tx('Any Microsoft 365 tenant with SharePoint Online.'),
    howTo: tx(
      'In the Entra app registration: API permissions → Add a permission → Microsoft Graph → Application permissions → search "SharePointTenantSettings" → tick SharePointTenantSettings.Read.All → Add → Grant admin consent.'
    ),
  },
  {
    key: 'groups',
    Icon: Users,
    permissions: 'Microsoft Graph → Directory.Read.All',
    requires: tx('Any Microsoft 365 tenant.'),
    note: tx(
      'Finds guests in Microsoft 365 groups (and so in their Teams and SharePoint sites) and groups anyone in the organisation can join.'
    ),
    howTo: tx(
      'In the Entra app registration: API permissions → Microsoft Graph → Application permissions → Directory.Read.All → Grant admin consent.'
    ),
  },
  {
    key: 'sharing',
    Icon: Share2,
    permissions: 'Microsoft Graph → Sites.Read.All',
    requires: tx('Any Microsoft 365 tenant with SharePoint Online.'),
    note: tx(
      'Checks files and folders in every site and OneDrive. Libraries with up to 5,000 items are fully re-checked on every scan; larger ones are checked for changes and fully re-checked weekly. A very large tenant\'s first pass continues over several scans.'
    ),
    howTo: tx(
      'In the Entra app registration: API permissions → Microsoft Graph → Application permissions → Sites.Read.All → Grant admin consent.'
    ),
  },
]

const openTotal = r => r?.counts?.open_total ?? Object.values(r?.counts?.open || {}).reduce((a, b) => a + (b || 0), 0)

const changes = r => {
  const lib = r?.counts?.libraries
  const parts = []
  if (lib?.total) parts.push(`${lib.scanned}/${lib.total} libraries`)
  if (r?.counts?.items_checked) parts.push(`${r.counts.items_checked} items checked`)
  return parts.join(' · ')
}

function scanMessage(r) {
  const o = r?.counts?.open || {}
  const lib = r?.counts?.libraries
  const parts = [
    `${o.public_file ?? 0} "Anyone" links`,
    `${o.external_share ?? 0} external shares`,
    `${o.tenant_policy ?? 0} policy issues`,
    `${o.guest_access ?? 0} groups with guests`,
  ]
  if (lib?.total) parts.push(`${lib.scanned} of ${lib.total} libraries checked`)
  return parts.join(' · ')
}

function summaryCards(run) {
  const src = run?.sources || {}
  const o = run?.counts?.open || {}
  const lib = run?.counts?.libraries
  const failed = key => src[key] && !['ok', 'partial'].includes(src[key].state)
  const val = (key, n) => (!run ? '—' : failed(key) ? '—' : (n ?? 0))
  return [
    {
      label: tx('"Anyone" links'),
      value: val('sharing', o.public_file),
      sub: failed('sharing') ? tx('Could not be read') : tx('Files and folders open without sign-in'),
      warn: failed('sharing') || (o.public_file ?? 0) > 0,
    },
    {
      label: tx('External shares'),
      value: val('sharing', o.external_share),
      sub: failed('sharing') ? tx('Could not be read')
        : lib?.total ? `${lib.scanned} of ${lib.total} libraries checked this scan` : tx('Shared with people outside'),
      warn: failed('sharing'),
    },
    {
      label: tx('Guests / public groups'),
      value: failed('groups') || !run ? '—' : `${o.guest_access ?? 0} / ${o.public_group ?? 0}`,
      sub: failed('groups') ? tx('Could not be read') : tx('Microsoft 365 groups'),
      warn: failed('groups'),
    },
    {
      label: tx('Sharing policy issues'),
      value: val('tenant', o.tenant_policy),
      sub: failed('tenant') ? tx('Needs SharePointTenantSettings.Read.All') : tx('Tenant-wide settings'),
      warn: failed('tenant') || (o.tenant_policy ?? 0) > 0,
    },
  ]
}

export function SharePointManagePage() {
  return (
    <ConnectorScanSettings
      connectorId="sharepoint"
      functionName="sharepoint-security"
      title={tx('SharePoint Security')}
      accent="#038387"
      findingsPath="/app/findings/sharepoint"
      sources={SOURCES}
      summaryCards={summaryCards}
      openTotal={openTotal}
      changes={changes}
      scanMessage={scanMessage}
    />
  )
}
