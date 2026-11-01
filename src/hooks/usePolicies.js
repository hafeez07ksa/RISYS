import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail, uploadLibraryFile } from '@/lib/policies'

/* ── Policy library ───────────────────────────────────────────────────────────
 *
 * policies → policy_versions (draft → in review → approved → published; a
 * published version is locked and hashed) → policy_requirements (the ECC/CCC
 * mapping) → policy_audiences (who must attest) → attestation_campaigns /
 * attestations.
 *
 * Every state change is an RPC (submit, return, approve, publish, retire,
 * campaigns, attestations); the database checks the approver's authority and
 * refuses edits to anything that is not a draft. This hook only calls them.
 * -------------------------------------------------------------------------- */

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  fail(error)
  return data
}

export function usePolicies() {
  const { organization } = useAuth()
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const [p, v, c] = await Promise.all([
      supabase.from('policies')
        .select('*, unit:business_units ( id, name ), reqs:policy_requirements ( framework, requirement_id, relation )')
        .eq('org_id', organization.id).order('ref'),
      supabase.from('policy_versions')
        .select('id, policy_id, version_no, status, submitted_at, approved_at, published_at, effective_on')
        .eq('org_id', organization.id),
      supabase.from('v_policy_attestation').select('*').eq('org_id', organization.id).eq('status', 'open'),
    ])
    if (p.error) setError(p.error.message)
    const versions = v.data || []
    const campaigns = c.data || []
    setPolicies((p.data || []).map((x) => ({
      ...x,
      versions: versions.filter((y) => y.policy_id === x.id).sort((a, b) => b.version_no - a.version_no),
      openCampaign: campaigns.find((y) => y.policy_id === x.id) || null,
    })))
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  /** Create the policy, its mapping, audiences and authors. Version 1 is created by the database. */
  const createPolicy = async (values, { mapping = [], audiences = [], authors = [] } = {}) => {
    const { data, error } = await supabase.from('policies')
      .insert({ ...values, org_id: organization.id }).select().single()
    fail(error)
    await saveChildren(organization.id, data.id, { mapping, audiences, authors })
    await fetchAll()
    return data
  }

  return { policies, loading, error, refetch: fetchAll, createPolicy }
}

async function saveChildren(orgId, policyId, { mapping, audiences, authors }) {
  if (mapping) {
    const { error } = await supabase.from('policy_requirements').delete().eq('policy_id', policyId)
    fail(error)
    if (mapping.length) {
      const r = await supabase.from('policy_requirements').insert(mapping.map((m) => ({
        org_id: orgId, policy_id: policyId, framework: m.framework, requirement_id: m.requirement_id, relation: m.relation,
      })))
      fail(r.error)
    }
  }
  if (audiences) {
    const { error } = await supabase.from('policy_audiences').delete().eq('policy_id', policyId)
    fail(error)
    if (audiences.length) {
      const r = await supabase.from('policy_audiences').insert(audiences.map((a) => ({
        org_id: orgId, policy_id: policyId, kind: a.kind, ref: a.kind === 'everyone' ? null : a.ref,
      })))
      fail(r.error)
    }
  }
  if (authors) {
    const { error } = await supabase.from('policy_authors').delete().eq('policy_id', policyId)
    fail(error)
    if (authors.length) {
      const r = await supabase.from('policy_authors').insert(authors.map((u) => ({ org_id: orgId, policy_id: policyId, user_id: u })))
      fail(r.error)
    }
  }
}

