/* ── Report models ────────────────────────────────────────────────────────────
 *
 * Pure functions: raw data from the report_*_data functions in, the exact
 * model a report renders out. The model — not the raw data — is what gets
 * archived as the report's snapshot, so the archive holds what the board saw,
 * with the bands and statuses as they were derived on the day.
 *
 * Banding uses lib/matrix.js, the same code the register uses on screen, so a
 * risk that is "High" in the app is "High" in the board pack.
 * -------------------------------------------------------------------------- */
import { bandFor, bandForScore, DEFAULT_MATRIX } from '../matrix'

const ORDER = { critical: 4, high: 3, medium: 2, low: 1 }
const ACTIVE_FINDING = ['open', 'in_remediation', 'ready_for_validation']

const n = (x) => (x == null ? 0 : Number(x))
const today = () => new Date(new Date().toISOString().slice(0, 10))
const daysUntil = (d) => (d ? Math.round((new Date(d) - today()) / 86_400_000) : null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/* Formatted by hand: toLocaleDateString differs between browsers and Node
 * ("Sep" vs "Sept"), and a report must read the same wherever it is built. */
const asDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d))
export function fmtDate(d) {
  if (!d) return '—'
  const x = asDate(d)
  if (Number.isNaN(x.getTime())) return '—'
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`
}
export function fmtDateTime(d) {
  if (!d) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  const hh = String(x.getHours()).padStart(2, '0'), mm = String(x.getMinutes()).padStart(2, '0')
  return `${fmtDate(x)}, ${hh}:${mm}`
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

/** A compliant status whose review date has passed is read as Partial — the app's rule. */
export function effectiveCompliance(status, reviewDueAt) {
  if (!status) return 'not_started'
  if (status === 'compliant' && reviewDueAt && new Date(reviewDueAt) < today()) return 'partial'
  return status
}

const DOMAIN_SHORT = {
  1: 'Governance', 2: 'Defense', 3: 'Resilience', 4: 'Third-party & cloud',
}

/* ═══ Board pack ═══════════════════════════════════════════════════════════ */

export function buildBoardPackModel(raw) {
  const matrix = raw.matrix?.cells?.length ? raw.matrix : DEFAULT_MATRIX
  const dims = raw.matrix?.dimensions || 5

  const risks = (raw.risks ?? []).map((r) => {
    const inherentBand = r.il && r.ii ? bandFor(r.il, r.ii, matrix) : bandForScore(r.inherent, matrix)
    const hasResidualAxes = !!(r.rl && r.ri)
    const residualBand = hasResidualAxes ? bandFor(r.rl, r.ri, matrix) : bandForScore(r.residual, matrix)
    return { ...r, inherentBand, residualBand, hasResidualAxes }
  })

  // Heat maps. Residual only counts risks actually scored after controls —
  // a residual that silently equals inherent is not a residual assessment.
  const heat = (key) => {
    const cells = {}
    for (let l = 1; l <= dims; l++) for (let i = 1; i <= dims; i++) {
      cells[`${l}-${i}`] = { band: bandFor(l, i, matrix), count: 0 }
    }
    let total = 0
    for (const r of risks) {
      const l = key === 'inherent' ? r.il : r.rl
      const i = key === 'inherent' ? r.ii : r.ri
      if (l && i && cells[`${l}-${i}`]) { cells[`${l}-${i}`].count++; total++ }
    }
    return { cells, total }
  }
  const inherentHeat = heat('inherent')
  const residualHeat = heat('residual')

  const byResidual = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const r of risks) if (r.residualBand) byResidual[r.residualBand]++

  const tolerance = { within: 0, breached: 0, not_evaluated: 0 }
  for (const r of risks) tolerance[r.tolerance_status in tolerance ? r.tolerance_status : 'not_evaluated']++

  const topRisks = [...risks]
    .sort((a, b) => (ORDER[b.residualBand] ?? 0) - (ORDER[a.residualBand] ?? 0) || n(b.residual) - n(a.residual))
    .slice(0, 10)

  // ── ECC ──
  const mainTotal = n(raw.ecc?.main_controls)
  const statusByReq = {}
  for (const st of raw.ecc?.statuses ?? []) statusByReq[st.req] = st
  const counts = { compliant: 0, partial: 0, in_progress: 0, not_compliant: 0, not_applicable: 0 }
  const domainCounts = {}
  for (const st of raw.ecc?.statuses ?? []) {
    // Only main controls count toward coverage (sub-controls roll up into them).
    if (!/^\d+-\d+-\d+$/.test(st.req)) continue
    const eff = effectiveCompliance(st.status, st.review_due_at)
    if (eff === 'not_started') continue
    counts[eff] = (counts[eff] ?? 0) + 1
    const d = String(st.domain ?? st.req.split('-')[0])
    domainCounts[d] ??= { compliant: 0, partial: 0, in_progress: 0, not_compliant: 0, not_applicable: 0 }
    domainCounts[d][eff] = (domainCounts[d][eff] ?? 0) + 1
  }
  const assessed = Object.values(counts).reduce((a, b) => a + b, 0)
  const domains = (raw.ecc?.domains ?? []).map((d) => {
    const c = domainCounts[String(d.id)] ?? { compliant: 0, partial: 0, in_progress: 0, not_compliant: 0, not_applicable: 0 }
    const done = Object.values(c).reduce((a, b) => a + b, 0)
    return { id: String(d.id), name: d.name, short: DOMAIN_SHORT[d.id] ?? d.name, mains: n(d.mains), counts: c,
             assessed: done, notAssessed: Math.max(0, n(d.mains) - done) }
  })

  const autoCounts = { compliant: 0, partial: 0, not_compliant: 0, not_started: 0 }
  for (const a of raw.ecc?.automation ?? []) autoCounts[a.status] = (autoCounts[a.status] ?? 0) + 1

  const signals = raw.signals ?? []
  const sigCounts = { pass: 0, partial: 0, fail: 0, unknown: 0 }
  for (const x of signals) sigCounts[x.status] = (sigCounts[x.status] ?? 0) + 1

  // ── Incidents, findings, audit ──
  const sumObj = (o) => Object.values(o ?? {}).reduce((a, b) => a + n(b), 0)
  const incidents = {
    inPeriod: raw.incidents?.in_period ?? {}, open: raw.incidents?.open ?? {},
    inPeriodTotal: sumObj(raw.incidents?.in_period), openTotal: sumObj(raw.incidents?.open),
    resolved: n(raw.incidents?.resolved_in_period), slaBreached: n(raw.incidents?.sla_breached_in_period),
    mttr: raw.incidents?.mean_hours_to_resolve,
  }

  const cf = {}
  for (const x of raw.connector_findings ?? []) {
    cf[x.connector] ??= { connector: x.connector, critical: 0, warning: 0, info: 0, total: 0 }
    const sev = x.severity === 'critical' || x.severity === 'high' ? 'critical' : x.severity === 'warning' || x.severity === 'medium' ? 'warning' : 'info'
    cf[x.connector][sev] += n(x.n)
    cf[x.connector].total += n(x.n)
  }
  const connectorFindings = Object.values(cf).sort((a, b) => b.critical - a.critical || b.total - a.total)
  const connectorCritical = connectorFindings.reduce((a, x) => a + x.critical, 0)

  const auditOpen = raw.audit?.open_findings ?? {}
  const audit = {
    open: auditOpen, openTotal: sumObj(auditOpen), high: n(auditOpen.high),
    overdue: n(raw.audit?.overdue_findings), engagements: raw.audit?.engagements ?? [],
  }

  // ── Exceptions and treatment ──
  const exceptions = (raw.exceptions ?? []).map((e) => ({ ...e, daysLeft: daysUntil(e.expires_at) }))
  const expiringSoon = exceptions.filter((e) => e.daysLeft !== null && e.daysLeft <= 60)

  // ── What the board should look at ──
  const attention = []
  const breached = risks.filter((r) => r.tolerance_status === 'breached')
  if (breached.length) attention.push(`${plural(breached.length, 'risk')} outside the organisation's risk tolerance: ${breached.slice(0, 3).map((r) => r.ref).join(', ')}${breached.length > 3 ? ' and others' : ''}.`)
  if (byResidual.critical) {
    const unassessed = risks.filter((r) => r.residualBand === 'critical' && !r.hasResidualAxes).length
    attention.push(`${plural(byResidual.critical, 'risk')} rated Critical on current score${unassessed ? ` — ${unassessed} of them not yet assessed after controls, so shown at their inherent rating` : ' after controls'}.`)
  }
  if (tolerance.not_evaluated) attention.push(`${tolerance.not_evaluated} of ${risks.length} registered risks have not yet been evaluated against tolerance, so the register cannot yet show which of them need treatment.`)
  if (expiringSoon.length) attention.push(`${plural(expiringSoon.length, 'risk acceptance')} expire within 60 days and will need re-approval or treatment.`)
  if (n(raw.treatment_plans?.overdue)) attention.push(`${plural(n(raw.treatment_plans.overdue), 'treatment plan')} past their due date.`)
  if (audit.high) attention.push(`${plural(audit.high, 'high-rated audit finding')} open${audit.overdue ? `; ${audit.overdue} past remediation date` : ''}.`)
  if (connectorCritical) attention.push(`${connectorCritical} critical findings from connected systems are open and untriaged or unresolved.`)
  if (mainTotal && pct(assessed, mainTotal) < 50) attention.push(`Only ${assessed} of ${mainTotal} NCA ECC main controls (${pct(assessed, mainTotal)}%) have a recorded assessment.`)
  if (incidents.slaBreached) attention.push(`${plural(incidents.slaBreached, 'incident')} resolved in the period missed their SLA.`)

  return {
    orgName: raw.org?.name ?? 'Organisation',
    period: raw.period,
    risks, topRisks, byResidual, tolerance,
    heat: { inherent: inherentHeat, residual: residualHeat, dims },
    residualUnscored: risks.filter((r) => !r.hasResidualAxes).length,
    movement: raw.risk_movement ?? {},
    exceptions, expiringSoon,
    plans: { total: n(raw.treatment_plans?.total), overdue: n(raw.treatment_plans?.overdue) },
    ecc: { mainTotal, assessed, coverage: pct(assessed, mainTotal), counts, domains,
           compliantPct: pct(counts.compliant, mainTotal), autoCounts,
           automatedReqs: (raw.ecc?.automation ?? []).length },
    signals, sigCounts,
    incidents, connectorFindings, connectorCritical, audit,
    attention,
  }
}

