/* ── NCA CCC and SDAIA PDPL compliance status reports ────────────────────────
 *
 * The same report as the NCA ECC status report, for the other implemented
 * frameworks: the organisation's position against every requirement in its
 * scope, the recorded status, what RISYS measures, the controls and evidence
 * behind each requirement, and the gaps still open. It also states the scope
 * the workspace set (CCC role and data level; the PDPL answers), because the
 * scope decides what is counted.
 *
 * Like the ECC report it says plainly that the status is self-assessed: it is
 * not a determination by the NCA or by SDAIA.
 * -------------------------------------------------------------------------- */
import { View, Text } from './rtl'
import {
  ReportDocument, CoverPage, ContentPage, SectionTitle, H3, H4, P, Muted, Lead, Bullets, Callout,
  Pill, KpiRow, Table, StackedBar, Legend, FactGrid,
} from './primitives'
import { C, COMPLIANCE, AUTOMATED } from './theme'
import { CCC_ROLES, CCC_LEVELS } from '@/data/cccAutomation'
import { PDPL_PROFILE_QUESTIONS, pdplApplies } from '@/data/pdplAutomation'
import { tx } from '@/lib/i18n'

const SEG = ['compliant', 'partial', 'in_progress', 'not_compliant', 'not_applicable']
const clip = (t, n = 150) => (!t ? '' : t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)
// PDPL paragraphs print as IR-23(1); CCC ids print as they are.
const printed = (id) => {
  const p = String(id ?? '').split('-')
  return ['L', 'IR', 'TR'].includes(p[0]) && p.length > 2 ? `${p[0]}-${p[1]}(${p.slice(2).join('-')})` : String(id ?? '')
}

const SCOPE_REASON = {
  optional: tx('Optional at your data level'),
  not_applicable: tx('Not applicable to your scope'),
}

function Status({ r }) {
  return (
    <View>
      <Pill small meta={COMPLIANCE[r.effective] ?? COMPLIANCE.not_started} />
      {r.overdueReview ? <Text style={{ fontSize: 6, color: C.crimson, marginTop: 1.5 }}>{tx('Review overdue')}</Text> : null}
      {r.outOfScope ? <Text style={{ fontSize: 6, color: C.text3, marginTop: 1.5 }}>{SCOPE_REASON[r.outOfScope] ?? ''}</Text> : null}
    </View>
  )
}
const Measured = ({ r }) => (r.auto_status
  ? <Pill small meta={AUTOMATED[r.auto_status] ?? AUTOMATED.not_started} />
  : <Text style={{ fontSize: 7, color: C.text3 }}>—</Text>)

const Count = ({ v, alert }) => (
  <Text style={{ fontSize: 7.6, color: v ? (alert ? C.crimson : C.text2) : C.text3, fontWeight: v && alert ? 600 : 400 }}>{v || '—'}</Text>
)

const COPY = {
  'NCA CCC': {
    short: 'NCA CCC',
    unit: tx('main controls'),
    cover: tx('This report sets out the organisation’s own assessment of its position against the NCA Cloud Cybersecurity Controls, recorded in RISYS, for the role and data classification level it has set. It is not issued, reviewed or endorsed by the National Cybersecurity Authority. A copy of this file and the data it was built from are archived in RISYS under the Report ID above.'),
    basis: tx('Statuses are recorded by the organisation against each control and are supported by the controls and evidence listed in Section 5. CCC builds on NCA ECC: findings from connected systems keyed to an ECC control that CCC extends are counted against the CCC control too. A status recorded as compliant whose review date has passed is shown as Partial until reviewed. This is a self-assessment; it is not a determination by the National Cybersecurity Authority.'),
    notIssued: tx('This report is a self-assessment prepared by the organisation using RISYS. It is not issued, reviewed or endorsed by the National Cybersecurity Authority.'),
  },
  'SDAIA PDPL': {
    short: 'SDAIA PDPL',
    unit: tx('articles'),
    cover: tx('This report sets out the organisation’s own assessment of its position against the Personal Data Protection Law, its Implementing Regulation and the Regulation on Personal Data Transfer outside the Kingdom, recorded in RISYS for the scope it has set. It is not issued, reviewed or endorsed by the Saudi Data and AI Authority (SDAIA) and is not legal advice. A copy of this file and the data it was built from are archived in RISYS under the Report ID above.'),
    basis: tx('Statuses are recorded by the organisation against each article and are supported by the controls and evidence listed in Section 5. Where RISYS measures an article from the organisation’s Privacy registers (data subject requests, breaches, records of processing, impact assessments) or its connected systems, the measurement is shown beside the recorded status. A status recorded as compliant whose review date has passed is shown as Partial until reviewed. This is a self-assessment; it is not a determination by SDAIA and it is not legal advice.'),
    notIssued: tx('This report is a self-assessment prepared by the organisation using RISYS. It is not issued, reviewed or endorsed by the Saudi Data and AI Authority, and it is not legal advice.'),
  },
}