export function usePolicy(id) {
  const { organization, user } = useAuth()
  const [state, setState] = useState({ policy: null, versions: [], mapping: [], audiences: [], authors: [], campaigns: [], attestations: [], exceptions: [], approvers: [] })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!organization?.id || !id) return
    const [p, v, m, a, au, c, at, ex] = await Promise.all([
      supabase.from('policies').select('*, unit:business_units ( id, name )').eq('id', id).eq('org_id', organization.id).maybeSingle(),
      supabase.from('policy_versions').select('*').eq('policy_id', id).order('version_no', { ascending: false }),
      supabase.from('policy_requirements').select('*').eq('policy_id', id).order('framework').order('requirement_id'),
      supabase.from('policy_audiences').select('*').eq('policy_id', id),
      supabase.from('policy_authors').select('*').eq('policy_id', id),
      supabase.from('v_policy_attestation').select('*').eq('policy_id', id).order('created_at', { ascending: false }),
      supabase.from('attestations').select('*').eq('policy_id', id).order('created_at', { ascending: false }),
      supabase.from('exceptions').select('*').eq('org_id', organization.id).eq('subject_type', 'policy').eq('subject_id', id).order('requested_at', { ascending: false }),
    ])
    if (!p.data) { setNotFound(true); setLoading(false); return }
    const versions = v.data || []
    const pending = versions.find((x) => x.status === 'in_review')
    let approvers = []
    if (pending) {
      const r = await supabase.rpc('policy_eligible_approvers', { p_version: pending.id })
      approvers = (r.data || []).map((x) => (typeof x === 'string' ? x : x.policy_eligible_approvers))
    }
    setState({
      policy: p.data, versions, mapping: m.data || [], audiences: a.data || [], authors: (au.data || []).map((x) => x.user_id),
      campaigns: c.data || [], attestations: at.data || [], exceptions: ex.data || [], approvers,
    })
    setNotFound(false)
    setLoading(false)
  }, [organization?.id, id])

  useEffect(() => { setLoading(true); fetchAll() }, [fetchAll])

  const after = async (promise) => { const r = await promise; await fetchAll(); return r }
  const p = state.policy

  return {
    ...state, loading, notFound, refetch: fetchAll,
    draft: state.versions.find((x) => x.status === 'draft') || null,
    open: state.versions.find((x) => ['draft', 'in_review', 'approved'].includes(x.status)) || null,
    current: state.versions.find((x) => x.id === p?.current_version_id) || null,
    canEdit: !!p && !!user && (p.owner_id === user.id || state.authors.includes(user.id)),

    updatePolicy: async (values, children = {}) => {
      const { error } = await supabase.from('policies').update(values).eq('id', id)
      fail(error)
      await saveChildren(organization.id, id, children)
      await fetchAll()
    },
    deletePolicy: async () => { const { error } = await supabase.from('policies').delete().eq('id', id); fail(error) },

    saveDraft: (versionId, patch) => after((async () => {
      const { error } = await supabase.from('policy_versions').update(patch).eq('id', versionId)
      fail(error)
    })()),
    uploadDraftFile: (file) => uploadLibraryFile(organization.id, 'policies', file),

    newVersion: () => after(rpc('new_policy_version', { p_policy: id })),
    submit: (versionId) => after(rpc('submit_policy_version', { p_version: versionId })),
    returnVersion: (versionId, reason) => after(rpc('return_policy_version', { p_version: versionId, p_reason: reason })),
    approve: (versionId, comment) => after(rpc('approve_policy_version', { p_version: versionId, p_comment: comment || null })),
    publish: (versionId, effective) => after(rpc('publish_policy_version', { p_version: versionId, p_effective: effective || null })),
    retire: (reason) => after(rpc('retire_policy', { p_policy: id, p_reason: reason })),

    startCampaign: (due) => after(rpc('start_attestation_campaign', { p_policy: id, p_trigger: 'manual', p_due: due || null })),
    remind: (campaignId) => after(rpc('remind_attestation_campaign', { p_campaign: campaignId })),
    excuse: (attId, reason) => after(rpc('excuse_attestation', { p_id: attId, p_reason: reason })),
  }
}

export const verifyPolicyVersion = (versionId) => rpc('verify_policy_version', { p_version: versionId })

