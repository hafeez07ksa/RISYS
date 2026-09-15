import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { logAudit, AUDIT } from '@/lib/audit'
import { uploadEvidenceFile, deleteEvidenceRecord } from '@/lib/evidence'

// ── RISKS ─────────────────────────────────────────────────────────────────────
export function useRisks(filters = {}) {
  const { organization } = useAuth()
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRisks = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    let query = supabase
      .from('risks')
      .select('*')
      .eq('org_id', organization.id)
      .order('inherent_score', { ascending: false })
    if (filters.status)         query = query.eq('status', filters.status)
    if (filters.category)       query = query.eq('category', filters.category)
    if (filters.workflow_state) query = query.eq('workflow_state', filters.workflow_state)
    if (filters.search)         query = query.ilike('title', `%${filters.search}%`)
    const { data, error } = await query
    if (!error) setRisks(data || [])
    setLoading(false)
  }, [organization?.id, filters.status, filters.category, filters.workflow_state, filters.search])

  useEffect(() => { fetchRisks() }, [fetchRisks])

  const createRisk = async (data) => {
    // Strip generated columns — Postgres computes these automatically
    const { risk_score, inherent_score, residual_score, ...cleanData } = data
    const payload = {
      ...cleanData,
      org_id: organization.id,
      inherent_likelihood: data.inherent_likelihood || data.likelihood || 3,
      inherent_impact:     data.inherent_impact     || data.impact     || 3,
      likelihood:          data.inherent_likelihood || data.likelihood || 3,
      impact:              data.inherent_impact     || data.impact     || 3,
      residual_likelihood: data.residual_likelihood || null,
      residual_impact:     data.residual_impact     || null,
    }
    const { data: risk, error } = await supabase.from('risks').insert(payload).select().single()
    if (error) throw error
    // Audit log entry is written automatically by DB trigger
    await fetchRisks()
    return risk
  }

  const updateRisk = async (id, updates, performedBy) => {
    const { risk_score, inherent_score, residual_score, ...cleanUpdates } = updates
    const payload = { ...cleanUpdates, updated_at: new Date().toISOString() }
    if (updates.inherent_likelihood || updates.inherent_impact) {
      const risk = risks.find(r => r.id === id)
      payload.likelihood = updates.inherent_likelihood || risk?.inherent_likelihood || 3
      payload.impact     = updates.inherent_impact     || risk?.inherent_impact     || 3
    }
    const { error } = await supabase.from('risks').update(payload).eq('id', id)
    if (error) throw error
    // Field-level changes are audited automatically by DB trigger
    await fetchRisks()
  }

  const deleteRisk = async (id) => {
    await supabase.from('risks').delete().eq('id', id)
    await fetchRisks()
  }

  return { risks, loading, createRisk, updateRisk, deleteRisk, refetch: fetchRisks }
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────
export function useRiskControls(riskId) {
  const { organization } = useAuth()
  const [controls, setControls]       = useState([])
  const [allControls, setAllControls] = useState([])
  const [mappings, setMappings]       = useState([])
  const [loading, setLoading]         = useState(true)

  const fetchControls = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    try {
      const { data: all, error: allErr } = await supabase
        .from('risk_controls')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })
      if (allErr) throw allErr
      setAllControls(all || [])

      if (riskId) {
        // The full mapping row, not just the id — coverage scope and
        // what the control reduces live on the LINK, and the gate reads
        // them from here.
        const { data: mappings } = await supabase
          .from('risk_control_mappings')
          .select('*')
          .eq('risk_id', riskId)
        const ids = (mappings || []).map(m => m.control_id)
        setMappings(mappings || [])
        setControls((all || []).filter(c => ids.includes(c.id)))
      } else {
        setMappings([])
        setControls([])
      }
    } finally {
      setLoading(false)
    }
  }, [organization?.id, riskId])

  useEffect(() => { fetchControls() }, [fetchControls])

  const createControl = async (data) => {
    const { data: ctrl, error } = await supabase
      .from('risk_controls')
      .insert({ ...data, org_id: organization.id })
      .select().single()
    if (error) throw error
    if (riskId) {
      const { error: mapErr } = await supabase
        .from('risk_control_mappings')
        .insert({ risk_id: riskId, control_id: ctrl.id, org_id: organization.id })
      if (mapErr) throw mapErr
    }
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

  const linkControl = async (controlId, attrs = {}) => {
    const { error } = await supabase
      .from('risk_control_mappings')
      .upsert({
        risk_id: riskId, control_id: controlId, org_id: organization.id,
        coverage: attrs.coverage || 'full',
        coverage_note: attrs.coverage_note || null,
        reduces: attrs.reduces || 'both',
      }, { onConflict: 'risk_id,control_id' })
    if (error) throw error
    await fetchControls()
  }

  /**
   * Coverage and what the control reduces are properties of this link,
   * not of the control. The same control can fully cover one risk and
   * miss another entirely — which is exactly the gap a register has to
   * be able to show.
   */
  const updateMapping = async (controlId, attrs) => {
    const { error } = await supabase
      .from('risk_control_mappings')
      .update(attrs)
      .eq('risk_id', riskId)
      .eq('control_id', controlId)
    if (error) throw error
    await fetchControls()
  }

  const unlinkControl = async (controlId) => {
    await supabase.from('risk_control_mappings').delete().eq('risk_id', riskId).eq('control_id', controlId)
    await fetchControls()
  }

  const mappingFor = (controlId) => mappings.find(m => m.control_id === controlId) || null

  return {
    controls, allControls, mappings, loading,
    createControl, updateControl, linkControl, updateMapping, unlinkControl, mappingFor,
    refetch: fetchControls,
  }
}

