import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useConnectors } from '@/hooks/useConnectors'
import { useRiskMatrix } from '@/hooks/useRiskGate'
import {
  PRIMARY_FRAMEWORK_ID, getFramework,
  useFrameworkRequirements, useComplianceStatuses, useFrameworkMappings,
  useRequirementAutomation, useReviewSchedule, summariseReviews,
  computeFrameworkScore,
} from '@/hooks/useCompliance'
import { aggregateFindings } from '@/lib/findings'
import { ROLE_SETS } from '@/lib/roles'
import { getSLAStatus } from '@/lib/sla'
import { treatmentSLA } from '@/lib/gate'
import { isReviewOverdue, normalizeWorkflowState } from '@/lib/risks'
import { bandForScore, BAND_ORDER } from '@/lib/matrix'
import { ACTIVE_FINDING } from '@/hooks/useAudits'
import { localISO } from '@/lib/manualCompliance'

/* ── Dashboard data ───────────────────────────────────────────────────────────
 *
 * Every number on the dashboard is computed with the same helper the owning
 * page uses, so the dashboard can never disagree with the page it links to:
 *
 *   ECC posture     computeFrameworkScore — the Compliance page's ring
 *   risk bands      residual where scored, otherwise inherent — the register
 *   open risks      workflow_state <> 'closed' — the register
 *   findings        aggregateFindings — the Findings page
 *   incident SLA    getSLAStatus — the Incidents page
 *   reviews         v_review_schedule — the Review calendar
 *
 * Nothing here is estimated or invented. Where a source cannot be read (the
 * role may not see it, or no connector is linked) the panel says so instead
 * of showing a zero that looks like a measurement.
 * -------------------------------------------------------------------------- */

const ECC = getFramework(PRIMARY_FRAMEWORK_ID)
const DAY = 86400000

/** The score a risk carries now: residual once scored, inherent until then. */
export function currentScore(r) {
  return r.residual_score || r.inherent_score || r.risk_score || 0
}

/** Likelihood × impact coordinates for the heat map. */
export function coordinates(r, basis) {
  if (basis === 'current' && r.residual_likelihood && r.residual_impact) {
    return { l: Number(r.residual_likelihood), i: Number(r.residual_impact) }
  }
  if (r.inherent_likelihood && r.inherent_impact) {
    return { l: Number(r.inherent_likelihood), i: Number(r.inherent_impact) }
  }
  return null
}

const isOpenIncident = i => i.status === 'open' || i.status === 'in_progress'
const isOpenTask = t => t.status === 'todo' || t.status === 'in_progress'

