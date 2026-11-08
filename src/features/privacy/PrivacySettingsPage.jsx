import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Combobox } from '@/components/ui/Combobox'
import { FormPage, FormSection, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { usePrivacySettings } from '@/hooks/usePrivacy'
import { Field, SubmitButton } from '@/features/audits/parts'
import { tx } from '@/lib/i18n'

/* /app/privacy/settings — the controller and the Data Protection Officer.
 * Every record of processing carries these (PDPL-IR Art. 33(5)); the DPO is
 * appointed under Art. 32. Compliance writers maintain them. */
export function PrivacySettingsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const { settings, loading, save } = usePrivacySettings()
  const [f, setF] = useState({ controller_name: '', controller_contact: '', dpo_user_id: null, dpo_name: '', dpo_contact: '', sdaia_contact: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  useEffect(() => {
    if (loading) return
    setF({
      controller_name: settings?.controller_name || organization?.name || '', controller_contact: settings?.controller_contact || '',
      dpo_user_id: settings?.dpo_user_id || null, dpo_name: settings?.dpo_name || '', dpo_contact: settings?.dpo_contact || '',
      sdaia_contact: settings?.sdaia_contact || '',
    })
  }, [loading, settings, organization?.name])

  const back = () => navigate('/app/privacy')
  const submit = async () => {
    setBusy(true); setError(''); setNote('')
    const t = (s) => s.trim() || null
    try {
      await save({ controller_name: t(f.controller_name), controller_contact: t(f.controller_contact), dpo_user_id: f.dpo_user_id || null,
        dpo_name: f.dpo_user_id ? null : t(f.dpo_name), dpo_contact: t(f.dpo_contact), sdaia_contact: t(f.sdaia_contact) })
      setNote(tx('Saved.'))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <PageLoading />
  if (!perms.isComplianceWriter) return <PageNotFound title={tx('Not allowed')} back={{ label: tx('Privacy'), onClick: back }}>{tx('Compliance writers maintain the controller and DPO details.')}</PageNotFound>

  return (
    <FormPage
      title={tx('Controller and DPO')}
      description={tx('Shown on every record of processing and used when notifying SDAIA or data subjects.')}
      back={{ label: tx('Privacy'), onClick: back }}
      onSubmit={submit} error={error} note={note}
      footer={<SubmitButton busy={busy} onClick={submit}>{tx('Save')}</SubmitButton>}
    >
      <FormSection title={tx('Controller')} description={tx('The organisation that decides why and how personal data is processed.')}>
        <Field label={tx('Name')}><input className="risys-input" value={f.controller_name} onChange={set('controller_name')} /></Field>
        <Field label={tx('Contact details')}><input className="risys-input" value={f.controller_contact} onChange={set('controller_contact')} placeholder={tx('Address, email, phone')} /></Field>
      </FormSection>
      <FormSection title={tx('Data Protection Officer')} description={tx('PDPL-IR Art. 32. A workspace member, or someone outside RISYS.')}
        tips={[tx('Data subjects and SDAIA use these details, so use a role mailbox (dpo@…) rather than a personal one.')]}>
        <Field label={tx('Member')}>
          <Combobox value={f.dpo_user_id} clearable placeholder={tx('Someone outside RISYS')}
            options={members.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))}
            onChange={(v) => setF((x) => ({ ...x, dpo_user_id: v || null }))} />
        </Field>
        {!f.dpo_user_id && <Field label={tx('Name')}><input className="risys-input" value={f.dpo_name} onChange={set('dpo_name')} /></Field>}
        <Field label={tx('Contact details')}><input className="risys-input" value={f.dpo_contact} onChange={set('dpo_contact')} /></Field>
      </FormSection>
      <FormSection title={tx('Competent authority')} description={tx('How breaches are notified to SDAIA (the national data governance platform or the contact you were given).')}>
        <Field label={tx('SDAIA contact or portal')}><input className="risys-input" value={f.sdaia_contact} onChange={set('sdaia_contact')} /></Field>
      </FormSection>
    </FormPage>
  )
}
