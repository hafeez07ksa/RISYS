import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Upload, X, CheckCircle2, Undo2, Plus } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { Combobox } from '@/components/ui/Combobox'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useEvidenceItem } from '@/hooks/useEvidenceLibrary'
import { useFrameworkRequirements } from '@/hooks/usePolicies'
import { hasCccProfile } from '@/hooks/useCompliance'
import { EVIDENCE_KINDS, labelOf } from '@/lib/policies'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Section, Facts, Field, SubmitButton, ErrorText, Empty, DueText, personName } from '@/features/audits/parts'
import { EvidenceReviewBadge, FileChip, shortHash } from '@/features/policies/parts'
import { tx } from '@/lib/i18n'

/* /app/evidence/:id — one evidence item: its files, where it is used, its
 * review (by someone other than the person who added it) and, once accepted,
 * replacement by a newer item. */
export function EvidenceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const ev = useEvidenceItem(id)
  const i = ev.item
  const reqs = useFrameworkRequirements()
  const [note, setNote] = useState('')
  const [addReq, setAddReq] = useState(null)
  const [newer, setNewer] = useState(null)
  const [others, setOthers] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  useEffect(() => {
    if (!organization?.id || !i || i.review_status !== 'accepted' || i.superseded_by) return
    supabase.from('evidence_items').select('id, ref, title, review_status').eq('org_id', organization.id).neq('id', i.id).is('superseded_by', null)
      .order('created_at', { ascending: false }).limit(200).then(({ data }) => setOthers(data || []))
  }, [organization?.id, i?.id, i?.review_status, i?.superseded_by]) // eslint-disable-line react-hooks/exhaustive-deps

  const withCcc = hasCccProfile(organization)
  const reqOptions = useMemo(() => reqs.filter((r) => r.framework === 'NCA ECC' || withCcc).map((r) => ({
    value: `${r.framework}|${r.requirement_id}`, label: `${r.framework === 'NCA ECC' ? 'ECC' : 'CCC'} ${r.requirement_id}`, description: r.requirement_text?.slice(0, 120),
  })), [reqs, withCcc])

  const back = { label: tx('Evidence library'), onClick: () => navigate('/app/evidence') }
  if (ev.loading) return <PageLoading />
  if (!i) return <PageNotFound title={tx('Evidence not found')} back={back} />

  const mine = i.added_by === user?.id
  const canReview = perms.isComplianceWriter && !mine && i.review_status === 'pending' && !i.superseded_by
  const canLink = perms.isComplianceWriter || mine
  const canFix = (mine || perms.isComplianceWriter) && i.review_status === 'returned'
  const fromPolicy = i.source_type === 'policy_version'

  return (
    <RecordPage
      title={`${i.ref} — ${i.title}`}
      description={labelOf(EVIDENCE_KINDS, i.kind)}
      meta={<><EvidenceReviewBadge v={i.review_status} />{i.superseded_by && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{tx('Superseded')}</span>}</>}
      back={back}
      aside={
        <Section title={tx('Record')}>
          <Facts rows={[
            [tx('Owner'), personName(members, i.owner_id)],
            [tx('Added'), `${personName(members, i.added_by)} · ${fmtDateTime(i.created_at)}`],
            [tx('Valid'), i.valid_from || i.valid_until ? <span key="v">{fmtDate(i.valid_from)} – {i.valid_until ? <DueText date={i.valid_until} done={!!i.superseded_by} /> : '—'}</span> : null],
            [tx('Reviewed'), i.reviewed_by ? `${personName(members, i.reviewed_by)} · ${fmtDateTime(i.reviewed_at)}` : null],
            [tx('Review note'), i.review_note],
            [tx('Source'), fromPolicy ? <Link key="p" to={`/app/policies`}>{tx('Published policy version')}</Link> : null],
          ]} />
        </Section>
      }
    >
      <ErrorText>{error}</ErrorText>
      {i.description && <Section title={tx('Description')}><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{i.description}</p></Section>}

      <Section title={tx('Files')}>
        {(i.files || []).length === 0 ? <p style={{ margin: 0, color: 'var(--text-3)' }}>{fromPolicy ? tx('The policy text itself is the evidence.') : tx('No files.')}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {i.files.map((f) => (
              <div key={f.path} className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
                <FileChip file={f} onError={setError} />
                <code style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{shortHash(f.sha256)}</code>
              </div>
            ))}
          </div>
        )}
        {canFix && (
          <label className="btn-secondary" style={{ cursor: 'pointer', marginTop: 10 }}><Upload size={13} /> {tx('Add files and send back for review')}
            <input type="file" multiple hidden onChange={(e) => { const add = [...(e.target.files || [])]; e.target.value = ''; if (add.length) run('files', () => ev.addFiles(add))() }} /></label>
        )}
      </Section>

      <Section title={tx('Used for')} pad={false}>
        {(i.links || []).length === 0 ? <Empty title={tx('Not linked yet')}>{tx('Link it to the requirements and controls it supports.')}</Empty> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {i.links.map((l) => {
              const ctl = ev.controls.find((c) => c.id === l.control_id)
              return (
                <tr key={l.id}>
                  <td style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
                    {l.requirement_id ? <Link to={`/app/compliance/${encodeURIComponent(l.framework)}/${encodeURIComponent(l.requirement_id)}`}>{l.framework} {l.requirement_id}</Link>
                      : l.control_id ? <Link to={`/app/controls/${l.control_id}`}>{tx('Control')} {ctl ? `${ctl.control_id || ''} ${ctl.name}` : ''}</Link>
                      : <Link to="/app/audits">{tx('Audit test')}</Link>}
                  </td>
                  <td style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', textAlign: 'end' }}>
                    {perms.isComplianceWriter && !fromPolicy && <button className="btn-ghost" title={tx('Remove')} disabled={!!busy} onClick={run(`rm-${l.id}`, () => ev.removeLink(l.id))}><X size={12} /></button>}
                  </td>
                </tr>
              )
            })}
          </tbody></table>
        )}
        {canLink && !fromPolicy && (
          <div className="flex items-center" style={{ gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}><Combobox value={addReq} onChange={setAddReq} options={reqOptions} placeholder={tx('Link a requirement')} /></div>
            <button className="btn-secondary" disabled={!addReq || !!busy} onClick={run('link', async () => {
              const [framework, requirement_id] = addReq.split('|'); await ev.addLink({ framework, requirement_id }); setAddReq(null)
            })}><Plus size={13} /> {tx('Link')}</button>
          </div>
        )}
      </Section>

      {canReview && (
        <Section title={tx('Review')}>
          <Field label={tx('Note')} help={tx('Required when returning it: say what is missing.')}>
            <textarea className="risys-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex" style={{ gap: 8, marginTop: 10 }}>
            <SubmitButton busy={busy === 'acc'} onClick={run('acc', () => ev.review(true, note.trim()))}><CheckCircle2 size={13} /> {tx('Accept')}</SubmitButton>
            <button className="btn-secondary" disabled={!!busy} onClick={run('ret', () => ev.review(false, note.trim()))}><Undo2 size={13} /> {tx('Return')}</button>
          </div>
        </Section>
      )}
      {i.review_status === 'pending' && mine && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>{tx('Waiting for review by a compliance writer other than you.')}</p>}

      {i.review_status === 'accepted' && !i.superseded_by && canLink && !fromPolicy && (
        <Section title={tx('Replace with newer evidence')}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>{tx('An accepted item never changes. Add the new evidence first, then pick it here: its links are carried over and this one is marked superseded.')}</p>
          <div className="flex items-center" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><Combobox value={newer} onChange={setNewer} placeholder={tx('Choose the newer item')}
              options={others.map((o) => ({ value: o.id, label: `${o.ref} ${o.title}` }))} /></div>
            <button className="btn-secondary" disabled={!newer || !!busy} onClick={run('sup', () => ev.supersede(newer))}>{tx('Supersede')}</button>
          </div>
        </Section>
      )}
    </RecordPage>
  )
}
