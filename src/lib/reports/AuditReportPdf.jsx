/* ── Audit report ─────────────────────────────────────────────────────────────
 *
 * The report of one audit engagement, in the structure internal audit
 * standards expect: objective, scope and approach; an overall opinion;
 * each finding written as condition / criteria / cause / effect with a
 * recommendation and management's response; and the testing that supports it.
 *
 * Draft findings are never included (report_audit_data filters them out), and
 * an engagement that is not closed is marked as a draft on every page.
 * -------------------------------------------------------------------------- */
import { View, Text } from './rtl'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, P, Muted, Bullets, Callout,
  Pill, KpiRow, Table, FactGrid, s,
} from './primitives'
import { C, TEST_RESULT, FINDING_RATING, FINDING_STATUS, OPINION } from './theme'
import { fmtDate } from './models'
import { FONT_DISPLAY } from './assets'
import { tx } from '@/lib/i18n'

const TYPE = { internal: tx('Internal audit'), external: tx('External audit'), regulatory: tx('Regulatory inspection'), self_assessment: tx('Self-assessment') }
const STAGE = { planned: tx('Planned'), fieldwork: tx('Fieldwork'), reporting: tx('Reporting'), closed: tx('Closed'), cancelled: tx('Cancelled') }
const range = (a, b) => (a || b ? `${fmtDate(a)} – ${fmtDate(b)}` : '—')

function Finding({ f }) {
  const r = FINDING_RATING[f.rating] ?? FINDING_RATING.observation
  const overdue = f.due_date && new Date(f.due_date) < new Date() && !['closed', 'risk_accepted'].includes(f.status)
  const Block = ({ label, children, tone }) => children ? (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 6.8, fontWeight: 600, color: tone ?? C.rose, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: C.text }}>{children}</Text>
    </View>
  ) : null
  return (
    <View style={{ marginBottom: 14, borderLeftWidth: 3, borderLeftColor: r.color, paddingLeft: 10 }}>
      <View wrap={false}>
      <View style={[s.row, { alignItems: 'flex-start', marginBottom: 6 }]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 7, fontWeight: 600, color: C.text3, letterSpacing: 0.8 }}>{f.ref}{f.requirement_id ? `  ·  ${f.framework ?? ''} ${f.requirement_id}` : ''}</Text>
          <Text style={{ fontSize: 11, fontWeight: 600, color: C.ink, marginTop: 1 }}>{f.title}</Text>
        </View>
        <Pill meta={r} />
      </View>
      <Block label={tx('Condition — what we found')}>{f.condition}</Block>
      </View>
      <Block label={tx('Criteria — what is required')}>{f.criteria}</Block>
      <Block label={tx('Cause')}>{f.cause}</Block>
      <Block label={tx('Effect — why it matters')}>{f.effect}</Block>
      <Block label={tx('Recommendation')} tone={C.crimson}>{f.recommendation}</Block>
      <View wrap={false} style={{ backgroundColor: C.surface, padding: 8, marginTop: 2 }}>
        <Text style={{ fontSize: 6.8, fontWeight: 600, color: C.crimson, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{tx('Management response')}</Text>
        <Text style={{ color: f.management_response ? C.text : C.text3, marginBottom: 5 }}>
          {f.management_response ?? tx('No management response has been recorded.')}
        </Text>
        {f.action_plan ? <Text style={{ color: C.text2, marginBottom: 5 }}><Text style={{ fontWeight: 600 }}>{tx('Action:')} </Text>{f.action_plan}</Text> : null}
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Text style={{ fontSize: 7.4, color: C.text2, marginRight: 16 }}><Text style={{ fontWeight: 600 }}>{tx('Owner')} </Text>{f.owner ?? tx('Not assigned')}</Text>
          <Text style={{ fontSize: 7.4, color: overdue ? C.crimson : C.text2, marginRight: 16, fontWeight: overdue ? 600 : 400 }}>
            <Text style={{ fontWeight: 600 }}>{tx('Due')} </Text>{fmtDate(f.due_date)}{overdue ? tx(' (overdue)') : ''}
          </Text>
          <Text style={{ fontSize: 7.4, color: C.text2, marginRight: 16 }}><Text style={{ fontWeight: 600 }}>{tx('Status')} </Text>{FINDING_STATUS[f.status]?.label ?? f.status}</Text>
          {f.risk_ref ? <Text style={{ fontSize: 7.4, color: C.text2 }}><Text style={{ fontWeight: 600 }}>{tx('Risk')} </Text>{f.risk_ref}</Text> : null}
        </View>
      </View>
    </View>
  )
}

