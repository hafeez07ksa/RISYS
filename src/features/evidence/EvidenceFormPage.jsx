import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, X } from 'lucide-react'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { DateField } from '@/components/ui/DateField'
import { FormPage, FormSection, PageNotFound } from '@/components/ui/FormPage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { useEvidenceLibrary } from '@/hooks/useEvidenceLibrary'
import { useFrameworkRequirements } from '@/hooks/usePolicies'
import { linkableRequirements, FRAMEWORK_SHORT } from '@/hooks/useCompliance'
import { EVIDENCE_KINDS, todayRiyadh, addMonths, fileSize } from '@/lib/policies'
import { Field, SubmitButton } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

const val = (e) => (e?.target ? e.target.value : e)

/* /app/evidence/new — add an evidence item and link it to requirements and
 * controls. ?framework=…&requirement=… pre-links a requirement when opened
 * from the compliance page. Someone else reviews it before it counts. */
export function EvidenceFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { addItem } = useEvidenceLibrary()
  const reqs = useFrameworkRequirements()
  const today = todayRiyadh()
  const pre = params.get('framework') && params.get('requirement') ? [`${params.get('framework')}|${params.get('requirement')}`] : []
  const [f, setF] = useState({ title: '', description: '', kind: 'document', owner_id: user?.id || '', valid_from: today, valid_until: addMonths(today, 12) })
  const [files, setFiles] = useState([])
  const [reqLinks, setReqLinks] = useState(pre)
  const [ctlLinks, setCtlLinks] = useState([])
  const [controls, setControls] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('risk_controls').select('id, control_id, name').eq('org_id', organization.id).order('control_id').then(({ data }) => setControls(data || []))
  }, [organization?.id])

  const linkable = useMemo(() => linkableRequirements(reqs, organization), [reqs, organization])
  const reqOptions = useMemo(() => linkable.map((r) => ({
    value: `${r.framework}|${r.requirement_id}`, label: `${FRAMEWORK_SHORT[r.framework] || r.framework} ${r.requirement_id}`, description: r.requirement_text?.slice(0, 120),
  })), [linkable])
  const back = () => navigate('/app/evidence')

  const save = async () => {
    if (f.title.trim().length < 3) { setError(tx('Give the evidence a title of at least 3 characters.')); return }
    if (!files.length) { setError(tx('Attach at least one file.')); return }
    if (f.valid_from && f.valid_until && f.valid_until < f.valid_from) { setError(tx('It stops being valid before it starts.')); return }
    setBusy(true); setError('')
    try {
      const links = [
        ...reqLinks.map((k) => { const [framework, requirement_id] = k.split('|'); return { framework, requirement_id } }),
        ...ctlLinks.map((control_id) => ({ control_id })),
      ]
      const item = await addItem({
        title: f.title.trim(), description: f.description.trim() || null, kind: f.kind, owner_id: f.owner_id || null,
        valid_from: f.valid_from || null, valid_until: f.valid_until || null,
      }, files, links)
      navigate(`/app/evidence/${item.id}`, { replace: true })
    } catch (e) { setError(e.message); setBusy(false) }
  }

  if (perms.isReadOnly) return <PageNotFound title={tx('Read-only role')} back={{ label: tx('Evidence library'), onClick: () => navigate('/app/evidence') }}>{tx('Viewers and auditors cannot add evidence.')}</PageNotFound>

  return (
    <FormPage
      title={tx('Add evidence')}
      description={tx('Collect it once, link it everywhere it counts. It is reviewed by someone else before it is accepted.')}
      back={{ label: tx('Evidence library'), onClick: back }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{tx('Add to the library')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Evidence')} description={tx('What it is, who keeps it current and how long it stays valid.')}
        tips={[
          tx('Name it so an auditor knows what it proves: “Entra ID MFA registration report, October 2026”.'),
          tx('Validity: how long the evidence describes the current state. A configuration export is usually valid for 3 to 12 months.'),
          tx('The owner is asked to replace it before it expires.'),
        ]}>
        <Field label={tx('Title')} required><input className="risys-input" value={f.title} onChange={set('title')} /></Field>
        <Field label={tx('Description')}><textarea className="risys-input" rows={2} value={f.description} onChange={set('description')} /></Field>
        <div className="fp-grid-2">
          <Field label={tx('Kind')}><SelectField className="w-full" value={f.kind} onChange={set('kind')} options={EVIDENCE_KINDS.filter((k) => k.value !== 'policy_version')} /></Field>
          <Field label={tx('Owner')}><Combobox value={f.owner_id} onChange={(v) => setF((x) => ({ ...x, owner_id: v || '' }))}
            options={members.filter((m) => m.role !== 'viewer').map((m) => ({ value: m.user_id, label: m.full_name || m.email }))} /></Field>
          <Field label={tx('Valid from')}><DateField value={f.valid_from} onChange={set('valid_from')} /></Field>
          <Field label={tx('Valid until')}><DateField value={f.valid_until} onChange={set('valid_until')} /></Field>
        </div>
      </FormSection>

      <FormSection title={tx('Files')} description={tx('Each file is stored privately with its SHA-256 hash.')}>
        {files.map((file, i) => (
          <div key={i} className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
            <span style={{ color: 'var(--text)' }}>{file.name}</span><span style={{ color: 'var(--text-3)' }}>{fileSize(file.size)}</span>
            <button type="button" className="btn-ghost" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}><X size={12} /></button>
          </div>
        ))}
        <div><label className="btn-secondary" style={{ cursor: 'pointer' }}><Upload size={13} /> {tx('Choose files')}
          <input type="file" multiple hidden onChange={(e) => { const add = [...(e.target.files || [])]; e.target.value = ''; setFiles((xs) => [...xs, ...add]) }} /></label></div>
      </FormSection>

      <FormSection title={tx('Used for')} description={tx('The requirements and controls this evidence supports. You can add more later.')}>
        <Field label={tx('Framework requirements')}><Combobox multiple value={reqLinks} onChange={(v) => setReqLinks(v || [])} options={reqOptions} placeholder={tx('None')} /></Field>
        <Field label={tx('Controls')}><Combobox multiple value={ctlLinks} onChange={(v) => setCtlLinks(v || [])} placeholder={tx('None')}
          options={controls.map((c) => ({ value: c.id, label: `${c.control_id || ''} ${c.name}`.trim() }))} /></Field>
      </FormSection>
    </FormPage>
  )
}
