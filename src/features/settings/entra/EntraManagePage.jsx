import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, RotateCw,
  Users, ShieldAlert, Activity, Search, X, Crown, UserX,
  Globe, ChevronRight, Settings,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { useConnectors } from '@/hooks/useConnectors'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const palettes = [
    ['#EAF0FB','#2B5797'],['#ECF4EE','#2F6B3C'],['#FAF3E2','#9C6F0F'],
    ['#F6EBE8','#5D0F0F'],['#F2EEF9','#4C1D95'],['#E6F4FB','#0F5A8A'],
  ]
  const [bg, color] = palettes[initials.charCodeAt(0) % palettes.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.36, fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em',
    }}>{initials}</div>
  )
}

function MfaRing({ total, registered }) {
  const pct = total > 0 ? Math.round((registered / total) * 100) : 0
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const r = 20, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 56, height: 56 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f0eded" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{pct}%</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, warn, amber, onClick }) {
  const color = warn ? '#b91c1c' : amber ? '#92400e' : '#1a1314'
  const bdColor = warn ? '#fecaca' : amber ? '#fde68a' : '#e5e0e0'
  const bg = warn ? '#fef2f2' : amber ? '#fffbeb' : '#fff'
  return (
    <div onClick={onClick} className="rounded-xl p-4 flex flex-col gap-2 transition-all hover:shadow-sm"
      style={{ background: bg, border: `1px solid ${bdColor}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: warn ? '#b91c1c' : amber ? '#92400e' : '#8a7070' }}>{label}</p>
        <Icon size={13} strokeWidth={1.5} style={{ color: warn ? '#fca5a5' : amber ? '#fcd34d' : '#d4cccc' }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 300, color }}>{value}</p>
    </div>
  )
}

// ── Danger Zone ───────────────────────────────────────────────────────────────

function DangerZone({ connectorId, connectorName, onDisconnected }) {
  const { disconnect } = useConnectors()
  const [open, setOpen]                   = useState(false)
  const [input, setInput]                 = useState('')
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError]                 = useState(null)
  const keyword = 'DISCONNECT'
  const matches = input.trim().toUpperCase() === keyword

  const handleDisconnect = async () => {
    if (!matches) return
    setDisconnecting(true); setError(null)
    try { await disconnect(connectorId); onDisconnected?.() }
    catch (e) { setError(e.message); setDisconnecting(false) }
  }

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div style={{ width: '100%', maxWidth: 440, borderRadius: 14, overflow: 'hidden', background: '#fff', border: '1px solid #e5e0e0', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: '16px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} style={{ color: '#b91c1c' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c' }}>Disconnect {connectorName}?</p>
                <p style={{ fontSize: 11.5, color: '#991b1b' }}>This will stop all syncs immediately</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={15} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '12px 14px', borderRadius: 8, background: '#f8f7f7', border: '1px solid #e5e0e0', fontSize: 12, color: '#4a3a3a', lineHeight: 1.7 }}>
                <p style={{ fontWeight: 600, color: '#1a1314', marginBottom: 6 }}>What happens when you disconnect:</p>
                <p>· All directory syncs stop immediately</p>
                <p>· Existing synced users remain in RISYS</p>
                <p>· Security findings will no longer update</p>
                <p>· You can reconnect again at any time</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: '#8a7070', marginBottom: 6 }}>
                  Type <strong style={{ color: '#1a1314', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{keyword}</strong> to confirm
                </label>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && matches && handleDisconnect()}
                  placeholder={keyword} autoFocus
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)', padding: '9px 12px', borderRadius: 8, outline: 'none', border: `1.5px solid ${matches ? '#bbf7d0' : '#e5e0e0'}`, background: matches ? '#f0fdf4' : '#fff', color: '#1a1314', boxSizing: 'border-box', letterSpacing: '0.08em', transition: 'border-color 0.15s' }} />
              </div>
              {error && <p style={{ fontSize: 12, color: '#b91c1c' }}>{error}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
              <button onClick={() => { setOpen(false); setInput('') }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>
                Cancel
              </button>
              <button onClick={handleDisconnect} disabled={!matches || disconnecting}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: matches ? 'pointer' : 'not-allowed', border: 'none', background: matches ? '#b91c1c' : '#f5f3f3', color: matches ? '#fff' : '#d4cccc', opacity: disconnecting ? 0.6 : 1, transition: 'background 0.15s' }}>
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Just the button — the section wrapper lives in the Settings tab */}
      <button onClick={() => setOpen(true)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#b91c1c', border: '1.5px solid #fca5a5', whiteSpace: 'nowrap' }}>
        Disconnect
      </button>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntraManagePage() {
  const navigate = useNavigate()
  const { organization } = useAuth()

  const [tab, setTab]           = useState('users')
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState(null)
  const [syncError, setSyncError] = useState(false)

  const [users, setUsers]               = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [userFilter, setUserFilter]     = useState('all')
  const [userSearch, setUserSearch]     = useState('')

  const [logs, setLogs]               = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logFilter, setLogFilter]     = useState('all')

  const { getValidEntraToken } = useConnectors()

  const fetchUsers = useCallback(async () => {
    if (!organization?.id) return
    setUsersLoading(true)
    const { data } = await supabase.from('entra_users').select('*')
      .eq('org_id', organization.id).order('display_name')
    setUsers(data || [])
    setUsersLoading(false)
  }, [organization?.id])

  const fetchLogs = useCallback(async () => {
    if (!organization?.id) return
    setLogsLoading(true)
    let q = supabase.from('entra_signin_logs').select('*')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false }).limit(200)
    if (logFilter === 'failures') q = q.eq('status', 'failure')
    if (logFilter === 'risky')    q = q.neq('risk_level', 'none').neq('risk_level', null)
    const { data } = await q
    setLogs(data || [])
    setLogsLoading(false)
  }, [organization?.id, logFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { fetchLogs()  }, [fetchLogs])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null); setSyncError(false)
    try {
      // Refresh token if expiring within 5 minutes before hitting the edge function
      await getValidEntraToken()

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/entra-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ org_id: organization.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setSyncMsg(`Synced ${data.users_synced} users · ${data.signins_synced} sign-in events`)
      await fetchUsers(); await fetchLogs()
    } catch (err) { setSyncMsg(err.message); setSyncError(true) }
    finally { setSyncing(false) }
  }

  // Directory counts — plain directory attributes, no findings logic here.
  // (Security findings now live in the dedicated Findings page.)
  const c = {
    total:      users.length,
    no_mfa:     users.filter(u => u.account_enabled && !u.is_mfa_registered).length,
    privileged: users.filter(u => u.is_privileged).length,
    disabled:   users.filter(u => !u.account_enabled).length,
    guests:     users.filter(u => u.user_type === 'Guest').length,
    mfa_on:     users.filter(u => u.is_mfa_registered).length,
  }
  const lc = {
    total: logs.length,
    failures: logs.filter(l => l.status === 'failure').length,
    risky:    logs.filter(l => l.risk_level && l.risk_level !== 'none').length,
  }

  const filteredUsers = users.filter(u => {
    const mf =
      userFilter === 'all'        ? true :
      userFilter === 'no_mfa'     ? (!u.is_mfa_registered && u.account_enabled) :
      userFilter === 'privileged' ? u.is_privileged :
      userFilter === 'disabled'   ? !u.account_enabled :
      userFilter === 'guests'     ? u.user_type === 'Guest' : true
    const q = userSearch.toLowerCase()
    const ms = !q ||
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.user_principal_name || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q)
    return mf && ms
  })

  const GRID = '2fr 1.6fr 1fr 1fr 90px 24px'

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Microsoft Entra ID"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchUsers(); fetchLogs() }}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => navigate('/app/settings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* ── Connection card ───────────────────────────────────────────── */}
        <div className="rounded-xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: '1px solid #f0eded' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, padding: 10, flexShrink: 0, background: '#f8f7f7' }}>
              {['#f25022','#7fba00','#00a4ef','#ffb900'].map(col => (
                <div key={col} style={{ background: col, borderRadius: 1 }} />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#1a1314' }}>Microsoft Entra ID</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>● Active</span>
              </div>
              <p className="text-xs" style={{ color: '#8a7070' }}>
                {c.total} users · {c.mfa_on} of {c.total} with MFA
              </p>
              {syncMsg && (
                <p className="text-[11px] mt-1 font-medium" style={{ color: syncError ? '#b91c1c' : '#166534' }}>
                  {syncError ? '✗ ' : '✓ '}{syncMsg}
                </p>
              )}
            </div>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg flex-shrink-0"
              style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? <Spinner size="sm" /> : <RotateCw size={13} />}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {/* MFA posture bar */}
          <div className="flex items-center gap-5 px-5 py-4">
            <MfaRing total={c.total} registered={c.mfa_on} />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium" style={{ color: '#1a1314' }}>MFA Coverage</p>
                <p className="text-xs" style={{ color: '#8a7070' }}>{c.mfa_on} of {c.total} users protected</p>
              </div>
              <div style={{ height: 6, background: '#f0eded', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, transition: 'width 0.8s ease',
                  width: c.total > 0 ? `${Math.round((c.mfa_on / c.total) * 100)}%` : '0%',
                  background: c.no_mfa === 0 ? '#16a34a' : c.no_mfa > c.total / 2 ? '#dc2626' : '#d97706',
                }} />
              </div>
              <p className="text-[11px] mt-1" style={{ color: '#8a7070' }}>
                Maps to NCA ECC 2-1-2 · Privileged Access Management
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat cards (directory facets) ─────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <StatCard label="Total Users" value={c.total}      icon={Users}       onClick={() => { setTab('users'); setUserFilter('all') }} />
          <StatCard label="No MFA"      value={c.no_mfa}     icon={ShieldAlert} warn={c.no_mfa > 0}      onClick={() => { setTab('users'); setUserFilter('no_mfa') }} />
          <StatCard label="Privileged"  value={c.privileged} icon={Crown}       amber={c.privileged > 0} onClick={() => { setTab('users'); setUserFilter('privileged') }} />
          <StatCard label="Disabled"    value={c.disabled}   icon={UserX}       onClick={() => { setTab('users'); setUserFilter('disabled') }} />
          <StatCard label="Guests"      value={c.guests}     icon={Globe}       onClick={() => { setTab('users'); setUserFilter('guests') }} />
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex mb-5" style={{ borderBottom: '1px solid #e5e0e0' }}>
          {[
            { id: 'users',    label: 'Directory Users', icon: Users,    badge: null },
            { id: 'signins',  label: 'Sign-in Logs',    icon: Activity, badge: lc.failures > 0 ? lc.failures : null },
            { id: 'settings', label: 'Settings',        icon: Settings, badge: null },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs -mb-px border-b-2 transition-colors"
              style={{ color: tab === id ? '#1a1314' : '#8a7070', borderBottomColor: tab === id ? '#5D0F0F' : 'transparent', fontWeight: tab === id ? 500 : 400 }}>
              <Icon size={13} />{label}
              {badge && <span className="ml-1 px-1.5 rounded-full text-[10px] font-semibold" style={{ background: '#fef2f2', color: '#b91c1c' }}>{badge}</span>}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            DIRECTORY USERS
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'users' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: '#f5f3f3' }}>
                {[
                  ['all',       'All'],
                  ['no_mfa',    `No MFA${c.no_mfa > 0 ? ` (${c.no_mfa})` : ''}`],
                  ['privileged',`Privileged${c.privileged > 0 ? ` (${c.privileged})` : ''}`],
                  ['guests',    'Guests'],
                  ['disabled',  'Disabled'],
                ].map(([val, lbl]) => (
                  <button key={val} onClick={() => setUserFilter(val)}
                    className="px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{
                      background: userFilter === val ? '#fff' : 'transparent',
                      color:      userFilter === val ? '#1a1314' : '#8a7070',
                      border:     userFilter === val ? '1px solid #e5e0e0' : '1px solid transparent',
                      fontWeight: userFilter === val ? 500 : 400,
                    }}>{lbl}</button>
                ))}
              </div>
              <div className="flex-1 relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search name, email, department…"
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
                  style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314' }} />
              </div>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                <Users size={30} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>
                  {users.length === 0 ? 'No directory data yet' : 'No users match this filter'}
                </p>
                {users.length === 0 && (
                  <>
                    <p className="text-xs mb-4" style={{ color: '#8a7070' }}>Click Sync Now to pull your Entra directory</p>
                    <button onClick={handleSync} disabled={syncing}
                      className="text-xs px-4 py-2 rounded-lg"
                      style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                      {syncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                {/* Table header */}
                <div className="grid items-center px-4 py-2.5 text-[11px] uppercase tracking-wider"
                  style={{ gridTemplateColumns: GRID, background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
                  <span>User</span>
                  <span>Department · Title</span>
                  <span>Status</span>
                  <span>MFA</span>
                  <span>Last Sign-in</span>
                  <span />
                </div>

                <div style={{ background: '#fff' }}>
                  {filteredUsers.map((u, i) => (
                    <div key={u.id}
                      onClick={() => navigate(`/app/settings/entra/users/${u.entra_id}`)}
                      className="grid items-center px-4 py-3 hover:bg-[#fafafa] transition-colors cursor-pointer"
                      style={{
                        gridTemplateColumns: GRID,
                        borderTop: i > 0 ? '1px solid #f5f3f3' : 'none',
                        opacity: u.account_enabled ? 1 : 0.6,
                      }}>

                      {/* Avatar + name */}
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <Avatar name={u.display_name || u.user_principal_name} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate" style={{ color: '#1a1314' }}>
                              {u.display_name || u.user_principal_name || '—'}
                            </p>
                            {u.is_privileged && <Crown size={10} style={{ color: '#92400e', flexShrink: 0 }} />}
                            {u.user_type === 'Guest' && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                                GUEST
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] truncate" style={{ color: '#8a7070' }}>
                            {u.mail || u.user_principal_name || ''}
                          </p>
                        </div>
                      </div>

                      {/* Dept / title */}
                      <div className="min-w-0 pr-3">
                        <p className="text-xs truncate" style={{ color: '#4a3a3a' }}>{u.department || <span style={{ color: '#d4cccc' }}>—</span>}</p>
                        <p className="text-[11px] truncate" style={{ color: '#8a7070' }}>{u.job_title || ''}</p>
                      </div>

                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.account_enabled ? '#22c55e' : '#9ca3af' }} />
                        <span style={{ fontSize: 11, color: u.account_enabled ? '#166534' : '#6b7280' }}>
                          {u.account_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>

                      {/* MFA — plain directory attribute */}
                      <div>
                        {u.is_mfa_registered ? (
                          <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#166534' }}>
                            <CheckCircle size={12} style={{ color: '#22c55e' }} /> Registered
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b6acac' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d4cccc' }} /> Not set
                          </span>
                        )}
                      </div>

                      {/* Last sign-in */}
                      <span className="text-[11px]" style={{ color: u.last_sign_in ? '#8a7070' : '#d4cccc' }}>
                        {u.last_sign_in
                          ? new Date(u.last_sign_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          : 'Never'}
                      </span>

                      {/* Chevron */}
                      <ChevronRight size={14} style={{ color: '#d4cccc' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            SIGN-IN LOGS
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'signins' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total Events',    val: lc.total },
                { label: 'Failed Sign-ins', val: lc.failures, warn: lc.failures > 0 },
                { label: 'Risky Sign-ins',  val: lc.risky,    amber: lc.risky > 0 },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4"
                  style={{ background: '#fff', border: `1px solid ${s.warn ? '#fecaca' : s.amber ? '#fde68a' : '#e5e0e0'}` }}>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: s.warn ? '#b91c1c' : s.amber ? '#92400e' : '#8a7070' }}>{s.label}</p>
                  <p className="text-3xl font-light" style={{ color: s.warn ? '#b91c1c' : s.amber ? '#92400e' : '#1a1314' }}>{s.val}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-0 mb-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
              {[['all','All Events'],['failures','Failures'],['risky','Risky']].map(([val, label]) => (
                <button key={val} onClick={() => setLogFilter(val)}
                  className="px-4 py-2.5 text-xs -mb-px border-b-2 transition-colors"
                  style={{ color: logFilter === val ? '#1a1314' : '#8a7070', borderBottomColor: logFilter === val ? '#5D0F0F' : 'transparent', fontWeight: logFilter === val ? 500 : 400 }}>
                  {label}
                  {val === 'failures' && lc.failures > 0 && <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={{ background: '#fef2f2', color: '#b91c1c' }}>{lc.failures}</span>}
                  {val === 'risky' && lc.risky > 0 && <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={{ background: '#fffbeb', color: '#92400e' }}>{lc.risky}</span>}
                </button>
              ))}
            </div>

            {logsLoading ? <div className="flex justify-center py-16"><Spinner /></div>
            : logs.length === 0 ? (
              <div className="rounded-xl py-14 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                <Activity size={30} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>No sign-in events</p>
                <p className="text-xs mb-4" style={{ color: '#8a7070' }}>Requires Entra ID P1 · Click Sync Now to pull events</p>
                <button onClick={handleSync} disabled={syncing} className="text-xs px-4 py-2 rounded-lg" style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                <div className="grid items-center px-4 py-2.5 text-[11px] uppercase tracking-wider"
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 70px 1fr 110px', background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
                  <span>User</span><span>App</span><span>Location</span><span>MFA</span><span>Result</span><span>Time</span>
                </div>
                <div style={{ background: '#fff' }}>
                  {logs.map((log, i) => (
                    <div key={log.id} className="grid items-center px-4 py-3 hover:bg-[#fafafa]"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 70px 1fr 110px', borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
                      <div className="flex items-center gap-2.5 min-w-0 pr-3">
                        <Avatar name={log.user_display || log.user_email} size={26} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: '#1a1314' }}>{log.user_display || log.user_email || '—'}</p>
                          {log.user_email && log.user_display && <p className="text-[11px] truncate" style={{ color: '#8a7070' }}>{log.user_email}</p>}
                        </div>
                      </div>
                      <span className="text-xs truncate" style={{ color: '#8a7070' }}>{log.app_name || '—'}</span>
                      <span className="text-xs truncate" style={{ color: '#8a7070' }}>{log.location || log.ip_address || '—'}</span>
                      <span className="text-[11px] font-medium" style={{ color: log.mfa_used ? '#166534' : '#d4cccc' }}>{log.mfa_used ? '✓ Yes' : '—'}</span>
                      {log.status === 'failure'
                        ? <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}><X size={9} /> Failed</span>
                        : log.risk_level && log.risk_level !== 'none'
                          ? <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}><AlertTriangle size={9} /> Risky</span>
                          : <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={9} /> OK</span>
                      }
                      <span className="text-[11px]" style={{ color: '#8a7070' }}>
                        {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            SETTINGS TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-5">

            {/* Connection info */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>Connection</p>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Connector',     value: 'Microsoft Entra ID' },
                  { label: 'Status',        value: 'Active', color: '#166534' },
                  { label: 'Sync scope',    value: 'Users, MFA registration, directory roles, sign-in logs' },
                  { label: 'Sync method',   value: 'Manual (click Sync Now) · Auto-sync coming in Q3 2026' },
                  { label: 'Data retained', value: 'All synced data is kept if disconnected' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 12, color: '#8a7070', width: 120, flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: item.color || '#1a1314' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* What RISYS captures */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>What RISYS Captures</p>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { field: 'User profiles',         desc: 'Display name, email, UPN, department, job title, office location' },
                  { field: 'Account status',         desc: 'Active or disabled — used to detect orphaned accounts' },
                  { field: 'User type',              desc: 'Member or Guest — guests flagged as third-party access risk' },
                  { field: 'MFA registration',       desc: 'Whether MFA is registered and which methods (Auth App, TOTP, Windows Hello)' },
                  { field: 'MFA enforcement',        desc: 'Whether MFA is required by Conditional Access policy (P1)' },
                  { field: 'Directory roles',        desc: 'Global Admin, Security Admin, and all other Entra role assignments' },
                  { field: 'Privileged flag',        desc: 'Derived from directory roles — marks accounts needing extra controls' },
                  { field: 'Last sign-in',           desc: 'Date of most recent successful sign-in — used to detect inactive accounts (P1)' },
                  { field: 'Sign-in logs',           desc: 'Recent sign-in attempts: status, MFA used, app, location, IP, risk level (P1)' },
                  { field: 'Risk level',             desc: 'Microsoft\'s own per-sign-in risk score: none / low / medium / high (P2)' },
                ].map((p, i, arr) => (
                  <div key={p.field} style={{ display: 'flex', gap: 16, padding: '9px 10px', borderBottom: i < arr.length - 1 ? '1px solid #f5f3f3' : 'none', borderRadius: i === 0 ? '7px 7px 0 0' : i === arr.length - 1 ? '0 0 7px 7px' : 0, background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1314', width: 160, flexShrink: 0 }}>{p.field}</span>
                    <span style={{ fontSize: 12, color: '#8a7070', lineHeight: 1.55 }}>{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #fecaca' }}>
              <div style={{ padding: '12px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={13} style={{ color: '#b91c1c' }} />
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b91c1c' }}>Danger Zone</p>
              </div>
              <div style={{ padding: '16px 20px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1314', marginBottom: 3 }}>Disconnect Microsoft Entra ID</p>
                  <p style={{ fontSize: 12, color: '#8a7070', lineHeight: 1.6 }}>
                    Stops all directory syncs and identity monitoring immediately.
                    Existing data is preserved. You can reconnect at any time from Settings → Integrations.
                  </p>
                </div>
                <DangerZone connectorId="entra" connectorName="Microsoft Entra ID" onDisconnected={() => navigate('/app/settings')} />
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
