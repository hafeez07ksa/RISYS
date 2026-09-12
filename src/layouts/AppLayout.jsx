import { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { ShieldAlert, LogOut } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppTopbar } from '@/components/layout/Topbar'
import { CommandSearch, useCommandSearch } from '@/components/layout/CommandSearch'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { RisysLogo } from '@/components/ui/RisysLogo'

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
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No workspace access</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Your account is not a member of any workspace. If you were part of one,
          your access may have been revoked — contact your organization's administrator.
        </p>
        <button onClick={signOut} className="btn-secondary" style={{ width: '100%', marginTop: 18 }}>
          <LogOut size={13} /> Sign out
        </button>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 14 }}>
          Workspaces are provisioned by RISYS — contact our team to set one up.
        </p>
      </div>
    </div>
  )
}

export function AppLayout() {
  const { user, organization, loading } = useAuth()
  const search = useCommandSearch()
  const validateAccess = useAuthStore(s => s.validateAccess)

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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        <AppTopbar onOpenSearch={() => search.setOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <CommandSearch open={search.open} onClose={() => search.setOpen(false)} />
    </div>
  )
}
