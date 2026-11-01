import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { usePeople } from '@/hooks/usePeople'
import { usePolicyVersion, verifyPolicyVersion } from '@/hooks/usePolicies'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Section, Facts, ErrorText, personName } from '@/features/audits/parts'
import { VersionStatusBadge, PolicyText, FileChip, authorityLabel } from './parts'
import { tx } from '@/lib/i18n'

/* /app/policies/:id/versions/:no — one version as it was approved, with its
 * workflow stamps and a check that the stored text still matches its hash. */
export function PolicyVersionPage() {
  const { id, no } = useParams()
  const navigate = useNavigate()
  const { members } = usePeople()
  const { policy, version: v, loading } = usePolicyVersion(id, no)
  const [verify, setVerify] = useState(null)
  const [error, setError] = useState('')
  const back = { label: policy?.ref || tx('Policy'), onClick: () => navigate(`/app/policies/${id}?tab=history`) }

  if (loading) return <PageLoading />
  if (!policy || !v) return <PageNotFound title={tx('Version not found')} back={back}>{tx('Drafts are visible only to the people working on them.')}</PageNotFound>

  const who = (u, at) => (u ? `${personName(members, u)} · ${fmtDateTime(at)}` : null)
  return (
    <RecordPage
      title={`${policy.ref} — ${policy.title} · v${v.version_no}`}
      meta={<VersionStatusBadge v={v.status} />}
      back={back}
      aside={
        <Section title={tx('Record')}>
          <Facts rows={[
            [tx('Written by'), who(v.created_by, v.created_at)],
            [tx('Submitted'), who(v.submitted_by, v.submitted_at)],
            [tx('Returned'), v.returned_by ? `${who(v.returned_by, v.returned_at)} — ${v.return_reason}` : null],
            [tx('Approved'), v.approver_id ? `${who(v.approver_id, v.approved_at)} · ${authorityLabel(v.approved_authority)}` : null],
            [tx('Published'), who(v.published_by, v.published_at)],
            [tx('Effective'), v.effective_on ? fmtDate(v.effective_on) : null],
            [tx('Superseded'), v.superseded_at ? fmtDateTime(v.superseded_at) : null],
          ]} />
          {v.sha256 && (
            <div style={{ marginTop: 12, fontSize: 'var(--t-meta)', color: 'var(--text-3)', wordBreak: 'break-all' }}>
              SHA-256 <code>{v.sha256}</code>
              <div style={{ marginTop: 8 }}>
                <button className="btn-secondary" onClick={async () => { try { setVerify(await verifyPolicyVersion(v.id)) } catch (e) { setError(e.message) } }}>
                  <ShieldCheck size={12} /> {tx('Verify')}</button>
                {verify && <p style={{ margin: '6px 0 0', color: verify.match ? 'var(--low)' : 'var(--critical)', fontWeight: 600 }}>
                  {verify.match ? tx('Unchanged since publication') : tx('Does not match the published hash')}</p>}
              </div>
            </div>
          )}
        </Section>
      }
    >
      <ErrorText>{error}</ErrorText>
      {v.change_summary && <Section title={tx('What changed')}><p style={{ margin: 0 }}>{v.change_summary}</p></Section>}
      <Section title={tx('Text')}>
        <PolicyText text={v.body_md} />
        {v.body_md_ar && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}><PolicyText text={v.body_md_ar} rtl /></div>}
        {v.file && <div style={{ marginTop: 12 }}><FileChip file={v.file} onError={setError} /></div>}
      </Section>
    </RecordPage>
  )
}
