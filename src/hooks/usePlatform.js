import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

/* Platform console data layer.
 *
 * Every rule these calls depend on is enforced in the database, not here:
 * is_platform_admin() gates each RPC, a company must be suspended before it
 * can be deleted, suspension and deletion require a written reason, seat
 * limits cannot drop below the members already inside, and every call writes
 * a row to platform_audit_log that nobody can edit or delete afterwards.
 * The console surfaces those rules; it does not implement them. */

const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export function usePlatform() {
  const { user } = useAuth()
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(null) // null = checking
  const [orgs, setOrgs] = useState([])
  const [admins, setAdmins] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const checkAccess = useCallback(async () => {
    if (!user) { setIsPlatformAdmin(false); return false }
    const { data } = await supabase
      .from('platform_admins').select('user_id').eq('user_id', user.id).limit(1)
    const ok = !!(data && data.length)
    setIsPlatformAdmin(ok)
    return ok
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [o, a, s] = await Promise.all([
        supabase.rpc('platform_list_organizations'),
        supabase.rpc('platform_list_admins'),
        supabase.rpc('platform_stats'),
      ])
      const failed = [o, a, s].find((r) => r.error)
      if (failed) throw new Error(failed.error.message)
      setOrgs(o.data || []); setAdmins(a.data || []); setStats(s.data || null)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    (async () => {
      const ok = await checkAccess()
      if (ok) await fetchAll(); else setLoading(false)
    })()
  }, [checkAccess, fetchAll])

  const after = async (result) => { await fetchAll(); return result }

  return {
    isPlatformAdmin, orgs, admins, stats, loading, error, refetch: fetchAll,

    // Companies
    createCompany: async ({ name, adminEmail, plan, maxMembers, storageGb, industry, size, primaryContact, notes }) =>
      after(await call('platform_create_organization', {
        p_name: name, p_admin_email: adminEmail, p_plan: plan,
        p_max_members: maxMembers, p_storage_gb: storageGb,
        p_industry: industry || null, p_size: size || null,
        p_primary_contact: primaryContact || null, p_notes: notes || null,
      })),

    updateLimits: async (orgId, { plan, maxMembers, storageGb }) =>
      after(await call('platform_update_organization', {
        p_org: orgId, p_plan: plan ?? null, p_max_members: maxMembers ?? null, p_storage_gb: storageGb ?? null,
      })),

    updateProfile: async (orgId, { name, industry, size, primaryContact, notes }) =>
      after(await call('platform_update_org_profile', {
        p_org: orgId, p_name: name ?? null, p_industry: industry ?? null, p_size: size ?? null,
        p_primary_contact: primaryContact ?? null, p_notes: notes ?? null,
      })),

    // A reason is mandatory for suspension; the database rejects anything under
    // 10 characters, and files it in the audit log.
    setStatus: async (orgId, status, reason) =>
      after(await call('platform_set_org_status', { p_org: orgId, p_status: status, p_reason: reason || null })),

    deleteCompany: async (orgId, confirmName, reason) =>
      after(await call('platform_delete_organization', {
        p_org: orgId, p_confirm_name: confirmName, p_reason: reason || null,
      })),

    getCompany: (orgId) => call('platform_get_organization', { p_org: orgId }),

    // Activation links and invitations
    reissueAdminInvite: (orgId, adminEmail) =>
      call('platform_reissue_admin_invite', { p_org: orgId, p_admin_email: adminEmail }),

    revokeInvitation: (invitationId) =>
      call('platform_revoke_invitation', { p_invitation: invitationId }),

    // Platform staff
    addPlatformAdmin: async (email) => after(await call('platform_add_admin', { p_email: email })),
    removePlatformAdmin: async (userId) => after(await call('platform_remove_admin', { p_user_id: userId })),

    // Console activity
    listAudit: ({ limit = 100, before = null, action = null, org = null, search = null } = {}) =>
      call('platform_list_audit', {
        p_limit: limit, p_before: before, p_action: action, p_org: org, p_search: search || null,
      }),
  }
}

/* One company's full record, for the detail and form pages. */
export function useCompany(orgId) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('platform_get_organization', { p_org: orgId })
    if (err) setError(err.message); else setDetail(data)
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])
  return { detail, loading, error, reload: load }
}

export const activationLink = (token) => `${window.location.origin}/invite/${token}`
