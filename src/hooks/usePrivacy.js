import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail } from '@/lib/policies'

/* ── Privacy (PDPL) ───────────────────────────────────────────────────────────
 *
 *   privacy_settings         controller and DPO
 *   processing_activities    the record of processing (ROP-)
 *   data_subject_requests    the request register (DSR-), 30-day clock
 *   personal_data_breaches   breaches on incidents (PDB-), 72-hour clock
 *   privacy_assessments      Art. 25 impact assessments (PIA-), four eyes
 *
 * Every step that moves a clock or a status is an RPC; the database refuses
 * what PDPL does not allow (completing before identity is verified, a late
 * notification without a reason, approving your own assessment). Plain
 * content edits go straight to the tables, behind RLS and the guards.
 * -------------------------------------------------------------------------- */

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  fail(error)
  return data
}

function useList(table, select, order) {
  const { organization } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    let q = supabase.from(table).select(select).eq('org_id', organization.id)
    for (const [col, asc] of order) q = q.order(col, { ascending: asc })
    const { data } = await q
    setItems(data || [])
    setLoading(false)
  }, [organization?.id, table, select])
  useEffect(() => { fetchAll() }, [fetchAll])
  return { items, loading, refetch: fetchAll }
}

function useOne(table, id, select = '*') {
  const { organization } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchOne = useCallback(async () => {
    if (!organization?.id || !id) { setLoading(false); return }
    const { data } = await supabase.from(table).select(select).eq('id', id).eq('org_id', organization.id).maybeSingle()
    setItem(data || null)
    setLoading(false)
  }, [organization?.id, table, id, select])
  useEffect(() => { setLoading(true); fetchOne() }, [fetchOne])
  return { item, loading, refetch: fetchOne }
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export function usePrivacySettings() {
  const { organization, user } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchOne = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase.from('privacy_settings').select('*').eq('org_id', organization.id).maybeSingle()
    setSettings(data || null)
    setLoading(false)
  }, [organization?.id])
  useEffect(() => { fetchOne() }, [fetchOne])
  const save = async (values) => {
    const { error } = await supabase.from('privacy_settings')
      .upsert({ ...values, org_id: organization.id, updated_by: user?.id, updated_at: new Date().toISOString() })
    fail(error)
    await fetchOne()
  }
  return { settings, loading, save, refetch: fetchOne }
}

/* ── Records of processing ────────────────────────────────────────────────── */

export function useActivities() {
  const { organization } = useAuth()
  const list = useList('processing_activities', '*, unit:business_units ( id, name )', [['ref', true]])
  const create = async (values) => {
    const { data, error } = await supabase.from('processing_activities').insert({ ...values, org_id: organization.id }).select('id').single()
    fail(error)
    await list.refetch()
    return data.id
  }
  return { ...list, create }
}

export function useActivity(id) {
  const one = useOne('processing_activities', id, '*, unit:business_units ( id, name )')
  const { organization } = useAuth()
  const [linked, setLinked] = useState({ requests: [], assessments: [] })
  useEffect(() => {
    if (!organization?.id || !id) return
    Promise.all([
      supabase.from('data_subject_requests').select('id, ref, request_type, status, due_on, extended_due_on').eq('activity_id', id).order('received_at', { ascending: false }),
      supabase.from('privacy_assessments').select('id, ref, version_no, title, status, residual_rating, reassess_by').eq('activity_id', id).order('created_at', { ascending: false }),
    ]).then(([r, a]) => setLinked({ requests: r.data || [], assessments: a.data || [] }))
  }, [organization?.id, id])
  const update = async (values) => {
    const { error } = await supabase.from('processing_activities').update(values).eq('id', id)
    fail(error)
    await one.refetch()
  }
  const remove = async () => {
    const { error } = await supabase.from('processing_activities').delete().eq('id', id)
    fail(error)
  }
  return { ...one, linked, update, remove }
}

/* ── Data subject requests ────────────────────────────────────────────────── */

export function useRequests() {
  const { organization } = useAuth()
  const list = useList('data_subject_requests', '*, activity:processing_activities ( id, ref, name )', [['received_at', false]])
  const create = async (values) => {
    const { data, error } = await supabase.from('data_subject_requests').insert({ ...values, org_id: organization.id }).select('id').single()
    fail(error)
    await list.refetch()
    return data.id
  }
  return { ...list, create }
}