function ScopeFacts({ fwId, scope }) {
  if (!scope) return null
  if (fwId === 'NCA CCC') {
    return (
      <FactGrid facts={[
        [tx('Role'), tx(CCC_ROLES[scope.role]?.label ?? scope.role ?? '—')],
        [tx('Data level'), tx(CCC_LEVELS[scope.level]?.label ?? String(scope.level ?? '—'))],
      ]} />
    )
  }
  const yes = PDPL_PROFILE_QUESTIONS.filter((q) => scope[q.key]).map((q) => tx(q.label))
  return (
    <FactGrid facts={[
      [tx('Applies to us'), yes.length ? yes.join('; ') : tx('None of the conditional articles apply')],
      [tx('Data protection officer'), pdplApplies(scope, 'dpo_required') ? tx('Required (IR Art. 32)') : tx('Not required on these answers (IR Art. 32)')],
    ]} />
  )
}

export default function FrameworkStatusPdf({ model: m, meta }) {
  const fw = m.framework ?? {}
  const copy = COPY[fw.id] ?? COPY['NCA CCC']
  const scored = m.mains.length - m.outOfScope.length
  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={{ ...meta, coverNote: copy.cover }} />

      <ContentPage meta={meta}>
        {/* ── 1. Position ──────────────────────────────────────────── */}
        <SectionTitle first eyebrow={tx('Section 1')} title={tx('Compliance position')} />
        <Lead>
          {tx('{{org}} has recorded an assessment for {{assessed}} of the {{n}} {{unit}} of {{name}} ({{version}}) in its scope. {{c}} are recorded as compliant and {{nc}} as not compliant; {{open}} have not yet been assessed.', {
            org: m.orgName, assessed: scored - m.counts.not_started, n: scored, unit: copy.unit,
            name: tx(fw.name ?? ''), version: fw.version ?? '', c: m.counts.compliant, nc: m.counts.not_compliant,
            open: m.counts.not_started,
          })}
        </Lead>
        <KpiRow items={[
          { label: tx('In scope'), value: scored, sub: m.outOfScope.length ? tx('{{n}} shown, not counted', { n: m.outOfScope.length }) : undefined },
          { label: tx('Assessed'), value: `${scored ? Math.round(((scored - m.counts.not_started) / scored) * 100) : 0}%`,
            sub: tx('{{a}} of {{n}}', { a: scored - m.counts.not_started, n: scored }) },
          { label: tx('Compliant'), value: `${m.compliantPct}%`, tone: 'good', sub: tx('{{a}} of {{n}} applicable', { a: m.counts.compliant, n: m.applicable }) },
          { label: tx('Not compliant'), value: m.counts.not_compliant, tone: m.counts.not_compliant ? 'alert' : undefined,
            sub: tx('{{n}} partial or in progress', { n: m.counts.partial + m.counts.in_progress }) },
        ]} />

        <View wrap={false} style={{ marginBottom: 6 }}>
          <StackedBar total={m.mains.length} height={13}
                      segments={SEG.map((k) => ({ value: m.counts[k] ?? 0, meta: COMPLIANCE[k] }))} />
          <Legend items={[...SEG.map((k) => ({ color: COMPLIANCE[k].color, label: `${COMPLIANCE[k].label} ${m.counts[k] ?? 0}` })),
                          { color: C.white, label: `${tx('Not assessed')} ${m.counts.not_started}` }]} />
        </View>

        <H3>{tx('By domain')}</H3>
        <Table
          columns={[
            { key: 'name', label: tx('Domain'), width: 3.4, render: (d) => `${d.id}. ${tx(d.name ?? '')}`, bold: true },
            { key: 'mains', label: tx('Main'), width: 0.7, align: 'right' },
            ...SEG.map((k) => ({ key: k, label: COMPLIANCE[k].label, width: k === 'not_compliant' ? 1.1 : 0.9, align: 'right',
                                 render: (d) => <Count v={d.counts[k]} alert={k === 'not_compliant'} /> })),
            { key: 'na', label: tx('Not assessed'), width: 1, align: 'right', render: (d) => <Count v={d.counts.not_started} /> },
          ]}
          rows={m.domains}
        />

        <Callout title={tx('Basis of this status')} tone="rose">
          <Text>{copy.basis}</Text>
        </Callout>

        {/* ── 2. Scope ─────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 2')} title={tx('Scope')} />
        <P>{fw.id === 'NCA CCC'
          ? tx('NCA CCC applies by the role the organisation plays in the cloud and the classification of the data it holds there. The workspace administrator set this scope in RISYS; it decides which controls are counted.')
          : tx('Most PDPL articles apply to every Controller; some apply only in certain cases. The workspace administrator answered these questions in RISYS; they decide which articles are counted.')}</P>
        <ScopeFacts fwId={fw.id} scope={m.scope} />
        {m.outOfScope.length > 0 && (
          <>
            <H4>{tx('Shown but not counted')}</H4>
            <Table dense
              columns={[
                { key: 'req', label: tx('ID'), width: 1, bold: true, render: (r) => printed(r.req) },
                { key: 'text', label: tx('Text'), width: 5, render: (r) => clip(r.subdomain_name && fw.id === 'SDAIA PDPL' ? `${r.subdomain_name}. ${r.text}` : r.text, 150) },
                { key: 'why', label: tx('Why'), width: 1.8, render: (r) => SCOPE_REASON[r.outOfScope] ?? '' },
              ]}
              rows={m.outOfScope}
            />
          </>
        )}

        {/* ── 3. Gaps ──────────────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 3')} title={tx('Gaps requiring action')} />
        <P>{tx(
          'Requirements recorded as not compliant or partial, with the number of open issues traced to them — audit findings raised against the requirement and open findings from connected systems.'
        )}</P>
        <Table
          columns={[
            { key: 'req', label: tx('ID'), width: 0.9, bold: true, render: (r) => printed(r.req) },
            { key: 'text', label: tx('Text'), width: 5, render: (r) => clip(fw.id === 'SDAIA PDPL' && r.subdomain_name ? `${r.subdomain_name}. ${r.text}` : r.text, 170) },
            { key: 'st', label: tx('Status'), width: 1.4, render: (r) => <Status r={r} /> },
            { key: 'ctl', label: tx('Controls'), width: 0.8, align: 'right', render: (r) => <Count v={r.controlCount} /> },
            { key: 'iss', label: tx('Open issues'), width: 0.9, align: 'right', render: (r) => <Count v={r.openIssues} alert /> },
          ]}
          rows={m.gaps}
          empty={tx('No requirement is recorded as not compliant or partial.')}
        />

        {/* ── 4. Measurement ───────────────────────────────────────── */}
        <SectionTitle eyebrow={tx('Section 4')} title={tx('What RISYS measures')} />
        <P>{fw.id === 'SDAIA PDPL'
          ? tx('For {{n}} requirements RISYS measures part of the answer: from the organisation\'s Privacy registers in RISYS (requests answered within 30 days, breaches reported to SDAIA within 72 hours, records of processing, impact assessments, the data protection officer, transfers) and from its connected Microsoft systems (access control, MFA, logging, external sharing). The measured result is shown next to the recorded status; it informs the status but does not replace the judgement of the person who records it.', { n: m.automated.length })
          : tx('For {{n}} requirements RISYS measures part of the answer from the organisation\'s connected systems — for example MFA coverage and privileged role assignments from Microsoft Entra ID. The measured result is shown next to the recorded status; it informs the status but does not replace the judgement of the person who records it.', { n: m.automated.length })}</P>
        <KpiRow items={[
          { label: tx('Measured: pass'), value: m.auto.compliant, tone: 'good' },
          { label: tx('Partial'), value: m.auto.partial },
          { label: tx('Fail'), value: m.auto.not_compliant, tone: m.auto.not_compliant ? 'alert' : undefined },
          { label: tx('Not measurable yet'), value: m.auto.not_started, sub: tx('Data not yet collected') },
        ]} />
        {m.disagreements.length > 0 && (
          <>
            <H4>{tx('Where the recorded status and the measurement disagree')}</H4>
            <Table dense
              columns={[
                { key: 'req', label: tx('ID'), width: 0.9, bold: true, render: (r) => printed(r.req) },
                { key: 'text', label: tx('Text'), width: 4, render: (r) => clip(r.text, 120) },
                { key: 'st', label: tx('Recorded'), width: 1.4, render: (r) => <Status r={r} /> },
                { key: 'au', label: tx('Measured'), width: 1.3, render: (r) => <Measured r={r} /> },
                { key: 'sig', label: tx('Measurements'), width: 3, render: (r) => (r.signals ?? []).filter((x) => x.direct !== false)
                    .map((x) => `${x.name}: ${x.status}`).join('; ') },
              ]}
              rows={m.disagreements}
            />
            <Muted>{tx(
              'These should be reviewed: either the recorded status needs updating or the measurement needs context the system cannot see.'
            )}</Muted>
          </>
        )}

        {/* ── 5. Detail ────────────────────────────────────────────── */}
        <SectionTitle breakBefore eyebrow={tx('Section 5')} title={tx('Requirement-by-requirement status')} />
        <P>{tx(
          'Every requirement in scope, in order. Paragraphs and sub-controls are indented beneath their requirement. "Controls" is the number of the organisation\'s controls mapped to the requirement; "Evidence" the number of evidence items filed against it; "Issues" open audit and connected-system findings.'
        )}</P>
        {m.domains.map((d) => (
          <View key={d.id}>
            {d.subdomains.map((sd, k) => (
              <View key={sd.id}>
                <Table dense indentKey="parent"
                  heading={<>{k === 0 ? <H3>{d.id}. {tx(d.name ?? '')}</H3> : null}<H4>{sd.id}  {sd.name}</H4></>}
                  columns={[
                    { key: 'req', label: tx('ID'), width: 1.0, render: (r) => (
                        <Text style={{ fontSize: 7.4, fontWeight: r.parent ? 400 : 600, color: r.parent ? C.text2 : C.text }}>{printed(r.req)}</Text>) },
                    { key: 'text', label: tx('Text'), width: 4.25, render: (r) => (
                        <Text style={{ fontSize: 7.2, color: r.parent ? C.text2 : C.text }}>{clip(r.text, 240)}</Text>) },
                    { key: 'st', label: tx('Recorded'), width: 1.4, render: (r) => <Status r={r} /> },
                    { key: 'au', label: tx('Measured'), width: 1.3, render: (r) => <Measured r={r} /> },
                    { key: 'ctl', label: tx('Controls'), width: 1.0, align: 'right', render: (r) => <Count v={r.controlCount} /> },
                    { key: 'ev', label: tx('Evidence'), width: 1.0, align: 'right', render: (r) => <Count v={Number(r.evidence) || 0} /> },
                    { key: 'iss', label: tx('Issues'), width: 0.85, align: 'right', render: (r) => <Count v={r.openIssues} alert /> },
                  ]}
                  rows={sd.rows}
                />
              </View>
            ))}
          </View>
        ))}

        <SectionTitle eyebrow={tx('About this report')} title={tx('Basis of preparation')} />
        <Bullets color={C.rose} items={[
          tx('Requirement text is taken from {{name}} ({{version}}) as loaded in RISYS. Long requirements are shortened in this report; the full text is in RISYS and in the published document.', { name: tx(fw.name ?? ''), version: fw.version ?? '' }),
          tx('Statuses are recorded by the organisation. Only main requirements are counted in the totals; paragraphs and sub-controls roll up into their requirement. Requirements outside the scope the organisation set are listed in Section 2 and not counted.'),
          tx('Measured results come from the most recent scan of each connected system and from the organisation’s own records in RISYS. They are not continuous monitoring.'),
          copy.notIssued,
          tx('The data this report was built from is archived in RISYS with the file and its SHA-256 fingerprint under the Report ID on the cover.'),
        ]} />
      </ContentPage>
    </ReportDocument>
  )
}
