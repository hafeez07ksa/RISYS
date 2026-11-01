import { useState } from 'react'
import { Plus, Download, Pencil, Trash2, Building2 } from 'lucide-react'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { usePeople } from '@/hooks/usePeople'
import { useBusinessUnits } from '@/hooks/useBusinessUnits'
import { Section, Field, SubmitButton, ErrorText, Th, Td, Empty, personName } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

/* ── Settings → Business units ────────────────────────────────────────────────
 *
 * The organisation's structure. Units own policies and are audiences for
 * attestation (a unit includes the units below it). Seed it from Entra
 * departments, then arrange the tree and assign people.
 * -------------------------------------------------------------------------- */

const BLANK = { name: '', code: '', parent_id: '', head_id: '' }

export function BusinessUnitsSettings() {
  const { members } = usePeople()
  const bu = useBusinessUnits()
  const [form, setForm] = useState(null)       // null | { id?, ...fields }
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const run = (key, fn) => async () => { setBusy(key); setError(''); setNote(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  const save = run('save', async () => {
    if (!form.name.trim()) throw new Error(tx('Give the unit a name.'))
    const v = { name: form.name.trim(), code: form.code.trim() || null, parent_id: form.parent_id || null, head_id: form.head_id || null }
    if (form.id) await bu.updateUnit(form.id, v); else await bu.addUnit(v)
    setForm(null)
  })

  const descendants = (id) => {
    const out = new Set([id])
    let grew = true
    while (grew) { grew = false; for (const u of bu.units) if (u.parent_id && out.has(u.parent_id) && !out.has(u.id)) { out.add(u.id); grew = true } }
    return out
  }
  const parentOptions = (selfId) => [{ value: '', label: tx('Top level') },
    ...bu.active.filter((u) => !selfId || !descendants(selfId).has(u.id)).map((u) => ({ value: u.id, label: `${'— '.repeat(u.depth)}${u.name}` }))]
  const people = members.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))
  const count = (id) => Object.values(bu.assignments).filter((x) => x === id).length

  return (
    <div style={{ maxWidth: 980 }}>
      <ErrorText>{error}</ErrorText>
      {note && <p style={{ margin: '0 0 10px', color: 'var(--low)', fontSize: 'var(--t-sm)' }}>{note}</p>}

      <Section title={tx('Business units')} pad={false} actions={<>
        <button className="btn-secondary" disabled={!!busy} onClick={run('import', async () => {
          const n = await bu.importFromEntra()
          setNote(n ? `${n} ${tx('units added from Entra departments.')}` : tx('No new Entra departments to add.'))
        })}><Download size={13} /> {tx('Import from Entra')}</button>
        <button className="btn-primary" onClick={() => setForm({ ...BLANK })}><Plus size={13} /> {tx('Add unit')}</button>
      </>}>
        {form && (
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fp-grid-2">
              <Field label={tx('Name')} required><input className="risys-input" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label={tx('Code')}><input className="risys-input" value={form.code} maxLength={24} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
              <Field label={tx('Part of')}><SelectField className="w-full" value={form.parent_id} options={parentOptions(form.id)} onChange={(e) => setForm({ ...form, parent_id: e?.target ? e.target.value : e })} /></Field>
              <Field label={tx('Head')}><Combobox value={form.head_id || null} options={people} clearable placeholder={tx('Not set')} onChange={(v) => setForm({ ...form, head_id: v || '' })} /></Field>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <SubmitButton busy={busy === 'save'} onClick={save}>{form.id ? tx('Save unit') : tx('Add unit')}</SubmitButton>
              <button className="btn-secondary" onClick={() => setForm(null)}>{tx('Cancel')}</button>
            </div>
          </div>
        )}
        {bu.tree.length === 0 ? (
          <Empty title={tx('No business units yet')}>{tx('Add your departments, or import them from the departments in Entra ID.')}</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>{tx('Unit')}</Th><Th>{tx('Code')}</Th><Th>{tx('Head')}</Th><Th align="right">{tx('People')}</Th><Th align="right"> </Th></tr></thead>
            <tbody>{bu.tree.map((u) => (
              <tr key={u.id} style={{ opacity: u.status === 'retired' ? 0.55 : 1 }}>
                <Td style={{ color: 'var(--text)', paddingInlineStart: 12 + u.depth * 18 }}>
                  <span className="flex items-center" style={{ gap: 6 }}><Building2 size={12} style={{ color: 'var(--text-3)' }} />{u.name}
                    {u.source === 'entra_department' && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>· Entra</span>}
                    {u.status === 'retired' && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>· {tx('retired')}</span>}</span>
                </Td>
                <Td>{u.code || '—'}</Td>
                <Td>{personName(members, u.head_id) || '—'}</Td>
                <Td align="right">{count(u.id)}</Td>
                <Td align="right">
                  <div className="flex items-center" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" title={tx('Edit')} onClick={() => setForm({ id: u.id, name: u.name, code: u.code || '', parent_id: u.parent_id || '', head_id: u.head_id || '' })}><Pencil size={12} /></button>
                    <button className="btn-ghost" disabled={!!busy} onClick={run(`st-${u.id}`, () => bu.updateUnit(u.id, { status: u.status === 'active' ? 'retired' : 'active' }))}>
                      {u.status === 'active' ? tx('Retire') : tx('Restore')}</button>
                    <InlineConfirm message={tx('Delete this unit?')} confirmLabel={tx('Delete')} onConfirm={() => bu.deleteUnit(u.id)} triggerTitle={tx('Delete')}>
                      <Trash2 size={12} />
                    </InlineConfirm>
                  </div>
                </Td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title={tx('People')} pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>{tx('Person')}</Th><Th width={320}>{tx('Business unit')}</Th></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.user_id}>
              <Td style={{ color: 'var(--text)' }}>{m.full_name || m.email}<div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{m.full_name ? m.email : ''}</div></Td>
              <Td>
                <SelectField className="w-full" value={bu.assignments[m.user_id] || ''}
                  options={[{ value: '', label: tx('Not assigned') }, ...bu.active.map((u) => ({ value: u.id, label: `${'— '.repeat(u.depth)}${u.name}` }))]}
                  onChange={(e) => run(`as-${m.user_id}`, () => bu.assign(m.user_id, e?.target ? e.target.value : e))()} />
              </Td>
            </tr>
          ))}</tbody>
        </table>
      </Section>
    </div>
  )
}
