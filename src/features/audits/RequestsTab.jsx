import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Section, RequestBadge, DueText, Th, Td, Empty, personName } from './parts'
import { tx } from '@/lib/i18n'

/* Evidence requests: what the auditor asked the business for. Each request
 * opens as its own page (/requests/:requestId), where the person asked attaches
 * files and submits, and the audit team accepts or returns it. Both rules are
 * enforced by audit_request_guard in the database. */

export function RequestsTab({ audit, members, canManage, locked }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const base = `/app/audits/${audit.engagement.id}/requests`

  return (
    <Section title={`${tx('Evidence requests')} (${audit.requests.length})`} pad={false}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('New request')}</button>}>
      {audit.requests.length === 0 ? (
        <Empty title={tx('No evidence requested yet')}
          action={canManage && !locked && <button className="btn-primary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('Request evidence')}</button>}>
          {tx('Ask the business for the documents, exports or screenshots the tests need. The person asked is notified and answers here.')}
        </Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>{tx('Request')}</Th><Th>{tx('Asked of')}</Th><Th>{tx('Due')}</Th><Th align="right">{tx('Files')}</Th><Th>{tx('Status')}</Th><Th /></tr></thead>
          <tbody>
            {audit.requests.map((r) => {
              const files = audit.files.filter((f) => f.request_id === r.id).length
              const mine = r.requested_from === user.id && ['open', 'rejected'].includes(r.status)
              const toReview = canManage && r.status === 'submitted'
              return (
                <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/${r.id}`)}>
                  <Td>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{r.title}</div>
                    {mine && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--crimson)', fontWeight: 600 }}>{tx('Waiting on you')}</div>}
                    {toReview && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--info)', fontWeight: 600 }}>{tx('Submitted — ready to review')}</div>}
                  </Td>
                  <Td>{personName(members, r.requested_from) ?? '—'}</Td>
                  <Td><DueText date={r.due_date} done={['submitted', 'accepted'].includes(r.status)} /></Td>
                  <Td align="right">{files || '—'}</Td>
                  <Td><RequestBadge v={r.status} /></Td>
                  <Td align="right"><ChevronRight size={14} className="rtl-flip" style={{ color: 'var(--text-3)' }} /></Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Section>
  )
}
