/* ── Board risk & compliance report ───────────────────────────────────────────
 *
 * A quarterly pack for the board or its risk committee. It answers, in order:
 * what needs the board's attention, where risk sits before and after controls,
 * what has been accepted and on whose authority, how far the organisation is
 * through NCA ECC, and what operations and assurance are telling us.
 *
 * Every number comes from the model (models.js → buildBoardPackModel), which is
 * archived with the file, so a figure in a past pack can always be traced.
 * -------------------------------------------------------------------------- */
import { View, Text } from './rtl'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, P, Muted, Lead, Bullets, Callout,
  Pill, KpiRow, Table, HeatMap, BandLegend, StackedBar, Legend, FactGrid, s,
} from './primitives'
import { C, BAND, COMPLIANCE, SIGNAL, SEVERITY, OPINION, FINDING_RATING } from './theme'
import { fmtDate } from './models'
import { tx } from '@/lib/i18n'

const ECC_SEGMENTS = ['compliant', 'partial', 'in_progress', 'not_compliant', 'not_applicable']
const AUTHORITY = { ciso: 'CISO', committee: 'Risk committee', board: 'Board', cro: 'CRO', owner: 'Risk owner' }
const TOLERANCE = {
  within:        { label: tx('Within'),        color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  breached:      { label: tx('Breached'),      color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  not_evaluated: { label: tx('Not evaluated'), color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
}
const AUDIT_STATUS = { planned: tx('Planned'), fieldwork: tx('Fieldwork'), reporting: tx('Reporting'), closed: tx('Closed') }
const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1).replace(/_/g, ' ') : '—')

export default function BoardPackPdf({ model: m, meta }) {
  const highPlus = m.byResidual.critical + m.byResidual.high
  const openCritical = m.connectorCritical
  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={meta} />

      <ContentPage meta={meta}>
        {/* ── 1. Summary ───────────────────────────────────────────── */}
        <SectionTitle first eyebrow={tx('Section 1')} title={tx('Summary for the board')} />
        <Lead>
          {m.risks.length} {tx('risks are on the register for')} {m.orgName}. {highPlus
              ? tx('{{n}} rated High or Critical on current score', { n: highPlus })
              : tx('None is rated High or Critical')}
          {m.tolerance.breached ? tx(', and {{n}} outside the approved risk tolerance', { n: m.tolerance.breached }) : ''}.
                    {' '}{m.ecc.assessed} {tx('of')} {m.ecc.mainTotal} {tx('NCA ECC main controls have a recorded assessment, of which')} {tx('{{n}} compliant.', { n: m.ecc.counts.compliant })}</Lead>
        <KpiRow items={[
          { label: tx('Risks on register'), value: m.risks.length, sub: tx('{{n}} raised in the period', { n: m.movement.opened ?? 0 }) },
          { label: tx('Rated high / critical'), value: highPlus, tone: highPlus ? 'alert' : 'good', sub: tx('{{c}} critical · {{h}} high, current score', { c: m.byResidual.critical, h: m.byResidual.high }) },
          { label: tx('Outside tolerance'), value: m.tolerance.breached, tone: m.tolerance.breached ? 'alert' : undefined, sub: tx('{{n}} not yet evaluated', { n: m.tolerance.not_evaluated }) },
          { label: tx('ECC compliant'), value: `${m.ecc.compliantPct}%`, sub: tx('{{n}} of {{total}} main controls', { n: m.ecc.counts.compliant, total: m.ecc.mainTotal }) },
        ]} />
        <KpiRow items={[
          { label: tx('Open incidents'), value: m.incidents.openTotal, tone: m.incidents.open.critical ? 'alert' : undefined, sub: tx('{{n}} raised in the period', { n: m.incidents.inPeriodTotal }) },
          { label: tx('Critical system findings'), value: openCritical, tone: openCritical ? 'alert' : undefined, sub: tx('From connected systems') },
          { label: tx('Open audit findings'), value: m.audit.openTotal, tone: m.audit.high ? 'alert' : undefined, sub: tx('{{h}} high · {{o}} overdue', { h: m.audit.high, o: m.audit.overdue }) },
          { label: tx('Accepted risks'), value: m.exceptions.length, sub: tx('{{n}} expire within 60 days', { n: m.expiringSoon.length }) },
        ]} />

        <H3>{tx('Matters for the board\'s attention')}</H3>
        {m.attention.length
          ? <Bullets items={m.attention} />
          : <Callout tone="rose">{tx('No matter requires the board\'s attention this period.')}</Callout>}

        {/* ── 2. Risk posture ──────────────────────────────────────── */}
        <SectionTitle breakBefore eyebrow={tx('Section 2')} title={tx('Risk posture')} />
        <P>{tx(
          'Each risk is scored for likelihood and impact twice: before controls (inherent) and after the controls that are in place (residual). The gap between the two maps is what the organisation\'s controls are buying. Bands follow the organisation\'s own risk matrix.'
        )}</P>
        <View style={[s.row, { marginTop: 4, marginBottom: 6 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            <HeatMap title={tx('Inherent — before controls')} cells={m.heat.inherent.cells} dims={m.heat.dims} total={m.heat.inherent.total} />
          </View>
          <View style={{ flex: 1 }}>
            <HeatMap title={tx('Residual — after controls')} cells={m.heat.residual.cells} dims={m.heat.dims} total={m.heat.residual.total} />
          </View>
        </View>
        <BandLegend />
        {m.residualUnscored > 0 && (
          <Muted style={{ marginTop: 6 }}>
            {m.residualUnscored} {tx('of')} {m.risks.length} {tx(
              'risks have no residual assessment yet and are left off the residual map rather than shown at their inherent position. They are counted at their inherent score elsewhere in this report.'
            )}</Muted>
        )}

        <H3>{tx('Residual risk by band')}</H3>
        <View wrap={false} style={{ marginBottom: 8 }}>
          <StackedBar total={m.risks.length} height={12}
                      segments={['critical', 'high', 'medium', 'low'].map((b) => ({ value: m.byResidual[b], meta: BAND[b] }))} />
          <Legend items={['critical', 'high', 'medium', 'low'].map((b) => ({ color: BAND[b].color, label: `${tx(BAND[b].label)} ${m.byResidual[b]}` }))} />
        </View>

        <H3>{tx('Highest-rated risks')}</H3>
        <Table
          columns={[
            { key: 'ref', label: tx('Ref'), width: 0.8, bold: true },
            { key: 'title', label: tx('Risk'), width: 2.8 },
            { key: 'category', label: tx('Category'), width: 1.1 },
            { key: 'owner', label: tx('Owner'), width: 1 },
            { key: 'inh', label: tx('Inherent'), width: 1, render: (r) => <Pill small meta={BAND[r.inherentBand]} label={`${BAND[r.inherentBand]?.label ?? '—'} ${r.inherent ?? ''}`} /> },
            { key: 'res', label: tx('Residual'), width: 1, render: (r) => r.hasResidualAxes
                ? <Pill small meta={BAND[r.residualBand]} label={`${BAND[r.residualBand]?.label ?? '—'} ${r.residual ?? ''}`} />
                : <Text style={{ fontSize: 7, color: C.text3 }}>{tx('Not assessed')}</Text> },
            { key: 'tol', label: tx('Tolerance'), width: 1.3, render: (r) => <Pill small meta={TOLERANCE[r.tolerance_status] ?? TOLERANCE.not_evaluated} /> },
          ]}
          rows={m.topRisks}
          empty={tx('No risks are registered.')}
        />

        {/* ── 3. Tolerance, acceptance, treatment ───────────────────── */}
        <SectionTitle eyebrow={tx('Section 3')} title={tx('Tolerance, acceptance and treatment')} />
        <P>{tx(
          'Every residual score passes a tolerance gate. A risk inside tolerance can be accepted; one outside must be treated, or accepted as a formal exception signed at the authority its band requires. Exceptions expire and must be re-approved.'
        )}</P>
        <FactGrid facts={[
          ['Within tolerance', String(m.tolerance.within)],
          ['Outside tolerance', String(m.tolerance.breached)],
          ['Not yet evaluated', String(m.tolerance.not_evaluated)],
          ['Open treatment plans', `${m.plans.total}${m.plans.overdue ? ` — ${tx('{{n}} past due date', { n: m.plans.overdue })}` : ''}`],
          ['Risks raised / closed in period', tx('{{o}} raised · {{c}} closed', { o: m.movement.opened ?? 0, c: m.movement.closed ?? 0 })],
        ]} />
        <H3>{tx('Risks accepted by exception')}</H3>
        <Table
          columns={[
            { key: 'ref', label: tx('Exception'), width: 1, bold: true },
            { key: 'risk', label: tx('Risk'), width: 3, render: (e) => `${e.risk_ref} — ${e.risk_title}` },
            { key: 'band', label: tx('Band'), width: 0.9, render: (e) => e.band ? <Pill small meta={BAND[e.band]} /> : null },
            { key: 'authority', label: tx('Approved by'), width: 1.1, render: (e) => AUTHORITY[e.authority] ?? cap(e.authority) },
            { key: 'exp', label: tx('Expires'), width: 1.1, render: (e) => (
                <Text style={{ fontSize: 7.8, color: e.daysLeft !== null && e.daysLeft <= 60 ? C.crimson : C.text2, fontWeight: e.daysLeft !== null && e.daysLeft <= 60 ? 600 : 400 }}>
                  {fmtDate(e.expires_at)}{e.daysLeft !== null && e.daysLeft <= 60 ? `  (${e.daysLeft < 0 ? tx('lapsed') : tx('{{n}}d', { n: e.daysLeft })})` : ''}
                </Text>) },
          ]}
          rows={m.exceptions}
          empty={tx('No risk is currently accepted by exception.')}
        />

        {/* ── 4. NCA ECC ───────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 4')} title={tx('NCA Essential Cybersecurity Controls')} />
        <P>{tx('Status of the')} {m.ecc.mainTotal} {tx(
            'main controls of NCA ECC-2:2024, as recorded by the organisation in RISYS. A control recorded as compliant whose review date has passed is counted as Partial until it is reviewed again. Sub-controls roll up into their main control and are not counted separately.'
          )}</P>
        <KpiRow items={[
          { label: tx('Assessed'), value: `${m.ecc.coverage}%`, sub: tx('{{n}} of {{total}} main controls', { n: m.ecc.assessed, total: m.ecc.mainTotal }) },
          { label: tx('Compliant'), value: m.ecc.counts.compliant, tone: 'good' },
          { label: tx('Partial / in progress'), value: m.ecc.counts.partial + m.ecc.counts.in_progress },
          { label: tx('Not compliant'), value: m.ecc.counts.not_compliant, tone: m.ecc.counts.not_compliant ? 'alert' : undefined },
        ]} />
        <H3>{tx('By domain')}</H3>
        <View style={{ marginBottom: 4 }}>
          {m.ecc.domains.map((d) => (
            <View key={d.id} wrap={false} style={{ marginBottom: 8 }}>
              <View style={[s.row, { marginBottom: 3 }]}>
                <Text style={{ flex: 1, fontWeight: 600, color: C.text }}>{d.id}. {d.name}</Text>
                <Text style={{ fontSize: 7.4, color: C.text3 }}>
                  {tx('{{a}} of {{m}} assessed · {{c}} compliant', { a: d.assessed, m: d.mains, c: d.counts.compliant })}</Text>
              </View>
              <StackedBar total={d.mains} segments={ECC_SEGMENTS.map((k) => ({ value: d.counts[k] ?? 0, meta: COMPLIANCE[k] }))} />
            </View>
          ))}
          <Legend items={[...ECC_SEGMENTS.map((k) => COMPLIANCE[k]), { color: C.white, label: tx('Not assessed (empty track)') }]} />
        </View>

        <H3>{tx('What connected systems measure')}</H3>
        <P>{tx(
          'Where RISYS is connected to the organisation\'s systems it measures some ECC requirements directly. These measurements sit alongside the recorded status above; they do not overwrite it. A measurement marked Unknown needs data RISYS does not yet collect for this organisation.'
        )}</P>
        <KpiRow items={[
          { label: tx('Signals passing'), value: m.sigCounts.pass, tone: 'good' },
          { label: tx('Partial'), value: m.sigCounts.partial },
          { label: tx('Failing'), value: m.sigCounts.fail, tone: m.sigCounts.fail ? 'alert' : undefined },
          { label: tx('Not measurable yet'), value: m.sigCounts.unknown },
        ]} />
        <Table dense
          columns={[
            { key: 'name', label: tx('Measurement'), width: 2.2, bold: true },
            { key: 'status', label: tx('Result'), width: 0.8, render: (x) => <Pill small meta={SIGNAL[x.status] ?? SIGNAL.unknown} /> },
            { key: 'summary', label: tx('Detail'), width: 5 },
          ]}
          rows={[...m.signals].sort((a, b) => ['fail', 'partial', 'pass', 'unknown'].indexOf(a.status) - ['fail', 'partial', 'pass', 'unknown'].indexOf(b.status))}
          empty={tx('No measurements have been computed. Connect a system and run a scan.')}
        />

        {/* ── 5. Operations ────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 5')} title={tx('Incidents and findings from connected systems')} />
        <FactGrid facts={[
          ['Incidents raised in period', `${m.incidents.inPeriodTotal}${m.incidents.inPeriodTotal ? `  (${Object.entries(m.incidents.inPeriod).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`],
          ['Resolved in period', String(m.incidents.resolved)],
          ['Resolved outside SLA', String(m.incidents.slaBreached)],
          ['Mean time to resolve', m.incidents.mttr != null ? tx('{{n}} hours', { n: Math.round(m.incidents.mttr) }) : 'No incident resolved in the period'],
          ['Open now', `${m.incidents.openTotal}${m.incidents.openTotal ? `  (${Object.entries(m.incidents.open).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`],
        ]} />
        <H3>{tx('Open findings by connected system')}</H3>
        <Table
          columns={[
            { key: 'connector', label: tx('System'), width: 2.4, bold: true },
            { key: 'critical', label: tx('Critical'), width: 1, align: 'right', render: (x) => (
                <Text style={{ fontSize: 7.8, fontWeight: x.critical ? 700 : 400, color: x.critical ? SEVERITY.critical.color : C.text3 }}>{x.critical}</Text>) },
            { key: 'warning', label: tx('Warning'), width: 1, align: 'right' },
            { key: 'info', label: tx('Info'), width: 1, align: 'right' },
            { key: 'total', label: tx('Total'), width: 1, align: 'right', bold: true },
          ]}
          rows={m.connectorFindings}
          empty={tx('No connected system has reported findings.')}
        />
        <Muted>{tx(
          'Findings are produced by scans the organisation runs from RISYS and stay open until they are triaged — attached to a risk, raised as a new risk, or closed with a reason.'
        )}</Muted>

        {/* ── 6. Assurance ─────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 6')} title={tx('Audit and assurance')} />
        <Table
          columns={[
            { key: 'ref', label: tx('Ref'), width: 0.9, bold: true },
            { key: 'title', label: tx('Engagement'), width: 3.2 },
            { key: 'type', label: tx('Type'), width: 1, render: (x) => cap(x.type) },
            { key: 'status', label: tx('Stage'), width: 1, render: (x) => AUDIT_STATUS[x.status] ?? cap(x.status) },
            { key: 'opinion', label: tx('Opinion'), width: 1.4, render: (x) => x.opinion ? <Pill small meta={OPINION[x.opinion]} /> : <Text style={{ fontSize: 7.4, color: C.text3 }}>{tx('Not yet given')}</Text> },
          ]}
          rows={m.audit.engagements}
          empty={tx('No audit engagement was active in the period.')}
        />
        <View style={[s.row, { flexWrap: 'wrap', marginBottom: 6 }]}>
          <Text style={{ marginRight: 10, color: C.text2 }}>{tx('Open audit findings:')}</Text>
          {['high', 'medium', 'low', 'observation'].map((k) => (
            <View key={k} style={{ marginRight: 8 }}>
              <Pill small meta={FINDING_RATING[k]} label={`${FINDING_RATING[k].label} ${m.audit.open[k] ?? 0}`} />
            </View>
          ))}
        </View>

        {/* ── Basis ────────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('About this report')} title={tx('Basis of preparation')} />
        <Bullets color={C.rose} items={[
          'Figures are taken from the organisation’s records in RISYS at the moment of generation. They reflect what has been recorded, not an independent assurance opinion.',
          tx('Risks in draft or closed are excluded from the register counts; {{n}} draft risks exist and are not shown.', { n: m.movement.drafts ?? 0 }),
          'Risk bands use the organisation’s configured likelihood × impact matrix. Residual figures count only risks that have been scored after controls.',
          'NCA ECC status is self-assessed by the organisation. It is not a determination by the National Cybersecurity Authority.',
          'Measurements from connected systems reflect the most recent scan the organisation ran, not continuous monitoring.',
          'The data this report was built from is archived in RISYS with the file and its SHA-256 fingerprint under the Report ID on the cover.',
        ]} />
      </ContentPage>
    </ReportDocument>
  )
}
