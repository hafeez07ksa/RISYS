import { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Inbox, Plus, Siren, UserRoundSearch, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { MetricStrip } from '@/components/ui/Metric'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useMyWork, WORK_KINDS } from '@/hooks/useMyWork'
import { useActivities, useRequests, useBreaches, useAssessments, usePrivacySettings } from '@/hooks/usePrivacy'
import { requestOpen, requestDaysLeft, breachHoursLeft, ropaGaps, REQUEST_TYPES } from '@/lib/privacy'
import { labelOf } from '@/lib/policies'
import { Section, Th, Td, Empty } from '@/features/audits/parts'
import { RequestClock, BreachClock, RequestStatusBadge, AssessmentStatusBadge, LawNote } from './parts'
import { fmtDate } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

const labelOfType = (v) => labelOf(REQUEST_TYPES, v)

/** A small link-button for section headers: one line, icon and label together. */
const HeaderLink = ({ to, children }) => (
  <Link to={to} className="btn-ghost" style={{ textDecoration: 'none', fontSize: 'var(--t-sm)', padding: '4px 8px', whiteSpace: 'nowrap', gap: 4 }}>
    {children}<ChevronRight size={12} className="rtl-flip" />
  </Link>
)

/* ── Privacy overview — /app/privacy ──────────────────────────────────────────
 *
 * The DPO's page: the two PDPL clocks that carry penalties (72 hours to tell
 * SDAIA about a breach, 30 days to answer a data subject), what is waiting on
 * the person looking, and the gaps in the record of processing and the impact
 * assessments it calls for.
 * -------------------------------------------------------------------------- */

const PRIVACY_KINDS = ['dsr_due', 'breach_notify', 'dpia_approval']

