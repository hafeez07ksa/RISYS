import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

// ── CONTROL LIBRARY ───────────────────────────────────────────────────────────
export function useControls(filters = {}) {
  const { organization } = useAuth()
  const [controls, setControls] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchControls = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('risk_controls')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })

      if (filters.status)       query = query.eq('status', filters.status)
      if (filters.control_type) query = query.eq('control_type', filters.control_type)
      if (filters.testing_status) query = query.eq('testing_status', filters.testing_status)
      if (filters.search)       query = query.ilike('name', `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      setControls(data || [])
    } finally {
      setLoading(false)
    }
  }, [organization?.id, filters.status, filters.control_type, filters.testing_status, filters.search])

  useEffect(() => { fetchControls() }, [fetchControls])

  const createControl = async (data) => {
    const { data: ctrl, error } = await supabase
      .from('risk_controls')
      .insert({ ...data, org_id: organization.id })
      .select()
      .single()
    if (error) throw error
    await fetchControls()
    return ctrl
  }

  const updateControl = async (id, updates) => {
    const { error } = await supabase
      .from('risk_controls')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchControls()
  }

  const deleteControl = async (id) => {
    const { error } = await supabase.from('risk_controls').delete().eq('id', id)
    if (error) throw error
    await fetchControls()
  }

  return { controls, loading, createControl, updateControl, deleteControl, refetch: fetchControls }
}

// ── CONTROL TESTS ─────────────────────────────────────────────────────────────
export function useControlTestsForControl(controlId) {
  const { organization, user } = useAuth()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchTests = useCallback(async () => {
    if (!organization?.id || !controlId) return
    setLoading(true)
    const { data } = await supabase
      .from('risk_control_tests')
      .select('*')
      .eq('control_id', controlId)
      .order('test_date', { ascending: false })
    setTests(data || [])
    setLoading(false)
  }, [organization?.id, controlId])

  useEffect(() => { fetchTests() }, [fetchTests])

  const logTest = async (data) => {
    const { error } = await supabase.from('risk_control_tests').insert({
      ...data,
      org_id: organization.id,
      control_id: controlId,
      tested_by: user?.id,
    })
    if (error) throw new Error(error.message)
    await fetchTests()
  }

  return { tests, loading, logTest, refetch: fetchTests }
}

// ── EVIDENCE FOR A CONTROL ────────────────────────────────────────────────────
export function useControlEvidence(controlId) {
  const { organization, user } = useAuth()
  const [evidence, setEvidence] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchEvidence = useCallback(async () => {
    if (!organization?.id || !controlId) return
    setLoading(true)
    const { data } = await supabase
      .from('risk_evidence')
      .select('*')
      .eq('control_id', controlId)
      .eq('org_id', organization.id)
      .order('collected_at', { ascending: false })
    setEvidence(data || [])
    setLoading(false)
  }, [organization?.id, controlId])

  useEffect(() => { fetchEvidence() }, [fetchEvidence])

  const addEvidence = async (data, file) => {
    let fileUrl = null, fileName = null, fileSize = null
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${organization.id}/control-evidence/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('risk-evidence')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      const { data: urlData } = supabase.storage.from('risk-evidence').getPublicUrl(path)
      fileUrl  = urlData.publicUrl
      fileName = file.name
      fileSize = file.size
    }
    const { error } = await supabase.from('risk_evidence').insert({
      ...data,
      org_id: organization.id,
      control_id: controlId,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      collected_by: user?.id,
    })
    if (error) throw new Error(error.message)
    await fetchEvidence()
  }

  const deleteEvidence = async (id) => {
    await supabase.from('risk_evidence').delete().eq('id', id)
    await fetchEvidence()
  }

  return { evidence, loading, addEvidence, deleteEvidence, refetch: fetchEvidence }
}

// ── RISKS LINKED TO A CONTROL ─────────────────────────────────────────────────
export function useControlRiskMappings(controlId) {
  const { organization } = useAuth()
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRisks = useCallback(async () => {
    if (!organization?.id || !controlId) return
    setLoading(true)
    const { data: mappings } = await supabase
      .from('risk_control_mappings')
      .select('risk_id')
      .eq('control_id', controlId)
    const ids = (mappings || []).map(m => m.risk_id)
    if (ids.length === 0) { setRisks([]); setLoading(false); return }
    const { data: riskData } = await supabase
      .from('risks')
      .select('id, title, risk_id, inherent_score, residual_score, status, workflow_state')
      .in('id', ids)
    setRisks(riskData || [])
    setLoading(false)
  }, [organization?.id, controlId])

  useEffect(() => { fetchRisks() }, [fetchRisks])

  return { risks, loading, refetch: fetchRisks }
}

// ── CONTROL CONSTANTS ─────────────────────────────────────────────────────────
export const CONTROL_TYPES = ['Preventive', 'Detective', 'Corrective', 'Compensating']
export const CONTROL_FREQUENCIES = ['Continuous', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Ad-hoc']
export const TESTING_STATUSES = ['Not Tested', 'Pass', 'Fail', 'Partial']
export const CONTROL_STATUSES = ['active', 'inactive', 'under_review']

export function getTestingStatusStyle(status) {
  switch (status) {
    case 'Pass':    return { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }
    case 'Fail':    return { color: '#991b1b', bg: '#fef2f2', border: '#fecaca' }
    case 'Partial': return { color: '#92400e', bg: '#fffbeb', border: '#fde68a' }
    default:        return { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' }
  }
}

export function getEffectivenessLabel(n) {
  const labels = { 1: 'Very Low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very High' }
  return labels[n] || 'Unknown'
}

export function getControlTypeStyle(type) {
  switch (type) {
    case 'Preventive':   return { color: '#1e40af', bg: '#eff6ff' }
    case 'Detective':    return { color: '#6b21a8', bg: '#faf5ff' }
    case 'Corrective':   return { color: '#92400e', bg: '#fffbeb' }
    case 'Compensating': return { color: '#166534', bg: '#f0fdf4' }
    default:             return { color: '#6b7280', bg: '#f9fafb' }
  }
}
