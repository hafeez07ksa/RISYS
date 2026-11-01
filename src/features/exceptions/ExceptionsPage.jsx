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
import { useExceptions } from '@/hooks/useExceptions'
import { EXCEPTION_STATUSES, EXCEPTION_SUBJECTS, labelOf, daysUntil } from '@/lib/policies'
import { Th, Td, Empty, DueText, personName } from '@/features/audits/parts'
import { ExceptionStatusBadge, CriticalityBadge, authorityLabel } from '@/features/policies/parts'
import { tx } from '@/lib/i18n'

/* ── Exceptions ───────────────────────────────────────────────────────────────
 * Every approved departure from a policy or requirement, who decided it, the
 * compensating controls and when it ends. Visible to every member.
 * -------------------------------------------------------------------------- */
export function ExceptionsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { items, loading } = useExceptions()
  const [status, setStatus] = useState('live')

  const stats = useMemo(() => ({
    waiting: items.filter((e) => e.status === 'submitted').length,
    active: items.filter((e) => e.status === 'approved').length,
    soon: items.filter((e) => e.status === 'approved' && daysUntil(e.expires_on) <= 30).length,
    critical: items.filter((e) => e.status === 'approved' && ['high', 'critical'].includes(e.risk_rating)).length,
  }), [items])
  const list = items.filter((e) => status === 'all' || (status === 'live' ? ['submitted', 'approved'].includes(e.status) : e.status === status))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Exceptions')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <button className="btn-primary" onClick={() => navigate('/app/exceptions/new')}><Plus size={14} /> {tx('Request an exception')}</button>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Awaiting decision'), value: stats.waiting, tone: 'medium' },
            { label: tx('In force'), value: stats.active },
            { label: tx('Ending within 30 days'), value: stats.soon, tone: 'medium' },
            { label: tx('High or critical in force'), value: stats.critical, tone: 'critical' },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Register')}</h3>
            <div style={{ width: 210 }}>
              <SelectField className="w-full" value={status} onChange={(e) => setStatus(e?.target ? e.target.value : e)}
                options={[{ value: 'live', label: tx('Awaiting or in force') }, { value: 'all', label: tx('Everything') }, ...EXCEPTION_STATUSES]} />
            </div>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : list.length === 0 ? (
            <Empty title={items.length ? tx('Nothing matches this filter') : tx('No exceptions')}>
              {tx('Request one when a policy or requirement cannot be met for a while. It needs a justification, compensating controls and an end date, and is decided at the authority its risk rating needs.')}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Exception')}</Th><Th>{tx('Rating')}</Th><Th>{tx('Status')}</Th><Th>{tx('Requested by')}</Th><Th>{tx('Ends')}</Th></tr></thead>
                <tbody>{list.map((e) => (
                  <tr key={e.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/exceptions/${e.id}`)}>
                    <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{e.ref}</Td>
                    <Td>
                      <Link to={`/app/exceptions/${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 500 }}>{e.title}</Link>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{labelOf(EXCEPTION_SUBJECTS, e.subject_type)}{e.subject_label ? ` · ${e.subject_label}` : ''}</div>
                    </Td>
                    <Td><CriticalityBadge v={e.risk_rating} /><div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{authorityLabel(e.required_authority)}</div></Td>
                    <Td><ExceptionStatusBadge v={e.status} /></Td>
                    <Td>{personName(members, e.requested_by) || '—'}</Td>
                    <Td><DueText date={e.expires_on} done={e.status !== 'approved'} /></Td>
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