export function useRequest(id) {
  const one = useOne('data_subject_requests', id, '*, activity:processing_activities ( id, ref, name )')
  const after = async (p) => { const r = await p; await one.refetch(); return r }
  return {
    ...one,
    update: (values) => after((async () => {
      const { error } = await supabase.from('data_subject_requests').update(values).eq('id', id)
      fail(error)
    })()),
    verify: (method) => after(rpc('verify_dsr_identity', { p_id: id, p_method: method })),
    extend: (reason, notifiedAt) => after(rpc('extend_dsr', { p_id: id, p_reason: reason, p_notified_at: notifiedAt })),
    close: (outcome, summary, refusal, informedAt) => after(rpc('close_dsr', {
      p_id: id, p_outcome: outcome, p_summary: summary, p_refusal_reason: refusal || null, p_informed_at: informedAt || null,
    })),
  }
}

/* ── Personal-data breaches ───────────────────────────────────────────────── */

const BREACH_SELECT = '*, incident:incidents ( id, title, severity, status )'

export function useBreaches() {
  const { organization } = useAuth()
  const list = useList('personal_data_breaches', BREACH_SELECT, [['aware_at', false]])
  const report = async ({ incidentId, title, awareAt, description, severity }) => {
    const id = await rpc('report_personal_data_breach', {
      p_org: organization.id, p_incident: incidentId || null, p_title: title || null,
      p_aware_at: awareAt, p_description: description || null, p_severity: severity || 'high',
    })
    await list.refetch()
    return id
  }
  return { ...list, report }
}

export function useBreach(id) {
  const one = useOne('personal_data_breaches', id, BREACH_SELECT)
  const after = async (p) => { const r = await p; await one.refetch(); return r }
  return {
    ...one,
    update: (values) => after((async () => {
      const { error } = await supabase.from('personal_data_breaches').update(values).eq('id', id)
      fail(error)
    })()),
    assess: (notifiable, reason) => after(rpc('assess_personal_data_breach', { p_id: id, p_notifiable: notifiable, p_reason: reason || null })),
    notifySdaia: ({ notifiedAt, reference, report, lateReason }) => after(rpc('record_sdaia_notification', {
      p_id: id, p_notified_at: notifiedAt, p_reference: reference || null, p_report: report || null, p_late_reason: lateReason || null,
    })),
    noticeSubjects: ({ notifiedAt, notice, notRequired }) => after(rpc('record_breach_subject_notice', {
      p_id: id, p_notified_at: notifiedAt || null, p_notice: notice || null, p_not_required: notRequired || null,
    })),
    close: () => after(rpc('close_personal_data_breach', { p_id: id })),
  }
}

/** The breach recorded on an incident, if any (for the incident page). */
export function useIncidentBreach(incidentId) {
  const [breach, setBreach] = useState(null)
  useEffect(() => {
    if (!incidentId) return
    supabase.from('personal_data_breaches').select('id, ref, sdaia_due_at, sdaia_notified_at, notifiable, status')
      .eq('incident_id', incidentId).maybeSingle().then(({ data }) => setBreach(data || null))
  }, [incidentId])
  return breach
}

/* ── Impact assessments ───────────────────────────────────────────────────── */

const PIA_SELECT = '*, activity:processing_activities ( id, ref, name )'

export function useAssessments() {
  const { organization } = useAuth()
  const list = useList('privacy_assessments', PIA_SELECT, [['ref', true], ['version_no', false]])
  const create = async (values) => {
    const { data, error } = await supabase.from('privacy_assessments').insert({ ...values, org_id: organization.id }).select('id').single()
    fail(error)
    await list.refetch()
    return data.id
  }
  return { ...list, create }
}

export function useAssessment(id) {
  const one = useOne('privacy_assessments', id, PIA_SELECT)
  const { organization } = useAuth()
  const [versions, setVersions] = useState([])
  useEffect(() => {
    if (!organization?.id || !one.item?.ref) return
    supabase.from('privacy_assessments').select('id, version_no, status, approved_at, residual_rating')
      .eq('org_id', organization.id).eq('ref', one.item.ref).order('version_no', { ascending: false })
      .then(({ data }) => setVersions(data || []))
  }, [organization?.id, one.item?.ref, one.item?.status])
  const after = async (p) => { const r = await p; await one.refetch(); return r }
  return {
    ...one,
    versions,
    update: (values) => after((async () => {
      const { error } = await supabase.from('privacy_assessments').update(values).eq('id', id)
      fail(error)
    })()),
    remove: async () => { const { error } = await supabase.from('privacy_assessments').delete().eq('id', id); fail(error) },
    submit: () => after(rpc('submit_privacy_assessment', { p_id: id })),
    returnIt: (reason) => after(rpc('return_privacy_assessment', { p_id: id, p_reason: reason })),
    approve: (note) => after(rpc('approve_privacy_assessment', { p_id: id, p_note: note || null })),
    reassess: () => rpc('reassess_privacy_assessment', { p_id: id }),
  }
}
