import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Pencil, Send, Upload, Stamp, Undo2, BadgeCheck, FilePlus2, BellRing, ShieldOff, Archive, Trash2, ShieldCheck, CalendarCheck } from 'lucide-react'
import { RecordPage, PageLoading, PageNotFound } from '@/components/ui/FormPage'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { Tabs } from '@/components/ui/Tabs'
import { DateField } from '@/components/ui/DateField'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { usePermissions } from '@/hooks/usePermissions'
import { usePolicy, verifyPolicyVersion } from '@/hooks/usePolicies'
import { POLICY_KINDS, REVIEW_MONTHS, RELATIONS, AUDIENCE_KINDS, AUTHORITY_FOR, labelOf, todayRiyadh, addMonths } from '@/lib/policies'
import { roleLabel } from '@/lib/roles'
import { fmtDate, fmtDateTime } from '@/lib/reports/models'
import { Field, SubmitButton, ErrorText, Section, Facts, Th, Td, Empty, DueText, personName } from '@/features/audits/parts'
import {
  PolicyStatusBadge, VersionStatusBadge, CriticalityBadge, ExceptionStatusBadge, AttestationBadge,
  FileChip, RateBar, PolicyText, authorityLabel, shortHash,
} from './parts'
import { tx } from '@/lib/i18n'

/* /app/policies/:id — one policy: its record and mapping, the version being
 * worked on (write → submit → approve → publish), the version history, the
 * attestation campaigns and any exceptions granted against it.
 *
 * The database decides every step: who may approve at which authority, that
 * the author cannot approve their own version, that a published version is
 * locked. Buttons are shown to the people the database will accept. */

const TABS = ['overview', 'text', 'history', 'attestation', 'exceptions']

export function PolicyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const { user } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const pol = usePolicy(id)
  const p = pol.policy
  const [error, setError] = useState('')

  if (pol.loading) return <PageLoading />
  if (pol.notFound || !p) {
    return <PageNotFound title={tx('Policy not found')} back={{ label: tx('Policies'), onClick: () => navigate('/app/policies') }}>
      {tx('It may have been deleted, or it belongs to another organisation.')}</PageNotFound>
  }

  const isOwner = p.owner_id === user?.id
  const manage = perms.isComplianceWriter || isOwner
  const retired = p.status === 'retired'
  const openCampaign = pol.campaigns.find((c) => c.status === 'open')

  return (
    <RecordPage
      title={`${p.ref} — ${p.title}`}
      description={labelOf(POLICY_KINDS, p.kind)}
      meta={<><PolicyStatusBadge v={p.status} /><CriticalityBadge v={p.criticality} />{pol.current && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>v{pol.current.version_no}</span>}</>}
      back={{ label: tx('Policies'), onClick: () => navigate('/app/policies') }}
      actions={!retired && <>
        {manage && <button className="btn-secondary" onClick={() => navigate(`/app/policies/${id}/edit`)}><Pencil size={13} /> {tx('Edit')}</button>}
        {!perms.isReadOnly && (
          <button className="btn-secondary" onClick={() => navigate(`/app/exceptions/new?subject_type=policy&subject_id=${id}&label=${encodeURIComponent(`${p.ref} ${p.title}`)}`)}>
            <ShieldOff size={13} /> {tx('Request an exception')}</button>
        )}
      </>}
      aside={<Aside pol={pol} members={members} openCampaign={openCampaign} />}
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'overview', label: tx('Overview') },
          { value: 'text', label: tx('Text and approval') },
          { value: 'history', label: tx('Versions'), count: pol.versions.length },
          { value: 'attestation', label: tx('Attestation'), count: pol.campaigns.length },
          { value: 'exceptions', label: tx('Exceptions'), count: pol.exceptions.length },
        ]} />
      </div>
      <ErrorText>{error}</ErrorText>
      {tab === 'overview' && <Overview pol={pol} members={members} manage={manage} perms={perms} setError={setError} navigate={navigate} />}
      {tab === 'text' && <TextTab pol={pol} members={members} manage={manage} user={user} perms={perms} />}
      {tab === 'history' && <History pol={pol} members={members} navigate={navigate} />}
      {tab === 'attestation' && <AttestationTab pol={pol} members={members} manage={manage && !retired} />}
      {tab === 'exceptions' && <ExceptionsTab pol={pol} navigate={navigate} canRequest={!perms.isReadOnly && !retired} />}
    </RecordPage>
  )
}

