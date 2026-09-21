import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

/* ── Audit management ─────────────────────────────────────────────────────────
 *
 * Engagements → scope items (what is tested, and the result) → evidence
 * requests (what the auditor asked the business for) → evidence files →
 * findings (what was wrong, and management's response).
 *
 * The rules live in the database, not here: who may write which table (RLS),
 * that the person who tested an item cannot also review it, that a finding
 * owner can respond but not rewrite the finding, that only the auditor can
 * accept evidence or close a finding (guard triggers). This hook just calls
 * the tables and surfaces the database's own error text when it refuses.
 * -------------------------------------------------------------------------- */

export const AUDIT_EVIDENCE_BUCKET = 'audit-evidence'

export const AUDIT_TYPES = [
  { value: 'internal', label: 'Internal audit' },
  { value: 'external', label: 'External audit' },
  { value: 'regulatory', label: 'Regulatory inspection' },
  { value: 'self_assessment', label: 'Self-assessment' },
]
export const ENGAGEMENT_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'fieldwork', label: 'Fieldwork' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]
export const OPINIONS = [
  { value: 'effective', label: 'Effective' },
  { value: 'partially_effective', label: 'Partially effective' },
  { value: 'ineffective', label: 'Ineffective' },
]
export const TEST_RESULTS = [
  { value: 'not_tested', label: 'Not tested' },
  { value: 'effective', label: 'Effective' },
  { value: 'partially_effective', label: 'Partially effective' },
  { value: 'ineffective', label: 'Ineffective' },
  { value: 'not_applicable', label: 'Not applicable' },
]
export const FINDING_RATINGS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'observation', label: 'Observation' },
]
export const FINDING_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'in_remediation', label: 'In remediation' },
  { value: 'ready_for_validation', label: 'Awaiting validation' },
  { value: 'closed', label: 'Closed' },
  { value: 'risk_accepted', label: 'Risk accepted' },
]
export const REQUEST_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Returned' },
]
export const labelOf = (list, v) => list.find((x) => x.value === v)?.label ?? v ?? '—'
export const ACTIVE_FINDING = ['open', 'in_remediation', 'ready_for_validation']

/* Postgres raises the guard-trigger text as the error message; strip the
   PostgREST wrapper so the user reads the database's own sentence. */
function fail(error) {
  if (!error) return
  throw new Error(error.message?.replace(/^.*?ERROR:\s*/, '') || 'The change was refused.')
}

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ── List ─────────────────────────────────────────────────────────────────── */

