/* ── Risk report ──────────────────────────────────────────────────────────────
 *
 * Everything RISYS holds about one risk, in the order the risk process runs:
 *
 *   1. The risk         statement, cause / event / impact, classification, people
 *   2. Assessment       inherent and residual scores, the tolerance gate, history
 *   3. Controls         mapped controls with coverage, and their tests
 *   4. Treatment        all four options, plans and actions
 *   5. Acceptance       every acceptance or exception, with its governance
 *   6. Monitoring       KRIs, loss events, periodic reviews
 *   7. Evidence         evidence on file and the findings linked to the risk
 *   8. Record           tasks, discussion and the workflow history
 *
 * Built from report_risk_data(), which runs as the person generating it, so the
 * report never holds more than they can read in the app. Evidence files are
 * shown in an appendix: images drawn, PDFs appended after the report (see
 * riskEvidence.js), other file types listed.
 * -------------------------------------------------------------------------- */
import { Image } from '@react-pdf/renderer'
import { View, Text } from './rtl'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, P, Muted, Callout,
  Pill, KpiRow, Table, FactGrid, s,
} from './primitives'
import { C, BAND, SEVERITY } from './theme'
import { fmtDate, fmtDateTime } from './models'
import { getWorkflowState, getToleranceStatus } from '@/lib/risks'
import { optionMeta, OPTION_DECISIONS, HORIZONS, planStatusMeta } from '@/lib/treatment'
import { tierMeta } from '@/lib/authority'
import { ACCEPTANCE_PURPOSES, ACCEPTANCE_STATUSES } from '@/lib/erm'
import { fmtSize } from './riskEvidence'
import { tx } from '@/lib/i18n'

const label = (list, v) => list.find((x) => x.value === v)?.label ?? v ?? '—'
const band = (b) => BAND[b] ?? BAND.none
const yesNo = (v) => (v ? tx('Yes') : tx('No'))
// Stored codes (in_progress, high) read as words.
const human = (v) => (v ? tx(String(v).charAt(0).toUpperCase() + String(v).slice(1).replace(/_/g, ' ')) : null)
const truncate = (t, n = 400) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t)