function Aside({ pol, members, openCampaign }) {
  const p = pol.policy
  const cur = pol.current
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Section title={tx('At a glance')}>
        <Facts rows={[
          [tx('Owner'), personName(members, p.owner_id)],
          [tx('Business unit'), p.unit?.name],
          [tx('Review'), labelOf(REVIEW_MONTHS, p.review_months)],
          [tx('Next review'), p.next_review_on ? <DueText date={p.next_review_on} /> : null],
          [tx('Approval needs'), authorityLabel(AUTHORITY_FOR[p.criticality])],
          [tx('In force'), cur ? `v${cur.version_no} · ${fmtDate(cur.effective_on)}` : null],
        ]} />
      </Section>
      {openCampaign && (
        <Section title={tx('Attestation')}>
          <RateBar accepted={Number(openCampaign.accepted)} expected={Number(openCampaign.expected)} excused={Number(openCampaign.excused)} />
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '8px 0 0' }}>{openCampaign.ref} · {tx('due')} {fmtDate(openCampaign.due_on)}</p>
        </Section>
      )}
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function Overview({ pol, members, manage, perms, setError, navigate }) {
  const p = pol.policy
  const [retireReason, setRetireReason] = useState(null)
  const [busy, setBusy] = useState(false)
  const neverPublished = !p.current_version_id && p.status === 'draft'

  const retire = async () => {
    if ((retireReason || '').trim().length < 10) { setError(tx('Give a reason of at least 10 characters.')); return }
    setBusy(true); setError('')
    try { await pol.retire(retireReason.trim()); setRetireReason(null) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <Section title={tx('Purpose and scope')}>
        <Facts rows={[[tx('Purpose'), p.purpose], [tx('Scope'), p.scope]]} />
      </Section>

      <Section title={tx('Framework mapping')} pad={false}>
        {pol.mapping.length === 0 ? (
          <Empty title={tx('Not mapped')}>{tx('A version cannot be submitted until the policy is mapped to at least one requirement.')}</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>{tx('Framework')}</Th><Th>{tx('Requirement')}</Th><Th>{tx('Relation')}</Th></tr></thead>
            <tbody>{pol.mapping.map((m) => (
              <tr key={m.id}>
                <Td>{m.framework}</Td>
                <Td><Link to={`/app/compliance/${encodeURIComponent(m.framework)}/${encodeURIComponent(m.requirement_id)}`} style={{ fontFamily: 'var(--font-mono)' }}>{m.requirement_id}</Link></Td>
                <Td>{labelOf(RELATIONS, m.relation)}</Td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title={tx('Who must read it')}>
        {pol.audiences.length === 0 ? <p style={{ margin: 0, color: 'var(--text-3)' }}>{tx('No audience: publishing starts no attestation campaign.')}</p> : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {pol.audiences.map((a) => (
              <li key={a.id} style={{ fontSize: 'var(--t-body)' }}>
                {labelOf(AUDIENCE_KINDS, a.kind)}{a.kind === 'role' ? `: ${roleLabel(a.ref)}` : a.ref && a.kind !== 'group' && a.kind !== 'business_unit' ? `: ${a.ref}` : ''}
              </li>
            ))}
          </ul>
        )}
        {pol.authors.length > 0 && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: '10px 0 0' }}>
            {tx('Co-authors')}: {pol.authors.map((a) => personName(members, a)).join(', ')}
          </p>
        )}
      </Section>

      {p.status === 'published' && <ReviewSection pol={pol} members={members} manage={manage} setError={setError} />}

      {manage && p.status !== 'retired' && (
        <Section title={tx('Danger zone')}>
          {p.status === 'published' && (retireReason === null ? (
            <button className="btn-secondary" onClick={() => setRetireReason('')}><Archive size={13} /> {tx('Retire this policy')}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
                {tx('Retiring closes open attestation campaigns and takes the policy off the requirements it evidenced; compliance statuses it set go back to not started.')}</p>
              <Field label={tx('Reason')} required>
                <textarea className="risys-input" rows={2} value={retireReason} onChange={(e) => setRetireReason(e.target.value)} />
              </Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy} onClick={retire}>{tx('Retire policy')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setRetireReason(null)}>{tx('Keep it')}</button>
              </div>
            </div>
          ))}
          {neverPublished && perms.isAdmin && (
            <InlineConfirm message={tx('Delete this policy and its draft?')} detail={tx('Only a policy that was never published can be deleted.')}
              variant="panel" confirmLabel={tx('Delete')} triggerClassName="btn-secondary"
              onConfirm={async () => { await pol.deletePolicy(); navigate('/app/policies') }}>
              <Trash2 size={13} /> {tx('Delete policy')}
            </InlineConfirm>
          )}
          {!(p.status === 'published') && !(neverPublished && perms.isAdmin) && (
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--t-sm)' }}>{tx('A policy can be retired once it has been published.')}</p>
          )}
        </Section>
      )}
    </>
  )
}

