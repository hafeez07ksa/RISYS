import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, ClipboardCheck, Inbox } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useAudits, useMyAuditItems, AUDIT_TYPES, labelOf, ACTIVE_FINDING } from '@/hooks/useAudits'
import { fmtDate } from '@/lib/reports/models'
import { EngagementForm } from './EngagementForm'
import { StageBadge, OpinionBadge, RatingBadge, DueText, Th, Td, Empty, isOverdue } from './parts'

/* ── Audits ───────────────────────────────────────────────────────────────────
 *
 * The audit function's workspace: engagements, what is waiting on the person
 * looking at the page, and the open findings across all of them. Everyone in
 * the organisation can see it — the people being audited are the ones who
 * answer evidence requests and respond to findings.
 * -------------------------------------------------------------------------- */

export function AuditsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { engagements, loading, createEngagement } = useAudits()
  const mine = useMyAuditItems()
  const [showNew, setShowNew] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const stats = useMemo(() => {
    const active = engagements.filter((e) => !['closed', 'cancelled'].includes(e.status))
    const findings = engagements.flatMap((e) => e.findings ?? [])
    const open = findings.filter((f) => ACTIVE_FINDING.includes(f.status))
    const requests = engagements.flatMap((e) => e.requests ?? [])
    return {
      active: active.length,
      open: open.length,
      high: open.filter((f) => f.rating === 'high').length,
      overdue: open.filter((f) => isOverdue(f.due_date)).length,
      outstanding: requests.filter((r) => ['open', 'rejected'].includes(r.status)).length,
    }
  }, [engagements])

  const list = engagements.filter((e) => showClosed || !['closed', 'cancelled'].includes(e.status))
  const waiting = mine.requests.length + mine.findings.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title="Audits"
        subtitle={organization?.name}
        actions={perms.canManageAudits && (
          <button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New engagement</button>
        )}
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: 'Active engagements', value: stats.active },
            { label: 'Open findings', value: stats.open },
            { label: 'High-rated open', value: stats.high, tone: 'critical' },
            { label: 'Past due date', value: stats.overdue, tone: 'critical' },
            { label: 'Evidence outstanding', value: stats.outstanding, tone: 'medium' },
          ]} />
        </div>

        {waiting > 0 && (
          <section className="section" style={{ marginBottom: 16, borderColor: 'var(--crimson-wash)' }}>
            <div className="flex items-center" style={{ gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
              <Inbox size={14} style={{ color: 'var(--crimson)' }} />
              <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>Waiting on you</h3>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{waiting} item{waiting === 1 ? '' : 's'}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {mine.requests.map((r) => (
                  <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/audits/${r.engagement_id}?tab=requests`)}>
                    <Td style={{ width: 150, color: 'var(--text-3)' }}>Evidence request</Td>
                    <Td style={{ color: 'var(--text)' }}>{r.title}<span style={{ color: 'var(--text-3)' }}> · {r.engagement?.ref}</span>
                      {r.status === 'rejected' && <span style={{ color: 'var(--critical)' }}> · returned for more</span>}</Td>
                    <Td align="right"><DueText date={r.due_date} /></Td>
                  </tr>
                ))}
                {mine.findings.map((f) => (
                  <tr key={f.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/audits/${f.engagement_id}?tab=findings`)}>
                    <Td style={{ width: 150, color: 'var(--text-3)' }}>Finding to address</Td>
                    <Td style={{ color: 'var(--text)' }}>{f.ref} {f.title} <span style={{ marginLeft: 6 }}><RatingBadge v={f.rating} /></span></Td>
                    <Td align="right"><DueText date={f.due_date} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>Engagements</h3>
            <label className="flex items-center" style={{ gap: 6, fontSize: 'var(--t-sm)', color: 'var(--text-3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed
            </label>
          </div>
          {loading ? (
            <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          ) : list.length === 0 ? (
            <Empty title={engagements.length ? 'No active engagements' : 'No audits yet'}
              action={perms.canManageAudits && !engagements.length &&
                <button className="btn-primary" onClick={() => setShowNew(true)}><ClipboardCheck size={14} /> Plan the first engagement</button>}>
              {engagements.length
                ? 'Tick “Show closed” to see past engagements.'
                : 'An engagement holds what is being audited, the tests performed, the evidence requested from the business, the findings raised and the final report.'}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th width={110}>Ref</Th><Th>Engagement</Th><Th>Stage</Th><Th>Lead</Th>
                  <Th>Fieldwork</Th><Th align="right">Tested</Th><Th align="right">Open findings</Th><Th>Opinion</Th>
                </tr></thead>
                <tbody>
                  {list.map((e) => {
                    const tested = (e.scope ?? []).filter((x) => x.result !== 'not_tested').length
                    const open = (e.findings ?? []).filter((f) => ACTIVE_FINDING.includes(f.status))
                    const high = open.filter((f) => f.rating === 'high').length
                    return (
                      <tr key={e.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/audits/${e.id}`)}>
                        <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{e.ref}</Td>
                        <Td>
                          <Link to={`/app/audits/${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 500 }}>{e.title}</Link>
                          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{labelOf(AUDIT_TYPES, e.audit_type)}{e.framework ? ` · ${e.framework}` : ''}</div>
                        </Td>
                        <Td><StageBadge v={e.status} /></Td>
                        <Td>{e.lead?.full_name || e.lead?.email || '—'}</Td>
                        <Td>{e.planned_start ? `${fmtDate(e.planned_start)} – ${fmtDate(e.planned_end)}` : '—'}</Td>
                        <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{tested} / {(e.scope ?? []).length}</Td>
                        <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {open.length}{high ? <span style={{ color: 'var(--critical)', fontWeight: 600 }}> · {high} high</span> : ''}
                        </Td>
                        <Td><OpinionBadge v={e.opinion} /></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showNew && (
        <EngagementForm open onClose={() => setShowNew(false)} members={members}
          onSave={async (v) => { const e = await createEngagement(v); navigate(`/app/audits/${e.id}`) }} />
      )}
    </div>
  )
}