// ── EVIDENCE ──────────────────────────────────────────────────────────────────
export function useRiskEvidence(riskId, controlId) {
  const { organization } = useAuth()
  const [evidence, setEvidence] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetchEvidence = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('risk_evidence')
        .select('*')
        .eq('org_id', organization.id)
        .order('collected_at', { ascending: false })
      if (riskId)    query = query.eq('risk_id', riskId)
      if (controlId) query = query.eq('control_id', controlId)
      const { data, error } = await query
      if (error) throw error
      setEvidence(data || [])
    } finally {
      setLoading(false)
    }
  }, [organization?.id, riskId, controlId])

  useEffect(() => { fetchEvidence() }, [fetchEvidence])

  const addEvidence = async (data, file) => {
    // V1: store the private object path, never a public URL
    const fileInfo = file
      ? await uploadEvidenceFile(organization.id, 'evidence', file)
      : { file_path: null, file_name: null, file_size: null }

    const payload = {
      ...data,
      org_id:     organization.id,
      risk_id:    riskId    || null,
      control_id: controlId || null,
      file_url:   null,
      ...fileInfo,
    }

    const { data: ev, error } = await supabase
      .from('risk_evidence')
      .insert(payload)
      .select().single()
    if (error) throw new Error(`Failed to save evidence: ${error.message}`)
    await fetchEvidence()
    return ev
  }

  const deleteEvidence = async (id) => {
    await deleteEvidenceRecord(id)
    await fetchEvidence()
  }

  return { evidence, loading, addEvidence, deleteEvidence, refetch: fetchEvidence }
}