/* ── Text and approval ────────────────────────────────────────────────────── */

function TextTab({ pol, members, manage, user, perms }) {
  const p = pol.policy
  const v = pol.open
  const cur = pol.current
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  if (!v) {
    return (
      <>
        <ErrorText>{error}</ErrorText>
        {cur ? <VersionText v={cur} /> : <Empty title={tx('No version yet')} />}
        {pol.canEdit || manage ? (p.status === 'published' && (
          <button className="btn-primary" disabled={!!busy} onClick={run('new', pol.newVersion)}><FilePlus2 size={13} /> {tx('Start a new version')}</button>
        )) : null}
      </>
    )
  }
  if (v.status === 'draft') return <DraftEditor key={v.id} pol={pol} v={v} canEdit={pol.canEdit || manage || perms.isComplianceWriter} members={members} />

  const canApprove = v.status === 'in_review' && pol.approvers.includes(user?.id)
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <VersionText v={v} />
      {v.status === 'in_review' && (
        <Section title={`${tx('Waiting for approval')} — v${v.version_no}`}>
          <Facts rows={[
            [tx('Submitted'), `${personName(members, v.submitted_by)} · ${fmtDateTime(v.submitted_at)}`],
            [tx('Needs'), authorityLabel(AUTHORITY_FOR[p.criticality])],
            [tx('Can approve'), pol.approvers.length ? pol.approvers.map((a) => personName(members, a)).join(', ') : tx('Nobody yet: assign a holder of this authority in Risk Register → Tolerances.')],
          ]} />
          {canApprove && <ApproveBox pol={pol} v={v} />}
        </Section>
      )}
      {v.status === 'approved' && (
        <Section title={`${tx('Approved — ready to publish')} — v${v.version_no}`}>
          <Facts rows={[
            [tx('Approved by'), `${personName(members, v.approver_id)} · ${authorityLabel(v.approved_authority)} · ${fmtDateTime(v.approved_at)}`],
            [tx('Comment'), v.approval_comment],
          ]} />
          {manage && <PublishBox pol={pol} v={v} />}
        </Section>
      )}
    </>
  )
}

