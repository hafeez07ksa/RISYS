import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { Combobox, SelectField } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useGroups } from '@/hooks/useGroups'
import { usePermissions } from '@/hooks/usePermissions'
import { useBusinessUnits } from '@/hooks/useBusinessUnits'
import { hasCccProfile } from '@/hooks/useCompliance'
import { usePolicies, usePolicy, useFrameworkRequirements } from '@/hooks/usePolicies'
import { POLICY_TEMPLATES, templateByKey, templateMapping } from '@/data/policyTemplates'
import { POLICY_KINDS, CRITICALITY, REVIEW_MONTHS, RELATIONS, AUDIENCE_KINDS, labelOf } from '@/lib/policies'
import { ROLE_DEFS } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import { Field, SubmitButton } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

const EMPTY = {
  title: '', kind: 'policy', purpose: '', scope: '', owner_id: '', owning_unit_id: '',
  criticality: 'high', review_months: 12, template_key: '',
}
const val = (e) => (e?.target ? e.target.value : e)

/* /app/policies/new and /app/policies/:id/edit — the policy record, its ECC
 * mapping, who must attest to it and who may write drafts. The text itself is
 * written on the policy page, in the open draft. */
export function PolicyFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { groups } = useGroups()
  const bu = useBusinessUnits()
  const reqs = useFrameworkRequirements()
  const { createPolicy } = usePolicies()
  const pol = usePolicy(id)
  const p = pol.policy

  const [f, setF] = useState({ ...EMPTY, owner_id: user?.id || '' })
  const [mapping, setMapping] = useState([])
  const [audiences, setAudiences] = useState([{ kind: 'everyone', ref: null }])
  const [authors, setAuthors] = useState([])
  const [departments, setDepartments] = useState([])
  const [loaded, setLoaded] = useState(!editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: val(e) }))
  const [params] = useSearchParams()
  const [tplApplied, setTplApplied] = useState(false)

  useEffect(() => {
    if (!editing || !p || loaded) return
    setF({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? EMPTY[k]])) })
    setMapping(pol.mapping.map((m) => ({ framework: m.framework, requirement_id: m.requirement_id, relation: m.relation })))
    setAudiences(pol.audiences.map((a) => ({ kind: a.kind, ref: a.ref })))
    setAuthors(pol.authors)
    setLoaded(true)
  }, [editing, p, loaded, pol.mapping, pol.audiences, pol.authors])

  // Entra departments, for audiences; an empty list when Entra is not connected or not readable.
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('entra_users').select('department').eq('org_id', organization.id).not('department', 'is', null).limit(5000)
      .then(({ data }) => setDepartments([...new Set((data || []).map((d) => d.department?.trim()).filter(Boolean))].sort()))
  }, [organization?.id])

  const withCcc = hasCccProfile(organization)
  const known = useMemo(() => new Set(reqs.map((r) => `${r.framework}|${r.requirement_id}`)), [reqs])
  const reqOptions = useMemo(() => reqs
    .filter((r) => r.framework === 'NCA ECC' || withCcc)
    .map((r) => ({
      value: `${r.framework}|${r.requirement_id}`,
      label: `${r.framework === 'NCA ECC' ? 'ECC' : 'CCC'} ${r.requirement_id}${r.subdomain_name ? ` · ${r.subdomain_name}` : ''}`,
      description: r.requirement_text?.slice(0, 140),
    })), [reqs, withCcc])

  // /app/policies/new?template=iam — opened from a gap on the coverage page.
  useEffect(() => {
    if (editing || tplApplied || !reqs.length) return
    const key = params.get('template')
    if (key && templateByKey(key)) applyTemplate(key)
    setTplApplied(true)
  }, [editing, tplApplied, reqs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (key) => {
    const tpl = templateByKey(key)
    setF((x) => ({ ...x, template_key: key || '', ...(tpl ? { title: tpl.title, criticality: tpl.criticality, kind: 'policy' } : {}) }))
    if (tpl) setMapping(templateMapping(tpl, known.size ? known : null))
  }

  const people = members.map((m) => ({ value: m.user_id, label: m.full_name || m.email, description: m.full_name ? m.email : undefined }))
  const writers = members.filter((m) => !['viewer', 'auditor'].includes(m.role))
  const refOptions = (kind) => ({
    role: ROLE_DEFS.map((r) => ({ value: r.value, label: r.label })),
    group: groups.map((g) => ({ value: g.id, label: g.name })),
    business_unit: bu.active.map((u) => ({ value: u.id, label: `${'— '.repeat(u.depth)}${u.name}` })),
    entra_department: departments.map((d) => ({ value: d, label: d })),
  }[kind] || [])

  const back = () => navigate(editing ? `/app/policies/${id}` : '/app/policies')

  const save = async () => {
    if (f.title.trim().length < 3) { setError(tx('Give the policy a title of at least 3 characters.')); return }
    if (!f.owner_id) { setError(tx('Choose the policy owner.')); return }
    if (audiences.some((a) => a.kind !== 'everyone' && !a.ref)) { setError(tx('Complete or remove the empty audience row.')); return }
    if (mapping.some((m) => !m.requirement_id)) { setError(tx('Complete or remove the empty mapping row.')); return }
    const keys = mapping.map((m) => `${m.framework}|${m.requirement_id}`)
    if (new Set(keys).size !== keys.length) { setError(tx('A requirement is mapped twice.')); return }
    setBusy(true); setError('')
    const values = {
      title: f.title.trim(), kind: f.kind, purpose: f.purpose.trim() || null, scope: f.scope.trim() || null,
      owner_id: f.owner_id, owning_unit_id: f.owning_unit_id || null, criticality: f.criticality,
      review_months: Number(f.review_months), template_key: f.template_key || null,
    }
    const children = { mapping, audiences, authors: authors.filter((a) => a !== f.owner_id) }
    try {
      if (editing) { await pol.updatePolicy(values, children); navigate(`/app/policies/${id}`) }
      else { const created = await createPolicy(values, children); navigate(`/app/policies/${created.id}?tab=text`) }
    } catch (err) { setError(err.message); setBusy(false) }
  }

  if (editing && pol.loading) return <PageLoading />
  if (editing && (pol.notFound || !p)) {
    return <PageNotFound title={tx('Policy not found')} back={{ label: tx('Policies'), onClick: () => navigate('/app/policies') }} />
  }
  const allowed = editing ? (perms.isComplianceWriter || p.owner_id === user?.id) && p.status !== 'retired' : perms.isComplianceWriter
  if (!allowed) {
    return <PageNotFound title={tx('You cannot edit this policy')} back={{ label: tx('Policies'), onClick: back }}>
      {tx('Policies are created by compliance writers and administrators, and edited by them or the policy owner.')}</PageNotFound>
  }

  return (
    <FormPage
      title={editing ? `${tx('Edit policy')} — ${p.ref}` : tx('New policy')}
      description={tx('The record, its mapping to the framework and who must read it. The text goes into a draft version, which is approved and published on the policy page.')}
      back={{ label: editing ? p.ref : tx('Policies'), onClick: back }}
      onSubmit={save}
      error={error}
      footer={<>
        <button className="btn-secondary" onClick={back} disabled={busy}>{tx('Cancel')}</button>
        <SubmitButton busy={busy} onClick={save}>{editing ? tx('Save changes') : tx('Create policy')}</SubmitButton>
      </>}
    >
      <FormSection title={tx('Policy')} description={tx('What it is called, who owns it and how important it is.')}
        tips={[
          tx('Start from the ECC starter set: the template fills the title and maps the ECC control that asks for this policy.'),
          tx('The owner keeps it current and starts its reviews. Approval is by the authority its criticality needs: critical policies need the board.'),
          tx('Criticality decides the approver: low by a risk owner, medium by the CISO, high by a committee, critical by the board.'),
        ]}>
        {!editing && (
          <Field label={tx('Start from a template')}>
            <SelectField className="w-full" value={f.template_key} onChange={(e) => applyTemplate(val(e))}
              options={[{ value: '', label: tx('Blank policy') }, ...POLICY_TEMPLATES.map((t) => ({ value: t.key, label: `${t.requirement} · ${t.title}` }))]} />
          </Field>
        )}
        <Field label={tx('Title')} required>
          <input className="risys-input" value={f.title} onChange={set('title')} placeholder={tx('e.g. Identity and Access Management Policy')} />
        </Field>
        <div className="fp-grid-3">
          <Field label={tx('Type')}><SelectField className="w-full" value={f.kind} onChange={set('kind')} options={POLICY_KINDS} /></Field>
          <Field label={tx('Criticality')}><SelectField className="w-full" value={f.criticality} onChange={set('criticality')} options={CRITICALITY} /></Field>
          <Field label={tx('Review')}><SelectField className="w-full" value={f.review_months} onChange={(e) => setF((x) => ({ ...x, review_months: Number(val(e)) }))} options={REVIEW_MONTHS} /></Field>
        </div>
        <div className="fp-grid-2">
          <Field label={tx('Owner')} required>
            <Combobox value={f.owner_id} onChange={(v) => setF((x) => ({ ...x, owner_id: v || '' }))} options={people} placeholder={tx('Choose a person')} />
          </Field>
          <Field label={tx('Owning business unit')}>
            <SelectField className="w-full" value={f.owning_unit_id} onChange={set('owning_unit_id')}
              options={[{ value: '', label: tx('Not set') }, ...refOptions('business_unit')]} />
          </Field>
        </div>
        <Field label={tx('Co-authors')} help={tx('They can edit drafts with the owner. Viewers and auditors cannot be authors.')}>
          <Combobox multiple value={authors} onChange={(v) => setAuthors(v || [])} placeholder={tx('Nobody else')}
            options={writers.filter((m) => m.user_id !== f.owner_id).map((m) => ({ value: m.user_id, label: m.full_name || m.email }))} />
        </Field>
      </FormSection>

      <FormSection title={tx('Purpose and scope')} description={tx('Why the policy exists and what it applies to. Shown above the text to everyone who attests.')}
        tips={[
          tx('Purpose: one or two sentences on the risk the policy manages.'),
          tx('Scope: the people, systems and locations it covers, and anything excluded.'),
        ]}>
        <Field label={tx('Purpose')}><textarea className="risys-input" rows={3} value={f.purpose} onChange={set('purpose')} /></Field>
        <Field label={tx('Scope')}><textarea className="risys-input" rows={3} value={f.scope} onChange={set('scope')} /></Field>
      </FormSection>

      <FormSection title={tx('Framework mapping')} description={tx('The requirements this policy answers. A version cannot be submitted without at least one.')}
        tips={[
          tx('“Documents the requirement”: publishing records the version as compliance evidence for it; for ECC controls that ask for a documented, approved policy it also sets the control to compliant.'),
          tx('“Covers its periodic review”: the policy’s review cycle is the evidence of the review control (for example 1-3-4).'),
          tx('“Supports it”: the policy is evidence, but not the whole answer.'),
        ]}>
        {mapping.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto', gap: 8, alignItems: 'start' }}>
            <Combobox value={m.requirement_id ? `${m.framework}|${m.requirement_id}` : null} options={reqOptions} placeholder={tx('Choose a requirement')}
              onChange={(v) => { const [fw, rid] = String(v || '|').split('|'); setMapping((xs) => xs.map((x, j) => (j === i ? { ...x, framework: fw, requirement_id: rid } : x))) }} />
            <SelectField className="w-full" value={m.relation} options={RELATIONS}
              onChange={(e) => setMapping((xs) => xs.map((x, j) => (j === i ? { ...x, relation: val(e) } : x)))} />
            <button type="button" className="btn-ghost" title={tx('Remove')} onClick={() => setMapping((xs) => xs.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        <div><button type="button" className="btn-secondary" onClick={() => setMapping((xs) => [...xs, { framework: 'NCA ECC', requirement_id: '', relation: 'documents' }])}>
          <Plus size={13} /> {tx('Add a requirement')}</button></div>
      </FormSection>

      <FormSection title={tx('Who must read it')} description={tx('Everyone who matches any row is asked to attest when a version is published, and again every year.')}
        tips={[
          tx('Most cybersecurity policies apply to everyone. Narrow it for procedures that only one team runs.'),
          tx('A business unit includes the units below it.'),
          tx('An Entra department matches people by their email address in Entra ID.'),
          tx('People who join later are added to the open campaign the next morning.'),
        ]}>
        {audiences.map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr) auto', gap: 8, alignItems: 'start' }}>
            <SelectField className="w-full" value={a.kind} options={AUDIENCE_KINDS}
              onChange={(e) => setAudiences((xs) => xs.map((x, j) => (j === i ? { kind: val(e), ref: null } : x)))} />
            {a.kind === 'everyone' ? <span style={{ alignSelf: 'center', color: 'var(--text-3)', fontSize: 'var(--t-sm)' }}>{labelOf(AUDIENCE_KINDS, 'everyone')}</span> : (
              <Combobox value={a.ref} options={refOptions(a.kind)} placeholder={tx('Choose')}
                emptyText={a.kind === 'entra_department' ? tx('No Entra departments found') : undefined}
                onChange={(v) => setAudiences((xs) => xs.map((x, j) => (j === i ? { ...x, ref: v } : x)))} />
            )}
            <button type="button" className="btn-ghost" title={tx('Remove')} onClick={() => setAudiences((xs) => xs.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        <div><button type="button" className="btn-secondary" onClick={() => setAudiences((xs) => [...xs, { kind: 'role', ref: null }])}>
          <Plus size={13} /> {tx('Add an audience')}</button></div>
        {audiences.length === 0 && <p className="field-help" style={{ margin: 0 }}>{tx('With no audience, publishing starts no attestation campaign.')}</p>}
      </FormSection>
    </FormPage>
  )
}
