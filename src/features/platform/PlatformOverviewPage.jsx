import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import {
  PlatformShell, Card, Stat, StatRow, Table, Td, Empty, Chip, StatusChip, PlanChip,
  SeatBar, ActionChip, ErrorNote, ago, fmtDateTime,
} from './shared'

/* /platform — what needs attention, and the shape of the estate.
 *
 * The console opens on exceptions rather than on a company list, because the
 * list tells you nothing when it is long: a workspace nobody ever activated, a
 * client at their seat limit, or a suspended tenant left forgotten are the
 * things staff need to see without going looking. */
export function PlatformOverviewPage() {
  const { orgs, stats, loading, error, listAudit } = usePlatform()

  const seatPct = stats?.seats_licensed ? Math.round((stats.seats_used / stats.seats_licensed) * 100) : 0
  const atLimit = orgs.filter((o) => o.member_count >= o.max_members && o.status === 'active')
  const nearLimit = orgs.filter((o) => o.max_members && o.member_count / o.max_members >= 0.85 && o.member_count < o.max_members && o.status === 'active')
  const neverActivated = orgs.filter((o) => o.member_count === 0)
  const suspended = orgs.filter((o) => o.status === 'suspended')
  const quiet = orgs.filter((o) => {
    if (o.status !== 'active' || o.member_count === 0) return false
    const last = o.last_activity || o.last_seen || o.created_at
    return Date.now() - new Date(last).getTime() > 30 * 86400 * 1000
  })
  const attention = [
    ...atLimit.map((o) => ({ o, tone: 'red', why: 'At seat limit — cannot invite anyone else' })),
    ...neverActivated.map((o) => ({ o, tone: 'amber', why: `Never activated — provisioned ${ago(o.created_at)}` })),
    ...suspended.map((o) => ({ o, tone: 'amber', why: o.suspension_reason ? `Suspended: ${o.suspension_reason}` : 'Suspended' })),
    ...nearLimit.map((o) => ({ o, tone: 'amber', why: `${o.member_count} of ${o.max_members} seats used` })),
    ...quiet.map((o) => ({ o, tone: 'neutral', why: `No activity for ${ago(o.last_activity || o.last_seen || o.created_at)}` })),
  ]

  return (
    <PlatformShell
      title="Overview"
      description="Every tenant on the platform, and what needs attention."
      actions={<Link to="/platform/companies/new" className="btn-primary" style={{ textDecoration: 'none' }}><Plus size={13} /> New company</Link>}
    >
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StatRow>
            <Stat label="Companies" value={stats?.companies ?? 0}
              sub={`${stats?.active ?? 0} active · ${stats?.suspended ?? 0} suspended`} to="/platform/companies" />
            <Stat label="Seats used" value={stats?.seats_used ?? 0}
              sub={`${seatPct}% of ${stats?.seats_licensed ?? 0} licensed`} tone={seatPct >= 85 ? 'amber' : undefined} />
            <Stat label="Pending invites" value={stats?.pending_invites ?? 0}
              sub={stats?.expired_invites ? `${stats.expired_invites} expired` : 'none expired'}
              tone={stats?.expired_invites ? 'amber' : undefined} />
            <Stat label="Never activated" value={stats?.never_activated ?? 0}
              sub="provisioned, nobody joined" tone={stats?.never_activated ? 'amber' : undefined} />
            <Stat label="Console staff" value={stats?.staff ?? 0} sub="with console access" to="/platform/staff" />
            <Stat label="Console actions" value={stats?.console_actions_7d ?? 0} sub="last 7 days" to="/platform/activity" />
          </StatRow>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="pf-two-col">
            <Card title={`Needs attention (${attention.length})`} pad={false}>
              {attention.length === 0 ? <Empty>Nothing needs attention.</Empty> : (
                <Table columns={[{ label: 'Company' }, { label: 'Why' }, { label: 'Seats', width: 120 }, { label: 'Status', width: 110 }]}>
                  {attention.slice(0, 12).map(({ o, tone, why }, i) => (
                    <tr key={`${o.id}-${i}`}>
                      <Td>
                        <Link to={`/platform/companies/${o.id}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>{o.name}</Link>
                      </Td>
                      <Td><Chip tone={tone}>{why}</Chip></Td>
                      <Td><SeatBar used={o.member_count} max={o.max_members} /></Td>
                      <Td><StatusChip status={o.status} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card title="Estate">
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 9, columnGap: 14, margin: 0, fontSize: 12.5 }}>
                  {Object.entries(stats?.by_plan ?? {}).map(([plan, n]) => (
                    <Row key={plan} k={<PlanChip plan={plan} />} v={`${n} ${n === 1 ? 'company' : 'companies'}`} />
                  ))}
                  <Row k="Signed up" v={`${stats?.signups_30d ?? 0} in the last 30 days`} />
                  <Row k="Users" v={`${stats?.total_users ?? 0} accounts`} />
                  <Row k="Risks" v={`${stats?.risks ?? 0} across all tenants`} />
                  <Row k="Incidents" v={`${stats?.open_incidents ?? 0} open of ${stats?.incidents ?? 0}`} />
                </dl>
              </Card>
              <RecentActivity listAudit={listAudit} />
            </div>
          </div>
        </div>
      )}
    </PlatformShell>
  )
}

const Row = ({ k, v }) => (
  <>
    <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{k}</dt>
    <dd style={{ margin: 0, color: 'var(--text)', textAlign: 'end' }}>{v}</dd>
  </>
)

function RecentActivity({ listAudit }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    listAudit({ limit: 8 })
      .then((d) => { if (alive) setRows(d || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Recent console activity" pad={false}
      action={<Link to="/platform/activity" style={{ fontSize: 11.5, color: 'var(--crimson)', textDecoration: 'none' }}>View all ›</Link>}>
      {rows === null ? <Empty>Loading…</Empty>
        : rows.length === 0 ? <Empty>No console actions recorded yet.</Empty> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.slice(0, 8).map((r) => (
            <li key={r.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <ActionChip action={r.action} />
                {r.org_name && <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{r.org_name}</span>}
                {r.target_email && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.target_email}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                {r.actor_email} · <span title={fmtDateTime(r.created_at)}>{ago(r.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