function VersionText({ v }) {
  const [verify, setVerify] = useState(null)
  const [err, setErr] = useState('')
  return (
    <Section title={`${tx('Version')} ${v.version_no}`} actions={<VersionStatusBadge v={v.status} />}>
      {v.change_summary && <p style={{ margin: '0 0 12px', fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}><strong>{tx('What changed')}:</strong> {v.change_summary}</p>}
      <PolicyText text={v.body_md} />
      {v.body_md_ar && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}><PolicyText text={v.body_md_ar} rtl /></div>}
      {v.file && <div style={{ marginTop: 12 }}><FileChip file={v.file} onError={setErr} /></div>}
      {v.sha256 && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
          <span>SHA-256 <code>{shortHash(v.sha256)}</code></span>
          <button className="btn-ghost" onClick={async () => { try { setVerify(await verifyPolicyVersion(v.id)) } catch (e) { setErr(e.message) } }}>
            <ShieldCheck size={12} /> {tx('Verify')}</button>
          {verify && <span style={{ color: verify.match ? 'var(--low)' : 'var(--critical)', fontWeight: 600 }}>
            {verify.match ? tx('Unchanged since publication') : tx('Does not match the published hash')}</span>}
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </Section>
  )
}

function DraftEditor({ pol, v, canEdit }) {
  const [d, setD] = useState({ body_md: v.body_md || '', body_md_ar: v.body_md_ar || '', change_summary: v.change_summary || '', file: v.file || null })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const dirty = d.body_md !== (v.body_md || '') || d.body_md_ar !== (v.body_md_ar || '') || d.change_summary !== (v.change_summary || '') || d.file !== (v.file || null)
  const run = (key, fn) => async () => { setBusy(key); setError(''); setSaved(false); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }
  const patch = () => ({ body_md: d.body_md.trim() || null, body_md_ar: d.body_md_ar.trim() || null, change_summary: d.change_summary.trim() || null, file: d.file })

  if (!canEdit) return <VersionText v={v} />

  return (
    <Section title={`${tx('Draft')} — v${v.version_no}`} actions={<VersionStatusBadge v="draft" />}>
      {v.return_reason && (
        <p style={{ margin: '0 0 12px', padding: 10, borderRadius: 'var(--r)', background: 'var(--crimson-wash)', fontSize: 'var(--t-sm)' }}>
          <strong>{tx('Returned')}:</strong> {v.return_reason}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {v.version_no > 1 && (
          <Field label={tx('What changed in this version')} required help={tx('Required for every version after the first; shown to the approver and to everyone who attests.')}>
            <input className="risys-input" value={d.change_summary} onChange={(e) => setD({ ...d, change_summary: e.target.value })} />
          </Field>
        )}
        <Field label={tx('Policy text (English)')} help={tx('Write the policy here, or attach the approved document below — or both. The text and the file are hashed together when published.')}>
          <textarea className="risys-input" rows={16} value={d.body_md} onChange={(e) => setD({ ...d, body_md: e.target.value })} style={{ fontFamily: 'inherit', lineHeight: 1.6 }} />
        </Field>
        <Field label={tx('Policy text (Arabic)')}>
          <textarea className="risys-input" rows={10} dir="rtl" lang="ar" value={d.body_md_ar} onChange={(e) => setD({ ...d, body_md_ar: e.target.value })} style={{ lineHeight: 1.7 }} />
        </Field>
        <Field label={tx('Document')}>
          <div className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            {d.file && <FileChip file={d.file} onError={setError} />}
            <label className="btn-secondary" style={{ cursor: 'pointer' }}>
              <Upload size={13} /> {d.file ? tx('Replace file') : tx('Attach a file')}
              <input type="file" hidden onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = ''
                if (!file) return
                setBusy('upload'); setError('')
                try { setD((x) => ({ ...x, file: null })); const up = await pol.uploadDraftFile(file); setD((x) => ({ ...x, file: up })) } catch (err) { setError(err.message) } finally { setBusy('') }
              }} />
            </label>
            {d.file && <button className="btn-ghost" onClick={() => setD({ ...d, file: null })}>{tx('Remove file')}</button>}
            {busy === 'upload' && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{tx('Uploading…')}</span>}
          </div>
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center" style={{ gap: 8 }}>
          <SubmitButton busy={busy === 'save'} disabled={!dirty || !!busy} onClick={run('save', async () => { await pol.saveDraft(v.id, patch()); setSaved(true) })}>{tx('Save draft')}</SubmitButton>
          <button className="btn-primary" disabled={!!busy} onClick={run('submit', async () => { if (dirty) await pol.saveDraft(v.id, patch()); await pol.submit(v.id) })}>
            <Send size={13} /> {tx('Submit for approval')}</button>
          {saved && !dirty && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--low)' }}>{tx('Saved')}</span>}
        </div>
      </div>
    </Section>
  )
}

function ApproveBox({ pol, v }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = (key, fn) => async () => { setBusy(key); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <Field label={tx('Comment')} help={tx('Required when returning the version; optional when approving.')}>
        <textarea className="risys-input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex" style={{ gap: 8 }}>
        <SubmitButton busy={busy === 'approve'} onClick={run('approve', () => pol.approve(v.id, comment.trim()))}><Stamp size={13} /> {tx('Approve')}</SubmitButton>
        <button className="btn-secondary" disabled={!!busy} onClick={run('return', async () => {
          if (comment.trim().length < 10) throw new Error(tx('Say what needs to change, in at least 10 characters.'))
          await pol.returnVersion(v.id, comment.trim())
        })}><Undo2 size={13} /> {tx('Return to the author')}</button>
      </div>
    </div>
  )
}

function PublishBox({ pol, v }) {
  const [eff, setEff] = useState(todayRiyadh())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const p = pol.policy
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div className="fp-grid-2">
        <Field label={tx('Effective from')} help={tx('Up to 30 days back or 90 days ahead.')}><DateField value={eff} onChange={(x) => setEff(x?.target ? x.target.value : x)} /></Field>
        <Field label={tx('Next review')}><input className="risys-input" disabled value={eff ? fmtDate(addMonths(eff, p.review_months)) : ''} /></Field>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
        {tx('Publishing locks this version, records it as evidence for the mapped requirements and asks everyone in the audience to attest.')}</p>
      <ErrorText>{error}</ErrorText>
      {result && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--low)' }}>
        {tx('Published.')} {result.evidence_rows} {tx('requirements evidenced')}, {result.statuses_set} {tx('marked compliant')}.</p>}
      <div><SubmitButton busy={busy} onClick={async () => {
        setBusy(true); setError('')
        try { setResult(await pol.publish(v.id, eff)) } catch (e) { setError(e.message) } finally { setBusy(false) }
      }}><BadgeCheck size={13} /> {tx('Publish')}</SubmitButton></div>
    </div>
  )
}