/* ═══ NCA ECC status report ════════════════════════════════════════════════ */

export function buildEccModel(raw) {
  const reqs = (raw.requirements ?? []).map((r) => ({
    ...r,
    isMain: !r.parent,
    effective: effectiveCompliance(r.status, r.review_due_at),
    overdueReview: r.status === 'compliant' && r.review_due_at && new Date(r.review_due_at) < today(),
    controlCount: (r.controls ?? []).length,
    openIssues: n(r.audit_findings) + n(r.connector_findings),
  }))

  const mains = reqs.filter((r) => r.isMain)
  const counts = { compliant: 0, partial: 0, in_progress: 0, not_compliant: 0, not_applicable: 0, not_started: 0 }
  for (const r of mains) counts[r.effective] = (counts[r.effective] ?? 0) + 1
  const assessed = mains.length - counts.not_started
  const applicable = mains.length - counts.not_applicable

  const domainMap = new Map()
  for (const r of reqs) {
    const dId = String(r.domain)
    if (!domainMap.has(dId)) domainMap.set(dId, { id: dId, name: r.domain_name, subdomains: new Map(), counts: { ...Object.fromEntries(Object.keys(counts).map((k) => [k, 0])) } })
    const d = domainMap.get(dId)
    const sId = r.subdomain ?? r.req.split('-').slice(0, 2).join('-')
    if (!d.subdomains.has(sId)) d.subdomains.set(sId, { id: sId, name: r.subdomain_name, rows: [] })
    d.subdomains.get(sId).rows.push(r)
    if (r.isMain) d.counts[r.effective]++
  }
  const domains = [...domainMap.values()].map((d) => ({
    ...d, subdomains: [...d.subdomains.values()],
    mains: Object.values(d.counts).reduce((a, b) => a + b, 0),
  }))

  const gaps = mains
    .filter((r) => ['not_compliant', 'partial'].includes(r.effective))
    .sort((a, b) => (a.effective === 'not_compliant' ? -1 : 1) - (b.effective === 'not_compliant' ? -1 : 1))

  const auto = { compliant: 0, partial: 0, not_compliant: 0, not_started: 0 }
  for (const r of reqs) if (r.auto_status) auto[r.auto_status] = (auto[r.auto_status] ?? 0) + 1
  const automated = reqs.filter((r) => r.auto_status)
  // Where the recorded status and the automated measurement disagree, say so.
  const disagreements = automated.filter((r) =>
    (r.effective === 'compliant' && r.auto_status === 'not_compliant') ||
    (r.effective === 'not_compliant' && r.auto_status === 'compliant'))

  return {
    orgName: raw.org?.name ?? 'Organisation',
    framework: raw.framework,
    reqs, mains, counts, assessed, applicable,
    coverage: pct(assessed, mains.length),
    compliantPct: pct(counts.compliant, applicable || 1),
    domains, gaps, auto, automated, disagreements,
    totalOpenIssues: reqs.reduce((a, r) => a + r.openIssues, 0),
    controlsMapped: reqs.filter((r) => r.controlCount > 0).length,
    withEvidence: reqs.filter((r) => n(r.evidence) > 0).length,
  }
}

/* ═══ Audit report ═════════════════════════════════════════════════════════ */

export function buildAuditModel(raw) {
  const e = raw.engagement ?? {}
  const scope = raw.scope ?? []
  const findings = raw.findings ?? []
  const results = { effective: 0, partially_effective: 0, ineffective: 0, not_applicable: 0, not_tested: 0 }
  for (const x of scope) results[x.result] = (results[x.result] ?? 0) + 1
  const ratings = { high: 0, medium: 0, low: 0, observation: 0 }
  for (const f of findings) ratings[f.rating] = (ratings[f.rating] ?? 0) + 1
  const reviewed = scope.filter((x) => x.reviewed_by || x.reviewer).length
  const tested = scope.filter((x) => x.result !== 'not_tested').length
  return {
    orgName: raw.org?.name ?? 'Organisation',
    engagement: e, scope, findings, results, ratings,
    tested, reviewed,
    openFindings: findings.filter((f) => ACTIVE_FINDING.includes(f.status)).length,
    overdueFindings: findings.filter((f) => ACTIVE_FINDING.includes(f.status) && f.due_date && new Date(f.due_date) < today()).length,
    requests: raw.requests ?? {}, evidenceFiles: n(raw.evidence_files),
  }
}
