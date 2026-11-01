import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { supabase } from '@/lib/supabase'
import { useMyAttestations } from '@/hooks/usePolicies'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Section, Facts, SubmitButton, ErrorText, DueText } from '@/features/audits/parts'
import { AttestationBadge, PolicyText, FileChip, shortHash } from './parts'
import { tx, language } from '@/lib/i18n'

/* /app/my-policies/:id — read one policy version and accept it. The database
 * records who accepted which version (by its SHA-256) and when; only the
 * person asked can accept, and only while the campaign is open. */
export function AttestPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mine = useMyAttestations()
  const a = mine.items.find((x) => x.id === id)
  const [doc, setDoc] = useState(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const back = { label: tx('My policies'), onClick: () => navigate('/app/my-policies') }

  useEffect(() => {
    if (!a) return
    let alive = true
    ;(async () => {
      const [v, p] = await Promise.all([
        supabase.from('policy_versions').select('*').eq('id', a.policy_version_id).maybeSingle(),
        supabase.from('policies').select('id, ref, title, purpose, scope').eq('id', a.policy_id).maybeSingle(),
      ])
      if (alive) setDoc({ v: v.data, p: p.data })
    })()
    return () => { alive = false }
  }, [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (mine.loading || (a && !doc)) return <PageLoading />
  if (!a || !doc?.v) return <PageNotFound title={tx('Attestation not found')} back={back}>{tx('It may belong to someone else.')}</PageNotFound>

  const { v, p } = doc
  const ar = language() === 'ar'
  const canAccept = a.status === 'pending' && a.campaign?.status === 'open'
  return (
    <RecordPage
      title={`${p?.ref} — ${p?.title}`}
      description={`${tx('Version')} ${v.version_no} · ${tx('effective')} ${fmtDate(v.effective_on)}`}
      meta={<AttestationBadge v={a.status} />}
      back={back}
      aside={
        <Section title={tx('Your attestation')}>
          <Facts rows={[
            [tx('Campaign'), a.campaign?.ref],
            [tx('Due'), <DueText key="d" date={a.campaign?.due_on} done={!canAccept} />],
            [tx('Accepted'), a.accepted_at ? fmtDateTime(a.accepted_at) : null],
            [tx('Version hash'), <code key="h">{shortHash(a.version_sha256 || v.sha256)}</code>],
            [tx('Excused'), a.excused_reason],
          ]} />
        </Section>
      }
    >
      {v.change_summary && v.version_no > 1 && <Section title={tx('What changed')}><p style={{ margin: 0 }}>{v.change_summary}</p></Section>}
      {(p?.purpose || p?.scope) && <Section title={tx('Purpose and scope')}><Facts rows={[[tx('Purpose'), p.purpose], [tx('Scope'), p.scope]]} /></Section>}
      <Section title={tx('Policy')}>
        {ar && v.body_md_ar ? <PolicyText text={v.body_md_ar} rtl /> : <PolicyText text={v.body_md} />}
        {ar && v.body_md_ar && v.body_md && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>English</summary><div style={{ marginTop: 10 }}><PolicyText text={v.body_md} /></div></details>}
        {!ar && v.body_md_ar && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>العربية</summary><div style={{ marginTop: 10 }}><PolicyText text={v.body_md_ar} rtl /></div></details>}
        {v.file && <div style={{ marginTop: 12 }}><FileChip file={v.file} onError={setError} /></div>}
      </Section>
      {canAccept && (
        <Section title={tx('Accept')}>
          <label className="flex" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 'var(--t-body)' }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{tx('I have read and understood this policy, and I will comply with it.')}</span>
          </label>
          <ErrorText>{error}</ErrorText>
          <div style={{ marginTop: 12 }}>
            <SubmitButton busy={busy} disabled={!ack} onClick={async () => {
              setBusy(true); setError('')
              try { await mine.accept(a.id) } catch (e) { setError(e.message) } finally { setBusy(false) }
            }}><BadgeCheck size={13} /> {tx('Accept policy')}</SubmitButton>
          </div>
        </Section>
      )}
      {a.status === 'accepted' && <p style={{ color: 'var(--low)', fontWeight: 600 }}>{tx('You accepted this version on')} {fmtDateTime(a.accepted_at)}.</p>}
    </RecordPage>
  )
}
