import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { logAudit, AUDIT } from '@/lib/audit'
import { notify } from './useRisks'
import { DEFAULT_MATRIX, bandFor, bandMeta } from '@/lib/matrix'
import { evaluateGate, buildSignals } from '@/lib/gate'

// ============================================================
// THE GATE, wired to the database
//
// lib/gate.js decides; this file reads what it needs and writes what it
// decided. The split matters: the same evaluation moves into Postgres
// later (003_risk_gate_triggers.sql) without the rules changing.
//
// Every hook here degrades quietly when 002_risk_gate.sql has not been
// applied yet — a missing table yields defaults rather than an error
// banner, so the UI stays usable against an un-migrated database.
// ============================================================

// ── MATRIX CONFIG ─────────────────────────────────────────────────────────────
export function useRiskMatrix() {
  const { organization } = useAuth()
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX)
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchMatrix = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_matrix_config')
      .select('*')
      .eq('org_id', organization.id)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
    // No table yet, or no row for this org: the shipped 5x5 applies and
    // behaves exactly as the hardcoded thresholds used to.
    if (error) setMigrated(false)
    setMatrix(data?.[0] || DEFAULT_MATRIX)
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchMatrix() }, [fetchMatrix])

  return { matrix, loading, migrated, refetch: fetchMatrix }
}

// ── TOLERANCES ────────────────────────────────────────────────────────────────
export function useRiskTolerances() {
  const { organization, user } = useAuth()
  const [tolerances, setTolerances] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchTolerances = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_tolerances')
      .select('*')
      .eq('org_id', organization.id)
      .order('category', { ascending: true })
    if (error) setMigrated(false)
    setTolerances(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchTolerances() }, [fetchTolerances])

  const byCategory = useMemo(() => {
    const map = new Map()
    tolerances.forEach(t => map.set(t.category, t))
    return map
  }, [tolerances])

  /** The tolerance that governs a risk. No match means the gate abstains. */
  const toleranceFor = useCallback(category => byCategory.get(category) || null, [byCategory])

  const saveTolerance = async (category, updates) => {
    const row = {
      org_id: organization.id,
      category,
      ...updates,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('risk_tolerances')
      .upsert(row, { onConflict: 'org_id,category' })
      .select().single()
    if (error) throw error
    await logAudit(organization.id, AUDIT.RISK_TOLERANCE_SET, 'risk_tolerance', data.id, category, {
      rules: updates.rules, max_accept_band: updates.max_accept_band,
    })
    await fetchTolerances()
    return data
  }

  return { tolerances, loading, migrated, toleranceFor, saveTolerance, refetch: fetchTolerances }
}

// ── SCORE HISTORY ─────────────────────────────────────────────────────────────
/**
 * Append-only. There is deliberately no update or delete here, and the
 * migration grants no such policy either — a score history you can edit
 * is not a score history.
 */
export function useScoreHistory(riskId) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    if (!riskId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('risk_score_history')
      .select('*')
      .eq('risk_id', riskId)
      .order('assessed_at', { ascending: false })
    setHistory(data || [])
    setLoading(false)
  }, [riskId])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  return { history, loading, refetch: fetchHistory }
}

// ── SIGNAL COLLECTION ─────────────────────────────────────────────────────────
/**
 * Pull the children a tolerance rule might read. Kept separate from the
 * detail page's own hooks so the gate can be re-run from anywhere —
 * including a bulk sweep across the register — without mounting the UI.
 */
export async function collectSignals(riskId, risk) {
  const [mappingsRes, krisRes, evidenceRes, actionsRes] = await Promise.all([
    supabase.from('risk_control_mappings').select('*').eq('risk_id', riskId),
    supabase.from('risk_kris').select('*').eq('risk_id', riskId),
    supabase.from('risk_evidence').select('*').eq('risk_id', riskId),
    supabase.from('risk_treatment_actions').select('*').eq('risk_id', riskId),
  ])

  const mappings = mappingsRes.data || []
  let controls = []
  if (mappings.length) {
    const { data } = await supabase
      .from('risk_controls')
      .select('*')
      .in('id', mappings.map(m => m.control_id))
    controls = data || []
  }

  return {
    signals: buildSignals({
      risk,
      mappings,
      controls,
      kris: krisRes.data || [],
      evidence: evidenceRes.data || [],
      actions: actionsRes.data || [],
    }),
    mappings,
    controls,
  }
}

