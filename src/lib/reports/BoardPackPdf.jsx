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
import { View, Text } from '@react-pdf/renderer'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, P, Muted, Lead, Bullets, Callout,
  Pill, KpiRow, Table, HeatMap, BandLegend, StackedBar, Legend, FactGrid, s,
} from './primitives'
import { C, BAND, COMPLIANCE, SIGNAL, SEVERITY, OPINION, FINDING_RATING } from './theme'
import { fmtDate } from './models'

const ECC_SEGMENTS = ['compliant', 'partial', 'in_progress', 'not_compliant', 'not_applicable']
const AUTHORITY = { ciso: 'CISO', committee: 'Risk committee', board: 'Board', cro: 'CRO', owner: 'Risk owner' }
const TOLERANCE = {
  within:        { label: 'Within',        color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  breached:      { label: 'Breached',      color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  not_evaluated: { label: 'Not evaluated', color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
}
const AUDIT_STATUS = { planned: 'Planned', fieldwork: 'Fieldwork', reporting: 'Reporting', closed: 'Closed' }
const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1).replace(/_/g, ' ') : '—')

export default function BoardPackPdf({ model: m, meta }) {
  const highPlus = m.byResidual.critical + m.byResidual.high
  const openCritical = m.connectorCritical
  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={meta} />

      <ContentPage meta={meta}>
        {/* ── 1. Summary ───────────────────────────────────────────── */}
        <SectionTitle first eyebrow="Section 1" title="Summary for the board" />
        <Lead>
          {m.risks.length} risks are on the register for {m.orgName}. {highPlus
            ? `${highPlus} ${highPlus === 1 ? 'is' : 'are'} rated High or Critical on current score`
            : 'None is rated High or Critical'}
          {m.tolerance.breached ? `, and ${m.tolerance.breached} ${m.tolerance.breached === 1 ? 'sits' : 'sit'} outside the approved risk tolerance` : ''}.
          {' '}{m.ecc.assessed} of {m.ecc.mainTotal} NCA ECC main controls have a recorded assessment, of which {m.ecc.counts.compliant} {m.ecc.counts.compliant === 1 ? 'is' : 'are'} compliant.
        </Lead>
        <KpiRow items={[
          { label: 'Risks on register', value: m.risks.length, sub: `${m.movement.opened ?? 0} raised in the period` },
          { label: 'Rated high / critical', value: highPlus, tone: highPlus ? 'alert' : 'good', sub: `${m.byResidual.critical} critical · ${m.byResidual.high} high, current score` },
          { label: 'Outside tolerance', value: m.tolerance.breached, tone: m.tolerance.breached ? 'alert' : undefined, sub: `${m.tolerance.not_evaluated} not yet evaluated` },
          { label: 'ECC compliant', value: `${m.ecc.compliantPct}%`, sub: `${m.ecc.counts.compliant} of ${m.ecc.mainTotal} main controls` },
        ]} />
        <KpiRow items={[
          { label: 'Open incidents', value: m.incidents.openTotal, tone: m.incidents.open.critical ? 'alert' : undefined, sub: `${m.incidents.inPeriodTotal} raised in the period` },
          { label: 'Critical system findings', value: openCritical, tone: openCritical ? 'alert' : undefined, sub: 'From connected systems' },
          { label: 'Open audit findings', value: m.audit.openTotal, tone: m.audit.high ? 'alert' : undefined, sub: `${m.audit.high} high · ${m.audit.overdue} overdue` },
          { label: 'Accepted risks', value: m.exceptions.length, sub: `${m.expiringSoon.length} expire within 60 days` },
        ]} />

        <H3>Matters for the board's attention</H3>
        {m.attention.length
          ? <Bullets items={m.attention} />
          : <Callout tone="rose">No matter requires the board's attention this period.</Callout>}

        {/* ── 2. Risk posture ──────────────────────────────────────── */}
        <SectionTitle breakBefore eyebrow="Section 2" title="Risk posture" />
        <P>
          Each risk is scored for likelihood and impact twice: before controls (inherent) and after the controls
          that are in place (residual). The gap between the two maps is what the organisation's controls are
          buying. Bands follow the organisation's own risk matrix.
        </P>
        <View style={[s.row, { marginTop: 4, marginBottom: 6 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            <HeatMap title="Inherent — before controls" cells={m.heat.inherent.cells} dims={m.heat.dims} total={m.heat.inherent.total} />
          </View>
          <View style={{ flex: 1 }}>
            <HeatMap title="Residual — after controls" cells={m.heat.residual.cells} dims={m.heat.dims} total={m.heat.residual.total} />
          </View>
        </View>
        <BandLegend />
        {m.residualUnscored > 0 && (
          <Muted style={{ marginTop: 6 }}>
            {m.residualUnscored} of {m.risks.length} risks have no residual assessment yet and are left off the residual map
            rather than shown at their inherent position. They are counted at their inherent score elsewhere in this report.
          </Muted>
        )}

        <H3>Residual risk by band</H3>
        <View wrap={false} style={{ marginBottom: 8 }}>
          <StackedBar total={m.risks.length} height={12}
                      segments={['critical', 'high', 'medium', 'low'].map((b) => ({ value: m.byResidual[b], meta: BAND[b] }))} />
          <Legend items={['critical', 'high', 'medium', 'low'].map((b) => ({ color: BAND[b].color, label: `${BAND[b].label} ${m.byResidual[b]}` }))} />
        </View>

        <H3>Highest-rated risks</H3>
        <Table
          columns={[
            { key: 'ref', label: 'Ref', width: 0.8, bold: true },
            { key: 'title', label: 'Risk', width: 2.8 },
            { key: 'category', label: 'Category', width: 1.1 },
            { key: 'owner', label: 'Owner', width: 1 },
            { key: 'inh', label: 'Inherent', width: 1, render: (r) => <Pill small meta={BAND[r.inherentBand]} label={`${BAND[r.inherentBand]?.label ?? '—'} ${r.inherent ?? ''}`} /> },
            { key: 'res', label: 'Residual', width: 1, render: (r) => r.hasResidualAxes
                ? <Pill small meta={BAND[r.residualBand]} label={`${BAND[r.residualBand]?.label ?? '—'} ${r.residual ?? ''}`} />
                : <Text style={{ fontSize: 7, color: C.text3 }}>Not assessed</Text> },
            { key: 'tol', label: 'Tolerance', width: 1.3, render: (r) => <Pill small meta={TOLERANCE[r.tolerance_status] ?? TOLERANCE.not_evaluated} /> },
          ]}
          rows={m.topRisks}
          empty="No risks are registered."
        />

        {/* ── 3. Tolerance, acceptance, treatment ───────────────────── */}
        <SectionTitle eyebrow="Section 3" title="Tolerance, acceptance and treatment" />
        <P>
          Every residual score passes a tolerance gate. A risk inside tolerance can be accepted; one outside must be
          treated, or accepted as a formal exception signed at the authority its band requires. Exceptions expire and
          must be re-approved.
        </P>
        <FactGrid facts={[
          ['Within tolerance', String(m.tolerance.within)],
          ['Outside tolerance', String(m.tolerance.breached)],
          ['Not yet evaluated', String(m.tolerance.not_evaluated)],
          ['Open treatment plans', `${m.plans.total}${m.plans.overdue ? ` — ${m.plans.overdue} past due date` : ''}`],
          ['Risks raised / closed in period', `${m.movement.opened ?? 0} raised · ${m.movement.closed ?? 0} closed`],
        ]} />
        <H3>Risks accepted by exception</H3>
        <Table
          columns={[
            { key: 'ref', label: 'Exception', width: 1, bold: true },
            { key: 'risk', label: 'Risk', width: 3, render: (e) => `${e.risk_ref} — ${e.risk_title}` },
            { key: 'band', label: 'Band', width: 0.9, render: (e) => e.band ? <Pill small meta={BAND[e.band]} /> : null },
            { key: 'authority', label: 'Approved by', width: 1.1, render: (e) => AUTHORITY[e.authority] ?? cap(e.authority) },
            { key: 'exp', label: 'Expires', width: 1.1, render: (e) => (
                <Text style={{ fontSize: 7.8, color: e.daysLeft !== null && e.daysLeft <= 60 ? C.crimson : C.text2, fontWeight: e.daysLeft !== null && e.daysLeft <= 60 ? 600 : 400 }}>
                  {fmtDate(e.expires_at)}{e.daysLeft !== null && e.daysLeft <= 60 ? `  (${e.daysLeft < 0 ? 'lapsed' : `${e.daysLeft}d`})` : ''}
                </Text>) },
          ]}
          rows={m.exceptions}
          empty="No risk is currently accepted by exception."
        />

        {/* ── 4. NCA ECC ───────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 4" title="NCA Essential Cybersecurity Controls" />
        <P>
          Status of the {m.ecc.mainTotal} main controls of NCA ECC-2:2024, as recorded by the organisation in RISYS. A
          control recorded as compliant whose review date has passed is counted as Partial until it is reviewed
          again. Sub-controls roll up into their main control and are not counted separately.
        </P>
        <KpiRow items={[
          { label: 'Assessed', value: `${m.ecc.coverage}%`, sub: `${m.ecc.assessed} of ${m.ecc.mainTotal} main controls` },
          { label: 'Compliant', value: m.ecc.counts.compliant, tone: 'good' },
          { label: 'Partial / in progress', value: m.ecc.counts.partial + m.ecc.counts.in_progress },
          { label: 'Not compliant', value: m.ecc.counts.not_compliant, tone: m.ecc.counts.not_compliant ? 'alert' : undefined },
        ]} />
        <H3>By domain</H3>
        <View style={{ marginBottom: 4 }}>
          {m.ecc.domains.map((d) => (
            <View key={d.id} wrap={false} style={{ marginBottom: 8 }}>
              <View style={[s.row, { marginBottom: 3 }]}>
                <Text style={{ flex: 1, fontWeight: 600, color: C.text }}>{d.id}. {d.name}</Text>
                <Text style={{ fontSize: 7.4, color: C.text3 }}>
                  {d.assessed} of {d.mains} assessed · {d.counts.compliant} compliant
                </Text>
              </View>
              <StackedBar total={d.mains} segments={ECC_SEGMENTS.map((k) => ({ value: d.counts[k] ?? 0, meta: COMPLIANCE[k] }))} />
            </View>
          ))}
          <Legend items={[...ECC_SEGMENTS.map((k) => COMPLIANCE[k]), { color: C.white, label: 'Not assessed (empty track)' }]} />
        </View>

        <H3>What connected systems measure</H3>
        <P>
          Where RISYS is connected to the organisation's systems it measures some ECC requirements directly. These
          measurements sit alongside the recorded status above; they do not overwrite it. A measurement marked
          Unknown needs data RISYS does not yet collect for this organisation.
        </P>
        <KpiRow items={[
          { label: 'Signals passing', value: m.sigCounts.pass, tone: 'good' },
          { label: 'Partial', value: m.sigCounts.partial },
          { label: 'Failing', value: m.sigCounts.fail, tone: m.sigCounts.fail ? 'alert' : undefined },
          { label: 'Not measurable yet', value: m.sigCounts.unknown },
        ]} />
        <Table dense
          columns={[
            { key: 'name', label: 'Measurement', width: 2.2, bold: true },
            { key: 'status', label: 'Result', width: 0.8, render: (x) => <Pill small meta={SIGNAL[x.status] ?? SIGNAL.unknown} /> },
            { key: 'summary', label: 'Detail', width: 5 },
          ]}
          rows={[...m.signals].sort((a, b) => ['fail', 'partial', 'pass', 'unknown'].indexOf(a.status) - ['fail', 'partial', 'pass', 'unknown'].indexOf(b.status))}
          empty="No measurements have been computed. Connect a system and run a scan."
        />

        {/* ── 5. Operations ────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 5" title="Incidents and findings from connected systems" />
        <FactGrid facts={[
          ['Incidents raised in period', `${m.incidents.inPeriodTotal}${m.incidents.inPeriodTotal ? `  (${Object.entries(m.incidents.inPeriod).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`],
          ['Resolved in period', String(m.incidents.resolved)],
          ['Resolved outside SLA', String(m.incidents.slaBreached)],
          ['Mean time to resolve', m.incidents.mttr != null ? `${Math.round(m.incidents.mttr)} hours` : 'No incident resolved in the period'],
          ['Open now', `${m.incidents.openTotal}${m.incidents.openTotal ? `  (${Object.entries(m.incidents.open).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`],
        ]} />
        <H3>Open findings by connected system</H3>
        <Table
          columns={[
            { key: 'connector', label: 'System', width: 2.4, bold: true },
            { key: 'critical', label: 'Critical', width: 1, align: 'right', render: (x) => (
                <Text style={{ fontSize: 7.8, fontWeight: x.critical ? 700 : 400, color: x.critical ? SEVERITY.critical.color : C.text3 }}>{x.critical}</Text>) },
            { key: 'warning', label: 'Warning', width: 1, align: 'right' },
            { key: 'info', label: 'Info', width: 1, align: 'right' },
            { key: 'total', label: 'Total', width: 1, align: 'right', bold: true },
          ]}
          rows={m.connectorFindings}
          empty="No connected system has reported findings."
        />
        <Muted>
          Findings are produced by scans the organisation runs from RISYS and stay open until they are triaged —
          attached to a risk, raised as a new risk, or closed with a reason.
        </Muted>

        {/* ── 6. Assurance ─────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 6" title="Audit and assurance" />
        <Table
          columns={[
            { key: 'ref', label: 'Ref', width: 0.9, bold: true },
            { key: 'title', label: 'Engagement', width: 3.2 },
            { key: 'type', label: 'Type', width: 1, render: (x) => cap(x.type) },
            { key: 'status', label: 'Stage', width: 1, render: (x) => AUDIT_STATUS[x.status] ?? cap(x.status) },
            { key: 'opinion', label: 'Opinion', width: 1.4, render: (x) => x.opinion ? <Pill small meta={OPINION[x.opinion]} /> : <Text style={{ fontSize: 7.4, color: C.text3 }}>Not yet given</Text> },
          ]}
          rows={m.audit.engagements}
          empty="No audit engagement was active in the period."
        />
        <View style={[s.row, { flexWrap: 'wrap', marginBottom: 6 }]}>
          <Text style={{ marginRight: 10, color: C.text2 }}>Open audit findings:</Text>
          {['high', 'medium', 'low', 'observation'].map((k) => (
            <View key={k} style={{ marginRight: 8 }}>
              <Pill small meta={FINDING_RATING[k]} label={`${FINDING_RATING[k].label} ${m.audit.open[k] ?? 0}`} />
            </View>
          ))}
        </View>

        {/* ── Basis ────────────────────────────────────────────────── */}
        <SectionTitle eyebrow="About this report" title="Basis of preparation" />
        <Bullets color={C.rose} items={[
          'Figures are taken from the organisation’s records in RISYS at the moment of generation. They reflect what has been recorded, not an independent assurance opinion.',
          `Risks in draft or closed are excluded from the register counts; ${m.movement.drafts ?? 0} draft risks exist and are not shown.`,
          'Risk bands use the organisation’s configured likelihood × impact matrix. Residual figures count only risks that have been scored after controls.',
          'NCA ECC status is self-assessed by the organisation. It is not a determination by the National Cybersecurity Authority.',
          'Measurements from connected systems reflect the most recent scan the organisation ran, not continuous monitoring.',
          'The data this report was built from is archived in RISYS with the file and its SHA-256 fingerprint under the Report ID on the cover.',
        ]} />
      </ContentPage>
    </ReportDocument>
  )
}
