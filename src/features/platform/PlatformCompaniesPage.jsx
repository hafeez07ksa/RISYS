import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ArrowUpDown } from 'lucide-react'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import {
  PlatformShell, Card, Table, Td, Empty, SearchInput, Segmented, SeatBar,
  StatusChip, PlanChip, Chip, ErrorNote, ago, fmtDate,
} from './shared'

/* /platform/companies — every tenant, searchable and sortable.
 *
 * Row actions are deliberately absent: suspending, changing limits and
 * deleting all happen on the company's own page, where the consequences and
 * the current state are visible. A destructive action one click from a list
 * row is how the wrong tenant gets suspended. */

const SORTS = {
  created:  { label: 'Newest', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  name:     { label: 'Name',   fn: (a, b) => a.name.localeCompare(b.name) },
  seats:    { label: 'Seats',  fn: (a, b) => (b.member_count / (b.max_members || 1)) - (a.member_count / (a.max_members || 1)) },
  activity: { label: 'Activity', fn: (a, b) => new Date(b.last_activity || b.last_seen || 0) - new Date(a.last_activity || a.last_seen || 0) },
}

export function PlatformCompaniesPage() {
  const navigate = useNavigate()
  const { orgs, loading, error } = usePlatform()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [sort, setSort] = useState('created')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return orgs
      .filter((o) => status === 'all' || o.status === status)
      .filter((o) => plan === 'all' || o.plan === plan)
      .filter((o) => !needle
        || o.name.toLowerCase().includes(needle)
        || (o.primary_contact || '').toLowerCase().includes(needle)
        || (o.industry || '').toLowerCase().includes(needle)
        || (o.admins || []).some((a) => (a.email || '').toLowerCase().includes(needle) || (a.name || '').toLowerCase().includes(needle)))
      .sort(SORTS[sort].fn)
  }, [orgs, q, status, plan, sort])

  const counts = {
    all: orgs.length,
    active: orgs.filter((o) => o.status === 'active').length,
    suspended: orgs.filter((o) => o.status === 'suspended').length,
  }

  return (
    <PlatformShell
      title="Companies"
      description={`${orgs.length} ${orgs.length === 1 ? 'tenant' : 'tenants'} on the platform`}
      actions={<Link to="/platform/companies/new" className="btn-primary" style={{ textDecoration: 'none' }}><Plus size={13} /> New company</Link>}
    >
      <ErrorNote>{error}</ErrorNote>
      <Card pad={false}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={q} onChange={setQ} placeholder="Company, contact, admin, industry…" />
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'suspended', label: 'Suspended', count: counts.suspended },
          ]} />
          <Segmented value={plan} onChange={setPlan} options={[
            { value: 'all', label: 'Any plan' },
            { value: 'standard', label: 'Standard' },
            { value: 'professional', label: 'Professional' },
            { value: 'enterprise', label: 'Enterprise' },
          ]} />
          <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowUpDown size={12} style={{ color: 'var(--text-3)' }} />
            <Segmented value={sort} onChange={setSort}
              options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} />
          </div>
        </div>

        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div> : (
          <Table
            columns={[
              { label: 'Company' }, { label: 'Status', width: 120 }, { label: 'Plan', width: 120 },
              { label: 'Seats', width: 130 }, { label: 'Admin' }, { label: 'Data', width: 120 },
              { label: 'Last activity', width: 120 }, { label: 'Created', width: 110 },
            ]}
            empty={rows.length === 0 ? (
              <Empty>{orgs.length === 0
                ? <>No companies yet. <Link to="/platform/companies/new" style={{ color: 'var(--crimson)' }}>Provision the first one ›</Link></>
                : 'No company matches these filters.'}</Empty>
            ) : null}
          >
            {rows.map((o) => {
              const admin = (o.admins || [])[0]
              return (
                <tr key={o.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/platform/companies/${o.id}`)}>
                  <Td>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {[o.industry, o.size, o.primary_contact].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </Td>
                  <Td>
                    <StatusChip status={o.status} />
                    {o.status === 'suspended' && o.suspended_at && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>{ago(o.suspended_at)}</div>
                    )}
                  </Td>
                  <Td><PlanChip plan={o.plan} /></Td>
                  <Td><SeatBar used={o.member_count} max={o.max_members} /></Td>
                  <Td>
                    {admin ? (
                      <>
                        <div style={{ color: 'var(--text)' }}>{admin.name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{admin.email}</div>
                      </>
                    ) : o.pending_invites > 0
                      ? <Chip tone="amber">Invite pending</Chip>
                      : <Chip tone="red">No admin</Chip>}
                  </Td>
                  <Td>
                    <span className="tnum">{o.risk_count}</span> risks
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}><span className="tnum">{o.incident_count}</span> incidents</div>
                  </Td>
                  <Td>{ago(o.last_activity || o.last_seen)}</Td>
                  <Td>{fmtDate(o.created_at)}</Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
    </PlatformShell>
  )
}