export function useDashboardData() {
  const { organization, user } = useAuth()
  const perms = usePermissions()
  const { connections } = useConnectors()
  const { matrix } = useRiskMatrix()

  const canReadFindings = ROLE_SETS.findingsReader.includes(perms.role)
  const canViewLog = perms.canViewAudit

  // ECC — the same four hooks the Compliance page uses.
  const ecc = {
    reqs: useFrameworkRequirements(ECC.id),
    statuses: useComplianceStatuses(ECC.id),
    maps: useFrameworkMappings(ECC.id),
    auto: useRequirementAutomation(ECC.id),
  }
  const reviews = useReviewSchedule()

  const connectedIds = useMemo(
    () => connections.filter(c => c.status === 'active').map(c => c.connector_id),
    [connections],
  )
  const connectedKey = connectedIds.slice().sort().join(',')

  const [raw, setRaw] = useState(null)
  const [findings, setFindings] = useState({ findings: [], providers: [], loaded: false })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    if (!organization?.id) return
    const org = organization.id
    const q = (table, cols = '*') => supabase.from(table).select(cols).eq('org_id', org)

    const [risks, incidents, tasks, entra, log, suggestions, engagements, auditFindings] = await Promise.all([
      q('risks').order('inherent_score', { ascending: false }),
      q('incidents').order('created_at', { ascending: false }),
      q('tasks').order('due_at', { ascending: true, nullsFirst: false }),
      q('entra_users', 'id, account_enabled, is_mfa_registered, is_privileged, user_type'),
      canViewLog
        ? q('audit_log').order('created_at', { ascending: false }).limit(8)
        : Promise.resolve({ data: [] }),
      canReadFindings
        ? q('risk_suggestions', 'id, status, area_id, area_name, critical_findings, open_findings')
        : Promise.resolve({ data: [] }),
      q('audit_engagements', 'id, ref, title, audit_type, framework, status, planned_start, planned_end, closed_at, created_at')
        .order('created_at', { ascending: false }),
      q('audit_findings', 'id, engagement_id, status, rating, due_date'),
    ])

    setRaw({
      risks: risks.data || [],
      incidents: incidents.data || [],
      tasks: tasks.data || [],
      entraUsers: entra.data || [],
      log: log.data || [],
      suggestions: suggestions.data || [],
      engagements: engagements.data || [],
      auditFindings: auditFindings.data || [],
    })
    setUpdatedAt(new Date())
  }, [organization?.id, canViewLog, canReadFindings])

  const loadFindings = useCallback(async () => {
    if (!organization?.id || !canReadFindings) {
      setFindings({ findings: [], providers: [], loaded: true })
      return
    }
    const res = await aggregateFindings(organization.id, connectedIds)
    setFindings({ ...res, loaded: true })
    // connectedKey stands in for connectedIds so a new array identity with the
    // same members does not refetch.
  }, [organization?.id, canReadFindings, connectedKey])

  useEffect(() => {
    let live = true
    setLoading(true)
    load().finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [load])

  useEffect(() => { loadFindings() }, [loadFindings])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      load(), loadFindings(),
      ecc.statuses.refetch(), ecc.maps.refetch(), ecc.auto.refetch(), reviews.refetch(),
    ])
    setRefreshing(false)
  }, [load, loadFindings, ecc.statuses.refetch, ecc.maps.refetch, ecc.auto.refetch, reviews.refetch])

  const model = useMemo(
    () => buildModel({ raw, findings, matrix, connectedIds, userId: user?.id, canReadFindings }),
    [raw, findings, matrix, connectedIds, user?.id, canReadFindings],
  )

  // ECC posture, overall and per domain — computed exactly as the Compliance page does.
  const eccModel = useMemo(
    () => buildEcc(ecc.reqs.requirements, ecc.statuses.statuses, ecc.maps.mappings, ecc.maps.controls, ecc.auto.automation),
    [ecc.reqs.requirements, ecc.statuses.statuses, ecc.maps.mappings, ecc.maps.controls, ecc.auto.automation],
  )

  const reviewSummary = useMemo(() => summariseReviews(reviews.rows), [reviews.rows])

  return {
    loading: loading || !raw,
    eccLoading: ecc.reqs.loading && !eccModel,
    refreshing,
    refresh,
    updatedAt,
    model,
    ecc: eccModel,
    reviews: reviewSummary,
    matrix,
    perms,
  }
}

// ── Pure derivations (exported so they can be exercised without a database) ──