// ── KRIs ──────────────────────────────────────────────────────────────────────
export function useRiskKRIs(riskId) {
  const { organization } = useAuth()
  const [kris, setKRIs]   = useState([])
  const [loading, setLoading] = useState(false)

  const fetchKRIs = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_kris')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at')
    if (!error) setKRIs(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchKRIs() }, [fetchKRIs])

  function computeRAG(data) {
    const v = parseFloat(data.current_value)
    if (isNaN(v)) return 'Green'
    if (data.red_threshold   && v > parseFloat(data.red_threshold))   return 'Red'
    if (data.amber_threshold && v > parseFloat(data.amber_threshold)) return 'Amber'
    return 'Green'
  }

  const createKRI = async (data) => {
    const rag = data.current_value !== undefined && data.current_value !== '' ? computeRAG(data) : 'Green'
    const { data: kri, error } = await supabase
      .from('risk_kris')
      .insert({ ...data, org_id: organization.id, risk_id: riskId, rag_status: rag })
      .select().single()
    if (error) throw new Error(`Failed to create KRI: ${error.message}`)
    await fetchKRIs()
    return kri
  }

  const updateKRI = async (id, updates) => {
    const rag = updates.current_value !== undefined ? computeRAG(updates) : undefined
    const { error } = await supabase
      .from('risk_kris')
      .update({ ...updates, ...(rag ? { rag_status: rag } : {}), last_updated: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchKRIs()
  }

  const deleteKRI = async (id) => {
    await supabase.from('risk_kris').delete().eq('id', id)
    await fetchKRIs()
  }

  return { kris, loading, createKRI, updateKRI, deleteKRI, refetch: fetchKRIs }
}

// ── LOSS EVENTS ───────────────────────────────────────────────────────────────
export function useRiskLossEvents(riskId) {
  const { organization } = useAuth()
  const [lossEvents, setLossEvents] = useState([])
  const [loading, setLoading]       = useState(false)

  const fetchLossEvents = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    let query = supabase
      .from('risk_loss_events')
      .select('*')
      .eq('org_id', organization.id)
      .order('event_date', { ascending: false })
    if (riskId) query = query.eq('risk_id', riskId)
    const { data, error } = await query
    if (!error) setLossEvents(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchLossEvents() }, [fetchLossEvents])

  const createLossEvent = async (data) => {
    const { data: ev, error } = await supabase
      .from('risk_loss_events')
      .insert({ ...data, org_id: organization.id, risk_id: riskId })
      .select().single()
    if (error) throw new Error(`Failed to log loss event: ${error.message}`)
    await fetchLossEvents()
    return ev
  }

  const updateLossEvent = async (id, updates) => {
    const { error } = await supabase
      .from('risk_loss_events')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchLossEvents()
  }

  return { lossEvents, loading, createLossEvent, updateLossEvent, refetch: fetchLossEvents }
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
export function useRiskAuditLog(riskId) {
  const { organization } = useAuth()
  const [auditLog, setAuditLog] = useState([])

  useEffect(() => {
    if (!organization?.id || !riskId) return
    supabase
      .from('risk_audit_log')
      .select('*')
      .eq('risk_id', riskId)
      .order('performed_at', { ascending: false })
      .then(({ data }) => setAuditLog(data || []))
  }, [organization?.id, riskId])

  return { auditLog }
}

// ════════════════════════════════════════════════════════════
// ARCHER PARITY HOOKS
// ════════════════════════════════════════════════════════════

// In-app notification helper (best-effort, never blocks the main action)
export async function notify(orgId, userId, { type = 'info', title, body, link }) {
  if (!orgId || !userId) return
  try {
    await supabase.from('notifications').insert({ org_id: orgId, user_id: userId, type, title, body, link })
  } catch { /* non-blocking */ }
}

// ── WORKFLOW ENGINE ───────────────────────────────────────────
// Enforced transitions: draft → under_review → approved → closed
// Every transition is recorded in risk_workflow_history and the
// relevant party is notified.
export function useRiskCollaborators(riskId) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCollaborators = useCallback(async () => {
    if (!riskId) { setLoading(false); return }
    const { data } = await supabase
      .from('risk_collaborators')
      .select('id, user_id, created_at, added_by')
      .eq('risk_id', riskId)
      .order('created_at')
    setCollaborators(data || [])
    setLoading(false)
  }, [riskId])

  useEffect(() => { fetchCollaborators() }, [fetchCollaborators])

  const addCollaborator = async (userId, orgId) => {
    const { error } = await supabase.from('risk_collaborators')
      .insert({ risk_id: riskId, user_id: userId, org_id: orgId })
    if (error) throw error
    await fetchCollaborators()
  }

  const removeCollaborator = async (id) => {
    const { error } = await supabase.from('risk_collaborators').delete().eq('id', id)
    if (error) throw error
    await fetchCollaborators()
  }

  return { collaborators, loading, addCollaborator, removeCollaborator, refetch: fetchCollaborators }
}

