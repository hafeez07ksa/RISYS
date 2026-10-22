import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Pencil, KeyRound, Pause, Play, Trash2, ExternalLink, Users, AlertTriangle,
  Plug, Building2, StickyNote, ShieldX, History, HardDrive, Clock, Lock,
} from 'lucide-react'
import { usePlatform, useCompany, activationLink } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import {
  PlatformShell, Card, Table, Td, Empty, Stat, StatRow, Chip, LifecycleChip, Avatar,
  CopyBtn, ActionChip, MetaSummary, ErrorNote, ago, bytes, fmtDate, fmtDateTime, plural,
} from './shared'

/* /platform/companies/:id — one tenant.
 *
 * Everything staff need before acting on a client: who is inside, what is
 * outstanding, and what the console has already done to them. Never what the
 * client has recorded — their risks, incidents and evidence are theirs. Destructive actions live at the bottom, behind the rules the database
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
  // The list RPC's shape, so the lifecycle chip reads the same as on the list.
  const lifeOrg = { ...org, member_count: members.length, pending_invites: pending.length, last_activity: detail.last_risk_activity }
  // The database refuses deletion until 15 minutes after suspension.
  const cooling = suspended && org.suspended_at && (Date.now() - new Date(org.suspended_at).getTime()) < 15 * 60 * 1000

  const run = async (fn) => { setActionError(''); try { await fn(); await reload() } catch (e) { setActionError(e.message); throw e } }

  return (
    <PlatformShell
      back={{ to: '/platform/companies', label: 'All companies' }}
    >
      <ErrorNote>{actionError}</ErrorNote>

      <div className="pc-hero">
        <Avatar name={org.name} size={56} />
        <div className="pc-hero-main">
          <h1 className="pc-hero-name">{org.name}</h1>
          <div className="pc-hero-meta">
            <LifecycleChip org={lifeOrg} />
            {pending.length > 0 && <Chip tone="amber">{plural(pending.length, 'invitation')} pending</Chip>}
            <span>{[org.industry, org.primary_contact].filter(Boolean).join(' · ') || 'No profile details recorded'}</span>
            <span>· Provisioned {fmtDate(org.created_at)}</span>
          </div>
        </div>
        <div className="pc-actions">
          <Link to={`/platform/companies/${id}/edit`} className="btn-secondary" style={{ textDecoration: 'none' }}><Pencil size={13} /> Edit profile</Link>
          <Link to={`/platform/companies/${id}/activation`} className="btn-primary" style={{ textDecoration: 'none' }}><KeyRound size={13} /> Activation link</Link>
        </div>
      </div>

      {suspended && (
        <div className="pc-banner pc-banner--red">
          <ShieldX size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Suspended {org.suspended_at ? ago(org.suspended_at) : ''} — all {plural(members.length, 'member')} are locked out.</strong>
            {org.suspension_reason && <div>Reason: {org.suspension_reason}</div>}
          </div>
        </div>
      )}

      <nav className="pc-tabs">
        {TABS.map((t) => {
          const count = t.key === 'members' ? members.length : t.key === 'invitations' ? invitations.length : null
          return (
            <button key={t.key} className={tab === t.key ? 'is-on' : ''} onClick={() => setParams(t.key === 'overview' ? {} : { tab: t.key })}>
              {t.label}{count != null && <span className="tnum" style={{ opacity: 0.55, marginInlineStart: 4 }}>{count}</span>}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && <Overview detail={detail} org={org} members={members} />}
      {tab === 'members' && <Members members={members} />}
      {tab === 'invitations' && (
        <Invitations invitations={invitations} orgId={id}
          onRevoke={(invId) => run(() => platform.revokeInvitation(invId))} />
      )}
      {tab === 'activity' && <Activity rows={detail.activity || []} />}

      {/* ── Danger zone ── */}
      <div id="danger" style={{ marginTop: 26, scrollMarginTop: 16 }}>
        <Card title="Danger zone" icon={AlertTriangle}>
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
                ? 'Erases the workspace and everything the client has recorded in it, including every evidence file. Member accounts that exist only here are destroyed. No undo.'
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
  const admins = members.filter((m) => ['owner', 'admin'].includes(m.role))
  const pendingInvites = (detail.invitations || []).filter((i) => i.status === 'pending' && !i.expired).length
  return (
    <div className="pc-stack">
      <StatRow min={170}>
        <Stat icon={Users} tone="blue" label="People" value={members.length} sub={plural(admins.length, 'administrator')} />
        <Stat icon={KeyRound} tone="amber" label="Invitations pending" value={pendingInvites} sub="not yet accepted" />
        <Stat icon={Plug} tone="green" label="Connectors" value={detail.connector_count} sub="connected" />
        <Stat icon={HardDrive} tone="neutral" label="Storage used" value={bytes(detail.storage_bytes)} sub="files held for this client" />
        <Stat icon={Clock} tone="wine" label="Last activity" value={detail.last_risk_activity ? ago(detail.last_risk_activity) : 'never'} sub="anyone in the workspace" />
      </StatRow>
      <p className="pc-hint" style={{ margin: '-4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={12} /> The console never shows what a client records in RISYS — risks, incidents, controls, evidence or reports stay inside their workspace.
      </p>

      <div className="pc-grid">
        <Card className="pc-span-6" title="Account" icon={Building2}>
          <dl className="pc-dl">
            <F k="Primary contact" v={org.primary_contact || '—'} />
            <F k="Industry" v={org.industry || '—'} />
            <F k="Administrators" v={admins.length ? admins.map((a) => a.email).join(', ') : '—'} />
            <F k="Provisioned" v={fmtDateTime(org.created_at)} />
            <F k="Workspace ID" v={<span className="mono" style={{ fontSize: 11 }}>{org.id}</span>} />
          </dl>
        </Card>

        <div className="pc-span-6 pc-stack" style={{ gap: 14 }}>
          <Card title="Internal notes" icon={StickyNote}
            action={<Link to={`/platform/companies/${org.id}/edit`} className="pc-link">Edit</Link>}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: org.notes ? 'var(--text-2)' : 'var(--text-3)' }}>
              {org.notes || 'No notes. These are visible only to platform staff, never to the client.'}
            </p>
          </Card>
          <Card title="Connectors" icon={Plug} pad={false}>
            {(detail.connectors || []).length === 0 ? <Empty>No connectors configured.</Empty> : (
              <div className="pc-rows" style={{ paddingBlockEnd: 4 }}>
                {detail.connectors.map((c) => (
                  <div key={c.connector_id} className="pc-row">
                    <span className="pc-row-main">
                      <span className="pc-row-title" style={{ textTransform: 'capitalize' }}>{c.connector_id}</span>
                      <span className="pc-row-sub">{c.last_sync_at ? `synced ${ago(c.last_sync_at)}` : 'never synced'}</span>
                    </span>
                    <Chip dot tone={c.status === 'active' ? 'green' : 'neutral'}>{c.status}</Chip>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const F = ({ k, v }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
)

function Members({ members }) {
  return (
    <Card pad={false} title="Members" icon={Users} caption={plural(members.length, 'person', 'people')}>
      <Table
        columns={[{ label: 'Person' }, { label: 'Role', width: 130 }, { label: 'Title' }, { label: 'Joined', width: 130 }, { label: 'Last active', width: 130 }]}
        empty={members.length === 0 ? <Empty>Nobody has joined this workspace yet.</Empty> : null}
      >
        {members.map((m) => (
          <tr key={m.id}>
            <Td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={m.name || m.email || ''} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{m.name || '—'}</span>
                    {m.is_platform_staff && <Chip tone="blue">Platform staff</Chip>}
                  </div>
                  <div className="pc-sub">{m.email}</div>
                </div>
              </div>
            </Td>
            <Td><Chip tone={['owner', 'admin'].includes(m.role) ? 'amber' : 'neutral'}>{m.role}</Chip></Td>
            <Td>{m.title || '—'}</Td>
            <Td>{fmtDate(m.joined_at)}</Td>
            <Td>{m.last_active ? ago(m.last_active) : <span style={{ color: 'var(--text-3)' }}>never</span>}</Td>
          </tr>
        ))}
      </Table>
      <div className="pc-card-foot">
        Members are managed by the client's own administrator inside their workspace. The console does not add or remove people.
      </div>
    </Card>
  )
}

function Invitations({ invitations, onRevoke }) {
  return (
    <Card pad={false} title="Invitations" icon={KeyRound} caption={plural(invitations.length, 'invitation')}>
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
    <Card pad={false} title="Console actions against this company" icon={History}
      action={<Link to="/platform/activity" className="pc-link">All activity <ExternalLink size={10} /></Link>}>
      <Table
        columns={[{ label: 'When', width: 160 }, { label: 'Action', width: 200 }, { label: 'Detail' }, { label: 'By', width: 200 }]}
        empty={rows.length === 0 ? <Empty>Nothing has been done to this company from the console.</Empty> : null}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <Td style={{ whiteSpace: 'nowrap' }}>
              <div style={{ color: 'var(--text)' }}>{ago(r.created_at)}</div>
              <div className="pc-sub">{fmtDateTime(r.created_at)}</div>
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
