import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { SelectField } from '@/components/ui/Combobox'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useEvidenceLibrary } from '@/hooks/useEvidenceLibrary'
import { EVIDENCE_KINDS, EVIDENCE_REVIEW, labelOf, daysUntil } from '@/lib/policies'
import { Th, Td, Empty, DueText, personName } from '@/features/audits/parts'
import { EvidenceReviewBadge } from '@/features/policies/parts'
import { tx } from '@/lib/i18n'

/* ── Evidence library ─────────────────────────────────────────────────────────
 * Evidence collected once and used for many requirements, controls and audit
 * tests, with its validity and its four-eyes review.
 * -------------------------------------------------------------------------- */
export function EvidenceLibraryPage() {
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useEvidenceLibrary()
  const [filter, setFilter] = useState('current')

  const stats = useMemo(() => {
    const current = items.filter((i) => !i.superseded_by)
    return {
      pending: current.filter((i) => i.review_status === 'pending').length,
      accepted: current.filter((i) => i.review_status === 'accepted').length,
      returned: current.filter((i) => i.review_status === 'returned').length,
      expiring: current.filter((i) => i.review_status === 'accepted' && i.valid_until && daysUntil(i.valid_until) <= 30).length,
    }
  }, [items])

  const list = items.filter((i) => {
    if (filter === 'all') return true
    if (filter === 'current') return !i.superseded_by
    if (filter === 'mine') return i.added_by === user?.id || i.owner_id === user?.id
    if (filter === 'to_review') return !i.superseded_by && i.review_status === 'pending' && i.added_by !== user?.id
    return !i.superseded_by && i.review_status === filter
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Evidence library')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <button className="btn-primary" onClick={() => navigate('/app/evidence/new')}><Plus size={14} /> {tx('Add evidence')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Awaiting review'), value: stats.pending, tone: 'medium' },
            { label: tx('Accepted'), value: stats.accepted, tone: 'low' },
            { label: tx('Returned'), value: stats.returned, tone: 'critical' },
            { label: tx('Expiring within 30 days'), value: stats.expiring, tone: 'medium' },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Evidence')}</h3>
            <div style={{ width: 210 }}>
              <SelectField className="w-full" value={filter} onChange={(e) => setFilter(e?.target ? e.target.value : e)} options={[
                { value: 'current', label: tx('Current (not superseded)') },
                ...(perms.isComplianceWriter ? [{ value: 'to_review', label: tx('For me to review') }] : []),
                { value: 'mine', label: tx('Added or owned by me') },
                ...EVIDENCE_REVIEW,
                { value: 'all', label: tx('Everything') },
              ]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No evidence yet')}>
              {tx('Add a document, export or screenshot once and link it to every requirement, control and audit test it supports. Published policies appear here on their own.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Evidence')}</Th><Th>{tx('Used for')}</Th><Th>{tx('Review')}</Th><Th>{tx('Owner')}</Th><Th>{tx('Valid until')}</Th></tr></thead>
                <tbody>{list.map((i) => (
                  <tr key={i.id} className="row-hover" style={{ cursor: 'pointer', opacity: i.superseded_by ? 0.6 : 1 }} onClick={() => navigate(`/app/evidence/${i.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{i.ref}</Td>
                    <Td>
                      <Link to={`/app/evidence/${i.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 500 }}>{i.title}</Link>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{labelOf(EVIDENCE_KINDS, i.kind)} · {(i.files || []).length} {tx('files')}{i.superseded_by ? ` · ${tx('superseded')}` : ''}</div>
                    </Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-meta)' }}>
                      {(i.links || []).filter((l) => l.requirement_id).slice(0, 4).map((l) => l.requirement_id).join(', ')}
                      {(i.links || []).length > 4 ? ` +${i.links.length - 4}` : ''}
                      {(i.links || []).some((l) => l.control_id) && <span style={{ fontFamily: 'inherit', color: 'var(--text-3)' }}> · {(i.links || []).filter((l) => l.control_id).length} {tx('controls')}</span>}
                    </Td>
                    <Td><EvidenceReviewBadge v={i.review_status} /></Td>
                    <Td>{personName(members, i.owner_id) || '—'}</Td>
                    <Td>{i.valid_until ? <DueText date={i.valid_until} done={!!i.superseded_by} /> : '—'}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