export function useRiskWorkflow(risk, onChanged) {
  const { organization, user } = useAuth()
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!risk?.id) return
    const { data } = await supabase
      .from('risk_workflow_history')
      .select('*')
      .eq('risk_id', risk.id)
      .order('performed_at', { ascending: false })
    setHistory(data || [])
  }, [risk?.id])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const transition = async ({ action, to, comment }) => {
    setBusy(true)
    try {
      const updates = { workflow_state: to, updated_at: new Date().toISOString() }
      // Admission is the reviewer's act: it validates the record and
      // makes the risk ID permanent.
      if (action === 'admitted') {
        updates.approved_at = new Date().toISOString()
        updates.approved_by = user?.id
      }
      if (action === 'closed') {
        updates.closed_at = new Date().toISOString()
        updates.closure_reason = comment || null
        updates.status = 'closed'
      }
      if (action === 'reopened' || action === 'acceptance_revoked') {
        updates.closed_at = null
        updates.closure_reason = null
        if (risk.status === 'closed' || risk.status === 'accepted') updates.status = 'open'
      }
      if (action === 'treatment_approved') {
        updates.status = 'mitigating'
      }
      const { error } = await supabase.from('risks').update(updates).eq('id', risk.id)
      if (error) throw error

      await supabase.from('risk_workflow_history').insert({
        org_id: organization.id, risk_id: risk.id,
        from_state: risk.workflow_state, to_state: to,
        action, comment: comment || null, performed_by: user?.id,
      })

      // Audit log — map workflow action to audit constant
      const WORKFLOW_AUDIT = {
        admitted:           AUDIT.RISK_APPROVED,
        returned:           AUDIT.RISK_REJECTED,
        treatment_approved: AUDIT.RISK_STATUS,
        treatment_complete: AUDIT.RISK_STATUS,
        acceptance_revoked: AUDIT.RISK_STATUS,
        closed:             AUDIT.RISK_CLOSED,
        reopened:           AUDIT.RISK_UPDATED,
      }
      await logAudit(
        organization.id,
        WORKFLOW_AUDIT[action] || AUDIT.RISK_UPDATED,
        'risk', risk.id, risk.title,
        { from: risk.workflow_state, to, comment: comment || null }
      )

      // Notify the right party
      const ref = risk.risk_id || ''
      const link = `/app/risks/${risk.id}`
      if (action === 'admitted' && risk.owner_id) {
        await notify(organization.id, risk.owner_id, {
          type: 'workflow', title: `Admitted to register: ${ref}`,
          body: `"${risk.title}" is now on the register and ready to score.`, link,
        })
      }
      if (action === 'returned' && risk.owner_id) {
        await notify(organization.id, risk.owner_id, {
          type: 'workflow', title: `Returned to draft: ${ref}`,
          body: `"${risk.title}" was sent back${comment ? ` — ${comment}` : ''}.`, link,
        })
      }
      if (action === 'treatment_approved' && risk.assigned_to) {
        await notify(organization.id, risk.assigned_to, {
          type: 'workflow', title: `Treatment approved: ${ref}`,
          body: `"${risk.title}" is under treatment. Deliver the plan against its target residual score.`, link,
        })
      }

      await fetchHistory()
      onChanged && onChanged()
    } finally { setBusy(false) }
  }

  return { history, busy, transition, refetchHistory: fetchHistory }
}

