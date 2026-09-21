import { useState, useEffect } from 'react'
import { Plus, CheckCheck, Paperclip, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { SelectField } from '@/components/ui/Combobox'
import { TEST_RESULTS } from '@/hooks/useAudits'
import { fmtDate } from '@/lib/reports/models'
import { Dialog, Field, Grid, SubmitButton, ErrorText, Section, ResultBadge, Th, Td, Empty, personName } from './parts'
import { EvidenceList } from './EvidenceList'

/* Scope & testing. Each item is one thing tested — a framework requirement,
 * an organisation control, or both — with the procedure, sample and result.
 * The database stamps who tested and who reviewed, and refuses a review by
 * the person who performed the test. */

export function ScopeTab({ audit, members, canManage, locked }) {
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [testing, setTesting] = useState(null)
  const [error, setError] = useState('')
  const act = (fn) => async () => { setError(''); try { await fn() } catch (e) { setError(e.message) } }

  return (
    <Section title={`Scope & testing (${audit.scope.length})`}
      actions={canManage && !locked && <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={13} /> Add item</button>}
      pad={false}>
      {error && <div style={{ padding: '8px 16px' }}><ErrorText>{error}</ErrorText></div>}
      {audit.scope.length === 0 ? (
        <Empty title="Nothing in scope yet">Add each requirement or control the engagement will test. The results roll up into the audit report.</Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>Item</Th><Th>Test performed</Th><Th align="right">Sample</Th><Th>Result</Th><Th>Tested</Th><Th>Reviewed</Th><Th align="right" />
            </tr></thead>
            <tbody>
              {audit.scope.map((x) => {
                const files = audit.files.filter((f) => f.scope_item_id === x.id)
                const canReview = canManage && !locked && x.result !== 'not_tested' && !x.reviewed_by && x.tested_by !== user.id
                return (
                  <tr key={x.id}>
                    <Td style={{ minWidth: 200 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{x.title}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                        {[x.requirement_id && `${x.framework ?? ''} ${x.requirement_id}`, x.control && `${x.control.control_id ?? ''} ${x.control.name}`].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </Td>
                    <Td style={{ maxWidth: 320 }}>
                      {x.test_procedure || <span style={{ color: 'var(--text-3)' }}>Not described</span>}
                      {x.result_notes && <div style={{ marginTop: 4, color: 'var(--text)' }}>{x.result_notes}</div>}
                      {files.length > 0 && <div style={{ marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}><Paperclip size={11} style={{ display: 'inline' }} /> {files.length} file{files.length > 1 ? 's' : ''}</div>}
                    </Td>
                    <Td align="right" style={{ whiteSpace: 'nowrap' }}>
                      {x.sample_size ? `${x.sample_size} of ${x.population_size ?? '?'}` : '—'}
                      {x.exceptions_found ? <div style={{ color: 'var(--critical)', fontSize: 'var(--t-meta)' }}>{x.exceptions_found} exception{x.exceptions_found > 1 ? 's' : ''}</div> : null}
                    </Td>
                    <Td><ResultBadge v={x.result} /></Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>{x.tested_by ? <>{personName(members, x.tested_by)}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{fmtDate(x.tested_at)}</div></> : '—'}</Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>
                      {x.reviewed_by ? <>{personName(members, x.reviewed_by)}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{fmtDate(x.reviewed_at)}</div></>
                        : canReview ? <button className="btn-secondary" onClick={act(() => audit.reviewScopeItem(x.id))}><CheckCheck size={13} /> Mark reviewed</button>
                        : x.result !== 'not_tested' && x.tested_by === user.id ? <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>Needs another reviewer</span> : '—'}
                    </Td>
                    <Td align="right" style={{ whiteSpace: 'nowrap' }}>
                      {canManage && !locked && <>
                        <button className="btn-ghost" onClick={() => setTesting(x)}>Record test</button>
                        <button className="btn-ghost" title="Remove from scope" onClick={act(async () => {
                          if (window.confirm(`Remove “${x.title}” from scope?`)) await audit.deleteScopeItem(x.id)
                        })}><Trash2 size={13} /></button>
                      </>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddScopeDialog audit={audit} onClose={() => setAdding(false)} />}
      {testing && <TestDialog audit={audit} item={testing} canManage={canManage} onClose={() => setTesting(null)} />}
    </Section>
  )
}

function useFrameworkRequirements(framework) {
  const [reqs, setReqs] = useState([])
  useEffect(() => {
    if (!framework) { setReqs([]); return }
    let alive = true
    supabase.from('framework_requirements_v').select('requirement_id, requirement_text, parent_requirement_id')
      .eq('framework', framework).then(({ data }) => {
        if (!alive) return
        const key = (id) => id.split('-').map((p) => p.padStart(4, '0')).join('-')
        setReqs((data || []).sort((a, b) => key(a.requirement_id).localeCompare(key(b.requirement_id))))
      })
    return () => { alive = false }
  }, [framework])
  return reqs
}

function useControls() {
  const { organization } = useAuth()
  const [controls, setControls] = useState([])
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('risk_controls').select('id, control_id, name').eq('org_id', organization.id).order('name')
      .then(({ data }) => setControls(data || []))
  }, [organization?.id])
  return controls
}

function AddScopeDialog({ audit, onClose }) {
  const framework = audit.engagement.framework
  const reqs = useFrameworkRequirements(framework)
  const controls = useControls()
  const [f, setF] = useState({ requirement_id: '', control_id: '', title: '', test_procedure: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inScope = new Set(audit.scope.map((x) => x.requirement_id).filter(Boolean))

  const pickReq = (id) => {
    const r = reqs.find((x) => x.requirement_id === id)
    setF((v) => ({ ...v, requirement_id: id, title: v.title || (r ? r.requirement_text.slice(0, 120) : '') }))
  }
  const save = async () => {
    if (!f.title.trim()) { setError('Give the item a short title.'); return }
    setBusy(true); setError('')
    try {
      await audit.addScopeItem({
        title: f.title.trim(), test_procedure: f.test_procedure.trim() || null,
        framework: f.requirement_id ? framework : null, requirement_id: f.requirement_id || null,
        control_id: f.control_id || null,
      })
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} title="Add to scope" subtitle="A requirement, a control, or both — and how it will be tested."
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><SubmitButton busy={busy} onClick={save}>Add</SubmitButton></>}>
      {framework && (
        <Field label={`${framework} requirement`}>
          <SelectField className="w-full" value={f.requirement_id} onChange={(e) => pickReq(e.target.value)}
            options={[{ value: '', label: 'None' }, ...reqs.map((r) => ({
              value: r.requirement_id,
              label: `${r.requirement_id}${inScope.has(r.requirement_id) ? ' (in scope)' : ''} — ${r.requirement_text.slice(0, 90)}`,
            }))]} />
        </Field>
      )}
      <Field label="Organisation control">
        <SelectField className="w-full" value={f.control_id} onChange={(e) => setF({ ...f, control_id: e.target.value })}
          options={[{ value: '', label: 'None' }, ...controls.map((c) => ({ value: c.id, label: `${c.control_id ?? ''} ${c.name}`.trim() }))]} />
      </Field>
      <Field label="Title" required>
        <input className="risys-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. MFA enforced for all users" />
      </Field>
      <Field label="Test procedure" help="What the tester will do. Written before testing, so the test is planned rather than fitted to the result.">
        <textarea className="risys-input" rows={3} value={f.test_procedure} onChange={(e) => setF({ ...f, test_procedure: e.target.value })}
                  placeholder="Select 25 enabled accounts at random from the full population and inspect their registered MFA methods…" />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  )
}

function TestDialog({ audit, item, canManage, onClose }) {
  const n = (v) => (v === '' || v == null ? null : Number(v))
  const [f, setF] = useState({
    test_procedure: item.test_procedure ?? '', population_size: item.population_size ?? '', sample_size: item.sample_size ?? '',
    exceptions_found: item.exceptions_found ?? '', result: item.result, result_notes: item.result_notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (n(f.sample_size) != null && n(f.population_size) != null && n(f.sample_size) > n(f.population_size)) { setError('The sample is larger than the population.'); return }
    if (n(f.exceptions_found) != null && n(f.sample_size) != null && n(f.exceptions_found) > n(f.sample_size)) { setError('More exceptions than items sampled.'); return }
    setBusy(true); setError('')
    try {
      await audit.updateScopeItem(item.id, {
        test_procedure: f.test_procedure.trim() || null, population_size: n(f.population_size), sample_size: n(f.sample_size),
        exceptions_found: n(f.exceptions_found), result: f.result, result_notes: f.result_notes.trim() || null,
      })
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} width={640} title={`Record test — ${item.title}`}
      subtitle="Changing the result clears any earlier review; a different person must review it again."
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><SubmitButton busy={busy} onClick={save}>Save result</SubmitButton></>}>
      <Field label="Test procedure">
        <textarea className="risys-input" rows={2} value={f.test_procedure} onChange={set('test_procedure')} />
      </Field>
      <Grid cols={3}>
        <Field label="Population"><input className="risys-input" type="number" min="0" value={f.population_size} onChange={set('population_size')} /></Field>
        <Field label="Sample"><input className="risys-input" type="number" min="0" value={f.sample_size} onChange={set('sample_size')} /></Field>
        <Field label="Exceptions"><input className="risys-input" type="number" min="0" value={f.exceptions_found} onChange={set('exceptions_found')} /></Field>
      </Grid>
      <Field label="Result">
        <SelectField className="w-full" value={f.result} onChange={set('result')} options={TEST_RESULTS} />
      </Field>
      <Field label="What was found">
        <textarea className="risys-input" rows={3} value={f.result_notes} onChange={set('result_notes')}
                  placeholder="7 of 25 sampled accounts had no MFA method registered…" />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div>
        <div className="field-label">Working papers</div>
        <EvidenceList audit={audit} files={audit.files.filter((x) => x.scope_item_id === item.id)}
          canUpload={canManage} onUpload={(file) => audit.uploadEvidence(file, { scopeItemId: item.id })} />
      </div>
    </Dialog>
  )
}