export function useAudits() {
  const { organization } = useAuth()
  const [engagements, setEngagements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('audit_engagements')
      .select(`*, lead:profiles!audit_engagements_lead_auditor_id_fkey ( full_name, email ),
               scope:audit_scope_items ( id, result ),
               findings:audit_findings ( id, rating, status, due_date ),
               requests:audit_evidence_requests ( id, status, due_date )`)
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    setEngagements(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const createEngagement = async (values) => {
    const { data, error: err } = await supabase.from('audit_engagements')
      .insert({ ...values, org_id: organization.id }).select().single()
    fail(err)
    await fetchAll()
    return data
  }

  return { engagements, loading, error, refetch: fetchAll, createEngagement }
}

/** Evidence requests and finding responses waiting on the signed-in user, across engagements. */
export function useMyAuditItems() {
  const { organization, user } = useAuth()
  const [items, setItems] = useState({ requests: [], findings: [] })
  useEffect(() => {
    if (!organization?.id || !user?.id) return
    let alive = true
    ;(async () => {
      const [r, f] = await Promise.all([
        supabase.from('audit_evidence_requests')
          .select('id, title, due_date, status, engagement_id, engagement:audit_engagements ( ref, title )')
          .eq('org_id', organization.id).eq('requested_from', user.id).in('status', ['open', 'rejected']),
        supabase.from('audit_findings')
          .select('id, ref, title, rating, due_date, status, engagement_id')
          .eq('org_id', organization.id).eq('response_owner', user.id).in('status', ['open', 'in_remediation']),
      ])
      if (alive) setItems({ requests: r.data || [], findings: f.data || [] })
    })()
    return () => { alive = false }
  }, [organization?.id, user?.id])
  return items
}

/* ── One engagement ───────────────────────────────────────────────────────── */

export function useAudit(id) {
  const { organization, user } = useAuth()
  const [state, setState] = useState({ engagement: null, scope: [], requests: [], files: [], findings: [] })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!organization?.id || !id) return
    const [e, s, r, fl, f] = await Promise.all([
      supabase.from('audit_engagements')
        .select('*, lead:profiles!audit_engagements_lead_auditor_id_fkey ( full_name, email )')
        .eq('id', id).eq('org_id', organization.id).maybeSingle(),
      supabase.from('audit_scope_items').select('*, control:risk_controls ( id, control_id, name )')
        .eq('engagement_id', id).order('sort_order').order('created_at'),
      supabase.from('audit_evidence_requests').select('*').eq('engagement_id', id).order('created_at'),
      supabase.from('audit_evidence_files').select('*').eq('engagement_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('audit_findings').select('*, risk:risks ( id, risk_id, title )').eq('engagement_id', id).order('ref'),
    ])
    if (!e.data) setNotFound(true)
    setState({ engagement: e.data, scope: s.data || [], requests: r.data || [], files: fl.data || [], findings: f.data || [] })
    setLoading(false)
  }, [organization?.id, id])

  useEffect(() => { setLoading(true); fetchAll() }, [fetchAll])

  const base = () => ({ org_id: organization.id, engagement_id: id })
  const run = async (promise) => { const { data, error } = await promise; fail(error); await fetchAll(); return data }

  return {
    ...state, loading, notFound, refetch: fetchAll,

    updateEngagement: (patch) => run(supabase.from('audit_engagements').update(patch).eq('id', id)),
    deleteEngagement: async () => { const { error } = await supabase.from('audit_engagements').delete().eq('id', id); fail(error) },

    addScopeItem: (v) => run(supabase.from('audit_scope_items')
      .insert({ ...base(), sort_order: state.scope.length, ...v }).select().single()),
    updateScopeItem: (itemId, patch) => run(supabase.from('audit_scope_items').update(patch).eq('id', itemId)),
    // The database stamps the reviewer as the signed-in user and refuses if
    // they also performed the test.
    reviewScopeItem: (itemId) => run(supabase.from('audit_scope_items').update({ reviewed_by: user.id }).eq('id', itemId)),
    deleteScopeItem: (itemId) => run(supabase.from('audit_scope_items').delete().eq('id', itemId)),

    addRequest: (v) => run(supabase.from('audit_evidence_requests').insert({ ...base(), ...v }).select().single()),
    updateRequest: (reqId, patch) => run(supabase.from('audit_evidence_requests').update(patch).eq('id', reqId)),
    deleteRequest: (reqId) => run(supabase.from('audit_evidence_requests').delete().eq('id', reqId)),

    uploadEvidence: async (file, { requestId = null, scopeItemId = null } = {}) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${organization.id}/audits/${id}/${Date.now()}_${safe}`
      const sha256 = await sha256Hex(file)
      const up = await supabase.storage.from(AUDIT_EVIDENCE_BUCKET).upload(path, file, { upsert: false, cacheControl: '3600' })
      if (up.error) throw new Error(`File upload failed: ${up.error.message}`)
      const { error } = await supabase.from('audit_evidence_files').insert({
        ...base(), request_id: requestId, scope_item_id: scopeItemId,
        file_path: path, file_name: file.name, file_size: file.size, sha256, uploaded_by: user.id,
      })
      if (error) {
        await supabase.storage.from(AUDIT_EVIDENCE_BUCKET).remove([path]).catch(() => {})
        fail(error)
      }
      await fetchAll()
    },
    openEvidence: async (f) => {
      const win = window.open('', '_blank')
      try {
        const { data, error } = await supabase.storage.from(AUDIT_EVIDENCE_BUCKET).createSignedUrl(f.file_path, 60)
        if (error) throw new Error(`Could not open the file: ${error.message}`)
        if (win) { win.opener = null; win.location.href = data.signedUrl } else window.location.assign(data.signedUrl)
      } catch (err) { if (win) win.close(); throw err }
    },
    deleteEvidence: async (f) => {
      const { error } = await supabase.from('audit_evidence_files').delete().eq('id', f.id)
      fail(error)
      await supabase.storage.from(AUDIT_EVIDENCE_BUCKET).remove([f.file_path]).catch(() => {})
      await fetchAll()
    },

    addFinding: (v) => run(supabase.from('audit_findings').insert({ ...base(), ...v }).select().single()),
    updateFinding: (fid, patch) => run(supabase.from('audit_findings').update(patch).eq('id', fid)),
    deleteFinding: (fid) => run(supabase.from('audit_findings').delete().eq('id', fid)),

    /** Raise a draft risk from a finding and link the two. */
    raiseRisk: async (f) => {
      const { data: risk, error } = await supabase.from('risks').insert({
        org_id: organization.id,
        title: f.title,
        description: [f.condition, f.effect].filter(Boolean).join('\n\n') || null,
        cause: f.cause || null,
        impact_statement: f.effect || null,
        category: 'Cybersecurity',
        source: 'Internal Audit',
        owner_id: f.response_owner || null,
        created_by: user.id,
      }).select('id, risk_id').single()
      fail(error)
      await run(supabase.from('audit_findings').update({ risk_id: risk.id }).eq('id', f.id))
      return risk
    },
  }
}
