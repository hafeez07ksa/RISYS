import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail } from '@/lib/policies'

/* ── Enterprise Risk Management ───────────────────────────────────────────────
 *
 *   risk_submissions   raised risks and their triage (SUB-)
 *   risk_settings      the assessment and decision deadlines
 *   risk_exceptions    acceptances (read here; changed only through RPCs)
 *
 * Clients only read these tables. Every change is an RPC, so the database
 * decides who may triage, who may sign and for how long.
 * -------------------------------------------------------------------------- */

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  fail(error)
  return data
}

/* ── Raised risks ─────────────────────────────────────────────────────────── */

export function useRiskSubmissions() {
  const { organization } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase.from('risk_submissions')
      .select('*, business_unit:business_units(id, name), risk:risks(id, risk_id, title, workflow_state)')
      .eq('org_id', organization.id)
      .order('submitted_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const submit = async (values) => {
    const id = await rpc('submit_risk', { p_org: organization.id, p_data: values })
    await fetchAll()
    return id
  }

  return { items, loading, submit, refetch: fetchAll }
}

export function useRiskSubmission(id) {
  const { organization } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOne = useCallback(async () => {
    if (!organization?.id || !id) { setLoading(false); return }
    const { data } = await supabase.from('risk_submissions')
      .select('*, business_unit:business_units(id, name), risk:risks(id, risk_id, title, workflow_state)')
      .eq('id', id).eq('org_id', organization.id).maybeSingle()
    setItem(data || null)
    setLoading(false)
  }, [organization?.id, id])

  useEffect(() => { setLoading(true); fetchOne() }, [fetchOne])

  const update = async (values, response = null) => {
    await rpc('update_risk_submission', { p_id: id, p_data: values, p_response: response })
    await fetchOne()
  }
  const withdraw = async (reason) => {
    await rpc('withdraw_risk_submission', { p_id: id, p_reason: reason || null })
    await fetchOne()
  }
  const triage = async (action, { note = null, owner = null, title = null, category = null } = {}) => {
    const riskId = await rpc('triage_risk_submission', {
      p_id: id, p_action: action, p_note: note, p_owner: owner, p_title: title, p_category: category,
    })
    await fetchOne()
    return riskId
  }

  return { item, loading, update, withdraw, triage, refetch: fetchOne }
}

/** The submission a risk came from, for the "Raised through SUB-…" line. Null when unreadable. */
export function useSubmissionForRisk(riskId) {
  const { organization } = useAuth()
  const [item, setItem] = useState(null)
  useEffect(() => {
    let live = true
    if (!organization?.id || !riskId) { setItem(null); return undefined }
    supabase.from('risk_submissions').select('id, ref, submitted_by, submitted_at')
      .eq('org_id', organization.id).eq('risk_id', riskId).maybeSingle()
      .then(({ data }) => { if (live) setItem(data || null) })
    return () => { live = false }
  }, [organization?.id, riskId])
  return item
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export const DEFAULT_RISK_SETTINGS = { assessment_sla_days: 30, acceptance_decision_days: 14 }

export function useRiskSettings() {
  const { organization } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_RISK_SETTINGS)
  const [loading, setLoading] = useState(true)

  const fetchOne = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase.from('risk_settings').select('*').eq('org_id', organization.id).maybeSingle()
    setSettings(data || DEFAULT_RISK_SETTINGS)
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchOne() }, [fetchOne])

  const save = async (assessmentDays, decisionDays) => {
    await rpc('set_risk_settings', { p_org: organization.id, p_assessment_days: assessmentDays, p_decision_days: decisionDays })
    await fetchOne()
  }

  return { settings, loading, save, refetch: fetchOne }
}

/* ── Assessment deadline ──────────────────────────────────────────────────── */

export async function extendRiskAssessment(riskId, due, reason) {
  await rpc('extend_risk_assessment', { p_risk: riskId, p_due: due, p_reason: reason })
}

/* ── Acceptance ───────────────────────────────────────────────────────────── */

/** The database's own reading of what an acceptance of this risk needs. */
export async function fetchAcceptanceTerms(riskId) {
  const { data, error } = await supabase.rpc('risk_acceptance_terms', { p_risk: riskId })
  if (error) return null
  return Array.isArray(data) ? data[0] || null : data
}

export const requestRiskAcceptance = (riskId, values) =>
  rpc('request_risk_acceptance', { p_risk: riskId, p_data: values })

export const reviewRiskAcceptance = (id, outcome, note) =>
  rpc('review_risk_acceptance', { p_id: id, p_outcome: outcome, p_note: note })

export const decideRiskAcceptance = (id, decision, comment, conditions = null) =>
  rpc('decide_risk_acceptance', { p_id: id, p_decision: decision, p_comment: comment || null, p_conditions: conditions || null })

/* ── Oversight ────────────────────────────────────────────────────────────── */

/**
 * What the risk overview needs in one load: the risks the person can read
 * (all of them for a risk manager, their own otherwise), every acceptance in
 * the workspace and the raised risks they can see.
 */
export function useErmOverview() {
  const { organization } = useAuth()
  const [data, setData] = useState({ risks: [], acceptances: [], submissions: [] })
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const [r, a, s] = await Promise.all([
      supabase.from('risks').select('*').eq('org_id', organization.id).order('inherent_score', { ascending: false }),
      supabase.from('risk_exceptions').select('*, risk:risks(id, risk_id, title, owner_id)').eq('org_id', organization.id)
        .order('created_at', { ascending: false }),
      supabase.from('risk_submissions').select('id, ref, title, status, urgent, submitted_by, submitted_at, risk_id')
        .eq('org_id', organization.id).order('submitted_at', { ascending: true }),
    ])
    setData({ risks: r.data || [], acceptances: a.data || [], submissions: s.data || [] })
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])
  return { ...data, loading, refetch: fetchAll }
}

/** Raised risks waiting for triage, for the sidebar badge. */
export function useTriageCount(enabled = true) {
  const { organization } = useAuth()
  const [count, setCount] = useState(0)
  const fetchCount = useCallback(async () => {
    if (!enabled || !organization?.id) { setCount(0); return }
    const { count: n } = await supabase.from('risk_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', organization.id).eq('status', 'submitted')
    setCount(n || 0)
  }, [enabled, organization?.id])
  useEffect(() => { fetchCount() }, [fetchCount])
  return { count, refetch: fetchCount }
}
