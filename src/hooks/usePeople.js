import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export const ROLES = [
  { value: 'admin',        label: 'Admin',        desc: 'Full access — manages people, settings, and all records' },
  { value: 'risk_manager', label: 'Risk Manager', desc: 'Second line — reviews and approves risks, runs assessments' },
  { value: 'member',       label: 'Member',       desc: 'First line — owns risks, controls, evidence, and actions' },
  { value: 'viewer',       label: 'Viewer',       desc: 'Read-only — sees the register and reports, changes nothing' },
]
export const roleLabel = (v) => ROLES.find(r => r.value === v)?.label || v

export function invitationState(inv) {
  if (inv.status === 'pending' && new Date(inv.expires_at) < new Date()) return 'expired'
  return inv.status
}

export function inviteLink(inv) {
  return `${window.location.origin}/invite/${inv.token}`
}

export function usePeople() {
  const { organization, user } = useAuth()
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)

  const isAdmin = ['admin', 'owner'].includes(organization?.memberRole)

  const fetchMembers = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('organization_members')
      .select(`
        id, role, title, joined_at, last_active, group_id, user_id,
        profiles!organization_members_user_id_profiles_fkey ( full_name, email, avatar_url ),
        org_groups ( id, name, color )
      `)
      .eq('org_id', organization.id)
      .order('joined_at', { ascending: true })
    // Flatten profile fields so consumers can use m.full_name / m.email directly
    setMembers((data || []).map(m => ({
      ...m,
      full_name: m.profiles?.full_name || null,
      email: m.profiles?.email || null,
      avatar_url: m.profiles?.avatar_url || null,
    })))
    setLoading(false)
  }, [organization?.id])

  const fetchInvitations = useCallback(async () => {
    if (!organization?.id) return
    const { data } = await supabase
      .from('org_invitations')
      .select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })
    setInvitations(data || [])
  }, [organization?.id])

  useEffect(() => { fetchMembers(); fetchInvitations() }, [fetchMembers, fetchInvitations])

  // Single invite — returns the invitation row (with token for the link)
  const inviteMember = async ({ email, role }) => {
    const { data, error } = await supabase.rpc('create_invitation', {
      p_org: organization.id, p_email: email, p_role: role,
    })
    if (error) throw error
    await fetchInvitations()
    return data
  }

  // Bulk invite — resolves each email independently, returns successes + failures
  const inviteMany = async (emails, role) => {
    const results = []
    for (const raw of emails) {
      const email = raw.trim()
      if (!email) continue
      try {
        const inv = await inviteMember({ email, role })
        results.push({ email, ok: true, invitation: inv })
      } catch (err) {
        results.push({ email, ok: false, error: err.message })
      }
    }
    return results
  }

  const revokeInvitation = async (id) => {
    const { error } = await supabase.rpc('revoke_invitation', { p_id: id })
    if (error) throw error
    await fetchInvitations()
  }

  const deleteInvitation = async (id) => {
    const { error } = await supabase.rpc('delete_invitation', { p_id: id })
    if (error) throw error
    await fetchInvitations()
  }

  // Regenerate = re-create: fresh token, fresh 7-day expiry
  const regenerateInvitation = async (inv) => {
    return inviteMember({ email: inv.email, role: inv.role })
  }

  const updateMemberRole = async (memberId, role) => {
    const { error } = await supabase.from('organization_members').update({ role }).eq('id', memberId)
    if (error) throw error
    await fetchMembers()
  }

  const updateMemberTitle = async (memberId, title) => {
    const { error } = await supabase.from('organization_members').update({ title }).eq('id', memberId)
    if (error) throw error
    await fetchMembers()
  }

  const updateMemberGroup = async (memberId, groupId) => {
    const { error } = await supabase.from('organization_members').update({ group_id: groupId }).eq('id', memberId)
    if (error) throw error
    await fetchMembers()
  }

  const removeMember = async (memberId) => {
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId)
    if (error) throw error
    await fetchMembers()
  }

  // Permanent deletion — admin-only, enforced by the database function.
  // Removes the member from this org; if they belong to no other org,
  // their login is destroyed permanently (profile kept for history).
  const deleteAccount = async (memberId) => {
    const { data, error } = await supabase.rpc('delete_member_account', { p_member_id: memberId })
    if (error) throw error
    await fetchMembers()
    return data
  }

  return {
    members, invitations, loading, isAdmin, currentUserId: user?.id,
    inviteMember, inviteMany, revokeInvitation, deleteInvitation, regenerateInvitation, deleteAccount,
    updateMemberRole, updateMemberTitle, updateMemberGroup, removeMember,
    refetch: () => { fetchMembers(); fetchInvitations() },
  }
}