// ── TREATMENT ACTIONS (Remediation Plans) ─────────────────────
export function useTreatmentActions(riskId) {
  const { organization, user } = useAuth()
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchActions = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('risk_treatment_actions')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
    setActions(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchActions() }, [fetchActions])

  const createAction = async (data, risk) => {
    const { data: act, error } = await supabase
      .from('risk_treatment_actions')
      .insert({ ...data, org_id: organization.id, risk_id: riskId, created_by: user?.id })
      .select().single()
    if (error) throw new Error(error.message)
    if (data.owner_id && data.owner_id !== user?.id) {
      await notify(organization.id, data.owner_id, {
        type: 'assignment', title: `Treatment action assigned: ${act.action_ref}`,
        body: `You were assigned "${act.title}"${risk?.risk_id ? ` on ${risk.risk_id}` : ''}.`,
        link: `/app/risks/${riskId}`,
      })
    }
    await fetchActions()
    return act
  }

  const updateAction = async (id, updates) => {
    const payload = { ...updates }
    if (updates.status === 'completed' && !updates.completed_at) {
      payload.completed_at = new Date().toISOString()
      payload.percent_complete = 100
    }
    const { error } = await supabase.from('risk_treatment_actions').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchActions()
  }

  // Archer-style status update: % complete + comment, logged as a record
  const addStatusUpdate = async (actionId, { percent_complete, status, comment }) => {
    const { error } = await supabase.from('risk_treatment_updates').insert({
      org_id: organization.id, action_id: actionId,
      percent_complete, status: status || null, comment: comment || null, updated_by: user?.id,
    })
    if (error) throw new Error(error.message)
    const patch = {}
    if (percent_complete !== undefined && percent_complete !== null) patch.percent_complete = percent_complete
    if (status) patch.status = status
    if (percent_complete >= 100) { patch.status = 'completed'; patch.completed_at = new Date().toISOString() }
    if (Object.keys(patch).length) {
      await supabase.from('risk_treatment_actions').update(patch).eq('id', actionId)
    }
    await fetchActions()
  }

  const fetchUpdates = async (actionId) => {
    const { data } = await supabase
      .from('risk_treatment_updates')
      .select('*')
      .eq('action_id', actionId)
      .order('created_at', { ascending: false })
    return data || []
  }

  const deleteAction = async (id) => {
    await supabase.from('risk_treatment_actions').delete().eq('id', id)
    await fetchActions()
  }

  return { actions, loading, createAction, updateAction, addStatusUpdate, fetchUpdates, deleteAction, refetch: fetchActions }
}

