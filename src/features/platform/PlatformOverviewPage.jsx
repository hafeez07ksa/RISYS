import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Hourglass, Users, Sparkles, Plug, History, Inbox, TrendingUp, Activity as ActivityIcon,
  KeyRound, Pause, Play, Trash2, Pencil, ShieldCheck, ShieldOff, XCircle, CircleCheck, ArrowUpRight, SlidersHorizontal, Bot,
} from 'lucide-react'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { StackBar } from '@/components/ui/charts'
import { useAuthStore } from '@/store/authStore'
import {
  PlatformShell, Card, Kpi, Chip, Avatar, LifecycleChip, ErrorNote, ACTION_LABELS,
  ago, fmtDateTime, lifecycle, plural,
} from './shared'

/* /platform — the state of the platform at a glance.
 *
 * Opens on what needs a person (a link that expired, a client who never
 * activated, a suspended tenant left forgotten), then the shape of the estate:
 * how far each company has got, who is active, and what the console has done
 * lately. Every figure comes from platform_stats and platform_list_organizations.
 * Nothing a client records — risks, incidents, evidence — is shown here. */

const LIFE_COLOURS = { active: '#2F6B4E', quiet: '#B9ADAA', pending: '#D9A441', expired: '#B8433A', suspended: '#8C1616' }
const LIFE_LABELS = { active: 'Active', quiet: 'Quiet 30+ days', pending: 'Awaiting activation', expired: 'Link expired', suspended: 'Suspended' }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function PlatformOverviewPage() {
  const { orgs, stats, loading, error, listAudit } = usePlatform()
  const user = useAuthStore((s) => s.user)
  const first = (user?.user_metadata?.full_name || '').split(' ')[0]
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const m = useMemo(() => {
    const life = { active: 0, quiet: 0, pending: 0, expired: 0, suspended: 0 }
    for (const o of orgs) life[lifecycle(o).key]++

    const attention = []
    for (const o of orgs) {
      const l = lifecycle(o)
      if (l.key === 'expired') attention.push({ o, tone: 'red', why: 'Activation link expired — nobody has joined', act: { to: `/platform/companies/${o.id}/activation`, label: 'Issue new link' } })
      else if (l.key === 'pending') attention.push({ o, tone: 'amber', why: `Awaiting activation · provisioned ${ago(o.created_at)}`, act: { to: `/platform/companies/${o.id}?tab=invitations`, label: 'Copy link' } })
      else if (l.key === 'suspended') attention.push({ o, tone: 'red', why: o.suspension_reason ? `Suspended: ${o.suspension_reason}` : 'Suspended', act: { to: `/platform/companies/${o.id}#danger`, label: 'Review' } })
      else if (l.key === 'quiet') attention.push({ o, tone: 'neutral', why: `No activity for ${ago(o.last_activity || o.last_seen || o.created_at).replace(' ago', '')}`, act: { to: `/platform/companies/${o.id}`, label: 'Open' } })
    }
    const rank = { red: 0, amber: 1, neutral: 2 }
    attention.sort((a, b) => rank[a.tone] - rank[b.tone])

    const funnel = [
      { key: 'prov', label: 'Provisioned', hint: 'workspace created', n: orgs.length, colour: '#B9ADAA' },
      { key: 'act', label: 'Activated', hint: 'an admin joined', n: orgs.filter((o) => o.member_count > 0).length, colour: '#8C2D2D' },
      { key: 'team', label: 'Team invited', hint: 'more than one person', n: orgs.filter((o) => o.member_count > 1).length, colour: '#5D0F0F' },
      { key: 'live', label: 'Active this month', hint: 'activity in 30 days', n: life.active, colour: '#2F6B4E' },
    ]

    // Companies provisioned per month, last six months.
    const months = []
    const now = new Date()
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), n: 0 })
    }
    for (const o of orgs) {
      const d = new Date(o.created_at)
      const f = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`)
      if (f) f.n++
    }

    const tenants = [...orgs].sort((a, b) =>
      new Date(b.last_activity || b.last_seen || b.created_at) - new Date(a.last_activity || a.last_seen || a.created_at))

    return { life, attention, funnel, months, tenants }
  }, [orgs])

  const lifeSegs = Object.keys(m.life).map((k) => ({ key: k, value: m.life[k], color: LIFE_COLOURS[k], label: LIFE_LABELS[k] }))
  const awaiting = m.life.pending + m.life.expired

  return (
    <PlatformShell
      display
      eyebrow={first ? `${greeting()}, ${first}` : greeting()}
      title="Platform overview"
      description={`${today} · ${plural(orgs.length, 'tenant')} on RISYS`}
    >
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div> : (
        <div className="pc-stack">
          {/* ── KPIs ── */}
          <div className="pc-kpis">
            <Kpi icon={Building2} tone="wine" label="Companies" value={stats?.companies ?? 0} to="/platform/companies"
              sub={`${stats?.active ?? 0} active · ${stats?.suspended ?? 0} suspended`}>
              <StackBar segments={lifeSegs} label="Companies by state" />
            </Kpi>
            <Kpi icon={Hourglass} tone="amber" label="Awaiting activation" value={awaiting} alert={m.life.expired > 0}
              to="/platform/companies"
              sub={m.life.expired ? `${plural(m.life.expired, 'link')} expired · ${m.life.pending} pending` : awaiting ? `${m.life.pending} link${m.life.pending === 1 ? '' : 's'} still valid` : 'Every company has an admin'} />
            <Kpi icon={Users} tone="blue" label="People in workspaces" value={stats?.seats_used ?? 0}
              sub={`${plural(stats?.total_users ?? 0, 'account')} on the platform`} />
            <Kpi icon={Sparkles} tone="wine" label="New this month" value={stats?.signups_30d ?? 0}
              sub="companies provisioned in 30 days" />
            <Kpi icon={Plug} tone="green" label="Connected platforms" value={stats?.connectors ?? 0}
              sub="active connector links across tenants" />
            <Kpi icon={History} tone="neutral" label="Console actions" value={stats?.console_actions_7d ?? 0}
              to="/platform/activity" sub={`last 7 days · ${plural(stats?.staff ?? 0, 'staff member')}`} />
          </div>

          {/* ── Attention + funnel ── */}
          <div className="pc-grid">
            <Card className="pc-span-7" title="Needs attention" icon={Inbox} pad={false}
              caption={m.attention.length ? plural(m.attention.length, 'item') : null}>
              {m.attention.length === 0 ? (
                <div className="pc-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span className="pc-card-icon" style={{ width: 36, height: 36, borderRadius: 11, color: '#2F6B4E', background: '#E6F1EA' }}><CircleCheck size={18} /></span>
                  <strong style={{ color: 'var(--text-2)' }}>All clear</strong>
                  Every company is activated and in use.
                </div>
              ) : (
                <div className="pc-rows" style={{ paddingBlockEnd: 6 }}>
                  {m.attention.slice(0, 8).map(({ o, tone, why, act }) => (
                    <div key={o.id} className="pc-row">
                      <Avatar name={o.name} size={32} />
                      <div className="pc-row-main">
                        <Link to={`/platform/companies/${o.id}`} className="pc-row-title" style={{ textDecoration: 'none' }}>{o.name}</Link>
                        <span className="pc-row-sub">{(o.admins || [])[0]?.email || o.primary_contact || o.industry || '—'}</span>
                      </div>
                      <Chip tone={tone} dot>{why}</Chip>
                      <Link to={act.to} className="pc-link">{act.label} <ArrowUpRight size={11} /></Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="pc-span-5" title="Activation funnel" icon={TrendingUp}
              caption="how far each company has got">
              <div className="pc-funnel">
                {m.funnel.map((f) => (
                  <div key={f.key} className="pc-funnel-row">
                    <span className="pc-funnel-label">{f.label}<small>{f.hint}</small></span>
                    <span className="pc-funnel-bar" title={`${f.label}: ${f.n}`}>
                      <span style={{ width: `${orgs.length ? (f.n / orgs.length) * 100 : 0}%`, background: f.colour }} />
                    </span>
                    <span className="pc-funnel-n tnum">{f.n}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                {orgs.length
                  ? `${Math.round((m.funnel[2].n / orgs.length) * 100)}% of companies have invited their team.`
                  : 'Provision a company to start the funnel.'}
              </p>
            </Card>
          </div>

          {/* ── Tenants + growth + activity ── */}
          <div className="pc-grid">
            <Card className="pc-span-8" title="Tenants" icon={Building2} pad={false}
              caption="most recently active first"
              action={<Link to="/platform/companies" className="pc-link" style={{ marginInlineEnd: 0 }}>All companies <ArrowUpRight size={11} /></Link>}>
              {m.tenants.length === 0 ? (
                <div className="pc-empty">No companies yet. <Link to="/platform/companies/new" className="pc-link">Provision the first one</Link></div>
              ) : (
                <div className="pc-tiles">
                  {m.tenants.slice(0, 6).map((o) => (
                    <Link key={o.id} to={`/platform/companies/${o.id}`} className="pc-tile">
                      <div className="pc-tile-head">
                        <Avatar name={o.name} size={36} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="pc-tile-name">{o.name}</div>
                          <div className="pc-tile-meta">{o.industry || o.primary_contact || 'No profile details'}</div>
                        </div>
                      </div>
                      <div className="pc-tile-stats">
                        <span><b className="tnum">{o.member_count}</b>people</span>
                        <span><b className="tnum">{(o.admins || []).length}</b>admins</span>
                        <span><b className="tnum">{o.pending_invites}</b>invites</span>
                      </div>
                      <div className="pc-tile-foot">
                        <LifecycleChip org={o} />
                        <span>{o.last_activity || o.last_seen ? `active ${ago(o.last_activity || o.last_seen)}` : `created ${ago(o.created_at)}`}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <div className="pc-span-4 pc-stack" style={{ gap: 14 }}>
              <Card title="New companies" icon={ActivityIcon} caption="last 6 months">
                <Growth months={m.months} />
                <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                  {plural(stats?.signups_30d ?? 0, 'company', 'companies')} provisioned in the last 30 days.
                </p>
              </Card>
              <RecentActivity listAudit={listAudit} />
            </div>
          </div>
        </div>
      )}
    </PlatformShell>
  )
}

function Growth({ months }) {
  const max = Math.max(1, ...months.map((x) => x.n))
  const [on, setOn] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id) }, [])
  return (
    <div className="pc-growth">
      {months.map((x) => (
        <div key={x.key} className="pc-growth-col" title={`${x.label}: ${x.n}`}>
          <span className="pc-growth-n tnum">{x.n}</span>
          <span className={`pc-growth-bar${x.n ? '' : ' is-zero'}`} style={{ height: on ? `${x.n ? Math.max(8, (x.n / max) * 80) : 3}%` : '0%' }} />
          <span className="pc-growth-m">{x.label}</span>
        </div>
      ))}
    </div>
  )
}

const ACTION_ICON = {
  'company.provisioned': [Building2, 'green'],
  'company.profile_updated': [Pencil, 'neutral'],
  'company.limits_changed': [SlidersHorizontal, 'neutral'],
  'company.suspended': [Pause, 'amber'],
  'company.reactivated': [Play, 'green'],
  'company.deleted': [Trash2, 'wine'],
  'company.admin_link_issued': [KeyRound, 'blue'],
  'company.invitation_revoked': [XCircle, 'neutral'],
  'company.ai_changed': [Bot, 'blue'],
  'staff.granted': [ShieldCheck, 'blue'],
  'staff.revoked': [ShieldOff, 'amber'],
}

export function ActivityTimeline({ rows }) {
  return (
    <ul className="pc-timeline" style={{ listStyle: 'none', margin: 0 }}>
      {rows.map((r) => {
        const [Icon, tone] = ACTION_ICON[r.action] || [History, 'neutral']
        return (
          <li key={r.id}>
            <span className={`pc-tl-icon pc-tone-${tone}`}><Icon size={13} strokeWidth={1.9} /></span>
            <span className="pc-tl-main">
              <span className="pc-tl-title">{(ACTION_LABELS[r.action] || [r.action])[0]}</span>
              <span className="pc-tl-sub">{[r.org_name, r.target_email].filter(Boolean).join(' · ') || '—'}</span>
              <span className="pc-tl-meta" title={fmtDateTime(r.created_at)}>{r.actor_email} · {ago(r.created_at)}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function RecentActivity({ listAudit }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    listAudit({ limit: 6 })
      .then((d) => { if (alive) setRows(d || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Recent console activity" icon={History} pad={false} style={{ flex: 1 }}
      action={<Link to="/platform/activity" className="pc-link">View all <ArrowUpRight size={11} /></Link>}>
      {rows === null ? <div className="pc-empty">Loading…</div>
        : rows.length === 0 ? <div className="pc-empty">No console actions recorded yet.</div>
          : <ActivityTimeline rows={rows.slice(0, 6)} />}
    </Card>
  )
}
