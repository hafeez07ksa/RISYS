import { useEffect, useMemo, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { LeaveGuardProvider } from '@/components/layout/LeaveGuard'
import { ShieldAlert, LogOut } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppTopbar, RouteBreadcrumb } from '@/components/layout/Topbar'
import { usePermissions } from '@/hooks/usePermissions'
import { useAiSettings } from '@/hooks/useAskRisys'
import { visibleModules, moduleForPath } from '@/lib/navigation'
import { CommandSearch, useCommandSearch } from '@/components/layout/CommandSearch'
import { AskRisysWidget } from '@/features/ask/AskRisysWidget'
import { ASK_RISYS_ENABLED } from '@/lib/env'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { RisysLogo } from '@/components/ui/RisysLogo'
import { tx } from '@/lib/i18n'

const COLLAPSE_KEY = 'risys.sidebar.collapsed'

// Shown when a signed-in user has no workspace membership —
// i.e. they were removed, their org was suspended, or they never joined one.
function AccessGate() {
  const signOut = useAuthStore(s => s.signOut)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ marginBottom: 26 }}><RisysLogo size="md" /></div>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 32px', textAlign: 'center', boxShadow: '0 8px 32px rgba(41,32,33,0.07)' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FBEAEA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <ShieldAlert size={20} style={{ color: '#8C1616' }} />
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{tx('No workspace access')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>{tx(
          'Your account is not a member of any workspace. If you were part of one, your access may have been revoked — contact your organization\'s administrator.'
        )}</p>
        <button onClick={signOut} className="btn-secondary" style={{ width: '100%', marginTop: 18 }}>
          <LogOut size={13} className='rtl-flip' /> {tx('Sign out')}</button>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 14 }}>{tx('Workspaces are provisioned by RISYS — contact our team to set one up.')}</p>
      </div>
    </div>
  )
}

export function AppLayout() {
  const { user, organization, loading } = useAuth()
  const search = useCommandSearch()
  const validateAccess = useAuthStore(s => s.validateAccess)
  const perms = usePermissions()
  const { pathname } = useLocation()
  const { enabled: aiOn } = useAiSettings(ASK_RISYS_ENABLED ? organization?.id : null)
  const modules = useMemo(() => visibleModules(perms, { aiOn }), [perms, aiOn])
  const active = moduleForPath(modules, pathname)
  const hasSidebar = !!active
  const [askOpen, setAskOpen] = useState(false)
  const ask = { available: ASK_RISYS_ENABLED && aiOn, open: askOpen, onToggle: () => setAskOpen((o) => !o) }

  // Sidebar collapse persists; below 1100px it collapses on its own. Losing
  // navigation entirely on a tablet is worse than losing the labels.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* private mode */ }
  }, [collapsed])
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1100) setCollapsed(true) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Active enforcement: re-prove the session and membership against the
  // server every 60s and whenever the tab regains focus. A deleted account
  // or revoked membership is ejected within a minute, not at token expiry.
  useEffect(() => {
    if (!user) return
    const check = () => validateAccess()
    const interval = setInterval(check, 60_000)
    const onFocus = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [user, validateAccess])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!organization) return <AccessGate />

  /* Two navigation levels: the top bar picks the module (Dashboard, Risk
   * Management, Compliance, …) and the sidebar lists that module's pages.
   * Routes are unchanged; the module comes from the URL (lib/navigation.js). */
  return (
    <LeaveGuardProvider>
    <div className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg)', '--ask-dock': hasSidebar ? (collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)') : '0px' }}>
      <AppTopbar onOpenSearch={() => search.setOpen(true)} modules={modules} active={active}
        collapsed={collapsed} hasSidebar={hasSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar module={active} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} ask={ask} />
        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
          {/* Keyed on the workspace id: switching organisations remounts the
              routed subtree, so no list, filter or form state from the previous
              workspace survives the switch in memory (B5). RLS would refuse the
              rows anyway; this stops the stale render. */}
          <RouteBreadcrumb />
          {/* Pages that fill the height (height: 100%) fill exactly this box,
              so the trail above never adds a second scrollbar. */}
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }} key={organization.id}>
            <Outlet />
          </div>
        </main>
      </div>
      <CommandSearch open={search.open} onClose={() => search.setOpen(false)} />
      {/* Ask RISYS card, opened from the entry at the foot of the sidebar.
          Renders nothing unless AI is on for the workspace. */}
      {ASK_RISYS_ENABLED && <AskRisysWidget key={organization.id} open={askOpen} onClose={() => setAskOpen(false)} />}
    </div>
    </LeaveGuardProvider>
  )
}
