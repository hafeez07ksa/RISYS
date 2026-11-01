import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Grid3x3, Inbox, FilePen } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { SelectField } from '@/components/ui/Combobox'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { usePolicies, useMyAttestations, useMyPolicyWork } from '@/hooks/usePolicies'
import { POLICY_KINDS, POLICY_STATUSES, labelOf, daysUntil } from '@/lib/policies'
import { fmtDate } from '@/lib/reports/models'
import { Th, Td, Empty, personName, DueText } from '@/features/audits/parts'
import { PolicyStatusBadge, CriticalityBadge, RateBar } from './parts'
import { tx } from '@/lib/i18n'

/* ── Policies ─────────────────────────────────────────────────────────────────
 *
 * The policy library: every policy, procedure, standard and plan, its state,
 * owner, next review and the attestation campaign running for it — plus what
 * is waiting on the person looking at the page.
 * -------------------------------------------------------------------------- */

export function PoliciesPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { policies, loading } = usePolicies()
  const mine = useMyAttestations()
  const work = useMyPolicyWork()
  const [status, setStatus] = useState('active')

  const stats = useMemo(() => {
    const live = policies.filter((p) => p.status !== 'retired')
    const published = live.filter((p) => p.status === 'published')
    const campaigns = live.map((p) => p.openCampaign).filter(Boolean)
    const exp = campaigns.reduce((n, c) => n + Number(c.expected) - Number(c.excused), 0)
    const acc = campaigns.reduce((n, c) => n + Number(c.accepted), 0)
    return {
      published: published.length,
      review: live.filter((p) => ['in_review', 'approved'].includes(p.status)).length,
      overdue: published.filter((p) => daysUntil(p.next_review_on) < 0).length,
      draft: live.filter((p) => p.status === 'draft').length,
      rate: exp ? `${Math.round((100 * acc) / exp)}%` : '—',
    }
  }, [policies])

  const list = policies.filter((p) => status === 'all' || (status === 'active' ? p.status !== 'retired' : p.status === status))
  const waiting = mine.pending.length + work.approvals.length + work.reviews.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title={tx('Policies')}
        subtitle={organization?.name}
        actions={<>
          <button className="btn-secondary" onClick={() => navigate('/app/policies/coverage')}><Grid3x3 size={14} /> {tx('ECC coverage')}</button>
          <button className="btn-secondary" onClick={() => navigate('/app/my-policies')}><FilePen size={14} /> {tx('My policies')}</button>
          {perms.isComplianceWriter && (
            <button className="btn-primary" onClick={() => navigate('/app/policies/new')}><Plus size={14} /> {tx('New policy')}</button>
          )}
        </>}
      />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Published'), value: stats.published, tone: 'low' },
            { label: tx('In approval'), value: stats.review, tone: 'medium' },
            { label: tx('Drafts'), value: stats.draft },
            { label: tx('Review overdue'), value: stats.overdue, tone: 'critical' },
            { label: tx('Attestation, open campaigns'), value: stats.rate },
          ]} />
        </div>

        {waiting > 0 && (
          <section className="section" style={{ marginBottom: 16, borderColor: 'var(--crimson-wash)' }}>
            <div className="flex items-center" style={{ gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
              <Inbox size={14} style={{ color: 'var(--crimson)' }} />
              <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Waiting on you')}</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {work.approvals.map((v) => (
                  <tr key={v.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/policies/${v.policy_id}?tab=text`)}>
                    <Td style={{ width: 170, color: 'var(--text-3)' }}>{tx('Approve a version')}</Td>
                    <Td style={{ color: 'var(--text)' }}>{v.policy?.ref} {v.policy?.title} · v{v.version_no}</Td>
                    <Td align="right">{fmtDate(v.submitted_at)}</Td>
                  </tr>
                ))}
                {mine.pending.map((a) => (
                  <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/my-policies/${a.id}`)}>
                    <Td style={{ width: 170, color: 'var(--text-3)' }}>{tx('Read and attest')}</Td>
                    <Td style={{ color: 'var(--text)' }}>{a.policy?.ref} {a.policy?.title} · v{a.version?.version_no}</Td>
                    <Td align="right"><DueText date={a.campaign?.due_on} /></Td>
                  </tr>
                ))}
                {work.reviews.map((p) => (
                  <tr key={p.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/policies/${p.id}`)}>
                    <Td style={{ width: 170, color: 'var(--text-3)' }}>{tx('Review due')}</Td>
                    <Td style={{ color: 'var(--text)' }}>{p.ref} {p.title}</Td>
                    <Td align="right"><DueText date={p.next_review_on} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Library')}</h3>
            <div style={{ width: 200 }}>
              <SelectField className="w-full" value={status} onChange={(v) => setStatus(v?.target ? v.target.value : v)}
                options={[{ value: 'active', label: tx('All except retired') }, { value: 'all', label: tx('Everything') }, ...POLICY_STATUSES]} />
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          ) : list.length === 0 ? (
            <Empty title={policies.length ? tx('Nothing matches this filter') : tx('No policies yet')}
              action={perms.isComplianceWriter && !policies.length &&
                <button className="btn-primary" onClick={() => navigate('/app/policies/new')}><Plus size={14} /> {tx('Start from the ECC starter set')}</button>}>
              {policies.length ? null : tx('Each ECC domain asks for a documented, approved policy. Start from a template: it fills the title and the ECC mapping, and you write the text.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <Th width={100}>{tx('Ref')}</Th><Th>{tx('Policy')}</Th><Th>{tx('Status')}</Th><Th>{tx('Owner')}</Th>
                  <Th>{tx('Version')}</Th><Th>{tx('Next review')}</Th><Th>{tx('Attestation')}</Th>
                </tr></thead>
                <tbody>
                  {list.map((p) => {
                    const cur = p.versions.find((v) => v.id === p.current_version_id)
                    const open = p.versions.find((v) => ['draft', 'in_review', 'approved'].includes(v.status) && v.id !== p.current_version_id)
                    const c = p.openCampaign
                    return (
                      <tr key={p.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/policies/${p.id}`)}>
                        <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{p.ref}</Td>
                        <Td>
                          <Link to={`/app/policies/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 500 }}>{p.title}</Link>
                          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                            {labelOf(POLICY_KINDS, p.kind)}
                            {p.reqs?.length ? ` · ${p.reqs.filter((r) => r.relation === 'documents').map((r) => r.requirement_id).join(', ')}` : ''}
                            {p.unit ? ` · ${p.unit.name}` : ''}
                          </div>
                        </Td>
                        <Td><div className="flex items-center" style={{ gap: 4, flexWrap: 'wrap' }}><PolicyStatusBadge v={p.status} /><CriticalityBadge v={p.criticality} /></div></Td>
                        <Td>{personName(members, p.owner_id) || '—'}</Td>
                        <Td>{cur ? `v${cur.version_no}` : '—'}{open ? <span style={{ color: 'var(--text-3)' }}> · v{open.version_no} {tx('in progress')}</span> : ''}</Td>
                        <Td>{p.status === 'published' ? <DueText date={p.next_review_on} /> : '—'}</Td>
                        <Td>{c ? <RateBar accepted={Number(c.accepted)} expected={Number(c.expected)} excused={Number(c.excused)} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
