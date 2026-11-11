import { useEffect, useState } from 'react'
import { Cloud, Check, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { CCC_ROLES, CCC_LEVELS, CCC_VERSION } from '@/data/cccAutomation'
import { PDPL_PROFILE_QUESTIONS, PDPL_VERSION, pdplApplies } from '@/data/pdplAutomation'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── Settings → Organization ──────────────────────────────────────────────────
 *
 * The workspace's NCA CCC scope. CCC applies by role — whether the
 * organisation uses cloud services (tenant, CST), provides them (provider,
 * CSP) or both — and by the classification of the data it holds in the cloud
 * (CCC Annex A, Levels 1–4). Only the workspace can say either, so the
 * workspace administrator sets them here; RISYS staff do not.
 *
 * Saved through set_ccc_profile(), which checks the caller is an admin and
 * writes the change to the workspace audit log.
 *
 * The SDAIA PDPL scope: whether PDPL is in scope, and the answers that decide
 * which of its conditional articles apply. Saved through set_pdpl_profile(),
 * on the same terms.
 * -------------------------------------------------------------------------- */

const ROLE_ORDER = ['cst', 'csp', 'both']
const LEVEL_HELP = {
  1: 'Data classified as top secret.',
  2: 'Data classified as secret.',
  3: 'Data classified as confidential.',
  4: 'Data classified as public. Some controls become optional and two do not apply.',
}

function Choice({ name, checked, onChange, disabled, title, help }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      borderRadius: 'var(--r)', cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${checked ? 'var(--crimson)' : 'var(--border)'}`,
      background: checked ? 'var(--crimson-wash)' : 'var(--bg-2)',
    }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled}
        style={{ marginTop: 3, accentColor: 'var(--crimson)' }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        {help && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 2 }}>{help}</span>}
      </span>
    </label>
  )
}

export function CccScopeSettings() {
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const canEdit = perms.isAdmin

  const savedRole = organization?.ccc_role || ''
  const savedLevel = organization?.ccc_level ? String(organization.ccc_level) : ''

  const [role, setRole] = useState(savedRole)
  const [level, setLevel] = useState(savedLevel)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setRole(savedRole); setLevel(savedLevel) }, [savedRole, savedLevel, organization?.id])

  const dirty = role !== savedRole || (role && level !== savedLevel)
  const valid = !role || !!level

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase.rpc('set_ccc_profile', {
      p_org: organization.id,
      p_role: role || null,
      p_level: role ? Number(level) : null,
    })
    if (err) {
      setError(err.message || tx('Could not save the CCC scope.'))
    } else {
      if (user?.id) await useAuthStore.getState().fetchOrganization(user.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    }
    setSaving(false)
  }

  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <Cloud size={16} style={{ color: '#6d28d9', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
            {tx('NCA Cloud Cybersecurity Controls (CCC) scope')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, margin: 0, maxWidth: 820 }}>{tx(
            'CCC applies on top of ECC to organisations that use or provide cloud services. Which controls apply depends on your role and on the classification of the data you hold in the cloud: use the highest level present. The Compliance pages, the review calendar and the dashboard follow this setting.'
          )}</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '6px 0 0' }}>{CCC_VERSION}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="eyebrow" style={{ marginBottom: 8 }}>{tx('Your role')}</legend>
          <Choice name="ccc-role" checked={role === ''} onChange={() => setRole('')} disabled={!canEdit}
            title={tx('Not in scope')} help={tx('The organisation neither uses nor provides cloud services that CCC covers.')} />
          {ROLE_ORDER.map(r => (
            <Choice key={r} name="ccc-role" checked={role === r} disabled={!canEdit}
              onChange={() => { setRole(r); if (!level) setLevel('3') }}
              title={tx(CCC_ROLES[r].label)} help={tx(CCC_ROLES[r].help)} />
          ))}
        </fieldset>

        <fieldset disabled={!role} style={{
          border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8,
          opacity: role ? 1 : 0.5,
        }}>
          <legend className="eyebrow" style={{ marginBottom: 8 }}>{tx('Data classification level')}</legend>
          {[1, 2, 3, 4].map(l => (
            <Choice key={l} name="ccc-level" checked={level === String(l)} disabled={!canEdit || !role}
              onChange={() => setLevel(String(l))}
              title={tx(CCC_LEVELS[l].label)} help={tx(LEVEL_HELP[l])} />
          ))}
        </fieldset>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        {canEdit && (
          <>
            <button className="btn-primary" onClick={save} disabled={!dirty || !valid || saving}>
              {saving ? tx('Saving…') : tx('Save scope')}
            </button>
            {dirty && !saving && (
              <button className="btn-secondary" onClick={() => { setRole(savedRole); setLevel(savedLevel); setError('') }}>
                {tx('Cancel')}
              </button>
            )}
          </>
        )}
        {saved && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--low)' }}>
            <Check size={13} /> {tx('Saved. The change is in the audit log.')}
          </span>
        )}
        {!canEdit && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('Only a workspace administrator can change the CCC scope.')}</span>
        )}
        {organization?.ccc_updated_at && (
          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-3)', marginInlineStart: 'auto' }}>
            {tx('Last changed')} {fmtDateTime(organization.ccc_updated_at)}
          </span>
        )}
      </div>
      {error && <p className="field-error" style={{ margin: '10px 0 0' }}>{error}</p>}
    </section>
  )
}

function Tick({ checked, onChange, disabled, title, help }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      borderRadius: 'var(--r)', cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${checked ? 'var(--crimson)' : 'var(--border)'}`,
      background: checked ? 'var(--crimson-wash)' : 'var(--bg-2)',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
        style={{ marginTop: 3, accentColor: 'var(--crimson)' }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        {help && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 2 }}>{help}</span>}
      </span>
    </label>
  )
}

