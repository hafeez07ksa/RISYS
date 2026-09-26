import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Pencil, KeyRound, Pause, Play, Trash2, SlidersHorizontal, ExternalLink } from 'lucide-react'
import { usePlatform, useCompany, activationLink } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import {
  PlatformShell, Card, Table, Td, Empty, Stat, StatRow, Chip, StatusChip, PlanChip,
  SeatBar, CopyBtn, ActionChip, MetaSummary, ErrorNote, ago, bytes, fmtDate, fmtDateTime,
} from './shared'

/* /platform/companies/:id — one tenant.
 *
 * Everything staff need before acting on a client: what they are paying for,
 * who is inside, what is outstanding, and what the console has already done to
 * them. Destructive actions live at the bottom, behind the rules the database
 * enforces (suspend before delete; a written reason for both). */

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'members',     label: 'Members' },
  { key: 'invitations', label: 'Invitations' },
  { key: 'activity',    label: 'Activity' },
]

export function PlatformCompanyPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview'
  const { detail, loading, error, reload } = useCompany(id)
  const platform = usePlatform()
  const [actionError, setActionError] = useState('')

  if (loading && !detail) {
    return <PlatformShell><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div></PlatformShell>
  }
  if (error || !detail) {
    return (
      <PlatformShell title="Company not found" back={{ to: '/platform/companies', label: 'All companies' }}>
        <ErrorNote>{error || 'This company no longer exists.'}</ErrorNote>
      </PlatformShell>
    )
  }

  const org = detail.org
  const members = detail.members || []
  const invitations = detail.invitations || []
  const pending = invitations.filter((i) => i.status === 'pending' && !i.expired)
  const suspended = org.status === 'suspended'
  const seatsFull = members.length >= org.max_members
  // The database refuses deletion until 15 minutes after suspension.
  const cooling = suspended && org.suspended_at && (Date.now() - new Date(org.suspended_at).getTime()) < 15 * 60 * 1000

  const run = async (fn) => { setActionError(''); try { await fn(); await reload() } catch (e) { setActionError(e.message); throw e } }

  return (
    <PlatformShell
      back={{ to: '/platform/companies', label: 'All companies' }}
      title={org.name}
      description={[org.industry, org.size, org.primary_contact].filter(Boolean).join(' · ') || 'No profile details recorded'}
      actions={<>
        <Link to={`/platform/companies/${id}/edit`} className="btn-secondary" style={{ textDecoration: 'none' }}><Pencil size={13} /> Edit profile</Link>
        <Link to={`/platform/companies/${id}/limits`} className="btn-secondary" style={{ textDecoration: 'none' }}><SlidersHorizontal size={13} /> Plan &amp; limits</Link>
        <Link to={`/platform/companies/${id}/activation`} className="btn-secondary" style={{ textDecoration: 'none' }}><KeyRound size={13} /> Activation link</Link>
      </>}
    >
      <ErrorNote>{actionError}</ErrorNote>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatusChip status={org.status} />
        <PlanChip plan={org.plan} />
        {seatsFull && <Chip tone="red">Seat limit reached</Chip>}
        {members.length === 0 && <Chip tone="amber">Never activated</Chip>}
        {pending.length > 0 && <Chip tone="amber">{pending.length} invite{pending.length > 1 ? 's' : ''} pending</Chip>}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Created {fmtDate(org.created_at)}</span>
      </div>

      {suspended && (
        <div style={{ padding: '12px 14px', marginBottom: 16, background: '#FBEAEA', border: '1px solid #F0CECE', borderRadius: 'var(--r-lg)' }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#8C1616' }}>
            Suspended {org.suspended_at ? ago(org.suspended_at) : ''} — all {members.length} member{members.length === 1 ? '' : 's'} are locked out.
          </p>
          {org.suspension_reason && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#8C1616' }}>Reason: {org.suspension_reason}</p>}
        </div>
      )}

      <nav style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = tab === t.key
          const count = t.key === 'members' ? members.length : t.key === 'invitations' ? invitations.length : null
          return (
            <button key={t.key} onClick={() => setParams(t.key === 'overview' ? {} : { tab: t.key })} style={{
              fontSize: 12.5, fontWeight: on ? 600 : 500, padding: '8px 14px', cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--crimson)' : 'transparent'}`,
              color: on ? 'var(--text)' : 'var(--text-3)',
            }}>
              {t.label}{count != null && <span className="tnum" style={{ opacity: 0.6 }}> {count}</span>}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && <Overview detail={detail} org={org} members={members} />}
      {tab === 'members' && <Members members={members} max={org.max_members} />}
      {tab === 'invitations' && (
        <Invitations invitations={invitations} orgId={id}
          onRevoke={(invId) => run(() => platform.revokeInvitation(invId))} />
      )}
      {tab === 'activity' && <Activity rows={detail.activity || []} />}

      {/* ── Danger zone ── */}
      <div id="danger" style={{ marginTop: 26, scrollMarginTop: 16 }}>
        <Card title="Danger zone">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DangerRow
              title={suspended ? 'Reactivate this company' : 'Suspend this company'}
              body={suspended
                ? 'Members regain access immediately, with all data intact.'
                : `All ${members.length} member${members.length === 1 ? '' : 's'} lose access within a minute. Nothing is deleted, and reactivating restores everything.`}
            >
              {suspended ? (
                <InlineConfirm variant="panel" tone="neutral" triggerClassName="btn-secondary"
                  message={`Reactivate ${org.name}?`}
                  detail="Everyone regains access immediately."
                  confirmLabel="Reactivate"
                  onConfirm={() => run(() => platform.setStatus(id, 'active'))}>
                  <Play size={13} /> Reactivate
                </InlineConfirm>
              ) : (
                <Link to={`/platform/companies/${id}/suspend`} className="btn-secondary"
                  style={{ textDecoration: 'none', color: '#8A5A12', borderColor: '#F0DCB8' }}>
                  <Pause size={13} /> Suspend…
                </Link>
              )}
            </DangerRow>

            <DangerRow
              title="Delete this company permanently"
              body={suspended
                ? `Erases the workspace and everything in it: ${detail.risk_count} risks, ${detail.incident_count} incidents, ${detail.task_count} tasks, ${detail.evidence_count} evidence files. Member accounts that exist only here are destroyed. No undo.`
                : 'A live workspace cannot be deleted. Suspend it first — the database refuses deletion until then.'}
              tone="red"
            >
              {!suspended ? (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Suspend first</span>
              ) : cooling ? (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Available 15 minutes after suspension</span>
              ) : (
                <Link to={`/platform/companies/${id}/delete`} className="btn-danger" style={{ textDecoration: 'none' }}>
                  <Trash2 size={13} /> Delete…
                </Link>
              )}
            </DangerRow>
          </div>
        </Card>
      </div>
    </PlatformShell>
  )
}

