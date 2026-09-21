import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

/* Which workspace the user was last looking at. An id only — never the record,
   never the role. It is a convenience, not a credential: the id is worthless
   unless the membership query below returns that organisation too. */
const ACTIVE_ORG_KEY = 'risys.activeOrg'
const readActiveOrg = () => { try { return localStorage.getItem(ACTIVE_ORG_KEY) } catch { return null } }
const rememberActiveOrg = (id) => { try { localStorage.setItem(ACTIVE_ORG_KEY, id) } catch { /* private mode */ } }
const forgetActiveOrg = () => { try { localStorage.removeItem(ACTIVE_ORG_KEY) } catch { /* private mode */ } }

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      organization: null,   // the workspace currently being viewed
      memberships: [],      // every workspace this user belongs to (B5)
      switching: false,
      loading: true,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setOrganization: (organization) => {
        set({ organization })
        if (organization?.id) rememberActiveOrg(organization.id)
      },
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
            forgetActiveOrg()
            set({ organization: null, memberships: [] })
          }
        })
      },

      /*
       * Load EVERY membership, not one (B5). The old query ended in .limit(1),
       * so a user who belonged to two organisations — an advisory firm with
       * several clients, or a RISYS staff account — silently saw whichever row
       * Postgres returned first and had no way to reach the others.
       *
       * The active workspace is remembered in localStorage by id only. It is
       * re-proved against this query on every load: an id that is no longer in
       * the list is discarded, so a revoked membership can never be restored
       * from the browser. Suspended organisations never appear here at all,
       * because the members_select policy runs through is_org_member(), which
       * requires the organisation to be active.
       */
      fetchOrganization: async (userId) => {
        const { data, error } = await supabase
          .from('organization_members')
          .select('role, organizations(*)')
          .eq('user_id', userId)

        const rows = (!error && data ? data : []).filter(r => r.organizations)
        const memberships = rows
          .map(r => ({ ...r.organizations, memberRole: r.role }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

        if (memberships.length === 0) {
          // Membership removed (or org suspended): clear it — never keep stale access
          forgetActiveOrg()
          set({ memberships: [], organization: null })
          return
        }

        const wantedId = get().organization?.id || readActiveOrg()
        const active = memberships.find(o => o.id === wantedId) || memberships[0]
        rememberActiveOrg(active.id)
        set({ memberships, organization: active })
      },

      /*
       * Switch workspace. Every data hook is keyed on organization.id and the
       * routed subtree is remounted by AppLayout, so nothing from the previous
       * workspace survives the switch in memory — and RLS would refuse it
       * anyway if it tried.
       */
      switchOrganization: async (orgId) => {
        const { organization, memberships } = get()
        if (!orgId || orgId === organization?.id) return
        const next = memberships.find(o => o.id === orgId)
        if (!next) return
        set({ switching: true })
        rememberActiveOrg(next.id)
        set({ organization: next, switching: false })
        // Re-read from the server so the role and org record are current, not
        // whatever was cached when the list was last loaded.
        const { user } = get()
        if (user?.id) await get().fetchOrganization(user.id)
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
        forgetActiveOrg()
        set({ user: null, session: null, organization: null, memberships: [] })
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
