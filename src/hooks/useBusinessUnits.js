import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { fail } from '@/lib/policies'

/* ── Business units ───────────────────────────────────────────────────────────
 *
 * The organisation's structure (a tree, up to 12 levels): who owns a policy,
 * who must attest to it, and later whose risks and findings roll up where.
 * Administrators maintain it; it can be seeded from Entra departments.
 * -------------------------------------------------------------------------- */

export function useBusinessUnits() {
  const { organization } = useAuth()
  const [units, setUnits] = useState([])
  const [assignments, setAssignments] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const [u, m] = await Promise.all([
      supabase.from('business_units').select('*').eq('org_id', organization.id).order('name'),
      supabase.from('organization_members').select('user_id, business_unit_id').eq('org_id', organization.id),
    ])
    setUnits(u.data || [])
    setAssignments(Object.fromEntries((m.data || []).map((x) => [x.user_id, x.business_unit_id])))
    setLoading(false)
  }, [organization?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const done = async ({ error }) => { fail(error); await fetchAll() }

  /** Units in tree order, each with its depth, for indented lists and pickers. */
  const tree = []
  const walk = (parent, depth) => {
    for (const u of units.filter((x) => (x.parent_id || null) === parent)) { tree.push({ ...u, depth }); walk(u.id, depth + 1) }
  }
  walk(null, 0)
  // Anything orphaned by a race still shows.
  for (const u of units) if (!tree.some((x) => x.id === u.id)) tree.push({ ...u, depth: 0 })

  return {
    units, tree, assignments, loading, refetch: fetchAll,
    active: tree.filter((u) => u.status === 'active'),
    addUnit: async (v) => done(await supabase.from('business_units').insert({ ...v, org_id: organization.id })),
    updateUnit: async (id, patch) => done(await supabase.from('business_units').update(patch).eq('id', id)),
    deleteUnit: async (id) => done(await supabase.from('business_units').delete().eq('id', id)),
    assign: async (userId, unitId) => done(await supabase.rpc('set_member_business_unit', { p_org: organization.id, p_user: userId, p_unit: unitId || null })),
    importFromEntra: async () => {
      const { data, error } = await supabase.rpc('import_business_units_from_entra', { p_org: organization.id })
      fail(error)
      await fetchAll()
      return data
    },
  }
}
