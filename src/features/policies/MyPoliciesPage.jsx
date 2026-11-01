import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { useMyAttestations } from '@/hooks/usePolicies'
import { fmtDateTime } from '@/lib/reports/models'
import { Th, Td, Empty, DueText } from '@/features/audits/parts'
import { AttestationBadge, CriticalityBadge } from './parts'
import { tx } from '@/lib/i18n'

/* /app/my-policies — the policies the signed-in person has been asked to read
 * and accept, newest first. Open to every role. */
export function MyPoliciesPage() {
  const navigate = useNavigate()
  const { items, pending, loading } = useMyAttestations()
  const done = items.filter((a) => !pending.includes(a))

  const Table = ({ rows }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>{tx('Policy')}</Th><Th>{tx('Version')}</Th><Th>{tx('Status')}</Th><Th>{tx('Due')}</Th><Th>{tx('Accepted')}</Th></tr></thead>
      <tbody>{rows.map((a) => (
        <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/my-policies/${a.id}`)}>
          <Td style={{ color: 'var(--text)' }}>{a.policy?.ref} {a.policy?.title} <span style={{ marginInlineStart: 6 }}><CriticalityBadge v={a.policy?.criticality} /></span></Td>
          <Td>v{a.version?.version_no}</Td>
          <Td><AttestationBadge v={a.status} />{a.status === 'pending' && a.campaign?.status === 'closed' && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}> · {tx('campaign closed')}</span>}</Td>
          <Td><DueText date={a.campaign?.due_on} done={a.status !== 'pending' || a.campaign?.status === 'closed'} /></Td>
          <Td>{a.accepted_at ? fmtDateTime(a.accepted_at) : '—'}</Td>
        </tr>
      ))}</tbody>
    </table>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('My policies')} subtitle={tx('Policies you have been asked to read and accept')} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : (
          <>
            <section className="section" style={{ marginBottom: 16 }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('To read')} · {pending.length}</h3>
              </div>
              {pending.length ? <Table rows={pending} /> : <Empty title={tx('Nothing to read')}>{tx('When a policy that applies to you is published, it appears here.')}</Empty>}
            </section>
            {done.length > 0 && (
              <section className="section">
                <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('History')}</h3>
                </div>
                <Table rows={done} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
