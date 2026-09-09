import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'

export function useOrg() {
  const organization = useAuthStore((s) => s.organization)
  const setOrganization = useAuthStore((s) => s.setOrganization)

  const createOrganization = async ({ name, industry, size, adminRole }) => {
    // Atomic RPC: creates the organization and adds the creator as admin in one call
    const { data: org, error } = await supabase.rpc('create_organization', {
      p_name: name,
      p_industry: industry || null,
      p_size: size || null,
      p_title: adminRole || null, // their stated job title; membership role is always admin for the creator
    })
    if (error) throw new Error('Failed to create organization: ' + error.message)

    setOrganization({ ...org, memberRole: 'admin' })
    return org
  }

  return { organization, createOrganization }
}
