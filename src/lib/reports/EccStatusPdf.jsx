/* ── NCA ECC compliance status report ─────────────────────────────────────────
 *
 * The organisation's position against every NCA ECC-2:2024 requirement, as
 * it would be shown to a regulator, an external assessor or management: the
 * recorded status, what connected systems measure, the controls and evidence
 * behind each requirement, and the gaps still open.
 *
 * It says plainly that the status is self-assessed. RISYS must never produce a
 * document that could be mistaken for a determination by the NCA.
 * -------------------------------------------------------------------------- */
import { View, Text } from '@react-pdf/renderer'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, H4, P, Muted, Lead, Bullets, Callout,
  Pill, KpiRow, Table, StackedBar, Legend,
} from './primitives'
import { C, COMPLIANCE, AUTOMATED } from './theme'

const SEG = ['compliant', 'partial', 'in_progress', 'not_compliant', 'not_applicable']
const clip = (t, n = 150) => (!t ? '' : t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)

function Status({ r }) {
  return (
    <View>
      <Pill small meta={COMPLIANCE[r.effective] ?? COMPLIANCE.not_started} />
      {r.overdueReview ? <Text style={{ fontSize: 6, color: C.crimson, marginTop: 1.5 }}>Review overdue</Text> : null}
    </View>
  )
}
const Measured = ({ r }) => (r.auto_status
  ? <Pill small meta={AUTOMATED[r.auto_status] ?? AUTOMATED.not_started} />
  : <Text style={{ fontSize: 7, color: C.text3 }}>—</Text>)

const Count = ({ v, alert }) => (
  <Text style={{ fontSize: 7.6, color: v ? (alert ? C.crimson : C.text2) : C.text3, fontWeight: v && alert ? 600 : 400 }}>{v || '—'}</Text>
)