const emptyPdpl = () => Object.fromEntries(PDPL_PROFILE_QUESTIONS.map(q => [q.key, false]))

export function PdplScopeSettings() {
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const canEdit = perms.isAdmin

  const saved = organization?.pdpl_profile || null
  const savedKey = saved ? JSON.stringify(saved) : ''
  const [inScope, setInScope] = useState(!!saved)
  const [answers, setAnswers] = useState(saved ? { ...emptyPdpl(), ...saved } : emptyPdpl())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setInScope(!!saved)
    setAnswers(saved ? { ...emptyPdpl(), ...saved } : emptyPdpl())
  }, [savedKey, organization?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = inScope ? JSON.stringify({ ...emptyPdpl(), ...answers }) : ''
  const dirty = current !== (saved ? JSON.stringify({ ...emptyPdpl(), ...saved }) : '')
  const dpo = inScope && pdplApplies(answers, 'dpo_required')

  const save = async () => {
    setSaving(true); setError(''); setDone(false)
    const { error: err } = await supabase.rpc('set_pdpl_profile', {
      p_org: organization.id,
      p_profile: inScope ? answers : null,
    })
    if (err) {
      setError(err.message || tx('Could not save the PDPL scope.'))
    } else {
      if (user?.id) await useAuthStore.getState().fetchOrganization(user.id)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    }
    setSaving(false)
  }

  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <Lock size={16} style={{ color: '#166534', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
            {tx('SDAIA Personal Data Protection Law (PDPL) scope')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, margin: 0, maxWidth: 820 }}>{tx(
            'The PDPL applies to every organisation that processes personal data in the Kingdom. Most of its articles apply to everyone; the ones below apply only in some cases. Tick what is true for your organisation. The Compliance pages, the review calendar, the Privacy signals and the dashboard follow this setting.'
          )}</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '6px 0 0' }}>{PDPL_VERSION}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Choice name="pdpl-scope" checked={!inScope} onChange={() => setInScope(false)} disabled={!canEdit}
          title={tx('Not in scope')} help={tx('PDPL is not assessed in this workspace.')} />
        <Choice name="pdpl-scope" checked={inScope} onChange={() => setInScope(true)} disabled={!canEdit}
          title={tx('In scope')} help={tx('We process personal data in the Kingdom, or about people who live in it.')} />
      </div>

      <fieldset disabled={!inScope || !canEdit} style={{
        border: 'none', padding: 0, margin: 0, opacity: inScope ? 1 : 0.5,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 8,
      }}>
        <legend className="eyebrow" style={{ marginBottom: 8 }}>{tx('Which of these apply to you?')}</legend>
        {PDPL_PROFILE_QUESTIONS.map(q => (
          <Tick key={q.key} checked={!!answers[q.key]} disabled={!inScope || !canEdit}
            onChange={() => setAnswers(a => ({ ...a, [q.key]: !a[q.key] }))}
            title={tx(q.label)} help={tx(q.help)} />
        ))}
      </fieldset>

      {inScope && (
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '12px 0 0' }}>
          {dpo
            ? tx('A data protection officer is required (IR Art. 32). Name them in Privacy → Settings.')
            : tx('On these answers, a data protection officer is not required (IR Art. 32).')}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        {canEdit && (
          <>
            <button className="btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? tx('Saving…') : tx('Save scope')}
            </button>
            {dirty && !saving && (
              <button className="btn-secondary" onClick={() => {
                setInScope(!!saved); setAnswers(saved ? { ...emptyPdpl(), ...saved } : emptyPdpl()); setError('')
              }}>
                {tx('Cancel')}
              </button>
            )}
          </>
        )}
        {done && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--low)' }}>
            <Check size={13} /> {tx('Saved. The change is in the audit log.')}
          </span>
        )}
        {!canEdit && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('Only a workspace administrator can change the PDPL scope.')}</span>
        )}
        {organization?.pdpl_updated_at && (
          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-3)', marginInlineStart: 'auto' }}>
            {tx('Last changed')} {fmtDateTime(organization.pdpl_updated_at)}
          </span>
        )}
      </div>
      {error && <p className="field-error" style={{ margin: '10px 0 0' }}>{error}</p>}
    </section>
  )
}

export function OrganizationSettings() {
  const { organization } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>{organization?.name}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>{tx(
          'Workspace details are managed by RISYS when the workspace is provisioned. The settings below are yours to set.'
        )}</p>
      </section>
      <CccScopeSettings />
      <PdplScopeSettings />
    </div>
  )
}
