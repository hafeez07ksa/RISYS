import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { localISO } from '@/lib/manualCompliance'

// ── FRAMEWORK REGISTRY ────────────────────────────────────────────────────────
export const FRAMEWORKS = [
  {
    id: 'NCA ECC',
    label: 'NCA ECC',
    fullName: 'Essential Cybersecurity Controls',
    version: 'ECC-2:2024',
    table: 'nca_ecc',
    color: '#5D0F0F',
    bg: '#fdf5f5',
    tag: 'Critical Sector',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
  {
    id: 'SAMA CSF',
    label: 'SAMA CSF',
    fullName: 'Cybersecurity Framework',
    version: 'v1.0',
    table: 'sama_csf',
    color: '#1e40af',
    bg: '#eff6ff',
    tag: 'Financial Sector',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'subdomain',        // SAMA CSF groups by subdomain (3.1.1, 3.1.2 etc.)
    scoreAllControls: true,      // Score every row, not just Main Controls
  },
  {
    id: 'SDAIA PDPL',
    label: 'SDAIA PDPL',
    fullName: 'Personal Data Protection Law',
    version: 'PDPL-IR:2023',
    table: 'sdaia_pdpl',
    color: '#166534',
    bg: '#f0fdf4',
    tag: 'Data Privacy',
    requirementKey: 'clause_id',
    textKey: 'clause_text',
    groupBy: 'article',
  },
  {
    id: 'NCA CCC',
    label: 'NCA CCC',
    fullName: 'Cloud Cybersecurity Controls',
    version: 'CCC-1:2020',
    table: 'nca_ccc',
    color: '#6d28d9',
    bg: '#f5f3ff',
    tag: 'Cloud',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
  {
    id: 'NCA DCC',
    label: 'NCA DCC',
    fullName: 'Data Cybersecurity Controls',
    version: 'DCC-1:2022',
    table: 'nca_dcc',
    color: '#92400e',
    bg: '#fffbeb',
    tag: 'Data',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
  {
    id: 'NCA TCC',
    label: 'NCA TCC',
    fullName: 'Telework Cybersecurity Controls',
    version: 'TCC-1:2021',
    table: 'nca_tcc',
    color: '#0e7490',
    bg: '#ecfeff',
    tag: 'Telework',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
  {
    id: 'NCA CSCC',
    label: 'NCA CSCC',
    fullName: 'Cybersecurity Controls for Communication Sector',
    version: 'CSCC-1:2021',
    table: 'nca_cscc',
    color: '#be185d',
    bg: '#fdf2f8',
    tag: 'Telecom',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
  {
    id: 'NCA NCNICC',
    label: 'NCA NCNICC',
    fullName: 'Non-CNI Private Sector Controls',
    version: 'NCNICC-1:2024',
    table: 'nca_ncnicc',
    color: '#b45309',
    bg: '#fffbeb',
    tag: 'Private Sector',
    requirementKey: 'control_id',
    textKey: 'control_text',
    groupBy: 'domain',
  },
]

export const getFramework = (id) => FRAMEWORKS.find(f => f.id === id)

// ── ACTIVE SCOPE ──────────────────────────────────────────────────────────────
// Only NCA ECC is being implemented. The Compliance section works against the
// primary framework; everything else lives in the read-only Frameworks library
// until it is brought into scope.
export const PRIMARY_FRAMEWORK_ID = 'NCA ECC'

export const PRIMARY_FRAMEWORKS   = FRAMEWORKS.filter(f => f.id === PRIMARY_FRAMEWORK_ID)
export const SECONDARY_FRAMEWORKS = FRAMEWORKS.filter(f => f.id !== PRIMARY_FRAMEWORK_ID)

export const isPrimaryFramework = (id) => id === PRIMARY_FRAMEWORK_ID

// ── COMPLIANCE STATUS HELPERS ─────────────────────────────────────────────────
export const STATUS_CONFIG = {
  compliant:      { label: 'Compliant',      color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  partial:        { label: 'Partial',         color: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '#eab308' },
  not_compliant:  { label: 'Non-Compliant',   color: '#991b1b', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
  in_progress:    { label: 'In Progress',     color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
  not_applicable: { label: 'N/A',             color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', dot: '#9ca3af' },
  not_started:    { label: 'Not Started',     color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', dot: '#d1d5db' },
}

export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({ value, ...cfg }))

// ── HOOK: load framework requirements from DB ─────────────────────────────────
export function useFrameworkRequirements(frameworkId) {
  const [requirements, setRequirements] = useState([])
  const [loading, setLoading] = useState(false)

  const fw = getFramework(frameworkId)

  const fetch = useCallback(async () => {
    if (!fw) return
    setLoading(true)
    const { data, error } = await supabase.from(fw.table).select('*').order('id')
    if (!error) setRequirements(data || [])
    setLoading(false)
  }, [fw?.table])

  useEffect(() => { fetch() }, [fetch])

  return { requirements, loading, refetch: fetch }
}

// ── HOOK: org compliance statuses for a framework ─────────────────────────────
export function useComplianceStatuses(frameworkId) {
  const { organization, user } = useAuth()
  const [statuses, setStatuses] = useState({}) // keyed by requirement_id
  const [loading, setLoading] = useState(false)

  const fetchStatuses = useCallback(async () => {
    if (!organization?.id || !frameworkId) return
    setLoading(true)
    const { data } = await supabase
      .from('compliance_statuses')
      .select('*')
      .eq('org_id', organization.id)
      .eq('framework', frameworkId)
    const map = {}
    const today = localISO()
    for (const row of (data || [])) {
      // Evidence goes stale: past its review date a compliant control reads as Partial until re-evidenced.
      const overdue = row.status === 'compliant' && row.review_due_at && String(row.review_due_at).slice(0, 10) < today
      map[row.requirement_id] = overdue ? { ...row, status: 'partial', review_overdue: true } : row
    }
    setStatuses(map)
    setLoading(false)
  }, [organization?.id, frameworkId])

  useEffect(() => { fetchStatuses() }, [fetchStatuses])

  const setStatus = async (requirementId, status, notes) => {
    const existing = statuses[requirementId]
    if (existing) {
      await supabase.from('compliance_statuses')
        .update({ status, notes: notes || null, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('compliance_statuses').insert({
        org_id: organization.id,
        framework: frameworkId,
        requirement_id: requirementId,
        status,
        notes: notes || null,
        updated_by: user?.id,
      })
    }
    await fetchStatuses()
  }

  return { statuses, loading, setStatus, refetch: fetchStatuses }
}

// ── HOOK: evidenced compliance for a manual-evidence requirement ──────────────
//
// Every Comply appends a compliance_evidence row — the history is the audit
// trail — then marks the status compliant, pointing at that row and carrying
// its review date. Files live in a private bucket and are read through
// short-lived signed links.
const EVIDENCE_BUCKET = 'compliance-evidence'

export function useComplianceEvidence(frameworkId, requirementId) {
  const { organization, user } = useAuth()
  const [history, setHistory] = useState([])
  const [loadedKey, setLoadedKey] = useState(null)
  const [migrated, setMigrated] = useState(true)
  const key = `${organization?.id}|${frameworkId}|${requirementId}`

  const fetchEvidence = useCallback(async () => {
    if (!organization?.id || !frameworkId || !requirementId) return
    const { data, error } = await supabase
      .from('compliance_evidence')
      .select('*')
      .eq('org_id', organization.id)
      .eq('framework', frameworkId)
      .eq('requirement_id', requirementId)
      .order('submitted_at', { ascending: false })
      .limit(20)
    setMigrated(!error)
    setHistory(error ? [] : (data || []))
    setLoadedKey(`${organization.id}|${frameworkId}|${requirementId}`)
  }, [organization?.id, frameworkId, requirementId])

  useEffect(() => { fetchEvidence() }, [fetchEvidence])

  const uploadFile = async (file) => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fw = String(frameworkId).replace(/[^a-zA-Z0-9]/g, '_')
    const path = `${organization.id}/${fw}/${requirementId}/${Date.now()}_${safe}`
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { upsert: false })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    return { path, name: file.name, size: file.size, type: file.type || null, uploaded_at: new Date().toISOString() }
  }

  const signedUrl = async (path) => {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 300)
    if (error) throw new Error(`Could not open the file: ${error.message}`)
    return data.signedUrl
  }

  const comply = async ({ answers, files, nextReviewDate, summary }) => {
    const { data: evidence, error } = await supabase.from('compliance_evidence').insert({
      org_id: organization.id,
      framework: frameworkId,
      requirement_id: requirementId,
      answers,
      files,
      next_review_date: nextReviewDate || null,
      submitted_by: user?.id,
    }).select().single()
    if (error) throw new Error(`Could not save the evidence: ${error.message}`)

    const status = {
      status: 'compliant',
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
      review_due_at: nextReviewDate || null,
      evidence_id: evidence.id,
    }
    const { data: existing } = await supabase.from('compliance_statuses').select('id')
      .eq('org_id', organization.id).eq('framework', frameworkId).eq('requirement_id', requirementId)
      .maybeSingle()
    const { error: statusError } = existing
      ? await supabase.from('compliance_statuses').update(status).eq('id', existing.id)
      : await supabase.from('compliance_statuses').insert({
          ...status, org_id: organization.id, framework: frameworkId, requirement_id: requirementId, notes: summary || null,
        })
    if (statusError) throw new Error(`Evidence saved, but the status could not be updated: ${statusError.message}`)

    await fetchEvidence()
    return evidence
  }

  return {
    history,
    latest: history[0] || null,
    loaded: loadedKey === key,
    migrated,
    uploadFile,
    signedUrl,
    comply,
    refetch: fetchEvidence,
  }
}

// ── HOOK: control→framework mappings for an org ───────────────────────────────
export function useFrameworkMappings(frameworkId) {
  const { organization, user } = useAuth()
  const [mappings, setMappings] = useState([]) // array of {id, control_id, requirement_id, notes}
  const [controls, setControls] = useState([]) // org controls (for the picker)
  const [loading, setLoading] = useState(false)

  const fetchMappings = useCallback(async () => {
    if (!organization?.id || !frameworkId) return
    setLoading(true)
    const [{ data: maps }, { data: ctrls }] = await Promise.all([
      supabase.from('control_framework_mappings')
        .select('*')
        .eq('org_id', organization.id)
        .eq('framework', frameworkId),
      supabase.from('risk_controls')
        .select('id, name, control_id, control_type, testing_status, effectiveness')
        .eq('org_id', organization.id)
        .eq('status', 'active')
        .order('name'),
    ])
    setMappings(maps || [])
    setControls(ctrls || [])
    setLoading(false)
  }, [organization?.id, frameworkId])

  useEffect(() => { fetchMappings() }, [fetchMappings])

  const linkControl = async (controlId, requirementId, notes) => {
    const { error } = await supabase.from('control_framework_mappings').upsert({
      org_id: organization.id,
      framework: frameworkId,
      control_id: controlId,
      requirement_id: requirementId,
      notes: notes || null,
      created_by: user?.id,
    }, { onConflict: 'org_id,control_id,framework,requirement_id' })
    if (error) throw error
    await fetchMappings()
  }

  const unlinkControl = async (mappingId) => {
    await supabase.from('control_framework_mappings').delete().eq('id', mappingId)
    await fetchMappings()
  }

  // Returns mapping rows for a specific requirement
  const mappingsFor = (requirementId) => mappings.filter(m => m.requirement_id === requirementId)

  // Returns control objects for a specific requirement
  const controlsFor = (requirementId) => {
    const ids = mappingsFor(requirementId).map(m => m.control_id)
    return controls.filter(c => ids.includes(c.id))
  }

  return { mappings, controls, loading, linkControl, unlinkControl, mappingsFor, controlsFor, refetch: fetchMappings }
}

// ── HOOK: automated signal state per requirement ──────────────────────────────
//
// Reads v_requirement_automation, which joins the signal catalogue to the
// results the connector syncs write, and rolls subcontrol signals up to their
// parent. This is what replaced the old arrangement where a finding carried a
// free-text control reference that nothing ever joined on.
//
// Returns a map keyed by requirement_id:
//   { automated_status, signal_count, pass_count, fail_count,
//     unknown_count, last_computed_at, signals: [...] }
export function useRequirementAutomation(frameworkId) {
  const { organization } = useAuth()
  const [automation, setAutomation] = useState({})
  const [loading, setLoading] = useState(false)

  const fetchAutomation = useCallback(async () => {
    if (!organization?.id || !frameworkId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('v_requirement_automation')
      .select('*')
      .eq('org_id', organization.id)
      .eq('framework', frameworkId)
    const map = {}
    if (!error) for (const row of (data || [])) map[row.requirement_id] = row
    setAutomation(map)
    setLoading(false)
  }, [organization?.id, frameworkId])

  useEffect(() => { fetchAutomation() }, [fetchAutomation])

  return { automation, loading, refetch: fetchAutomation }
}

// Is this requirement covered by at least one signal that has actually run?
export function isAutomated(auto) {
  return !!auto && auto.signal_count > 0
}
export function hasAutomatedResult(auto) {
  return isAutomated(auto) && auto.automated_status !== 'not_started'
}

// ── REQUIREMENT ORDERING ──────────────────────────────────────────────────────
//
// Requirement ids are dotted paths, so they must be compared segment by segment
// as numbers. Lexical comparison puts 1-5-10 before 1-5-2, and — the bug this
// replaced — ordering by the table's surrogate key puts every subcontrol after
// every main control, so 1-5-3-1 lands below 1-5-4 instead of under 1-5-3.
//
// Comparing numerically also nests for free: 1-5-3-1 sorts immediately after
// 1-5-3 because it shares the prefix and has one more segment.
export function compareRequirementIds(a, b) {
  const pa = String(a ?? '').split('-').map(Number)
  const pb = String(b ?? '').split('-').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : -1
    const y = Number.isFinite(pb[i]) ? pb[i] : -1
    if (x !== y) return x - y
  }
  return 0
}

// Sort requirement rows into the order they appear in the published document.
export function sortRequirements(rows, fw) {
  const idKey = fw?.requirementKey || 'control_id'
  return [...rows].sort((a, b) =>
    compareRequirementIds(a[idKey] ?? a.clause_id, b[idKey] ?? b.clause_id))
}

// ── SUB-CONTROL DETECTION ─────────────────────────────────────────────────────// SAMA CSF uses "Sub Control" (no hyphen); all other NCA frameworks use "Sub-Control"
export function isSubControl(req) {
  const t = (req.control_type || '').toLowerCase().replace(/[\s-]/g, '')
  return t === 'subcontrol'
}

// ── SCORING HELPER ────────────────────────────────────────────────────────────
//
// Precedence, highest first:
//   1. Manual override in compliance_statuses — a human has made a call
//   2. Automated signal state — measured from connector data
//   3. Mapped risk_controls with test results — manually maintained
//   4. not_started
//
// Automated sits below the manual override deliberately: an assessor must be
// able to record a justified position that contradicts the measurement. Where
// that happens, `isOverridingEvidence` below flags it so the disagreement is
// visible rather than silent.
export function computeEffectiveStatus(statusOverride, mappedControls, auto) {
  // Manual override always wins — including 'not_started' if explicitly set
  // statusOverride is null/undefined only when no row exists in compliance_statuses
  if (statusOverride !== null && statusOverride !== undefined) return statusOverride

  // Automated signals, where at least one has produced a result
  if (hasAutomatedResult(auto)) return auto.automated_status

  // No manual override set → auto-compute from mapped controls
  if (!mappedControls || mappedControls.length === 0) return 'not_started'

  const passing = mappedControls.filter(c => c.testing_status === 'Pass').length
  const failing = mappedControls.filter(c => c.testing_status === 'Fail').length
  const total   = mappedControls.length

  if (failing > 0) return 'partial'
  if (passing === total) return 'compliant'
  if (passing > 0) return 'partial'
  return 'in_progress' // controls mapped but none tested
}

// True when a human status has been set that disagrees with what the
// connectors measured. Surface this in the UI — a manual "Compliant" sitting
// on top of a failing signal is exactly what an auditor will ask about.
export function isOverridingEvidence(statusOverride, auto) {
  if (statusOverride === null || statusOverride === undefined) return false
  if (!hasAutomatedResult(auto)) return false
  return statusOverride !== auto.automated_status
}

// ── FRAMEWORK SCORE ───────────────────────────────────────────────────────────
export function computeFrameworkScore(requirements, statuses, mappings, controls, fw, automation = {}) {
  let compliant = 0, partial = 0, notCompliant = 0, notStarted = 0, na = 0, inProgress = 0
  let automated = 0, automatedWithResult = 0

  // If framework scores all controls (e.g. SAMA CSF), include sub-controls
  const scoreAll = fw?.scoreAllControls
  const scoreable = scoreAll ? requirements : requirements.filter(r => !isSubControl(r))
  const total = scoreable.length || requirements.length

  for (const req of scoreable) {
    const reqId = req.control_id || req.clause_id
    const override = statuses[reqId]?.status
    const mapped = controls.filter(c => mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id).includes(c.id))
    const auto = automation[reqId]
    const status = computeEffectiveStatus(override, mapped, auto)

    if (isAutomated(auto))        automated++
    if (hasAutomatedResult(auto)) automatedWithResult++

    if (status === 'compliant')       compliant++
    else if (status === 'partial')    partial++
    else if (status === 'not_compliant')  notCompliant++
    else if (status === 'in_progress')    inProgress++
    else if (status === 'not_applicable') na++
    else notStarted++
  }

  const applicable = total - na
  const score = applicable > 0 ? Math.round(((compliant + partial * 0.5) / applicable) * 100) : 0

  return {
    total, compliant, partial, notCompliant, inProgress, na, notStarted, score,
    // How much of the framework RISYS can measure rather than assert
    automated,
    automatedWithResult,
    automationCoverage: total > 0 ? Math.round((automated / total) * 100) : 0,
  }
}