export function buildModel({ raw, findings, matrix, connectedIds = [], userId, canReadFindings }) {
  if (!raw) return null
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY)

  // Risks
  const openRisks = raw.risks.filter(r => normalizeWorkflowState(r.workflow_state) !== 'closed')
  const band = r => bandForScore(currentScore(r), matrix)
  const inherentBand = r => bandForScore(r.inherent_score || r.risk_score || 0, matrix)
  const bands = Object.fromEntries(BAND_ORDER.map(b => [b, 0]))
  const inherentBands = Object.fromEntries(BAND_ORDER.map(b => [b, 0]))
  let unscored = 0
  for (const r of openRisks) {
    const b = band(r)
    if (b) bands[b]++; else unscored++
    const ib = inherentBand(r)
    if (ib) inherentBands[ib]++
  }
  const outside = openRisks.filter(r => r.tolerance_status === 'breached').length
  const within = openRisks.filter(r => r.tolerance_status === 'within').length
  const newRisks30 = raw.risks.filter(r => r.created_at && new Date(r.created_at) >= since30).length

  // Risk areas: one row per category, ranked by the worst band then count.
  const areaMap = {}
  for (const r of openRisks) {
    const key = r.category || '—'
    const a = areaMap[key] || (areaMap[key] = { category: key, count: 0, worst: null, top: null })
    a.count++
    const b = band(r)
    if (b && (!a.worst || BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(a.worst))) a.worst = b
    if (!a.top || currentScore(r) > currentScore(a.top)) a.top = r
  }
  const areas = Object.values(areaMap).sort((x, y) =>
    (BAND_ORDER.indexOf(y.worst) - BAND_ORDER.indexOf(x.worst)) || (y.count - x.count))

  // Incidents
  const openIncidents = raw.incidents.filter(isOpenIncident)
  const withSla = openIncidents.map(i => ({ ...i, sla: getSLAStatus(i.severity, i.created_at) }))
  const breachedIncidents = withSla.filter(i => i.sla.status === 'breached')
  const incidentSeverity = {}
  for (const i of openIncidents) incidentSeverity[i.severity] = (incidentSeverity[i.severity] || 0) + 1

  // Tasks
  const openTasks = raw.tasks.filter(isOpenTask)
  const overdueTasks = openTasks.filter(t => t.due_at && new Date(t.due_at) < now)
  const dueSoonTasks = openTasks.filter(t => t.due_at && new Date(t.due_at) >= now && new Date(t.due_at) - now < 7 * DAY)
  const myTasks = openTasks.filter(t => t.assigned_to === userId)

  // Findings (only meaningful once loaded and readable)
  const fl = findings.findings
  const findingCounts = {
    total: fl.length,
    critical: fl.filter(f => f.severity === 'critical').length,
    warning: fl.filter(f => f.severity === 'warning').length,
    info: fl.filter(f => f.severity === 'info').length,
  }
  const perProvider = findings.providers.map(p => {
    const mine = fl.filter(f => f.connectorId === p.id)
    return {
      ...p,
      critical: mine.filter(f => f.severity === 'critical').length,
      warning: mine.filter(f => f.severity === 'warning').length,
      info: mine.filter(f => f.severity === 'info').length,
      total: mine.length,
    }
  })

  // Identity (Entra)
  const entraConnected = connectedIds.includes('entra')
  const eu = raw.entraUsers
  const enabled = eu.filter(u => u.account_enabled !== false)
  const identity = {
    connected: entraConnected,
    total: enabled.length,
    withMfa: enabled.filter(u => u.is_mfa_registered).length,
    privileged: eu.filter(u => u.is_privileged).length,
    guests: eu.filter(u => u.user_type === 'Guest').length,
  }

  // Audits
  const activeFindingsBy = {}
  let overdueAuditFindings = 0
  const today = localISO()
  for (const f of raw.auditFindings) {
    if (!ACTIVE_FINDING.includes(f.status)) continue
    activeFindingsBy[f.engagement_id] = (activeFindingsBy[f.engagement_id] || 0) + 1
    if (f.due_date && String(f.due_date).slice(0, 10) < today) overdueAuditFindings++
  }
  const stageRank = { fieldwork: 0, reporting: 1, planned: 2, closed: 3, cancelled: 4 }
  const engagements = raw.engagements
    .filter(e => e.status !== 'cancelled')
    .map(e => ({ ...e, activeFindings: activeFindingsBy[e.id] || 0 }))
    .sort((a, b) => (stageRank[a.status] ?? 9) - (stageRank[b.status] ?? 9)
      || String(b.created_at).localeCompare(String(a.created_at)))
  const activeEngagements = engagements.filter(e => e.status !== 'closed').length

  // Suggested risks waiting for a decision
  const pendingSuggestions = raw.suggestions.filter(s => s.status === 'pending')

  // Risk work the register would flag
  const treatmentOverdue = openRisks.filter(r => treatmentSLA(r)?.overdue).length
  const reviewOverdue = openRisks.filter(isReviewOverdue).length

  return {
    risks: { all: raw.risks, open: openRisks, bands, inherentBands, unscored, outside, within, newRisks30, areas, treatmentOverdue, reviewOverdue },
    incidents: { open: withSla, breached: breachedIncidents, severity: incidentSeverity, total: raw.incidents.length },
    tasks: { open: openTasks, overdue: overdueTasks, dueSoon: dueSoonTasks, mine: myTasks },
    findings: { ...findingCounts, providers: perProvider, loaded: findings.loaded, readable: canReadFindings, connected: findings.providers.length > 0 },
    identity,
    audits: { engagements, active: activeEngagements, overdueFindings: overdueAuditFindings },
    suggestions: pendingSuggestions,
    log: raw.log,
  }
}

export function buildEcc(reqs, statuses, mappings, controls, automation) {
  if (!reqs?.length) return null
  const args = [statuses, mappings, controls, ECC, automation]
  const overall = computeFrameworkScore(reqs, ...args)

  const groups = {}
  for (const r of reqs) {
    const id = r.domain_id || '—'
    ;(groups[id] || (groups[id] = { id, name: r.domain_name || id, reqs: [] })).reqs.push(r)
  }
  const domains = Object.values(groups)
    .map(g => ({ id: g.id, name: g.name, ...computeFrameworkScore(g.reqs, ...args) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))

  return { overall, domains }
}