// ── THE GATE RUNNER ───────────────────────────────────────────────────────────
/**
 * Evaluate one risk and persist the consequences.
 *
 * This is the only function in the codebase that may change
 * workflow_state without a human pressing a button, which is the whole
 * point: the gate is the step that creates work by itself.
 *
 * `trigger` names what caused the re-evaluation so the workflow history
 * reads as a narrative rather than a list of silent state flips.
 */
export async function runGate({ orgId, userId, risk, tolerance, matrix, trigger = 'Re-evaluated' }) {
  if (!risk?.id || !orgId) return null

  const { signals } = await collectSignals(risk.id, risk)
  const verdict = evaluateGate({ risk, tolerance, signals, matrix })

  // Pre-measurement states are not the gate's business. A draft has not
  // claimed to be scored yet, so it must not be dragged into breach.
  const preMeasurement = risk.workflow_state === 'draft' || risk.workflow_state === 'registered'
  if (!verdict.evaluated || preMeasurement) {
    await supabase.from('risks').update({
      tolerance_status: 'not_evaluated',
      gate_failed_rules: [],
      gate_evaluated_at: new Date().toISOString(),
    }).eq('id', risk.id)
    return verdict
  }

  const wasBreached = risk.tolerance_status === 'breached'
  const nowBreached = !verdict.passed

  const updates = {
    tolerance_status: verdict.status,
    gate_failed_rules: verdict.failedRules.map(r => ({
      label: r.label, metric: r.metric, operator: r.operator,
      expected: r.value, actual: r.actual,
    })),
    gate_evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // The breach clock starts on the first failing evaluation and only
  // stops when the risk actually clears — not every time it is re-run.
  if (nowBreached) {
    if (!wasBreached || !risk.breach_since) {
      updates.breach_since = new Date().toISOString()
      updates.treatment_due_at = verdict.treatmentDueAt
    }
  } else {
    updates.breach_since = null
    updates.treatment_due_at = null
  }

  // State. An accepted risk keeps its state — the exception is the
  // decision of record, and it reopens on expiry, not on re-evaluation.
  const movable = ['assessed', 'treatment_required', 'under_treatment', 'monitored']
  let toState = null
  if (movable.includes(risk.workflow_state)) {
    const target = verdict.requiredState
    // Under treatment stays under treatment while it is passing its own
    // plan; it only moves when the gate clears it or the plan fails.
    if (risk.workflow_state === 'under_treatment' && !verdict.passed) {
      toState = null
    } else if (target !== risk.workflow_state) {
      toState = target
    }
  }
  if (toState) updates.workflow_state = toState

  const { error } = await supabase.from('risks').update(updates).eq('id', risk.id)
  if (error) throw error

  if (toState) {
    await supabase.from('risk_workflow_history').insert({
      org_id: orgId, risk_id: risk.id,
      from_state: risk.workflow_state, to_state: toState,
      action: nowBreached ? 'gate_breached' : 'gate_cleared',
      comment: `${trigger} — ${verdict.reason}`,
      performed_by: userId,
    })
  }

  // Audit and escalate only on a *change* of verdict. Re-logging a
  // standing breach every time the page loads would bury the moment it
  // actually happened.
  const link = `/app/risks/${risk.id}`
  const ref = risk.risk_id || ''

  if (nowBreached && !wasBreached) {
    await logAudit(orgId, AUDIT.RISK_GATE_BREACHED, 'risk', risk.id, risk.title, {
      trigger,
      band: verdict.band,
      failed: verdict.failedRules.map(r => r.label),
      // Flattened to text: the audit log renders meta values as strings,
      // and an object prints as "[object Object]".
      delta: verdict.breachDelta ? `${verdict.breachDelta.actual} vs ${verdict.breachDelta.limit}` : null,
      escalated_to: verdict.escalateTo,
    })
    const body = verdict.breachDelta
      ? `Residual ${verdict.breachDelta.actual} against a tolerance of ${verdict.breachDelta.limit}. Treatment is mandatory.`
      : `${verdict.failedRules.length} tolerance rule(s) failing. Treatment is mandatory.`
    for (const uid of new Set([risk.owner_id, risk.reviewer_id].filter(Boolean))) {
      await notify(orgId, uid, {
        type: 'workflow',
        title: `Outside tolerance: ${ref}`,
        body: `"${risk.title}" — ${body}`,
        link,
      })
    }
  }

  if (!nowBreached && wasBreached) {
    await logAudit(orgId, AUDIT.RISK_GATE_CLEARED, 'risk', risk.id, risk.title, {
      trigger, band: verdict.band, score: verdict.score,
    })
    for (const uid of new Set([risk.owner_id, risk.reviewer_id].filter(Boolean))) {
      await notify(orgId, uid, {
        type: 'workflow',
        title: `Back within tolerance: ${ref}`,
        body: `"${risk.title}" now sits at ${verdict.score} (${bandMeta(verdict.band).label}).`,
        link,
      })
    }
  }

  return verdict
}

// ── SCORING ───────────────────────────────────────────────────────────────────
/**
 * Record a score and re-run the gate.
 *
 * Scores are appended, never overwritten, and a justification is part of
 * the record rather than an afterthought. The gate runs immediately
 * afterwards because a score change is precisely the event the tolerance
 * rule exists to react to.
 */
export function useRiskScoring(risk, onChanged) {
  const { organization, user } = useAuth()
  const { matrix } = useRiskMatrix()
  const { toleranceFor } = useRiskTolerances()
  const [busy, setBusy] = useState(false)

  const saveScore = async (type, { likelihood, impact, justification }) => {
    if (!risk?.id) return null
    setBusy(true)
    try {
      const l = Number(likelihood), i = Number(impact)
      const score = l * i
      const band = bandFor(l, i, matrix)
      // Residual only has a previous value if it was actually scored; the
      // generated residual_score column otherwise echoes the inherent score,
      // which made a first residual assessment read as "25 → 16".
      const prev = type === 'inherent'
        ? risk.inherent_score
        : (risk.residual_likelihood && risk.residual_impact ? risk.residual_score : null)

      // 1. The immutable row first, so the justification exists even if
      //    the subsequent write fails.
      const { error: histErr } = await supabase.from('risk_score_history').insert({
        org_id: organization.id,
        risk_id: risk.id,
        score_type: type,
        likelihood: l,
        impact: i,
        score,
        band,
        matrix_version: matrix?.version || 1,
        justification: justification || null,
        prev_score: prev ?? null,
        assessed_by: user?.id,
      })
      if (histErr) throw histErr

      // 2. The risk itself. Generated score columns are never written.
      const updates = { updated_at: new Date().toISOString() }
      if (type === 'inherent') {
        updates.inherent_likelihood = l
        updates.inherent_impact = i
        updates.likelihood = l   // legacy columns, kept in step
        updates.impact = i
      } else {
        updates.residual_likelihood = l
        updates.residual_impact = i
      }
      // Scoring is what admits a registered risk into assessment.
      if (risk.workflow_state === 'registered') updates.workflow_state = 'assessed'

      const { error } = await supabase.from('risks').update(updates).eq('id', risk.id)
      if (error) throw error

      await logAudit(organization.id, AUDIT.RISK_SCORED, 'risk', risk.id, risk.title, {
        score_type: type, from: prev ?? null, to: score,
        likelihood: l, impact: i, band, justification: justification || null,
      })

      // 3. The gate. Everything above was measurement.
      const verdict = await runGate({
        orgId: organization.id,
        userId: user?.id,
        risk: { ...risk, ...updates, [`${type}_score`]: score },
        tolerance: toleranceFor(risk.category),
        matrix,
        trigger: `${type === 'inherent' ? 'Inherent' : 'Residual'} score changed to ${score}`,
      })

      onChanged && onChanged()
      return verdict
    } finally { setBusy(false) }
  }

  return { saveScore, busy, matrix, tolerance: toleranceFor(risk?.category) }
}

// ── LIVE VERDICT ──────────────────────────────────────────────────────────────
/**
 * The verdict as currently computed, for rendering. Does not write.
 * Pass the children the detail page has already loaded rather than
 * re-fetching them.
 */
export function useGateVerdict({ risk, mappings = [], controls = [], kris = [], evidence = [], actions = [] }) {
  const { matrix } = useRiskMatrix()
  const { toleranceFor, loading } = useRiskTolerances()

  return useMemo(() => {
    if (!risk) return null
    const signals = buildSignals({ risk, mappings, controls, kris, evidence, actions })
    const verdict = evaluateGate({ risk, tolerance: toleranceFor(risk.category), signals, matrix })
    return { ...verdict, signals, loading }
  }, [risk, mappings, controls, kris, evidence, actions, toleranceFor, matrix, loading])
}