export function usePolicyVersion(policyId, versionNo) {
  const { organization } = useAuth()
  const [state, setState] = useState({ policy: null, version: null, loading: true })
  useEffect(() => {
    if (!organization?.id || !policyId) return
    let alive = true
    ;(async () => {
      const [p, v] = await Promise.all([
        supabase.from('policies').select('*').eq('id', policyId).eq('org_id', organization.id).maybeSingle(),
        supabase.from('policy_versions').select('*').eq('policy_id', policyId).eq('version_no', Number(versionNo)).maybeSingle(),
      ])
      if (alive) setState({ policy: p.data, version: v.data, loading: false })
    })()
    return () => { alive = false }
  }, [organization?.id, policyId, versionNo])
  return state
}

export function usePolicyCoverage() {
  const { organization } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!organization?.id) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('v_policy_coverage').select('*').eq('org_id', organization.id)
      const key = (r) => r.requirement_id.split('-').map(Number)
      const sorted = (data || []).sort((a, b) => {
        const x = key(a); const y = key(b)
        for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
        return 0
      })
      if (alive) { setRows(sorted); setLoading(false) }
    })()
    return () => { alive = false }
  }, [organization?.id])
  return { rows, loading }
}

/** The signed-in person's attestations, with the policy and version they are for. */
export function useMyAttestations() {
  const { organization, user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchAll = useCallback(async () => {
    if (!organization?.id || !user?.id) return
    const { data } = await supabase.from('attestations')
      .select('*, policy:policies ( id, ref, title, kind, criticality ), campaign:attestation_campaigns ( id, ref, due_on, status ), version:policy_versions ( id, version_no, effective_on )')
      .eq('org_id', organization.id).eq('user_id', user.id).order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [organization?.id, user?.id])
  useEffect(() => { fetchAll() }, [fetchAll])
  return {
    items, loading, refetch: fetchAll,
    pending: items.filter((a) => a.status === 'pending' && a.campaign?.status === 'open'),
    accept: async (attId) => { const r = await rpc('accept_attestation', { p_id: attId }); await fetchAll(); return r },
  }
}

/** Policy versions waiting for the signed-in person's approval, and drafts they own. */
export function useMyPolicyWork() {
  const { organization, user } = useAuth()
  const [work, setWork] = useState({ approvals: [], drafts: [], reviews: [] })
  useEffect(() => {
    if (!organization?.id || !user?.id) return
    let alive = true
    ;(async () => {
      const [v, p] = await Promise.all([
        supabase.from('policy_versions').select('id, policy_id, version_no, status, submitted_at').eq('org_id', organization.id).eq('status', 'in_review'),
        supabase.from('policies').select('id, ref, title, status, owner_id, next_review_on').eq('org_id', organization.id).neq('status', 'retired'),
      ])
      const pols = p.data || []
      const approvals = []
      for (const ver of v.data || []) {
        const r = await supabase.rpc('policy_eligible_approvers', { p_version: ver.id })
        const ids = (r.data || []).map((x) => (typeof x === 'string' ? x : x.policy_eligible_approvers))
        if (ids.includes(user.id)) approvals.push({ ...ver, policy: pols.find((x) => x.id === ver.policy_id) })
      }
      const mine = pols.filter((x) => x.owner_id === user.id)
      const soon = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10)
      if (alive) setWork({
        approvals,
        drafts: mine.filter((x) => x.status === 'draft'),
        reviews: mine.filter((x) => x.status === 'published' && x.next_review_on && x.next_review_on <= soon),
      })
    })()
    return () => { alive = false }
  }, [organization?.id, user?.id])
  return work
}

/** ECC and CCC requirements, for the mapping picker. */
export function useFrameworkRequirements() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('framework_requirements_v')
        .select('framework, requirement_id, requirement_type, requirement_text, subdomain_name')
      if (alive) setRows(data || [])
    })()
    return () => { alive = false }
  }, [])
  return rows
}
