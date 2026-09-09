import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

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
    for (const row of (data || [])) map[row.requirement_id] = row
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

// ── SUB-CONTROL DETECTION ─────────────────────────────────────────────────────
// SAMA CSF uses "Sub Control" (no hyphen); all other NCA frameworks use "Sub-Control"
export function isSubControl(req) {
  const t = (req.control_type || '').toLowerCase().replace(/[\s-]/g, '')
  return t === 'subcontrol'
}

// ── SCORING HELPER ────────────────────────────────────────────────────────────
// Given a status override and mapped controls, compute effective status
export function computeEffectiveStatus(statusOverride, mappedControls) {
  // Manual override always wins — including 'not_started' if explicitly set
  // statusOverride is null/undefined only when no row exists in compliance_statuses
  if (statusOverride !== null && statusOverride !== undefined) return statusOverride

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

// ── FRAMEWORK SCORE ───────────────────────────────────────────────────────────
export function computeFrameworkScore(requirements, statuses, mappings, controls, fw) {
  let compliant = 0, partial = 0, notCompliant = 0, notStarted = 0, na = 0, inProgress = 0

  // If framework scores all controls (e.g. SAMA CSF), include sub-controls
  const scoreAll = fw?.scoreAllControls
  const scoreable = scoreAll ? requirements : requirements.filter(r => !isSubControl(r))
  const total = scoreable.length || requirements.length

  for (const req of scoreable) {
    const reqId = req.control_id || req.clause_id
    const override = statuses[reqId]?.status
    const mapped = controls.filter(c => mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id).includes(c.id))
    const status = computeEffectiveStatus(override, mapped)

    if (status === 'compliant')       compliant++
    else if (status === 'partial')    partial++
    else if (status === 'not_compliant')  notCompliant++
    else if (status === 'in_progress')    inProgress++
    else if (status === 'not_applicable') na++
    else notStarted++
  }

  const applicable = total - na
  const score = applicable > 0 ? Math.round(((compliant + partial * 0.5) / applicable) * 100) : 0

  return { total, compliant, partial, notCompliant, inProgress, na, notStarted, score }
}
