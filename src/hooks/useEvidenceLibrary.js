import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail, uploadLibraryFile } from '@/lib/policies'

/* ── Evidence library ─────────────────────────────────────────────────────────
 *
 * One evidence item (a document, export, screenshot or record, with its
 * files, validity and owner) linked to any number of framework requirements,
 * controls or audit tests — collect once, use many times. Every item is
 * reviewed by someone other than the person who added it before it counts;
 * an accepted item is fixed and is replaced by superseding it. Published
 * policy versions arrive here on their own, already accepted.
 * -------------------------------------------------------------------------- */

export function useEvidenceLibrary() {
  const { organization, user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase.from('evidence_items')
      .select('*, links:evidence_links ( id, framework, requirement_id, control_id, audit_scope_item_id )')
      .eq('org_id', organization.id).order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  /** Upload the files, create the item, then link it. */
  const addItem = async (values, files = [], links = []) => {
    const uploaded = []
    for (const f of files) uploaded.push(await uploadLibraryFile(organization.id, 'evidence', f))
    const { data, error } = await supabase.from('evidence_items').insert({
      ...values, org_id: organization.id, files: uploaded, added_by: user.id, source_type: 'upload',
    }).select().single()
    fail(error)
    if (links.length) {
      const r = await supabase.from('evidence_links').insert(links.map((l) => ({ ...l, org_id: organization.id, evidence_id: data.id, linked_by: user.id })))
      fail(r.error)
    }
    await fetchAll()
    return data
  }

  return { items, loading, refetch: fetchAll, addItem }
}

export function useEvidenceItem(id) {
  const { organization, user } = useAuth()
  const [item, setItem] = useState(null)
  const [controls, setControls] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchOne = useCallback(async () => {
    if (!organization?.id || !id) return
    const { data } = await supabase.from('evidence_items')
      .select('*, links:evidence_links ( * )').eq('id', id).eq('org_id', organization.id).maybeSingle()
    setItem(data)
    const ids = (data?.links || []).map((l) => l.control_id).filter(Boolean)
    if (ids.length) {
      const c = await supabase.from('risk_controls').select('id, control_id, name').in('id', ids)
      setControls(c.data || [])
    } else setControls([])
    setLoading(false)
  }, [organization?.id, id])

  useEffect(() => { setLoading(true); fetchOne() }, [fetchOne])

  const done = async ({ error }) => { fail(error); await fetchOne() }
  return {
    item, controls, loading, refetch: fetchOne,
    review: async (accept, note) => done(await supabase.rpc('review_evidence', { p_id: id, p_accept: accept, p_note: note || null })),
    supersede: async (newId) => done(await supabase.rpc('supersede_evidence', { p_old: id, p_new: newId })),
    addFiles: async (files) => {
      const uploaded = []
      for (const f of files) uploaded.push(await uploadLibraryFile(organization.id, 'evidence', f))
      return done(await supabase.from('evidence_items').update({ files: [...(item?.files || []), ...uploaded] }).eq('id', id))
    },
    update: async (patch) => done(await supabase.from('evidence_items').update(patch).eq('id', id)),
    addLink: async (link) => done(await supabase.from('evidence_links').insert({ ...link, org_id: organization.id, evidence_id: id, linked_by: user.id })),
    removeLink: async (linkId) => done(await supabase.from('evidence_links').delete().eq('id', linkId)),
  }
}
