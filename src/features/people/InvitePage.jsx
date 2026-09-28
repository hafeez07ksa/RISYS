import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, AlertTriangle, UserPlus, Mail, MailWarning } from 'lucide-react'
import { FormPage, FormSection } from '@/components/ui/FormPage'
import { Spinner } from '@/components/ui/Spinner'
import { usePeople, ROLES, inviteLink } from '@/hooks/usePeople'
import { Field } from '@/features/audits/parts'
import { CopyButton } from './PeoplePage'
import { tx } from '@/lib/i18n'

/* /app/people/invite — invite people by email.
 *
 * Each invitation is emailed from no-reply@risysgrc.com by the send-email
 * function. The copy-link stays beside every one regardless: corporate mail
 * filters do sometimes hold a message carrying a sign-in link, and an admin who
 * cannot get a colleague in has no other way round it. */
export function InvitePage() {
  const navigate = useNavigate()
  const { inviteMany } = usePeople()
  const [emailsRaw, setEmailsRaw] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const back = { label: tx('People'), onClick: () => navigate('/app/people') }

  const emails = emailsRaw.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean)
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))]
  const dupes = emails.length - unique.length

  const send = async () => {
    if (!unique.length) { setError(tx('Enter at least one email address.')); return }
    setSending(true); setError('')
    try { setResults(await inviteMany(unique, role)) } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  if (results) {
    const ok = results.filter((r) => r.ok)
    const bad = results.filter((r) => !r.ok)
    const notSent = ok.filter((r) => !r.emailed)
    const all = ok.map((r) => `${r.email}: ${inviteLink(r.invitation)}`).join('\n')
    return (
      <FormPage title={tx('Invitations created')} description={tx('Links are single-use, valid for 7 days and locked to that email address.')}
        back={back}
        footer={<>
          <button className="btn-secondary" onClick={() => { setResults(null); setEmailsRaw('') }}>{tx('Invite more people')}</button>
          <button className="btn-primary" onClick={back.onClick}>{tx('Done')}</button>
        </>}>
        {ok.length > 0 && (
          <FormSection
            title={`${ok.length} ${tx('invitation(s) created')}`}
            description={notSent.length === 0
              ? tx('Each person has been emailed their invitation. The link is here too, in case their mail filter holds it up.')
              : tx('The invitations are valid. Some could not be emailed — send those links yourself.')}
            tips={[
              tx('Mail comes from no-reply@risysgrc.com. Ask people to check their junk folder if nothing arrives within a few minutes.'),
              tx('Links are single-use, expire after 7 days, and let the person set their own password — you never see it.'),
              tx('Someone lost their link, or it expired? Issue a new one from the People page rather than sharing another person’s.'),
            ]}>
            {ok.length > 1 && <div><CopyButton text={all} label={tx('Copy all links')} /></div>}
            {ok.map((r) => (
              <div key={r.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {r.emailed
                  ? <Mail size={13} style={{ color: 'var(--low)', flexShrink: 0 }} />
                  : <MailWarning size={13} style={{ color: 'var(--medium)', flexShrink: 0 }} />}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</span>
                  {!r.emailed && (
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--medium)' }}>
                      {tx('Not emailed')}{r.emailError ? ` — ${r.emailError}` : ''}. {tx('Send this link yourself.')}
                    </span>
                  )}
                </span>
                <CopyButton text={inviteLink(r.invitation)} />
              </div>
            ))}
          </FormSection>
        )}
        {bad.length > 0 && (
          <FormSection title={`${bad.length} ${tx('could not be invited')}`} description={tx('Fix the address or the problem named, then invite them again.')}>
            {bad.map((r) => (
              <div key={r.email} style={{ padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)' }}>
                <p style={{ margin: 0, fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)' }}><AlertTriangle size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />{r.email}</p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--t-sm)', color: 'var(--critical)' }}>{r.error}</p>
              </div>
            ))}
          </FormSection>
        )}
      </FormPage>
    )
  }

  return (
    <FormPage
      title={tx('Invite people')}
      description={tx('Each person is emailed a single-use link, valid for 7 days and locked to their email address.')}
      back={back}
      onSubmit={send}
      error={error}
      footer={<>
        <button className="btn-secondary" disabled={sending} onClick={back.onClick}>{tx('Cancel')}</button>
        <button className="btn-primary" disabled={sending || !unique.length} onClick={send}>
          {sending ? <Spinner size="sm" /> : <UserPlus size={13} />}
          {unique.length > 1 ? `${tx('Invite')} ${unique.length} ${tx('people')}` : tx('Send invitation')}
        </button>
      </>}
    >
      <FormSection title={tx('Who')} description={tx('Paste one address or many, separated by commas or new lines. Duplicates are removed.')}
        tips={[
          tx('Use work addresses. The link only works for the exact address you enter here.'),
          tx('Invite people as you need them rather than importing the whole company — every seat counts against your plan.'),
        ]}>
        <Field label={tx('Email addresses')} required
          help={`${unique.length} ${tx('unique address(es)')}${dupes > 0 ? ` · ${dupes} ${tx('duplicate(s) removed')}` : ''}`}>
          <textarea className="risys-input" rows={6} value={emailsRaw} onChange={(e) => setEmailsRaw(e.target.value)} autoFocus
            placeholder={'sara@company.com\nahmed@company.com'} style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
      </FormSection>
      <FormSection title={tx('Role')} description={tx('What they can do in this workspace.')}
        tips={[
          tx('Give the least access that lets someone do their job; you can raise it later in a moment.'),
          tx('Viewer is right for people who only need to read — auditors from outside, executives following progress.'),
          tx('Keep administrators few. They can change roles, connectors and settings for everyone.'),
          tx('Roles also decide audit rights: only the audit roles can test, review and issue findings.'),
        ]}
        note={tx('Everyone invited together gets the same role. Invite mixed groups in separate batches.')}>
        <div role="radiogroup" aria-label={tx('Role')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ROLES.map((r) => {
            const on = role === r.value
            return (
              <label key={r.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                background: on ? 'var(--crimson-wash)' : 'var(--bg-2)', border: `1px solid ${on ? 'var(--rose)' : 'var(--border)'}`,
              }}>
                <input type="radio" name="role" checked={on} onChange={() => setRole(r.value)} style={{ marginTop: 3, accentColor: 'var(--crimson)' }} />
                <span>
                  <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--text-3)', marginTop: 1 }}>{r.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
      </FormSection>
    </FormPage>
  )
}
