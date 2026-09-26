import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckCheck, Paperclip, Trash2, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { fmtDate } from '@/lib/reports/models'
import { ErrorText, Section, ResultBadge, Th, Td, Empty, personName } from './parts'
import { tx } from '@/lib/i18n'

/* Scope & testing. Each item is one thing tested — a framework requirement,
 * an organisation control, or both — with the procedure, sample and result.
 * The database stamps who tested and who reviewed, and refuses a review by
 * the person who performed the test. Adding an item and recording a test are
 * pages of their own: /scope/new and /scope/:itemId. */

export function ScopeTab({ audit, members, canManage, locked }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const base = `/app/audits/${audit.engagement.id}/scope`
  const act = (fn) => async () => { setError(''); try { await fn() } catch (e) { setError(e.message) } }

  return (
    <Section title={`${tx('Scope & testing')} (${audit.scope.length})`}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('Add item')}</button>}
      pad={false}>
      {error && <div style={{ padding: '8px 16px' }}><ErrorText>{error}</ErrorText></div>}
      {audit.scope.length === 0 ? (
        <Empty title={tx('Nothing in scope yet')}
          action={canManage && !locked && <button className="btn-primary" onClick={() => navigate(`${base}/new`)}><Plus size={13} /> {tx('Add the first item')}</button>}>
          {tx('Add each requirement or control the engagement will test, with the test you intend to perform. The results roll up into the audit report.')}
        </Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>{tx('Item')}</Th><Th>{tx('Test performed')}</Th><Th align="right">{tx('Sample')}</Th><Th>{tx('Result')}</Th><Th>{tx('Tested')}</Th><Th>{tx('Reviewed')}</Th><Th align="right" />
            </tr></thead>
            <tbody>
              {audit.scope.map((x) => {
                const files = audit.files.filter((f) => f.scope_item_id === x.id)
                const canReview = canManage && !locked && x.result !== 'not_tested' && !x.reviewed_by && x.tested_by !== user.id
                return (
                  <tr key={x.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/${x.id}`)}>
                    <Td style={{ minWidth: 200 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{x.title}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                        {[x.requirement_id && `${x.framework ?? ''} ${x.requirement_id}`, x.control && `${x.control.control_id ?? ''} ${x.control.name}`].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </Td>
                    <Td style={{ maxWidth: 320 }}>
                      {x.test_procedure || <span style={{ color: 'var(--text-3)' }}>{tx('Not described')}</span>}
                      {x.result_notes && <div style={{ marginTop: 4, color: 'var(--text)' }}>{x.result_notes}</div>}
                      {files.length > 0 && <div style={{ marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}><Paperclip size={11} style={{ display: 'inline' }} /> {files.length} {files.length > 1 ? tx('files') : tx('file')}</div>}
                    </Td>
                    <Td align="right" style={{ whiteSpace: 'nowrap' }}>
                      {x.sample_size ? `${x.sample_size} ${tx('of')} ${x.population_size ?? '?'}` : '—'}
                      {x.exceptions_found ? <div style={{ color: 'var(--critical)', fontSize: 'var(--t-meta)' }}>{x.exceptions_found} {x.exceptions_found > 1 ? tx('exceptions') : tx('exception')}</div> : null}
                    </Td>
                    <Td><ResultBadge v={x.result} /></Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>{x.tested_by ? <>{personName(members, x.tested_by)}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{fmtDate(x.tested_at)}</div></> : '—'}</Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>
                      {x.reviewed_by ? <>{personName(members, x.reviewed_by)}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{fmtDate(x.reviewed_at)}</div></>
                        : canReview ? <button className="btn-secondary" onClick={(ev) => { ev.stopPropagation(); act(() => audit.reviewScopeItem(x.id))() }}><CheckCheck size={13} /> {tx('Mark reviewed')}</button>
                        : x.result !== 'not_tested' && x.tested_by === user.id ? <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{tx('Needs another reviewer')}</span> : '—'}
                    </Td>
                    <Td align="right" style={{ whiteSpace: 'nowrap' }}>
                      <div className="flex items-center justify-end" style={{ gap: 2 }}>
                        {canManage && !locked && (
                          <InlineConfirm triggerTitle={tx('Remove from scope')} message={tx('Remove from scope?')}
                            confirmLabel={tx('Remove')} onConfirm={() => audit.deleteScopeItem(x.id)}>
                            <Trash2 size={13} />
                          </InlineConfirm>
                        )}
                        <ChevronRight size={14} className="rtl-flip" style={{ color: 'var(--text-3)' }} />
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