// ── EXCEPTION REQUESTS (Risk Acceptance with expiry) ──────────
export function useRiskExceptions(riskId) {
  const { organization, user } = useAuth()
  const [exceptions, setExceptions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchExceptions = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('risk_exceptions')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
    setExceptions(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchExceptions() }, [fetchExceptions])

  const requestException = async (data, risk) => {
    const { data: exc, error } = await supabase
      .from('risk_exceptions')
      .insert({ ...data, org_id: organization.id, risk_id: riskId, requested_by: user?.id, status: 'pending' })
      .select().single()
    if (error) throw new Error(error.message)
    if (data.approver_id) {
      await notify(organization.id, data.approver_id, {
        type: 'exception', title: `Exception approval requested: ${exc.exception_ref}`,
        body: `Risk acceptance requested${risk?.risk_id ? ` for ${risk.risk_id}` : ''} — "${risk?.title || ''}".`,
        link: `/app/risks/${riskId}`,
      })
    }
    await fetchExceptions()
    return exc
  }

  // Approve / reject / revoke. Approving marks the risk accepted;
  // expiry is enforced by the expire_risk_exceptions() DB function.
  const decideException = async (id, decision, comment, risk, authority) => {
    const patch = {
      status: decision, decision_comment: comment || null,
      decided_at: new Date().toISOString(),
    }
    if (decision === 'approved') patch.granted_at = new Date().toISOString()
    if (decision === 'approved' && authority) patch.decided_authority = authority
    const { error } = await supabase.from('risk_exceptions').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    // An approved acceptance is a decision of record: it moves the risk into
    // the Accepted lifecycle state, which the gate leaves alone until the
    // acceptance is revoked or expires. Revoking puts it back before the gate.
    if (riskId && (decision === 'approved' || (decision === 'revoked' && risk?.workflow_state === 'accepted'))) {
      const to = decision === 'approved' ? 'accepted' : 'assessed'
      const now = new Date().toISOString()
      const riskPatch = decision === 'approved'
        ? { status: 'accepted', treatment: 'accept', workflow_state: to, updated_at: now }
        : { status: 'open', workflow_state: to, updated_at: now }
      await supabase.from('risks').update(riskPatch).eq('id', riskId)
      if (risk?.workflow_state !== to) {
        await supabase.from('risk_workflow_history').insert({
          org_id: organization.id, risk_id: riskId,
          from_state: risk?.workflow_state || null, to_state: to,
          action: decision === 'approved' ? 'acceptance_approved' : 'acceptance_revoked',
          comment: comment || null, performed_by: user?.id,
        })
      }
    }
    const decidedRow = exceptions.find(e => e.id === id)
    await logAudit(organization.id, AUDIT.RISK_EXCEPTION_DECIDED, 'risk', riskId, risk?.title ?? null, {
      decision, type: decidedRow?.exception_type || null, authority: authority || null, comment: comment || null,
    })
    const exc = exceptions.find(e => e.id === id)
    if (exc?.requested_by) {
      await notify(organization.id, exc.requested_by, {
        type: 'exception', title: `Exception ${decision}: ${exc.exception_ref}`,
        body: comment || `Your risk acceptance request was ${decision}.`,
        link: `/app/risks/${riskId}`,
      })
    }
    await fetchExceptions()
  }

  return { exceptions, loading, requestException, decideException, refetch: fetchExceptions }
}

// Run exception auto-expiry for the org (cheap; call on register load)
export async function runExceptionExpiry(orgId) {
  if (!orgId) return
  try { await supabase.rpc('expire_risk_exceptions', { p_org: orgId }) } catch { /* non-blocking */ }
}

// ── PERIODIC REVIEWS / RECERTIFICATION ────────────────────────
export function useRiskReviews(riskId) {
  const { organization, user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReviews = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('risk_reviews')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
    setReviews(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  // Records the review AND advances the risk's review_date
  const addReview = async ({ outcome, notes, next_review_date }) => {
    const { error } = await supabase.from('risk_reviews').insert({
      org_id: organization.id, risk_id: riskId,
      reviewed_by: user?.id, outcome, notes: notes || null,
      next_review_date: next_review_date || null,
    })
    if (error) throw new Error(error.message)
    await supabase.from('risks').update({
      last_reviewed_at: new Date().toISOString(),
      review_date: next_review_date || null,
    }).eq('id', riskId)
    await fetchReviews()
  }

  return { reviews, loading, addReview, refetch: fetchReviews }
}

// ── CONTROL TESTS (design / operating effectiveness) ──────────
export function useControlTests(controlId) {
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

  // DB trigger syncs the parent control's testing_status/effectiveness
  const logTest = async (data) => {
    const { error } = await supabase.from('risk_control_tests').insert({
      ...data, org_id: organization.id, control_id: controlId, tested_by: user?.id,
    })
    if (error) throw new Error(error.message)
    await fetchTests()
  }

  return { tests, loading, logTest, refetch: fetchTests }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
export function useNotifications() {
  const { organization, user } = useAuth()
  const [notifications, setNotifications] = useState([])

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }, [user?.id])

  useEffect(() => {
    fetchNotifications()
    const t = setInterval(fetchNotifications, 60000)
    return () => clearInterval(t)
  }, [fetchNotifications])

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    await fetchNotifications()
  }
  const markAllRead = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id).is('read_at', null)
    await fetchNotifications()
  }

  const unread = notifications.filter(n => !n.read_at).length
  return { notifications, unread, markRead, markAllRead, refetch: fetchNotifications }
}