export function PrivacyOverviewPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const work = useMyWork()
  const acts = useActivities()
  const reqs = useRequests()
  const breaches = useBreaches()
  const pias = useAssessments()
  const { settings } = usePrivacySettings()
  const loading = acts.loading || reqs.loading || breaches.loading || pias.loading

  const m = useMemo(() => {
    const openReqs = reqs.items.filter(requestOpen)
    const openBreaches = breaches.items.filter((b) => b.status === 'open')
    const approved = new Set(pias.items.filter((a) => a.status === 'approved' && a.activity_id).map((a) => a.activity_id))
    const live = acts.items.filter((a) => a.status === 'active')
    return {
      openReqs: openReqs.sort((a, b) => (requestDaysLeft(a) ?? 0) - (requestDaysLeft(b) ?? 0)),
      overdueReqs: openReqs.filter((r) => requestDaysLeft(r) < 0).length,
      openBreaches,
      awaitingSdaia: openBreaches.filter((b) => breachHoursLeft(b) !== null).length,
      inReview: pias.items.filter((a) => a.status === 'in_review').length,
      live: live.length,
      needAssessment: live.filter((a) => a.assessment_required && !approved.has(a.id)),
      withGaps: live.filter((a) => ropaGaps(a, settings).length > 0).length,
    }
  }, [acts.items, reqs.items, breaches.items, pias.items, settings])

  const mine = work.items.filter((i) => PRIVACY_KINDS.includes(i.kind))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Privacy')} subtitle={organization?.name}
        actions={!perms.isReadOnly && <>
          <button className="btn-secondary" onClick={() => navigate('/app/privacy/requests/new')}><UserRoundSearch size={14} /> {tx('Log a request')}</button>
          <button className="btn-primary" onClick={() => navigate('/app/privacy/breaches/new')}><Siren size={14} /> {tx('Report a breach')}</button>
        </>} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <LawNote>{tx('Personal data protection under the PDPL Implementing Regulation: data subject requests answered within 30 days (Art. 3), personal-data breaches notified to SDAIA within 72 hours (Art. 24), impact assessments where Art. 25 asks for one, and a record of processing kept for five years after the processing ends (Art. 33).')}</LawNote>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '-4px 0 14px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {organization?.pdpl_profile
            ? tx('These registers measure your SDAIA PDPL compliance.')
            : tx('SDAIA PDPL is not in scope in Compliance yet; once it is, these registers measure it.')}
          <HeaderLink to={organization?.pdpl_profile ? `/app/compliance/${encodeURIComponent('SDAIA PDPL')}` : '/app/settings?tab=organization'}>
            {organization?.pdpl_profile ? tx('Open PDPL compliance') : tx('Set the PDPL scope')}
          </HeaderLink>
        </p>

        {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : (
          <>
            <div style={{ marginBottom: 16 }}>
              <MetricStrip metrics={[
                { label: tx('Breaches awaiting SDAIA'), value: m.awaitingSdaia, tone: 'critical', to: '/app/privacy/breaches' },
                { label: tx('Open requests'), value: m.openReqs.length, to: '/app/privacy/requests' },
                { label: tx('Requests overdue'), value: m.overdueReqs, tone: 'critical', to: '/app/privacy/requests' },
                { label: tx('Assessments to approve'), value: m.inReview, tone: 'medium', to: '/app/privacy/assessments' },
                { label: tx('Processing records'), value: m.live, to: '/app/privacy/processing' },
                { label: tx('Records with gaps'), value: m.withGaps, tone: 'medium', to: '/app/privacy/processing' },
              ]} />
            </div>

            {mine.length > 0 && (
              <section className="section" style={{ marginBottom: 16, borderColor: 'var(--crimson-wash)' }}>
                <div className="flex items-center" style={{ gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                  <Inbox size={14} style={{ color: 'var(--crimson)' }} />
                  <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Waiting on you')}</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                  {mine.map((i) => (
                    <tr key={`${i.kind}:${i.item_id}`} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(i.href)}>
                      <Td style={{ width: 200, color: 'var(--text-3)' }}>{tx(WORK_KINDS[i.kind]?.label)}</Td>
                      <Td style={{ color: 'var(--text)' }}>{i.ref} · {i.title}{i.detail ? <span style={{ color: 'var(--text-3)' }}> · {tx(i.detail)}</span> : null}</Td>
                      <Td align="right">{i.due_on ? fmtDate(i.due_on) : ''}</Td>
                    </tr>
                  ))}
                </tbody></table>
              </section>
            )}

            <Section title={tx('Open breaches')} actions={<HeaderLink to="/app/privacy/breaches">{tx('All breaches')}</HeaderLink>} pad={false}>
              {m.openBreaches.length === 0 ? <Empty title={tx('No open breaches')} /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Breach')}</Th><Th>{tx('Aware since')}</Th><Th>{tx('SDAIA clock')}</Th></tr></thead>
                  <tbody>{m.openBreaches.map((b) => (
                    <tr key={b.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/breaches/${b.id}`)}>
                      <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{b.ref}</Td>
                      <Td>{b.incident?.title}</Td>
                      <Td>{fmtDate(b.aware_at)}</Td>
                      <Td><BreachClock b={b} /></Td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Section>

            <Section title={tx('Open data subject requests')} actions={<HeaderLink to="/app/privacy/requests">{tx('All requests')}</HeaderLink>} pad={false}>
              {m.openReqs.length === 0 ? <Empty title={tx('No open requests')} /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Request')}</Th><Th>{tx('Status')}</Th><Th width={170}>{tx('Due')}</Th></tr></thead>
                  <tbody>{m.openReqs.slice(0, 8).map((r) => (
                    <tr key={r.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/requests/${r.id}`)}>
                      <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.ref}</Td>
                      <Td>{labelOfType(r.request_type)} · {r.requester_name}</Td>
                      <Td><RequestStatusBadge v={r.status} /></Td>
                      <Td><RequestClock r={r} /></Td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Section>

            <Section title={tx('Processing that needs an impact assessment')} pad={false}
              actions={perms.isComplianceWriter && <HeaderLink to="/app/privacy/processing/new"><Plus size={12} /> {tx('Record processing')}</HeaderLink>}>
              {m.needAssessment.length === 0 ? (
                <Empty title={tx('Nothing outstanding')}>{tx('Every active processing record that meets an Art. 25 trigger has an approved impact assessment.')}</Empty>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><Th width={100}>{tx('Ref')}</Th><Th>{tx('Processing')}</Th><Th align="right">{tx('Assessment')}</Th></tr></thead>
                  <tbody>{m.needAssessment.map((a) => {
                    const pia = pias.items.find((x) => x.activity_id === a.id && x.status !== 'superseded')
                    return (
                      <tr key={a.id} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/privacy/processing/${a.id}`)}>
                        <Td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.ref}</Td>
                        <Td>{a.name}</Td>
                        <Td align="right">{pia ? <AssessmentStatusBadge v={pia.status} /> : <span style={{ color: 'var(--critical)' }}>{tx('None yet')}</span>}</Td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
