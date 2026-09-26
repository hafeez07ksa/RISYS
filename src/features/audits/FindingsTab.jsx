import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Section, RatingBadge, FindingStatusBadge, DueText, Th, Td, Empty, personName } from './parts'
import { tx } from '@/lib/i18n'

/* Findings, written the way audit standards expect: condition, criteria,
 * cause, effect, recommendation — then management's response, owner and date.
 * Each finding opens as its own page (/findings/:findingId). */

export const DONE = ['closed', 'risk_accepted']

export function FindingsTab({ audit, members, canManage, locked }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const base = `/app/audits/${audit.engagement.id}/findings`
  const visible = audit.findings.filter((f) => canManage || f.status !== 'draft')

  return (
    <Section title={`${tx('Findings')} (${visible.length})`} pad={false}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('New finding')}</button>}>
      {visible.length === 0 ? (
        <Empty title={tx('No findings')}
          action={canManage && !locked && <button className="btn-primary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('Write a finding')}</button>}>
          {canManage ? tx(
            'Raise a finding when testing shows a control is not designed or operating as required. Findings stay in draft until you issue them to management.'
          ) : tx('Findings issued by the audit team will appear here.')}
        </Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th width={120}>{tx('Ref')}</Th><Th>{tx('Finding')}</Th><Th>{tx('Rating')}</Th><Th>{tx('Owner')}</Th><Th>{tx('Due')}</Th><Th>{tx('Status')}</Th><Th /></tr></thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/${f.id}`)}>
                <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{f.ref}</Td>
                <Td>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{f.title}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                    {[f.requirement_id && `${f.framework ?? ''} ${f.requirement_id}`, f.risk && `${tx('Risk')} ${f.risk.risk_id}`].filter(Boolean).join(' · ')}
                    {f.response_owner === user.id && !DONE.includes(f.status) && f.status !== 'draft' && <span style={{ color: 'var(--crimson)', fontWeight: 600 }}> {tx('Waiting on you')}</span>}
                  </div>
                </Td>
                <Td><RatingBadge v={f.rating} /></Td>
                <Td>{personName(members, f.response_owner) ?? '—'}</Td>
                <Td><DueText date={f.due_date} done={DONE.includes(f.status)} /></Td>
                <Td><FindingStatusBadge v={f.status} /></Td>
                <Td align="right"><ChevronRight size={14} className="rtl-flip" style={{ color: 'var(--text-3)' }} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}