export default function AuditReportPdf({ model: m, meta }) {
  const e = m.engagement
  const draft = e.status !== 'closed'
  const op = e.opinion ? OPINION[e.opinion] : null
  const scopeCount = m.scope.length
  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={{ ...meta, eyebrow: `${tx(TYPE[e.audit_type] ?? 'Audit')} · ${e.ref}${draft ? ` · ${tx('Draft')}` : ''}` }} />

      <ContentPage meta={{ ...meta, classification: draft ? `${tx('Draft')} — ${meta.classification}` : meta.classification }}>
        {draft && (
          <Callout title={tx('Draft report')} tone="amber">
            <Text>{tx('This engagement is at the')} {STAGE[e.status]?.toLowerCase() ?? e.status} {tx(
                'stage. Findings, the opinion and management responses may still change. The final report is the one generated after the engagement is closed.'
              )}</Text>
          </Callout>
        )}

        {/* ── 1. Opinion ───────────────────────────────────────────── */}
        <SectionTitle first={!draft} eyebrow={tx('Section 1')} title={tx('Overall opinion')} />
        {op ? (
          <View wrap={false} style={{ backgroundColor: op.bg, borderWidth: 0.6, borderColor: op.border, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 600, color: op.color, letterSpacing: 1, textTransform: 'uppercase' }}>{tx('Opinion')}</Text>
            <Text style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: op.color, lineHeight: 1.2, marginTop: 3, marginBottom: 6 }}>{op.label}</Text>
            <Text style={{ color: C.text, marginBottom: e.opinion_summary ? 6 : 0 }}>{op.text}</Text>
            {e.opinion_summary ? <Text style={{ color: C.text2 }}>{e.opinion_summary}</Text> : null}
          </View>
        ) : (
          <Callout tone="rose">{tx('No overall opinion has been recorded yet.')}</Callout>
        )}
        <KpiRow items={[
          { label: tx('Items in scope'), value: scopeCount, sub: tx('{{t}} tested · {{r}} reviewed', { t: m.tested, r: m.reviewed }) },
          { label: tx('Effective'), value: m.results.effective, tone: 'good', sub: tx('{{n}} partially effective', { n: m.results.partially_effective }) },
          { label: tx('Ineffective'), value: m.results.ineffective, tone: m.results.ineffective ? 'alert' : undefined },
          { label: tx('Findings'), value: m.findings.length, tone: m.ratings.high ? 'alert' : undefined,
            sub: tx('{{h}} high · {{m}} medium · {{l}} low · {{o}} obs.', { h: m.ratings.high, m: m.ratings.medium, l: m.ratings.low, o: m.ratings.observation }) },
        ]} />

        <H3>{tx('Findings at a glance')}</H3>
        <Table
          columns={[
            { key: 'ref', label: tx('Ref'), width: 1.3, bold: true },
            { key: 'title', label: tx('Finding'), width: 4 },
            { key: 'rating', label: tx('Rating'), width: 1.1, render: (f) => <Pill small meta={FINDING_RATING[f.rating]} /> },
            { key: 'owner', label: tx('Owner'), width: 1.1 },
            { key: 'due', label: tx('Due'), width: 1.1, render: (f) => fmtDate(f.due_date) },
            { key: 'status', label: tx('Status'), width: 1.3, render: (f) => FINDING_STATUS[f.status]?.label ?? f.status },
          ]}
          rows={m.findings}
          empty={tx('No findings were raised.')}
        />

        {/* ── 2. Engagement ────────────────────────────────────────── */}
        <View wrap={false}>
        <SectionTitle eyebrow={tx('Section 2')} title={tx('Objective, scope and approach')} />
        <FactGrid facts={[
          ['Engagement', `${e.ref} — ${e.title}`],
          ['Type', TYPE[e.audit_type] ?? e.audit_type],
          e.framework ? ['Framework', e.framework] : null,
          ['Period under audit', range(e.period_start, e.period_end)],
          ['Fieldwork', range(e.planned_start, e.planned_end)],
          ['Lead auditor', e.lead_auditor ?? '—'],
          ['Stage', STAGE[e.status] ?? e.status],
        ]} />
        </View>
        {e.objective ? (<><H3>{tx('Objective')}</H3><P>{e.objective}</P></>) : null}
        {e.scope_summary ? (<><H3>{tx('Scope')}</H3><P>{e.scope_summary}</P></>) : null}
        {e.methodology ? (<><H3>{tx('Approach')}</H3><P>{e.methodology}</P></>) : null}

        {/* ── 3. Findings ──────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 3')} title={tx('Detailed findings')} />
        {m.findings.length === 0
          ? <P>{tx('No findings were raised in this engagement.')}</P>
          : m.findings.map((f) => <Finding key={f.ref} f={f} />)}
        <Muted>{tx(
          'Ratings: High — a weakness that exposes the organisation to significant risk and needs prompt action; Medium — a weakness to be remediated within the agreed plan; Low — an improvement with limited exposure; Observation — good-practice advice, no rating of control failure.'
        )}</Muted>

        {/* ── 4. Testing ───────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 4')} title={tx('Scope and testing results')} />
        <Table
          columns={[
            { key: 'item', label: tx('Requirement / control'), width: 2.6, render: (x) => (
                <View>
                  <Text style={{ fontSize: 7.6, fontWeight: 600, color: C.text }}>
                    {x.requirement_id ? `${x.framework ?? ''} ${x.requirement_id}` : x.control_ref ?? tx('Item')}
                  </Text>
                  <Text style={{ fontSize: 7.2, color: C.text2 }}>{x.title ?? x.control_name ?? x.requirement_text ?? ''}</Text>
                  {x.control_ref && x.requirement_id ? <Text style={{ fontSize: 6.6, color: C.text3 }}>{tx('Control')} {x.control_ref} {x.control_name ?? ''}</Text> : null}
                </View>) },
            { key: 'test_procedure', label: tx('Test performed'), width: 3, render: (x) => (
                <View>
                  <Text style={{ fontSize: 7.2, color: C.text2 }}>{x.test_procedure ?? '—'}</Text>
                  {x.result_notes ? <Text style={{ fontSize: 7, color: C.text, marginTop: 2 }}>{x.result_notes}</Text> : null}
                </View>) },
            { key: 'sample', label: tx('Sample'), width: 1.1, render: (x) => x.sample_size
                ? `${tx('{{s}} of {{p}}', { s: x.sample_size, p: x.population_size ?? '?' })}${x.exceptions_found ? ` · ${tx('{{n}} exc.', { n: x.exceptions_found })}` : ''}` : null },
            { key: 'result', label: tx('Result'), width: 1.4, render: (x) => <Pill small meta={TEST_RESULT[x.result] ?? TEST_RESULT.not_tested} /> },
            { key: 'by', label: tx('Tested / reviewed'), width: 1.3, render: (x) => (
                <View>
                  <Text style={{ fontSize: 7, color: C.text2 }}>{x.tester ?? '—'}</Text>
                  <Text style={{ fontSize: 7, color: x.reviewer ? C.text2 : C.crimson }}>{x.reviewer ?? (x.result !== 'not_tested' ? tx('Not reviewed') : '—')}</Text>
                </View>) },
          ]}
          rows={m.scope}
          empty={tx('No scope items were recorded.')}
        />

        <H3>{tx('Evidence')}</H3>
        <FactGrid facts={[
          ['Evidence requests', `${tx('{{t}} raised · {{a}} accepted · {{o}} outstanding', { t: m.requests.total ?? 0, a: m.requests.accepted ?? 0, o: m.requests.open ?? 0 })}${m.requests.overdue ? ` (${tx('{{n}} overdue', { n: m.requests.overdue })})` : ''}`],
          ['Evidence files', tx('{{n}} file(s) held in RISYS, each with a SHA-256 fingerprint recorded at upload', { n: m.evidenceFiles })],
        ]} />

        <SectionTitle eyebrow={tx('About this report')} title={tx('Basis of preparation')} />
        <Bullets color={C.rose} items={[
          'Each test result was recorded by the tester and, where shown, reviewed by a different person. RISYS does not allow the same person to both test and review an item.',
          'Findings are shown as issued to management. Draft findings the audit team has not issued are not included.',
          'Management responses are recorded by the finding owner in RISYS and are reproduced here as written.',
          m.reviewed < m.tested ? tx('{{n}} tested item(s) not yet reviewed.', { n: m.tested - m.reviewed }) : 'All tested items have been reviewed.',
          'The data this report was built from is archived in RISYS with the file and its SHA-256 fingerprint under the Report ID on the cover.',
        ]} />
      </ContentPage>
    </ReportDocument>
  )
}