function Block({ title, children, tone }) {
  if (!children) return null
  return (
    <View style={{ marginBottom: 7 }}>
      <Text style={{ fontSize: 6.8, fontWeight: 600, color: tone ?? C.rose, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{title}</Text>
      <Text style={{ color: C.text }}>{children}</Text>
    </View>
  )
}

function ScoreTile({ title, l, i, score, b }) {
  const m = band(b)
  return (
    <View style={{ flex: 1, backgroundColor: m.bg, borderTopWidth: 2, borderTopColor: m.color, padding: 9, marginRight: 6 }}>
      <Text style={{ fontSize: 6.6, fontWeight: 600, color: C.rose, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{title}</Text>
      <Text style={{ fontSize: 20, fontWeight: 700, color: m.color, lineHeight: 1 }}>{score ?? '—'}</Text>
      <Text style={{ fontSize: 7, color: C.text2, marginTop: 4 }}>
        {score ? `${m.label} · ${tx('Likelihood')} ${l} × ${tx('Impact')} ${i}` : tx('Not scored')}
      </Text>
    </View>
  )
}

// A4 width less the page margins (primitives PAD_X = 42).
const CONTENT_W = 595 - 84

function EvidenceItem({ ev, item }) {
  const facts = [
    ev.evidence_type ? tx(ev.evidence_type) : null,
    `${tx('Collected')} ${fmtDate(ev.collected_at || ev.created_at)}`,
    ev.collected_by_name,
    ev.is_approved ? `${tx('Approved')}${ev.approved_by_name ? ` · ${ev.approved_by_name}` : ''}` : tx('Not approved'),
    ev.expires_at ? `${tx('Expires')} ${fmtDate(ev.expires_at)}` : null,
  ].filter(Boolean).join(' · ')
  const file = item?.name ? `${item.name}${item.size ? ` · ${fmtSize(item.size)}` : ''}` : null
  const head = (
    <View style={{ marginBottom: 6 }}>
      <View style={[s.row, { alignItems: 'center', marginBottom: 2 }]}>
        <Text style={{ fontSize: 7.4, fontWeight: 700, color: C.white, backgroundColor: C.crimson, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginRight: 6 }}>{item?.ref ?? '—'}</Text>
        <Text style={{ fontSize: 10, fontWeight: 600, color: C.ink, flex: 1 }}>{ev.title || item?.name || tx('Evidence')}</Text>
      </View>
      <Text style={{ fontSize: 7.4, color: C.text2 }}>{facts}</Text>
      {file ? <Text style={{ fontSize: 7.2, color: C.text3 }}>{file}</Text> : null}
      {ev.description ? <Text style={{ fontSize: 7.8, color: C.text, marginTop: 3 }}>{ev.description}</Text> : null}
      {ev.evidence_period ? <Text style={{ fontSize: 7.4, color: C.text2 }}>{tx('Period covered')}: {ev.evidence_period}</Text> : null}
    </View>
  )
  if (item?.kind === 'image' && item.src) {
    const scale = Math.min(CONTENT_W / item.width, 520 / item.height, 0.75)
    return (
      <View wrap={false} style={{ marginBottom: 16, paddingBottom: 12, borderBottomWidth: 0.6, borderBottomColor: C.border }}>
        {head}
        <View style={{ borderWidth: 0.6, borderColor: C.border, alignSelf: 'flex-start' }}>
          <Image src={item.src} style={{ width: item.width * scale, height: item.height * scale }} />
        </View>
      </View>
    )
  }
  const note = item?.kind === 'pdf'
    ? (item.appended < item.pages
        ? tx('The first {{n}} of its {{total}} pages follow at the end of this report, each stamped “Evidence {{ref}}”.', { n: item.appended, total: item.pages, ref: item.ref })
        : tx('Its {{n}} page(s) follow at the end of this report, each stamped “Evidence {{ref}}”.', { n: item.pages, ref: item.ref }))
    : item?.note ?? tx('This evidence was not read for the report.')
  return (
    <View wrap={false} style={{ marginBottom: 14, paddingBottom: 10, borderBottomWidth: 0.6, borderBottomColor: C.border }}>
      {head}
      <View style={{ backgroundColor: item?.kind === 'pdf' ? C.surface : C.hover, borderLeftWidth: 2,
                     borderLeftColor: item?.kind === 'pdf' ? C.crimson : C.blush, paddingVertical: 5, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 7.8, color: C.text2 }}>{note}</Text>
      </View>
    </View>
  )
}

export default function RiskReportPdf({ model: m, meta, media }) {
  const ev = media?.byId ?? {}
  const r = m.risk
  const wf = getWorkflowState(r.workflow_state)
  const tol = getToleranceStatus(r.tolerance_status)
  const failed = Array.isArray(r.gate_failed_rules) ? r.gate_failed_rules : []
  const active = m.acceptances.find((a) => a.status === 'approved')
  const openActions = m.treatment_actions.filter((a) => a.status !== 'completed' && a.status !== 'cancelled')

  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={meta} />

      <ContentPage meta={meta}>
        {/* ── 1. The risk ─────────────────────────────────────────────────── */}
        <SectionTitle first eyebrow={`${r.risk_id ?? ''} · ${wf.label}`} title={r.title} />

        <View wrap={false} style={[s.row, { marginBottom: 10 }]}>
          <ScoreTile title={tx('Inherent')} l={r.inherent_likelihood} i={r.inherent_impact} score={r.inherent} b={r.inherent_band} />
          <ScoreTile title={tx('Residual')} l={r.residual_likelihood} i={r.residual_impact} score={r.residual} b={r.residual_band} />
          <View style={{ flex: 1, backgroundColor: C.surface, borderTopWidth: 2,
                         borderTopColor: r.tolerance_status === 'breached' ? C.crimson : r.tolerance_status === 'within' ? '#166534' : C.blush, padding: 9 }}>
            <Text style={{ fontSize: 6.6, fontWeight: 600, color: C.rose, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{tx('Tolerance')}</Text>
            <Text style={{ fontSize: 11, fontWeight: 600, color: r.tolerance_status === 'breached' ? C.crimson : C.ink }}>{tol.label}</Text>
            <Text style={{ fontSize: 7, color: C.text2, marginTop: 4 }}>
              {active ? `${tx('Accepted until')} ${fmtDate(active.expires_at)}` : r.treatment_due_at ? `${tx('Treatment due')} ${fmtDate(r.treatment_due_at)}` : wf.label}
            </Text>
          </View>
        </View>

        {r.risk_statement ? <Callout title={tx('Risk statement')}>{r.risk_statement}</Callout> : null}
        <Block title={tx('Cause')}>{r.cause}</Block>
        <Block title={tx('Event')}>{r.event}</Block>
        <Block title={tx('Impact')}>{r.impact_statement}</Block>
        <Block title={tx('Description')}>{r.description}</Block>

        <H3>{tx('Classification and ownership')}</H3>
        <FactGrid facts={[
          [tx('Reference'), r.risk_id],
          [tx('Category'), [r.category, r.subcategory].filter(Boolean).map((x) => tx(x)).join(' · ') || null],
          [tx('Risk type'), r.risk_type ? tx(r.risk_type) : null],
          [tx('Business unit'), r.business_unit],
          [tx('Workflow state'), wf.label],
          [tx('Status'), human(r.status)],
          [tx('Risk owner'), r.owner_name],
          r.assigned_name ? [tx('Assigned to'), r.assigned_name] : null,
          m.collaborators.length ? [tx('Collaborators'), m.collaborators.join(', ')] : null,
          [tx('Source'), r.source ? `${tx(r.source)}${r.source_entity_name ? ` · ${r.source_entity_name}` : ''}` : null],
          r.source_finding ? [tx('Source finding'), r.source_finding] : null,
          m.submission ? [tx('Raised through'), `${m.submission.ref} · ${m.submission.submitted_by_name ?? ''} · ${fmtDate(m.submission.submitted_at)}`] : null,
          [tx('Framework reference'), r.framework_ref],
          [tx('Appetite'), r.risk_appetite ? tx(r.risk_appetite) : null],
          [tx('Direction'), r.risk_direction ? tx(r.risk_direction) : null],
          [tx('Identified'), fmtDate(r.identified_date)],
          [tx('Admitted to the register'), r.approved_at ? `${fmtDate(r.approved_at)}${r.approved_by_name ? ` · ${r.approved_by_name}` : ''}` : null],
          r.assessment_due_at ? [tx('Assessment due'), fmtDate(r.assessment_due_at)] : null,
          r.assessed_at ? [tx('Assessed'), fmtDate(r.assessed_at)] : null,
          [tx('Review frequency'), r.review_frequency ? tx(r.review_frequency) : null],
          [tx('Next review'), r.review_date ? fmtDate(r.review_date) : null],
          r.closed_at ? [tx('Closed'), `${fmtDate(r.closed_at)}${r.closure_reason ? ` — ${r.closure_reason}` : ''}`] : null,
        ]} />

        {/* ── 2. Assessment ───────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Assessment')} title={tx('Scores and the tolerance gate')} />
        <FactGrid facts={[
          [tx('Tolerance status'), tol.label],
          [tx('Gate last run'), r.gate_evaluated_at ? fmtDateTime(r.gate_evaluated_at) : tx('Not run')],
          r.breach_since ? [tx('Outside tolerance since'), fmtDate(r.breach_since)] : null,
          m.tolerance ? [tx('Category appetite'), `${m.tolerance.appetite ? tx(m.tolerance.appetite) : '—'}${m.tolerance.max_accept_band ? ` · ${tx('accept up to')} ${band(m.tolerance.max_accept_band).label}` : ''}`] : null,
          m.tolerance?.appetite_statement ? [tx('Appetite statement'), m.tolerance.appetite_statement] : null,
        ]} />
        {failed.length > 0 && (
          <Table heading={<H3>{tx('Tolerance rules failed')}</H3>} dense
            columns={[
              { key: 'label', label: tx('Rule'), width: 3, render: (x) => x.label || x.metric },
              { key: 'expected', label: tx('Limit'), width: 1.4, render: (x) => `${x.operator ?? ''} ${x.expected ?? ''}` },
              { key: 'actual', label: tx('Actual'), width: 1, render: (x) => (x.actual == null ? '—' : String(x.actual)) },
            ]}
            rows={failed} />
        )}
        <Table heading={<H3>{tx('Score history')}</H3>} dense empty={tx('No scores recorded yet.')}
          columns={[
            { key: 'assessed_at', label: tx('Date'), width: 1.2, render: (x) => fmtDate(x.assessed_at) },
            { key: 'score_type', label: tx('Type'), width: 1, render: (x) => tx(x.score_type === 'residual' ? 'Residual' : x.score_type === 'inherent' ? 'Inherent' : x.score_type) },
            { key: 'li', label: tx('L × I'), width: 0.8, render: (x) => `${x.likelihood ?? '—'} × ${x.impact ?? '—'}` },
            { key: 'score', label: tx('Score'), width: 0.8, render: (x) => <Pill small meta={band(x.band)} label={`${x.score ?? '—'} ${band(x.band).label}`} /> },
            { key: 'justification', label: tx('Justification'), width: 3.2, render: (x) => truncate(x.justification, 220) },
            { key: 'assessed_by_name', label: tx('By'), width: 1.2 },
          ]}
          rows={m.score_history} />

        {/* ── 3. Controls ─────────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Controls')} title={tx('Controls mapped to this risk')} />
        <Table dense empty={tx('No controls are mapped to this risk.')}
          columns={[
            { key: 'control_ref', label: tx('Control'), width: 0.9 },
            { key: 'name', label: tx('Name'), width: 2.3 },
            { key: 'control_type', label: tx('Type'), width: 1, render: (x) => (x.control_type ? tx(x.control_type) : null) },
            { key: 'coverage', label: tx('Coverage'), width: 1, render: (x) => (x.coverage ? tx(x.coverage === 'full' ? 'Full' : x.coverage === 'partial' ? 'Partial' : 'None') : null) },
            { key: 'reduces', label: tx('Reduces'), width: 1, render: (x) => (x.reduces ? tx(x.reduces === 'both' ? 'Both' : x.reduces === 'likelihood' ? 'Likelihood' : 'Impact') : null) },
            { key: 'testing_status', label: tx('Testing'), width: 1, render: (x) => (x.testing_status ? tx(x.testing_status) : null) },
            { key: 'effectiveness', label: tx('Effectiveness'), width: 1.2, align: 'right', render: (x) => (x.effectiveness ? `${x.effectiveness}/5` : null) },
          ]}
          rows={m.controls} />
        {m.controls.some((c) => c.coverage_note) && (
          <View style={{ marginBottom: 8 }}>
            {m.controls.filter((c) => c.coverage_note).map((c, i) => (
              <Muted key={i}>{c.control_ref ?? c.name}: {c.coverage_note}</Muted>
            ))}
          </View>
        )}
        {m.control_tests.length > 0 && (
          <Table heading={<H3>{tx('Control tests')}</H3>} dense
            columns={[
              { key: 'test_date', label: tx('Date'), width: 1, render: (x) => fmtDate(x.test_date) },
              { key: 'test_type', label: tx('Test'), width: 1.2, render: (x) => (x.test_type ? tx(x.test_type) : null) },
              { key: 'result', label: tx('Result'), width: 1, render: (x) => (x.result ? tx(x.result) : null) },
              { key: 'notes', label: tx('Notes'), width: 3.2, render: (x) => truncate(x.notes, 200) },
              { key: 'tested_by_name', label: tx('Tested by'), width: 1.2 },
            ]}
            rows={m.control_tests} />
        )}

        {/* ── 4. Treatment ────────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Treatment')} title={tx('Treatment decision, plans and actions')} />
        <Table dense heading={<H3>{tx('Options considered')}</H3>} empty={tx('No treatment decision recorded yet.')}
          columns={[
            { key: 'option', label: tx('Option'), width: 1, bold: true, render: (x) => optionMeta(x.option).label },
            { key: 'decision', label: tx('Decision'), width: 1, render: (x) => label(OPTION_DECISIONS, x.decision) },
            { key: 'horizon', label: tx('Horizon'), width: 1, render: (x) => (x.horizon ? label(HORIZONS, x.horizon) : null) },
            { key: 'assessment', label: tx('Rationale'), width: 4, render: (x) => truncate(x.assessment || x.rejection_reason, 260) },
            { key: 'decided_by_name', label: tx('Decided by'), width: 1.2 },
          ]}
          rows={m.treatment_options} />
        {m.treatment_plans.length > 0 && (
          <Table dense heading={<H3>{tx('Treatment plans')}</H3>}
            columns={[
              { key: 'plan_ref', label: tx('Plan'), width: 0.9 },
              { key: 'title', label: tx('Title'), width: 2.6 },
              { key: 'option', label: tx('Option'), width: 0.9, render: (x) => optionMeta(x.option).label },
              { key: 'target', label: tx('Target'), width: 0.9, render: (x) => (x.target_likelihood && x.target_impact ? `${x.target_likelihood} × ${x.target_impact}` : null) },
              { key: 'owner_id_name', label: tx('Owner'), width: 1.2 },
              { key: 'due_date', label: tx('Due'), width: 1, render: (x) => fmtDate(x.due_date) },
              { key: 'status', label: tx('Status'), width: 1, render: (x) => planStatusMeta(x.status).label },
            ]}
            rows={m.treatment_plans} />
        )}
        <Table dense heading={<H3>{tx('Actions')} {openActions.length ? `· ${tx('{{n}} open', { n: openActions.length })}` : ''}</H3>}
          empty={tx('No treatment actions recorded.')}
          columns={[
            { key: 'action_ref', label: tx('Ref'), width: 0.8 },
            { key: 'title', label: tx('Action'), width: 3 },
            { key: 'owner_id_name', label: tx('Owner'), width: 1.2 },
            { key: 'target_date', label: tx('Target'), width: 1, render: (x) => fmtDate(x.target_date) },
            { key: 'percent_complete', label: '%', width: 0.5, align: 'right', render: (x) => (x.percent_complete == null ? null : String(x.percent_complete)) },
            { key: 'status', label: tx('Status'), width: 1, render: (x) => human(x.status) },
          ]}
          rows={m.treatment_actions} />

        {/* ── 5. Acceptance ───────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Acceptance')} title={tx('Acceptances and exceptions')} />
        {m.acceptances.length === 0 ? <P style={{ color: C.text3 }}>{tx('This risk has never been put forward for acceptance.')}</P> : m.acceptances.map((a) => (
          <View key={a.id} wrap={false} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: a.exception_type === 'exception' ? C.crimson : C.rose, paddingLeft: 10 }}>
            <View style={[s.row, { alignItems: 'center', marginBottom: 4 }]}>
              <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink, flex: 1 }}>
                {a.exception_ref} · {a.exception_type === 'exception' ? tx('Exception · above tolerance') : tx('Acceptance')}
              </Text>
              <Pill small meta={a.status === 'approved' ? BAND.low : a.status === 'pending' ? BAND.medium : BAND.none} label={label(ACCEPTANCE_STATUSES, a.status)} />
            </View>
            <FactGrid facts={[
              [tx('Purpose'), a.purpose ? label(ACCEPTANCE_PURPOSES, a.purpose) : null],
              [tx('Rationale'), a.justification],
              a.compensating_controls ? [tx('Compensating controls'), a.compensating_controls] : null,
              [tx('Authority required'), `${tierMeta(a.required_authority).label}${a.band_at_request ? ` · ${band(a.band_at_request).label} ${tx('at')} ${a.residual_at_request ?? '—'}` : ''}`],
              [tx('Requested'), `${a.requested_by_name ?? '—'} · ${fmtDate(a.created_at)}`],
              [tx('Approver'), a.approver_id_name],
              a.decision_due_on ? [tx('Decision due'), fmtDate(a.decision_due_on)] : null,
              a.management_review_required ? [tx('Management review'), `${a.management_reviewer_id_name ?? '—'} · ${a.management_review_outcome ? tx(a.management_review_outcome === 'objected' ? 'Objected' : 'Endorsed') : tx('Pending')}${a.management_review_note ? ` — ${a.management_review_note}` : ''}`] : null,
              a.decided_at ? [tx('Decision'), `${a.decided_by_name ?? ''}${a.decided_authority ? ` ${tx('as')} ${tierMeta(a.decided_authority).label}` : ''} · ${fmtDate(a.decided_at)}${a.decision_comment ? ` — ${a.decision_comment}` : ''}`] : null,
              a.conditions ? [tx('Conditions'), a.conditions] : null,
              [tx('Valid until'), fmtDate(a.expires_at)],
              [tx('Review'), a.review_frequency ? tx(a.review_frequency) : null],
              a.revoked_at ? [tx('Revoked'), `${a.revoked_by_name ?? ''} · ${fmtDate(a.revoked_at)}${a.revoke_reason ? ` — ${a.revoke_reason}` : ''}`] : null,
            ]} />
          </View>
        ))}

        {/* ── 6. Monitoring ───────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Monitoring')} title={tx('KRIs, loss events and reviews')} />
        <Table dense heading={<H3>{tx('Key risk indicators')}</H3>} empty={tx('No KRIs defined.')}
          columns={[
            { key: 'name', label: tx('KRI'), width: 2.4 },
            { key: 'current_value', label: tx('Current'), width: 0.9, align: 'right', render: (x) => (x.current_value == null ? null : `${x.current_value}${x.unit ? ` ${x.unit}` : ''}`) },
            { key: 'thresholds', label: tx('Green / amber / red'), width: 1.6, render: (x) => [x.green_threshold, x.amber_threshold, x.red_threshold].map((v) => v ?? '—').join(' / ') },
            { key: 'rag_status', label: tx('Status'), width: 0.8, render: (x) => (x.rag_status ? tx(x.rag_status) : null) },
            { key: 'trend', label: tx('Trend'), width: 0.8, render: (x) => (x.trend ? tx(x.trend) : null) },
            { key: 'owner_id_name', label: tx('Owner'), width: 1.2 },
          ]}
          rows={m.kris} />
        <Table dense heading={<H3>{tx('Loss events')}</H3>} empty={tx('No loss events recorded.')}
          columns={[
            { key: 'event_id', label: tx('Ref'), width: 0.8 },
            { key: 'title', label: tx('Event'), width: 2.6 },
            { key: 'event_date', label: tx('Date'), width: 1, render: (x) => fmtDate(x.event_date) },
            { key: 'net_loss', label: tx('Net loss'), width: 1.2, align: 'right', render: (x) => (x.net_loss == null ? null : `${Number(x.net_loss).toLocaleString('en-US')} ${x.currency ?? ''}`) },
            { key: 'root_cause_category', label: tx('Root cause'), width: 1, render: (x) => (x.root_cause_category ? tx(x.root_cause_category) : null) },
          ]}
          rows={m.loss_events} />
        <Table dense heading={<H3>{tx('Periodic reviews')}</H3>} empty={tx('No reviews recorded.')}
          columns={[
            { key: 'created_at', label: tx('Date'), width: 1, render: (x) => fmtDate(x.created_at) },
            { key: 'outcome', label: tx('Outcome'), width: 1.2, render: (x) => (x.outcome ? tx(x.outcome) : null) },
            { key: 'notes', label: tx('Notes'), width: 3.6, render: (x) => truncate(x.notes, 260) },
            { key: 'reviewed_by_name', label: tx('Reviewed by'), width: 1.2 },
            { key: 'next_review_date', label: tx('Next review'), width: 1, render: (x) => fmtDate(x.next_review_date) },
          ]}
          rows={m.reviews} />

        {/* ── 7. Evidence and findings ────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Evidence')} title={tx('Evidence and linked findings')} />
        <Table dense heading={<H3>{tx('Evidence on file')}</H3>} empty={tx('No evidence attached to this risk.')}
          columns={[
            { key: 'ref', label: tx('Ref'), width: 0.5, render: (x) => ev[x.id]?.ref ?? null },
            { key: 'title', label: tx('Evidence'), width: 2.4, render: (x) => x.title || x.file_name },
            { key: 'evidence_type', label: tx('Type'), width: 1, render: (x) => (x.evidence_type ? tx(x.evidence_type) : null) },
            { key: 'collected_at', label: tx('Collected'), width: 1, render: (x) => fmtDate(x.collected_at || x.created_at) },
            { key: 'expires_at', label: tx('Expires'), width: 1, render: (x) => (x.expires_at ? fmtDate(x.expires_at) : null) },
            { key: 'is_approved', label: tx('Approved'), width: 0.8, render: (x) => yesNo(x.is_approved) },
            { key: 'collected_by_name', label: tx('By'), width: 1.2 },
          ]}
          rows={m.evidence} />
        <Table dense heading={<H3>{tx('Findings linked to this risk')} {m.findings.length ? `· ${m.findings.length}` : ''}</H3>} empty={tx('No findings are linked to this risk.')}
          columns={[
            { key: 'finding_title', label: tx('Finding'), width: 3.6, render: (x) => truncate(x.subject_name ? `${x.finding_title} — ${x.subject_name}` : x.finding_title, 180) },
            { key: 'severity', label: tx('Severity'), width: 0.9, render: (x) => <Pill small meta={SEVERITY[x.severity] ?? SEVERITY.info} /> },
            { key: 'control_ref', label: tx('Control'), width: 1.1 },
            { key: 'disposition', label: tx('Link'), width: 1, render: (x) => (x.disposition === 'created' ? tx('Raised this risk') : tx('Attached')) },
            { key: 'decided_at', label: tx('Date'), width: 0.9, render: (x) => fmtDate(x.decided_at) },
          ]}
          rows={m.findings} />

        {/* ── 8. Record ───────────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Record')} title={tx('Tasks, discussion and history')} />
        <Table dense heading={<H3>{tx('Tasks')}</H3>} empty={tx('No tasks linked to this risk.')}
          columns={[
            { key: 'title', label: tx('Task'), width: 3 },
            { key: 'assigned_to_name', label: tx('Assigned to'), width: 1.2 },
            { key: 'due_at', label: tx('Due'), width: 1, render: (x) => fmtDate(x.due_at) },
            { key: 'priority', label: tx('Priority'), width: 0.8, render: (x) => human(x.priority) },
            { key: 'status', label: tx('Status'), width: 1, render: (x) => human(x.status) },
          ]}
          rows={m.tasks} />
        {m.comments.length > 0 && (
          <Table dense heading={<H3>{tx('Discussion')}</H3>}
            columns={[
              { key: 'created_at', label: tx('Date'), width: 1.1, render: (x) => fmtDateTime(x.created_at) },
              { key: 'user_id_name', label: tx('By'), width: 1.2 },
              { key: 'content', label: tx('Comment'), width: 5, render: (x) => truncate(x.content, 400) },
            ]}
            rows={m.comments} />
        )}
        <Table dense heading={<H3>{tx('Workflow history')}</H3>} empty={tx('No workflow changes recorded.')}
          columns={[
            { key: 'performed_at', label: tx('Date'), width: 1.2, render: (x) => fmtDateTime(x.performed_at) },
            { key: 'transition', label: tx('Change'), width: 2, render: (x) => `${x.from_state ? getWorkflowState(x.from_state).label : '—'} → ${x.to_state ? getWorkflowState(x.to_state).label : '—'}` },
            { key: 'comment', label: tx('Comment'), width: 3.4, render: (x) => truncate(x.comment, 260) },
            { key: 'performed_by_name', label: tx('By'), width: 1.2, render: (x) => x.performed_by_name ?? tx('RISYS') },
          ]}
          rows={m.workflow} />

        <H3>{tx('Basis of preparation')}</H3>
        <Muted>{media
          ? tx('Generated from the risk record in RISYS at the time shown on the cover, with the permissions of the person who generated it. Evidence images are reproduced in the appendix and evidence PDFs are appended after it; other file types are listed only. Scores are banded with the organisation’s risk matrix, and authority follows the acceptance ladder recorded in RISYS.')
          : tx('Generated from the risk record in RISYS at the time shown on the cover, with the permissions of the person who generated it. Evidence files are listed but not included. Scores are banded with the organisation’s risk matrix, and authority follows the acceptance ladder recorded in RISYS.')}</Muted>

        {/* ── Appendix: the evidence itself ───────────────────────────────── */}
        {media && m.evidence.length > 0 && (
          <View break>
            <SectionTitle first eyebrow={tx('Appendix')} title={tx('Evidence')} />
            <P style={{ color: C.text2, marginBottom: 10 }}>
              {tx('Each item carries the reference used in the evidence table. Images are shown as uploaded (scaled to fit). Evidence PDFs follow this appendix, each page stamped with its reference.')}
            </P>
            {m.evidence.map((x) => <EvidenceItem key={x.id} ev={x} item={ev[x.id]} />)}
          </View>
        )}
      </ContentPage>
    </ReportDocument>
  )
}
