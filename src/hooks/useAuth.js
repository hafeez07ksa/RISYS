import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const session = useAuthStore((s) => s.session)
  const organization = useAuthStore((s) => s.organization)
  const memberships = useAuthStore((s) => s.memberships)
  const switchOrganization = useAuthStore((s) => s.switchOrganization)
  const loading = useAuthStore((s) => s.loading)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const signOut = useAuthStore((s) => s.signOut)

  return { user, session, organization, memberships, switchOrganization, loading, signIn, signUp, signOut }
}
