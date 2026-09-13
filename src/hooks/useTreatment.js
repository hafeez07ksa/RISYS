import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { logAudit, AUDIT } from '@/lib/audit'
import { notify } from './useRisks'
import { tierMeta } from '@/lib/authority'

// ============================================================
// Treatment decision, plans and acceptance authority.
//
// Every hook degrades quietly when 003_treatment_acceptance_triage.sql
// has not been applied: reads return empty with `migrated: false`, so the
// page can explain what is missing instead of throwing.
// ============================================================

// ── THE FOUR OPTIONS ──────────────────────────────────────────────────────────
export function useTreatmentOptions(riskId) {
  const { organization, user } = useAuth()
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchOptions = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_treatment_options')
      .select('*')
      .eq('risk_id', riskId)
    if (error) setMigrated(false)
    setOptions(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchOptions() }, [fetchOptions])

  const saveOption = async (option, patch, risk) => {
    const now = new Date().toISOString()
    const decided = patch.decision && patch.decision !== 'pending'
    const { error } = await supabase
      .from('risk_treatment_options')
      .upsert({
        org_id: organization.id,
        risk_id: riskId,
        option,
        ...patch,
        decided_by: decided ? user?.id : null,
        decided_at: decided ? now : null,
        updated_at: now,
      }, { onConflict: 'risk_id,option' })
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.RISK_TREATMENT_OPTION, 'risk', riskId, risk?.title ?? null, {
      option, decision: patch.decision, horizon: patch.horizon || null, reason: patch.rejection_reason || null,
    })
    await fetchOptions()
  }

  return { options, loading, migrated, saveOption, refetch: fetchOptions }
}

// ── PLANS ─────────────────────────────────────────────────────────────────────
export function useTreatmentPlans(riskId) {
  const { organization, user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchPlans = useCallback(async () => {
    if (!organization?.id || !riskId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_treatment_plans')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: true })
    if (error) setMigrated(false)
    setPlans(data || [])
    setLoading(false)
  }, [organization?.id, riskId])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const createPlan = async (data, risk) => {
    const { data: plan, error } = await supabase
      .from('risk_treatment_plans')
      .insert({ ...data, org_id: organization.id, risk_id: riskId, created_by: user?.id })
      .select().single()
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.RISK_PLAN_CREATED, 'risk', riskId, risk?.title ?? null, {
      plan: plan.plan_ref, option: plan.option, horizon: plan.horizon,
      target: plan.target_likelihood && plan.target_impact ? `L${plan.target_likelihood} × I${plan.target_impact}` : null,
    })
    if (data.owner_id && data.owner_id !== user?.id) {
      await notify(organization.id, data.owner_id, {
        type: 'assignment',
        title: `Treatment plan assigned: ${plan.plan_ref}`,
        body: `You own "${plan.title}"${risk?.risk_id ? ` on ${risk.risk_id}` : ''}.`,
        link: `/app/risks/${riskId}`,
      })
    }
    await fetchPlans()
    return plan
  }

  const updatePlan = async (id, patch) => {
    const payload = { ...patch, updated_at: new Date().toISOString() }
    if (patch.status === 'approved') {
      payload.approved_by = user?.id
      payload.approved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('risk_treatment_plans').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchPlans()
  }

  return { plans, loading, migrated, createPlan, updatePlan, refetch: fetchPlans }
}

// ── AUTHORITY HOLDERS ─────────────────────────────────────────────────────────
export function useAuthorityHolders() {
  const { organization, user } = useAuth()
  const [holders, setHolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(true)

  const fetchHolders = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('risk_authority_holders')
      .select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: true })
    if (error) setMigrated(false)
    setHolders(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchHolders() }, [fetchHolders])

  const addHolder = async (tier, userId) => {
    const { error } = await supabase
      .from('risk_authority_holders')
      .insert({ org_id: organization.id, tier, user_id: userId, assigned_by: user?.id })
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.AUTHORITY_ASSIGNED, 'member', null, tierMeta(tier).label, { tier, user_id: userId })
    await fetchHolders()
  }

  const removeHolder = async (holder) => {
    const { error } = await supabase.from('risk_authority_holders').delete().eq('id', holder.id)
    if (error) throw new Error(error.message)
    await logAudit(organization.id, AUDIT.AUTHORITY_REMOVED, 'member', null, tierMeta(holder.tier).label, {
      tier: holder.tier, user_id: holder.user_id,
    })
    await fetchHolders()
  }

  return { holders, loading, migrated, addHolder, removeHolder, refetch: fetchHolders }
}
