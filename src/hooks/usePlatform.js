import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

// Platform console data layer. Every RPC is gated server-side by
// is_platform_admin() — this hook just surfaces them.
export function usePlatform() {
  const { user } = useAuth()
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(null) // null = checking
  const [orgs, setOrgs] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)

  const checkAccess = useCallback(async () => {
    if (!user) { setIsPlatformAdmin(false); return false }
    const { data } = await supabase
      .from('platform_admins').select('user_id').eq('user_id', user.id).limit(1)
    const ok = !!(data && data.length)
    setIsPlatformAdmin(ok)
    return ok
  }, [user?.id])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [o, a] = await Promise.all([
      supabase.rpc('platform_list_organizations'),
      supabase.rpc('platform_list_admins'),
    ])
    setOrgs(o.data || [])
    setAdmins(a.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const ok = await checkAccess()
      if (ok) await fetchAll()
      else setLoading(false)
    })()
  }, [checkAccess, fetchAll])

  const createCompany = async ({ name, adminEmail, plan, maxMembers, storageGb, industry, size }) => {
    const { data, error } = await supabase.rpc('platform_create_organization', {
      p_name: name, p_admin_email: adminEmail, p_plan: plan,
      p_max_members: maxMembers, p_storage_gb: storageGb,
      p_industry: industry || null, p_size: size || null,
    })
    if (error) throw error
    await fetchAll()
    return data // { org, activation_token, admin_email, expires_at }
  }

  const updateLimits = async (orgId, { plan, maxMembers, storageGb }) => {
    const { error } = await supabase.rpc('platform_update_organization', {
      p_org: orgId, p_plan: plan ?? null, p_max_members: maxMembers ?? null, p_storage_gb: storageGb ?? null,
    })
    if (error) throw error
    await fetchAll()
  }

  const setStatus = async (orgId, status) => {
    const { error } = await supabase.rpc('platform_set_org_status', { p_org: orgId, p_status: status })
    if (error) throw error
    await fetchAll()
  }

  const deleteCompany = async (orgId, confirmName) => {
    const { data, error } = await supabase.rpc('platform_delete_organization', {
      p_org: orgId, p_confirm_name: confirmName,
    })
    if (error) throw error
    await fetchAll()
    return data // { deleted_org, deleted_user_accounts }
  }

  const reissueAdminInvite = async (orgId, adminEmail) => {
    const { data, error } = await supabase.rpc('platform_reissue_admin_invite', { p_org: orgId, p_admin_email: adminEmail })
    if (error) throw error
    return data
  }

  const addPlatformAdmin = async (email) => {
    const { error } = await supabase.rpc('platform_add_admin', { p_email: email })
    if (error) throw error
    await fetchAll()
  }

  const removePlatformAdmin = async (userId) => {
    const { error } = await supabase.rpc('platform_remove_admin', { p_user_id: userId })
    if (error) throw error
    await fetchAll()
  }

  return {
    isPlatformAdmin, orgs, admins, loading, refetch: fetchAll,
    createCompany, updateLimits, setStatus, reissueAdminInvite, deleteCompany,
    addPlatformAdmin, removePlatformAdmin,
  }
}

export const activationLink = (token) => `${window.location.origin}/invite/${token}`