const DangerRow = ({ title, body, children, tone }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
    <div style={{ flex: 1, minWidth: 280 }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: tone === 'red' ? '#8C1616' : 'var(--text)' }}>{title}</p>
      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>{body}</p>
    </div>
    {children}
  </div>
)

function Overview({ detail, org, members }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatRow>
        <Stat label="Seats" value={`${members.length}/${org.max_members}`} sub={`${org.plan} plan`} />
        <Stat label="Risks" value={detail.risk_count} />
        <Stat label="Incidents" value={detail.incident_count} />
        <Stat label="Controls" value={detail.control_count} />
        <Stat label="Evidence" value={detail.evidence_count} sub={bytes(detail.storage_bytes)} />
        <Stat label="Connectors" value={detail.connector_count} sub="connected" />
      </StatRow>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="pf-two-col">
        <Card title="Account">
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 10, columnGap: 16, margin: 0, fontSize: 12.5 }}>
            <F k="Workspace ID" v={<span className="mono" style={{ fontSize: 11 }}>{org.id}</span>} />
            <F k="Slug" v={<span className="mono" style={{ fontSize: 11 }}>{org.slug}</span>} />
            <F k="Plan" v={<PlanChip plan={org.plan} />} />
            <F k="Seats" v={<SeatBar used={members.length} max={org.max_members} />} />
            <F k="Storage quota" v={`${bytes(detail.storage_bytes)} of ${org.storage_quota_gb} GB used`} />
            <F k="Primary contact" v={org.primary_contact || '—'} />
            <F k="Provisioned" v={fmtDateTime(org.created_at)} />
            <F k="Last tenant activity" v={detail.last_risk_activity ? ago(detail.last_risk_activity) : 'never'} />
          </dl>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Internal notes"
            action={<Link to={`/platform/companies/${org.id}/edit`} style={{ fontSize: 11.5, color: 'var(--crimson)', textDecoration: 'none' }}>Edit ›</Link>}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: org.notes ? 'var(--text-2)' : 'var(--text-3)' }}>
              {org.notes || 'No notes. These are visible only to platform staff, never to the client.'}
            </p>
          </Card>
          <Card title="Connectors" pad={false}>
            {(detail.connectors || []).length === 0 ? <Empty>No connectors configured.</Empty> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {detail.connectors.map((c) => (
                  <li key={c.connector_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border-3)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{c.connector_id}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.last_sync_at ? `synced ${ago(c.last_sync_at)}` : 'never synced'}</span>
                      <Chip tone={c.status === 'connected' ? 'green' : 'neutral'}>{c.status}</Chip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const F = ({ k, v }) => (
  <>
    <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{k}</dt>
    <dd style={{ margin: 0, color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</dd>
  </>
)

function Members({ members, max }) {
  return (
    <Card pad={false} title={`Members (${members.length} of ${max} seats)`}>
      <Table
        columns={[{ label: 'Person' }, { label: 'Role', width: 130 }, { label: 'Title' }, { label: 'Joined', width: 130 }, { label: 'Last active', width: 130 }]}
        empty={members.length === 0 ? <Empty>Nobody has joined this workspace yet.</Empty> : null}
      >
        {members.map((m) => (
          <tr key={m.id}>
            <Td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>{m.name || '—'}</span>
                {m.is_platform_staff && <Chip tone="blue">Platform staff</Chip>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.email}</div>
            </Td>
            <Td><Chip tone={['owner', 'admin'].includes(m.role) ? 'amber' : 'neutral'}>{m.role}</Chip></Td>
            <Td>{m.title || '—'}</Td>
            <Td>{fmtDate(m.joined_at)}</Td>
            <Td>{m.last_active ? ago(m.last_active) : <span style={{ color: 'var(--text-3)' }}>never</span>}</Td>
          </tr>
        ))}
      </Table>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-3)' }}>
        Members are managed by the client's own administrator inside their workspace. The console does not add or remove people.
      </div>
    </Card>
  )
}

function Invitations({ invitations, onRevoke }) {
  return (
    <Card pad={false} title={`Invitations (${invitations.length})`}>
      <Table
        columns={[{ label: 'Email' }, { label: 'Role', width: 110 }, { label: 'Status', width: 130 }, { label: 'Expires', width: 150 }, { label: '', align: 'right', width: 230 }]}
        empty={invitations.length === 0 ? <Empty>No invitations.</Empty> : null}
      >
        {invitations.map((i) => {
          const live = i.status === 'pending' && !i.expired
          return (
            <tr key={i.id}>
              <Td style={{ color: 'var(--text)' }}>{i.email}</Td>
              <Td><Chip tone={i.role === 'admin' ? 'amber' : 'neutral'}>{i.role}</Chip></Td>
              <Td>
                <Chip tone={i.status === 'accepted' ? 'green' : i.expired ? 'red' : 'amber'}>
                  {i.status === 'accepted' ? 'Accepted' : i.expired ? 'Expired' : 'Pending'}
                </Chip>
              </Td>
              <Td>{fmtDate(i.expires_at)}</Td>
              <Td align="right">
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {live && <CopyBtn text={activationLink(i.token)} label="Copy link" />}
                  {i.status !== 'accepted' && (
                    <InlineConfirm
                      triggerClassName="btn-secondary"
                      triggerStyle={{ color: '#8C1616', borderColor: '#F0CECE', fontSize: 11.5, padding: '4px 9px' }}
                      message={`Revoke the invitation for ${i.email}?`}
                      confirmLabel="Revoke"
                      onConfirm={() => onRevoke(i.id)}>
                      Revoke
                    </InlineConfirm>
                  )}
                </div>
              </Td>
            </tr>
          )
        })}
      </Table>
    </Card>
  )
}

function Activity({ rows }) {
  return (
    <Card pad={false} title="Console actions against this company"
      action={<Link to="/platform/activity" style={{ fontSize: 11.5, color: 'var(--crimson)', textDecoration: 'none' }}>
        All activity <ExternalLink size={10} style={{ display: 'inline', verticalAlign: -1 }} /></Link>}>
      <Table
        columns={[{ label: 'When', width: 160 }, { label: 'Action', width: 200 }, { label: 'Detail' }, { label: 'By', width: 200 }]}
        empty={rows.length === 0 ? <Empty>Nothing has been done to this company from the console.</Empty> : null}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <Td style={{ whiteSpace: 'nowrap' }}>
              <div style={{ color: 'var(--text)' }}>{ago(r.created_at)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{fmtDateTime(r.created_at)}</div>
            </Td>
            <Td><ActionChip action={r.action} /></Td>
            <Td>
              {r.target_email && <div style={{ color: 'var(--text-2)' }}>{r.target_email}</div>}
              {r.reason && <div style={{ color: 'var(--text)', fontStyle: 'italic' }}>“{r.reason}”</div>}
              <MetaSummary meta={r.meta} />
            </Td>
            <Td style={{ fontSize: 11.5 }}>{r.actor_email || '—'}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}
