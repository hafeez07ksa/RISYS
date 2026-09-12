import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      organization: null,
      loading: true,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setOrganization: (organization) => set({ organization }),
      setLoading: (loading) => set({ loading }),

      initialize: async () => {
        set({ loading: true })
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          set({ session, user: session.user })
          await get().fetchOrganization(session.user.id)
        }
        set({ loading: false })

        supabase.auth.onAuthStateChange(async (_event, session) => {
          set({ session, user: session?.user ?? null })
          if (session?.user) {
            await get().fetchOrganization(session.user.id)
          } else {
            set({ organization: null })
          }
        })
      },

      fetchOrganization: async (userId) => {
        const { data, error } = await supabase
          .from('organization_members')
          .select('organizations(*), role')
          .eq('user_id', userId)
          .limit(1)

        const row = !error && data && data.length > 0 ? data[0] : null
        if (row && row.organizations) {
          set({ organization: { ...row.organizations, memberRole: row.role } })
        } else {
          // Membership removed (or org suspended): clear it — never keep stale access
          set({ organization: null })
        }
      },

      // Server-side validation: catches deleted accounts whose JWT is still
      // technically alive, and memberships revoked while the tab was open.
      validateAccess: async () => {
        const { user } = get()
        if (!user) return false
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) {
          await get().signOut()
          return false
        }
        await get().fetchOrganization(data.user.id)
        return true
      },

      signUp: async ({ email, password, fullName, emailRedirectTo }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            ...(emailRedirectTo ? { emailRedirectTo } : {}),
          },
        })
        if (error) throw error
        return data
      },

      signIn: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        set({ session: data.session, user: data.user })
        await get().fetchOrganization(data.user.id)
        return data
      },

      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, session: null, organization: null })
      },
    }),
    {
      name: 'risys-auth',
      // Persist nothing sensitive: organization access must be re-proven
      // against the database on every load, never trusted from localStorage.
      partialize: () => ({}),
    }
  )
)