/* ── Versions ─────────────────────────────────────────────────────────────── */

function History({ pol, members, navigate }) {
  return (
    <Section title={tx('Version history')} pad={false}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><Th width={70}>{tx('Version')}</Th><Th>{tx('Status')}</Th><Th>{tx('What changed')}</Th><Th>{tx('Approved by')}</Th><Th>{tx('Effective')}</Th></tr></thead>
        <tbody>{pol.versions.map((v) => (
          <tr key={v.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/policies/${pol.policy.id}/versions/${v.version_no}`)}>
            <Td style={{ fontWeight: 600, color: 'var(--text)' }}>v{v.version_no}</Td>
            <Td><VersionStatusBadge v={v.status} /></Td>
            <Td>{v.change_summary || (v.version_no === 1 ? tx('First version') : '—')}</Td>
            <Td>{v.approver_id ? `${personName(members, v.approver_id)} · ${authorityLabel(v.approved_authority)}` : '—'}</Td>
            <Td>{v.effective_on ? fmtDate(v.effective_on) : '—'}</Td>
          </tr>
        ))}</tbody>
      </table>
    </Section>
  )
}

/* ── Periodic review ──────────────────────────────────────────────────────────
 * ECC asks for the documented requirements to be reviewed periodically (the
 * X-Y-4 controls). A review ends in a new version (publish it) or in "no
 * change", recorded here with what was looked at. Either way the next review
 * date moves on by the cycle and the review is filed as evidence on the mapped
 * controls. Once the date passes, those controls count as Partial. */

const OUTCOME_LABEL = {
  first_publication: 'First publication',
  new_version: 'New version published',
  unchanged: 'Reviewed, no change',
}

function ReviewSection({ pol, members, manage, setError }) {
  const p = pol.policy
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const days = p.next_review_on ? Math.round((new Date(p.next_review_on) - new Date(todayRiyadh())) / 86400000) : null
  const inWindow = days === null || days <= 90
  const changing = !!pol.versions.find((x) => ['in_review', 'approved'].includes(x.status))

  const confirm = async () => {
    if ((note || '').trim().length < 10) { setError(tx('Say what was reviewed (at least 10 characters).')); return }
    setBusy(true); setError('')
    try { await pol.confirmReview(note.trim()); setNote(null) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Section title={tx('Periodic review')}>
      <Facts rows={[
        [tx('Cycle'), labelOf(REVIEW_MONTHS, p.review_months)],
        [tx('Next review'), p.next_review_on ? <DueText date={p.next_review_on} /> : null],
      ]} />
      {pol.reviews.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr><Th width={110}>{tx('Reviewed')}</Th><Th>{tx('Outcome')}</Th><Th>{tx('By')}</Th><Th width={120}>{tx('Next review')}</Th></tr></thead>
          <tbody>{pol.reviews.slice(0, 6).map((r) => (
            <tr key={r.id}>
              <Td>{fmtDate(r.reviewed_on)}</Td>
              <Td>
                {tx(OUTCOME_LABEL[r.outcome] || r.outcome)}
                {r.note && <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{r.note}</span>}
              </Td>
              <Td>{personName(members, r.reviewed_by)}</Td>
              <Td>{fmtDate(r.next_review_on)}</Td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {manage && (
        <div style={{ marginTop: 12 }}>
          {changing ? (
            <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
              {tx('A new version is in approval. Publishing it records the review.')}</p>
          ) : !inWindow ? (
            <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>
              {tx('A review can be recorded from 90 days before the next review date.')}</p>
          ) : note === null ? (
            <div className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => setNote('')}><CalendarCheck size={13} /> {tx('Record a review with no change')}</button>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                {tx('If the policy needs to change, start a new version on the Text and approval tab instead.')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label={tx('What was reviewed')} required help={tx('For example: checked against the current ECC text, the org chart and last year\'s audit findings; no change needed.')}>
                <textarea className="risys-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex" style={{ gap: 6 }}>
                <SubmitButton busy={busy} onClick={confirm}>{tx('Record review')}</SubmitButton>
                <button className="btn-secondary" onClick={() => setNote(null)}>{tx('Cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

/* ── Attestation ──────────────────────────────────────────────────────────── */

function AttestationTab({ pol, members, manage }) {
  const p = pol.policy
  const [campaignId, setCampaignId] = useState(null)
  const [due, setDue] = useState('')
  const [excuse, setExcuse] = useState({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const open = pol.campaigns.find((c) => c.status === 'open')
  const selected = pol.campaigns.find((c) => c.campaign_id === (campaignId || open?.campaign_id || pol.campaigns[0]?.campaign_id))
  const rows = useMemo(() => pol.attestations.filter((a) => a.campaign_id === selected?.campaign_id)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1)), [pol.attestations, selected])
  const run = (key, fn) => async () => { setBusy(key); setError(''); setNote(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }

  useEffect(() => { setCampaignId(null) }, [pol.campaigns.length])

  return (
    <>
      <ErrorText>{error}</ErrorText>
      {note && <p style={{ margin: '0 0 10px', fontSize: 'var(--t-sm)', color: 'var(--low)' }}>{note}</p>}
      {manage && p.status === 'published' && !open && (
        <Section title={tx('Start a campaign')}>
          <div className="fp-grid-2" style={{ alignItems: 'end' }}>
            <Field label={tx('Due')} help={tx('Default: 14 days from today.')}><DateField value={due} onChange={(x) => setDue(x?.target ? x.target.value : x)} /></Field>
            <div><SubmitButton busy={busy === 'start'} onClick={run('start', () => pol.startCampaign(due))}>{tx('Ask the audience to attest')}</SubmitButton></div>
          </div>
        </Section>
      )}
      <Section title={tx('Campaigns')} pad={false}>
        {pol.campaigns.length === 0 ? <Empty title={tx('No campaigns yet')}>{tx('Publishing a version starts one automatically for the audience.')}</Empty> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>{tx('Ref')}</Th><Th>{tx('Started by')}</Th><Th>{tx('Due')}</Th><Th>{tx('Progress')}</Th><Th align="right"> </Th></tr></thead>
            <tbody>{pol.campaigns.map((c) => (
              <tr key={c.campaign_id} className="row-hover" style={{ cursor: 'pointer', background: c.campaign_id === selected?.campaign_id ? 'var(--surface)' : undefined }} onClick={() => setCampaignId(c.campaign_id)}>
                <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{c.ref} {c.status === 'closed' && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {tx('closed')}</span>}</Td>
                <Td>{{ publish: tx('Publication'), annual: tx('Annual re-attestation'), new_member: tx('New member'), manual: tx('Started by hand') }[c.trigger_kind]}</Td>
                <Td><DueText date={c.due_on} done={c.status === 'closed'} /></Td>
                <Td><RateBar accepted={Number(c.accepted)} expected={Number(c.expected)} excused={Number(c.excused)} /></Td>
                <Td align="right">{manage && c.status === 'open' && Number(c.pending) > 0 && (
                  <button className="btn-ghost" disabled={!!busy} onClick={(e) => { e.stopPropagation(); run('remind', async () => { const n = await pol.remind(c.campaign_id); setNote(`${tx('Reminder sent to')} ${n}.`) })() }}>
                    <BellRing size={12} /> {tx('Remind')}</button>
                )}</Td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
      {selected && (
        <Section title={`${tx('People')} — ${selected.ref}`} pad={false}>
          {rows.length === 0 ? <Empty title={tx('Only you can see your own attestation')}>{tx('The owner, compliance writers and auditors see everyone’s.')}</Empty> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th>{tx('Person')}</Th><Th>{tx('Status')}</Th><Th>{tx('When')}</Th><Th align="right"> </Th></tr></thead>
              <tbody>{rows.map((a) => (
                <tr key={a.id}>
                  <Td style={{ color: 'var(--text)' }}>{personName(members, a.user_id)}</Td>
                  <Td><AttestationBadge v={a.status} />{a.excused_reason && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{a.excused_reason}</div>}</Td>
                  <Td>{a.accepted_at ? fmtDateTime(a.accepted_at) : a.reminders_sent ? `${a.reminders_sent} ${tx('reminders')}` : '—'}</Td>
                  <Td align="right">{manage && a.status === 'pending' && selected.status === 'open' && (excuse[a.id] === undefined ? (
                    <button className="btn-ghost" onClick={() => setExcuse({ ...excuse, [a.id]: '' })}>{tx('Excuse')}</button>
                  ) : (
                    <div className="flex items-center" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <input className="risys-input" style={{ width: 220 }} placeholder={tx('Reason, e.g. on long leave')} value={excuse[a.id]} onChange={(e) => setExcuse({ ...excuse, [a.id]: e.target.value })} />
                      <button className="btn-secondary" disabled={!!busy} onClick={run(`ex-${a.id}`, async () => { await pol.excuse(a.id, excuse[a.id]); setExcuse((x) => { const y = { ...x }; delete y[a.id]; return y }) })}>{tx('Excuse')}</button>
                      <button className="btn-ghost" onClick={() => setExcuse((x) => { const y = { ...x }; delete y[a.id]; return y })}>{tx('Cancel')}</button>
                    </div>
                  ))}</Td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Section>
      )}
    </>
  )
}

/* ── Exceptions ───────────────────────────────────────────────────────────── */

function ExceptionsTab({ pol, navigate, canRequest }) {
  const p = pol.policy
  return (
    <Section title={tx('Exceptions to this policy')} pad={false}
      actions={canRequest && <button className="btn-secondary" onClick={() => navigate(`/app/exceptions/new?subject_type=policy&subject_id=${p.id}&label=${encodeURIComponent(`${p.ref} ${p.title}`)}`)}>
        <ShieldOff size={13} /> {tx('Request an exception')}</button>}>
      {pol.exceptions.length === 0 ? <Empty title={tx('No exceptions')}>{tx('An exception is a time-limited, approved departure from the policy, with compensating controls.')}</Empty> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>{tx('Ref')}</Th><Th>{tx('Exception')}</Th><Th>{tx('Status')}</Th><Th>{tx('Expires')}</Th></tr></thead>
          <tbody>{pol.exceptions.map((e) => (
            <tr key={e.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/exceptions/${e.id}`)}>
              <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{e.ref}</Td>
              <Td>{e.title}</Td>
              <Td><ExceptionStatusBadge v={e.status} /></Td>
              <Td><DueText date={e.expires_on} done={e.status !== 'approved'} /></Td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Section>
  )
}
