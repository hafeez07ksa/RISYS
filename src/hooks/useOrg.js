import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'

export function useOrg() {
  const organization = useAuthStore((s) => s.organization)
  const memberships = useAuthStore((s) => s.memberships)
  const switchOrganization = useAuthStore((s) => s.switchOrganization)
  const fetchOrganization = useAuthStore((s) => s.fetchOrganization)

  const createOrganization = async ({ name, industry, size, adminRole }) => {
    // Atomic RPC: creates the organization and adds the creator as admin in one call
    const { data: org, error } = await supabase.rpc('create_organization', {
      p_name: name,
      p_industry: industry || null,
      p_size: size || null,
      p_title: adminRole || null, // their stated job title; the creator's membership role is always `owner`
    })
    if (error) throw new Error('Failed to create organization: ' + error.message)

    // Re-read memberships so the new workspace joins the switcher, and make it
    // the active one. A user can now hold several (B5).
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) {
      await fetchOrganization(user.id)
      await switchOrganization(org.id)
    }
    return org
  }

  return { organization, memberships, switchOrganization, createOrganization }
}