export default function EccStatusPdf({ model: m, meta }) {
  const fw = m.framework ?? {}
  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={{ ...meta,
        coverNote: 'This report sets out the organisation’s own assessment of its position against NCA ECC, recorded in RISYS. It is not issued, reviewed or endorsed by the National Cybersecurity Authority. A copy of this file and the data it was built from are archived in RISYS under the Report ID above.' }} />

      <ContentPage meta={meta}>
        {/* ── 1. Position ──────────────────────────────────────────── */}
        <SectionTitle first eyebrow="Section 1" title="Compliance position" />
        <Lead>
          {m.orgName} has recorded an assessment for {m.assessed} of the {m.mains.length} main controls of{' '}
          {fw.name ?? 'the Essential Cybersecurity Controls'} ({fw.version ?? 'ECC-2:2024'}). {m.counts.compliant} are recorded as
          compliant and {m.counts.not_compliant} as not compliant; {m.mains.length - m.assessed} have not yet been assessed.
        </Lead>
        <KpiRow items={[
          { label: 'Main controls', value: m.mains.length, sub: `${m.counts.not_applicable} marked not applicable` },
          { label: 'Assessed', value: `${m.coverage}%`, sub: `${m.assessed} of ${m.mains.length}` },
          { label: 'Compliant', value: `${m.compliantPct}%`, tone: 'good', sub: `${m.counts.compliant} of ${m.applicable} applicable` },
          { label: 'Not compliant', value: m.counts.not_compliant, tone: m.counts.not_compliant ? 'alert' : undefined, sub: `${m.counts.partial + m.counts.in_progress} partial or in progress` },
        ]} />

        <View wrap={false} style={{ marginBottom: 6 }}>
          <StackedBar total={m.mains.length} height={13}
                      segments={SEG.map((k) => ({ value: m.counts[k] ?? 0, meta: COMPLIANCE[k] }))} />
          <Legend items={[...SEG.map((k) => ({ color: COMPLIANCE[k].color, label: `${COMPLIANCE[k].label} ${m.counts[k] ?? 0}` })),
                          { color: C.white, label: `Not assessed ${m.counts.not_started}` }]} />
        </View>

        <H3>By domain</H3>
        <Table
          columns={[
            { key: 'name', label: 'Domain', width: 3.4, render: (d) => `${d.id}. ${d.name}`, bold: true },
            { key: 'mains', label: 'Main', width: 0.7, align: 'right' },
            ...SEG.map((k) => ({ key: k, label: COMPLIANCE[k].label, width: k === 'not_compliant' ? 1.1 : 0.9, align: 'right',
                                 render: (d) => <Count v={d.counts[k]} alert={k === 'not_compliant'} /> })),
            { key: 'na', label: 'Not assessed', width: 1, align: 'right', render: (d) => <Count v={d.counts.not_started} /> },
          ]}
          rows={m.domains}
        />

        <Callout title="Basis of this status" tone="rose">
          <Text>
            Statuses are recorded by the organisation against each requirement and are supported by the controls
            and evidence listed in Section 4. A status recorded as compliant whose review date has passed is shown
            as Partial until reviewed. This is a self-assessment; it is not a determination by the National
            Cybersecurity Authority.
          </Text>
        </Callout>

        {/* ── 2. Gaps ──────────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 2" title="Gaps requiring action" />
        <P>
          Main controls recorded as not compliant or partial, with the number of open issues traced to them — audit
          findings raised against the requirement and open findings from connected systems.
        </P>
        <Table
          columns={[
            { key: 'req', label: 'Control', width: 0.8, bold: true },
            { key: 'text', label: 'Requirement', width: 5, render: (r) => clip(r.text, 170) },
            { key: 'st', label: 'Status', width: 1.4, render: (r) => <Status r={r} /> },
            { key: 'ctl', label: 'Controls', width: 0.8, align: 'right', render: (r) => <Count v={r.controlCount} /> },
            { key: 'iss', label: 'Open issues', width: 0.9, align: 'right', render: (r) => <Count v={r.openIssues} alert /> },
          ]}
          rows={m.gaps}
          empty="No main control is recorded as not compliant or partial."
        />

        {/* ── 3. Measurement ───────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 3" title="What connected systems measure" />
        <P>
          For {m.automated.length} requirements RISYS measures part of the answer from the organisation's connected
          systems — for example MFA coverage and privileged role assignments from Microsoft Entra ID. The measured
          result is shown next to the recorded status; it informs the status but does not replace the judgement
          of the person who records it. Requirements not listed depend on documents, processes or systems that
          are assessed manually or through connectors not yet in place for this organisation.
        </P>
        <KpiRow items={[
          { label: 'Measured: pass', value: m.auto.compliant, tone: 'good' },
          { label: 'Partial', value: m.auto.partial },
          { label: 'Fail', value: m.auto.not_compliant, tone: m.auto.not_compliant ? 'alert' : undefined },
          { label: 'Not measurable yet', value: m.auto.not_started, sub: 'Data not yet collected' },
        ]} />
        {m.disagreements.length > 0 && (
          <>
            <H4>Where the recorded status and the measurement disagree</H4>
            <Table dense
              columns={[
                { key: 'req', label: 'Control', width: 0.8, bold: true },
                { key: 'text', label: 'Requirement', width: 4, render: (r) => clip(r.text, 120) },
                { key: 'st', label: 'Recorded', width: 1.4, render: (r) => <Status r={r} /> },
                { key: 'au', label: 'Measured', width: 1.3, render: (r) => <Measured r={r} /> },
                { key: 'sig', label: 'Measurements', width: 3, render: (r) => (r.signals ?? []).filter((x) => x.direct !== false)
                    .map((x) => `${x.name}: ${x.status}`).join('; ') },
              ]}
              rows={m.disagreements}
            />
            <Muted>These should be reviewed: either the recorded status needs updating or the measurement needs context the system cannot see.</Muted>
          </>
        )}

        {/* ── 4. Detail ────────────────────────────────────────────── */}
        <SectionTitle breakBefore eyebrow="Section 4" title="Requirement-by-requirement status" />
        <P>
          Every requirement of the framework, in order. Sub-controls are indented beneath their main control. "Controls"
          is the number of the organisation's controls mapped to the requirement; "Evidence" the number of evidence
          items filed against it; "Issues" open audit and connected-system findings.
        </P>
        {m.domains.map((d) => (
          <View key={d.id}>
            {d.subdomains.map((sd, k) => (
              <View key={sd.id}>
                <Table dense indentKey="parent"
                  heading={<>{k === 0 ? <H3>{d.id}. {d.name}</H3> : null}<H4>{sd.id}  {sd.name}</H4></>}
                  columns={[
                    { key: 'req', label: 'Control', width: 0.95, render: (r) => (
                        <Text style={{ fontSize: 7.4, fontWeight: r.parent ? 400 : 600, color: r.parent ? C.text2 : C.text }}>{r.req}</Text>) },
                    { key: 'text', label: 'Requirement', width: 4.3, render: (r) => (
                        <Text style={{ fontSize: 7.2, color: r.parent ? C.text2 : C.text }}>{clip(r.text, 240)}</Text>) },
                    { key: 'st', label: 'Recorded', width: 1.4, render: (r) => <Status r={r} /> },
                    { key: 'au', label: 'Measured', width: 1.3, render: (r) => <Measured r={r} /> },
                    { key: 'ctl', label: 'Controls', width: 1.0, align: 'right', render: (r) => <Count v={r.controlCount} /> },
                    { key: 'ev', label: 'Evidence', width: 1.0, align: 'right', render: (r) => <Count v={Number(r.evidence) || 0} /> },
                    { key: 'iss', label: 'Issues', width: 0.85, align: 'right', render: (r) => <Count v={r.openIssues} alert /> },
                  ]}
                  rows={sd.rows}
                />
              </View>
            ))}
          </View>
        ))}

        <SectionTitle eyebrow="About this report" title="Basis of preparation" />
        <Bullets color={C.rose} items={[
          `Requirement text is taken from ${fw.name ?? 'the Essential Cybersecurity Controls'} (${fw.version ?? 'ECC-2:2024'}) as loaded in RISYS. Long requirements are shortened in this report; the full text is in RISYS and in the published framework.`,
          'Statuses are recorded by the organisation. Only main controls are counted in the totals; sub-controls roll up into their main control.',
          'Measured results come from the most recent scan of each connected system and from the organisation’s own records in RISYS (for example its risk register). They are not continuous monitoring.',
          'This report is a self-assessment prepared by the organisation using RISYS. It is not issued, reviewed or endorsed by the National Cybersecurity Authority.',
          'The data this report was built from is archived in RISYS with the file and its SHA-256 fingerprint under the Report ID on the cover.',
        ]} />
      </ContentPage>
    </ReportDocument>
  )
}
