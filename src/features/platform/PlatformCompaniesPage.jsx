import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpDown, Building2, Plus } from 'lucide-react'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import {
  PlatformShell, Card, Table, Td, Empty, SearchInput, Segmented, Avatar, LifecycleChip, Chip,
  ErrorNote, ago, fmtDate, lifecycle, plural,
} from './shared'

/* /platform/companies — every tenant, searchable and sortable.
 *
 * Row actions are deliberately absent: suspending and deleting happen on the
 * company's own page, where the consequences and the current state are
 * visible. A destructive action one click from a list row is how the wrong
 * tenant gets suspended. */

const SORTS = {
  activity: { label: 'Last active', fn: (a, b) => new Date(b.last_activity || b.last_seen || 0) - new Date(a.last_activity || a.last_seen || 0) },
  created:  { label: 'Newest', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  name:     { label: 'Name',   fn: (a, b) => a.name.localeCompare(b.name) },
  people:   { label: 'People', fn: (a, b) => b.member_count - a.member_count },
}

const STATES = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'awaiting', label: 'Awaiting activation' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'suspended', label: 'Suspended' },
]
const inState = (o, s) => {
  if (s === 'all') return true
  const k = lifecycle(o).key
  return s === 'awaiting' ? (k === 'pending' || k === 'expired') : k === s
}

export function PlatformCompaniesPage() {
  const navigate = useNavigate()
  const { orgs, loading, error } = usePlatform()
  const [q, setQ] = useState('')
  const [state, setState] = useState('all')
  const [sort, setSort] = useState('activity')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return orgs
      .filter((o) => inState(o, state))
      .filter((o) => !needle
        || o.name.toLowerCase().includes(needle)
        || (o.primary_contact || '').toLowerCase().includes(needle)
        || (o.industry || '').toLowerCase().includes(needle)
        || (o.admins || []).some((a) => (a.email || '').toLowerCase().includes(needle) || (a.name || '').toLowerCase().includes(needle)))
      .sort(SORTS[sort].fn)
  }, [orgs, q, state, sort])

  const counts = Object.fromEntries(STATES.map((s) => [s.value, orgs.filter((o) => inState(o, s.value)).length]))

  return (
    <PlatformShell
      title="Companies"
      description={`${plural(orgs.length, 'tenant')} on the platform · ${plural(orgs.reduce((n, o) => n + (o.member_count || 0), 0), 'person', 'people')} inside them`}
      actions={<Link to="/platform/companies/new" className="btn-primary" style={{ textDecoration: 'none' }}><Plus size={13} /> New company</Link>}
    >
      <ErrorNote>{error}</ErrorNote>
      <Card pad={false} title="All companies" icon={Building2}>
        <div className="pc-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search company, admin, contact, industry…" />
          <Segmented value={state} onChange={setState}
            options={STATES.map((s) => ({ ...s, count: counts[s.value] }))} />
          <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowUpDown size={12} style={{ color: 'var(--text-3)' }} />
            <Segmented value={sort} onChange={setSort}
              options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} />
          </div>
        </div>

        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div> : (
          <Table
            columns={[
              { label: 'Company' }, { label: 'State', width: 190 }, { label: 'Administrator' },
              { label: 'People', width: 90, align: 'right' }, { label: 'Invites pending', width: 130, align: 'right' },
              { label: 'Last active', width: 120 }, { label: 'Created', width: 120 },
            ]}
            empty={rows.length === 0 ? (
              <Empty>{orgs.length === 0
                ? <>No companies yet. <Link to="/platform/companies/new" className="pc-link">Provision the first one</Link></>
                : 'No company matches these filters.'}</Empty>
            ) : null}
          >
            {rows.map((o) => {
              const admin = (o.admins || [])[0]
              return (
                <tr key={o.id} className="is-link" onClick={() => navigate(`/platform/companies/${o.id}`)}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <Avatar name={o.name} size={34} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{o.name}</div>
                        <div className="pc-sub">{[o.industry, o.primary_contact].filter(Boolean).join(' · ') || 'No profile details'}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <LifecycleChip org={o} />
                    {o.status === 'suspended' && o.suspended_at && <div className="pc-sub">{ago(o.suspended_at)}</div>}
                  </Td>
                  <Td>
                    {admin ? (
                      <>
                        <div style={{ color: 'var(--text)' }}>{admin.name || '—'}</div>
                        <div className="pc-sub">{admin.email}</div>
                      </>
                    ) : o.pending_invites > 0
                      ? <Chip tone="amber">Invitation sent</Chip>
                      : <Chip tone="red">No administrator</Chip>}
                  </Td>
                  <Td align="right"><span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{o.member_count}</span></Td>
                  <Td align="right"><span className="tnum">{o.pending_invites}</span></Td>
                  <Td>{o.last_activity || o.last_seen ? ago(o.last_activity || o.last_seen) : <span className="pc-muted">never</span>}</Td>
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
