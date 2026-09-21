import { Mail, Users, ShieldAlert, Globe } from 'lucide-react'
import { ConnectorScanSettings } from '@/features/settings/shared/ConnectorScanSettings'

// Microsoft 365 settings: what RISYS reads from Exchange and the directory,
// when it scans, and how recent scans went. Findings live under Findings → M365.
//
// Site and file sharing used to be checked here with a field Graph does not
// return. It belongs to the SharePoint connector, which reads it properly, so
// this page no longer offers it.

const SOURCES = [
  {
    key: 'forwarding',
    Icon: Mail,
    permissions: 'Microsoft Graph → MailboxSettings.Read, Mail.Read, Organization.Read.All',
    requires: 'Exchange Online mailboxes. Accounts without a mailbox are skipped.',
    note: 'Finds mailbox forwarding and enabled inbox rules that send mail to an address outside your verified domains. Mailboxes are read in batches of 20; a very large tenant\'s pass continues over several scans.',
    howTo: 'In the Entra app registration: API permissions → Add a permission → Microsoft Graph → Application permissions → tick MailboxSettings.Read, Mail.Read and Organization.Read.All → Add → Grant admin consent.',
  },
  {
    key: 'guests',
    Icon: Users,
    permissions: 'Microsoft Graph → User.Read.All (or Directory.Read.All)',
    requires: 'Any Microsoft 365 tenant. Last sign-in needs Microsoft Entra ID P1; without it, age since invitation is used instead.',
    note: 'Finds guest accounts nobody has re-approved, and invitations that were never accepted.',
    howTo: 'In the Entra app registration: API permissions → Microsoft Graph → Application permissions → User.Read.All → Grant admin consent.',
  },
  {
    key: 'consent',
    Icon: ShieldAlert,
    permissions: 'Microsoft Graph → Directory.Read.All',
    requires: 'Any Microsoft 365 tenant.',
    note: 'Finds third-party applications holding broad permissions over mail, files or the directory — consent that outlives whoever granted it. Microsoft\'s own applications are not reported.',
    howTo: 'In the Entra app registration: API permissions → Microsoft Graph → Application permissions → Directory.Read.All → Grant admin consent.',
  },
  {
    key: 'dns',
    Icon: Globe,
    permissions: 'No Microsoft permission beyond the verified domain list',
    requires: 'At least one verified mail domain. *.onmicrosoft.com is Microsoft\'s own and is not checked.',
    note: 'Resolves SPF, DKIM and DMARC for each of your mail domains over DNS and reports what is missing or not enforcing. Maps to NCA ECC 2-4-3-5.',
    howTo: 'Nothing to grant — this reads public DNS. Fixes are made at your DNS provider and, for DKIM, in the Microsoft 365 Defender portal.',
  },
]

const openTotal = r => r?.counts?.open_total ?? Object.values(r?.counts?.open || {}).reduce((a, b) => a + (b || 0), 0)

const changes = (r) => {
  const mb = r?.counts?.mailboxes
  return mb?.total ? `${mb.scanned}/${mb.total} mailboxes checked` : ''
}

function scanMessage(r) {
  const o = r?.counts?.open || {}
  const mb = r?.counts?.mailboxes
  const parts = [
    `${o.external_forwarding ?? 0} forwarding out of the organisation`,
    `${o.guest_access ?? 0} guest accounts to review`,
    `${(o.app_consent ?? 0) + (o.app_privilege ?? 0)} third-party apps`,
    `${o.mail_dns ?? 0} mail domain DNS issues`,
  ]
  if (mb?.total) parts.push(`${mb.scanned} of ${mb.total} mailboxes checked`)
  return parts.join(' · ')
}

function summaryCards(run) {
  const src = run?.sources || {}
  const o = run?.counts?.open || {}
  const mb = run?.counts?.mailboxes
  // A source that was skipped had nothing to look at; that is not a failure.
  const skipped = key => src[key]?.state === 'skipped'
  const failed = key => src[key] && !['ok', 'partial', 'skipped'].includes(src[key].state)
  const val = (key, n) => (!run || failed(key) || skipped(key) ? '—' : (n ?? 0))
  return [
    {
      label: 'Forwarding out',
      value: val('forwarding', o.external_forwarding),
      sub: failed('forwarding') ? 'Could not be read'
        : mb?.total ? `${mb.scanned} of ${mb.total} mailboxes checked` : 'Mail copied outside your domains',
      warn: failed('forwarding') || (o.external_forwarding ?? 0) > 0,
    },
    {
      label: 'Guests to review',
      value: val('guests', o.guest_access),
      sub: failed('guests') ? 'Could not be read'
        : src.guests?.state === 'partial' ? 'Counted from invitation — last sign-in needs P1'
        : 'Not re-approved in 90 days',
      warn: failed('guests'),
    },
    {
      label: 'Apps with directory write',
      value: val('consent', o.app_privilege),
      sub: failed('consent') ? 'Could not be read' : 'Can create or change accounts',
      warn: failed('consent') || (o.app_privilege ?? 0) > 0,
    },
    {
      label: 'Mail domain DNS',
      value: val('dns', o.mail_dns),
      sub: skipped('dns') ? (src.dns?.detail ?? 'Nothing to check')
        : failed('dns') ? 'Could not be checked' : 'SPF, DKIM and DMARC gaps',
      warn: failed('dns') || (o.mail_dns ?? 0) > 0,
    },
  ]
}

export function M365ManagePage() {
  return (
    <ConnectorScanSettings
      connectorId="m365"
      functionName="m365-security"
      title="Microsoft 365 Security"
      accent="#0078D4"
      findingsPath="/app/findings/m365"
      sources={SOURCES}
      summaryCards={summaryCards}
      openTotal={openTotal}
      changes={changes}
      scanMessage={scanMessage}
    />
  )
}
