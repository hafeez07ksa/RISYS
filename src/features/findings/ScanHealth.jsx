import { CheckCircle2, AlertTriangle, MinusCircle, Loader2, CalendarClock } from 'lucide-react'
import { SOURCE_STATE_META, formatRelative, isActiveRun, runStatus } from '@/hooks/useConnectorScans'
import { tx } from '@/lib/i18n'

// Human names for scan data sources, per connector.
export const SOURCE_LABELS = {
  defender: {
    posture:  { name: 'Secure Score',          what: tx('configuration gaps') },
    alerts:   { name: 'Alerts',                what: tx('active threats') },
    endpoint: { name: 'Defender for Endpoint', what: tx('vulnerabilities and device health') },
  },
  entra: {
    directory: { name: 'Directory',       what: tx('users, account status and guests') },
    mfa:       { name: 'MFA registration', what: tx('who has registered MFA') },
    roles:     { name: 'Directory roles',  what: tx('privileged accounts') },
    signins:   { name: 'Sign-in logs',     what: tx('last 7 days of sign-ins') },
  },
  m365: {
    forwarding: { name: 'Mail forwarding',  what: tx('mailbox forwarding and inbox rules') },
    guests:     { name: 'Guest accounts',   what: tx('guests nobody has reviewed') },
    consent:    { name: 'App consent',      what: tx('third-party apps holding tenant permissions') },
    dns:        { name: 'Mail domain DNS',  what: tx('SPF, DKIM and DMARC on your mail domains') },
  },
  sharepoint: {
    tenant:  { name: 'Tenant sharing policy', what: tx('SharePoint and OneDrive sharing settings') },
    groups:  { name: 'Microsoft 365 groups',  what: tx('guests and public groups') },
    sharing: { name: 'File sharing',          what: tx('"Anyone" links and external shares') },
  },
}

const TONE = {
  ok:    { color: '#166534', bg: '#f0fdf4', bd: '#bbf7d0', Icon: CheckCircle2 },
  warn:  { color: '#92400e', bg: '#fffbeb', bd: '#fde68a', Icon: CalendarClock },
  error: { color: '#b91c1c', bg: '#fef2f2', bd: '#fecaca', Icon: AlertTriangle },
  muted: { color: '#6b5555', bg: '#f8f7f7', bd: '#e5e0e0', Icon: MinusCircle },
}

export function SourceStatePill({ state }) {
  const meta = SOURCE_STATE_META[state] || SOURCE_STATE_META.error
  const t = TONE[meta.tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600,
      padding: '2px 8px', borderRadius: 20, color: t.color, background: t.bg, border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap',
    }}>
      <t.Icon size={11} /> {meta.label}
    </span>
  )
}

/**
 * One-line summary of the last scan for a findings list. Stays quiet when
 * everything worked, and says plainly which data could not be read otherwise —
 * so an empty list is never mistaken for "no problems".
 */
export function ScanHealthBanner({ connectorId, latestRun, lastCompletedRun, schedule, onOpenSettings }) {
  const labels = SOURCE_LABELS[connectorId] || {}
  const running = isActiveRun(latestRun)
  const run = lastCompletedRun
  const status = runStatus(run)

  if (!run && !running) {
    return (
      <Banner tone="muted" Icon={MinusCircle}>{tx(
          'This connector has not been scanned yet, so the list below may be incomplete.'
        )}{onOpenSettings && <LinkButton onClick={onOpenSettings}>{tx('Run a scan')}</LinkButton>}
      </Banner>
    )
  }

  const problems = Object.entries(run?.sources || {})
    .filter(([, s]) => s.state !== 'ok')
    .map(([key, s]) => ({ key, ...s, label: labels[key]?.name || key, what: labels[key]?.what }))
  // 'partial' means a large tenant is still being worked through, and 'skipped'
  // means there was nothing there to look at or the admin turned the source off.
  // Neither is a failure, and neither should make an accurate list look doubtful.
  const blocking = problems.filter(p => !['not_licensed', 'partial', 'skipped'].includes(p.state))
  const inProgress = problems.filter(p => p.state === 'partial')

  const schedText = schedule?.enabled
    ? `Next automatic scan ${formatRelative(schedule.next_run_at)}.`
    : 'Automatic scans are off.'

  return (
    <div className="flex flex-col gap-2 mb-4">
      {running && (
        <Banner tone="muted" Icon={Loader2} spin>{tx('A scan is running now. Results will appear when it finishes.')}</Banner>
      )}
      {run && (status === 'failed' || blocking.length > 0) ? (
        <Banner tone="error" Icon={AlertTriangle}>
          <div className="flex flex-col gap-1">
            <span>
              <strong>{status === 'failed' ? tx('The last scan failed') : tx('The last scan was incomplete')}</strong>
              {' '}({formatRelative(run.finished_at || run.started_at)}{tx(
              '). Findings from the sources below are missing or out of date, so a low count does not mean you are clean.'
            )}</span>
            {run.error && <span>{run.error}</span>}
            {blocking.map(p => (
              <span key={p.key}>
                <strong>{p.label}</strong>{p.what ? ` (${p.what})` : ''}: {p.detail}
              </span>
            ))}
            {onOpenSettings && <LinkButton onClick={onOpenSettings}>{tx('Open scan settings')}</LinkButton>}
          </div>
        </Banner>
      ) : run ? (
        <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: '#8a7070' }}>
          <CalendarClock size={12} />
          <span>{tx('Last scanned')} {formatRelative(run.finished_at || run.started_at)} ({run.trigger}). {schedText}</span>
          {problems.filter(p => p.state === 'not_licensed').map(p => (
            <span key={p.key} title={p.detail}>· {p.label} {tx('not available in this tenant')}</span>
          ))}
          {problems.filter(p => p.state === 'skipped').map(p => (
            <span key={p.key} title={p.detail}>· {p.label} {tx('not checked')}</span>
          ))}
          {inProgress.map(p => (
            <span key={p.key} style={{ color: '#92400e' }}>· {p.label}: {p.detail}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Banner({ tone, Icon, spin, children }) {
  const t = TONE[tone]
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-lg text-xs"
      style={{ background: t.bg, border: `1px solid ${t.bd}`, color: t.color, lineHeight: 1.5 }}>
      <Icon size={14} className={spin ? 'animate-spin' : ''} style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1">{children}</div>
    </div>
  )
}

function LinkButton({ onClick, children }) {
  return (
    <button onClick={onClick} className='underline font-medium text-start'
      style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', marginInlineStart: 4 }}>
      {children}
    </button>
  )
}
