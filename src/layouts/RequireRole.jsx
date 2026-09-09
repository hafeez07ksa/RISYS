import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Route guard — renders children only if the signed-in user holds one of
 * the required roles. Otherwise shows a friendly "Access denied" screen.
 *
 * Usage:
 *   <RequireRole roles={['admin', 'owner']}>
 *     <SettingsPage />
 *   </RequireRole>
 *
 * This is a UI guard only. The database RLS policies enforce the same
 * restrictions server-side independently — a blocked user can't bypass
 * this by hitting the API directly either.
 */
export function RequireRole({ roles, children, redirectTo = '/app/dashboard' }) {
  const { organization, loading } = useAuth()

  // Still loading — show nothing (AppLayout already handles this spinner)
  if (loading) return null

  const role = organization?.memberRole
  if (!role || !roles.includes(role)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: '#fdf5f5', border: '1px solid #f0dada',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <ShieldAlert size={22} style={{ color: '#5D0F0F' }} />
        </div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1314', marginBottom: 6 }}>
          Access restricted
        </h2>
        <p style={{ fontSize: 13, color: '#8a7070', maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
          This section is only available to administrators.
          Contact your organization's admin if you need access.
        </p>
        <a href="/app/dashboard"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, padding: '8px 16px',
            borderRadius: 8, background: '#5D0F0F', color: '#fff',
            textDecoration: 'none',
          }}>
          Back to Dashboard
        </a>
      </div>
    )
  }

  return children
}
