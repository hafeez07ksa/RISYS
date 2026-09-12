import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  UserPlus, Search, Copy, Check, RotateCw, Ban, Trash2, Mail,
  ShieldCheck, Users, Clock, AlertTriangle, X, ChevronDown,
  Building2, Shield, ShieldAlert, UserCheck, RefreshCw, Send,
  ChevronUp, Info,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { usePeople, ROLES, roleLabel, invitationState, inviteLink } from '@/hooks/usePeople'
import { logAudit, AUDIT } from '@/lib/audit'

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_PILL = {
  admin:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  owner:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  risk_manager: { bg: '#FAF3E2', color: '#9C6F0F', border: '#EBDCB6' },
  member:       { bg: '#ECF4EE', color: '#2F6B3C', border: '#C8DECD' },
  viewer:       { bg: '#f8f7f7', color: '#8a7070', border: '#e5e0e0' },
}
const INV_PILL = {
  pending:  { bg: '#FAF3E2', color: '#9C6F0F', label: 'Pending' },
  expired:  { bg: '#FBEAEA', color: '#8C1616', label: 'Expired' },
  accepted: { bg: '#ECF4EE', color: '#2F6B3C', label: 'Accepted' },
  revoked:  { bg: '#f8f7f7', color: '#8a7070', label: 'Revoked' },
}

function initialsOf(m) {
  const n = m.full_name || m.email || '?'
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Resolve the best invite email from an Entra user.
// Priority: mail (real SMTP) > UPN only if it looks like a real address
// (no #EXT# which is the external guest format that Supabase auth rejects)
function resolveEntraEmail(u) {
  if (u.mail) return u.mail
  const upn = u.user_principal_name || ''
  if (upn && !upn.includes('#EXT#')) return upn
  return null
}

function CopyButton({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500,
      padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
      background: copied ? '#ECF4EE' : '#f8f7f7',
      color: copied ? '#2F6B3C' : '#5D0F0F',
      border: `1px solid ${copied ? '#C8DECD' : '#e5e0e0'}`,
    }}>
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : label}
    </button>
  )
}

// ── Custom role dropdown (replaces native <select>) ───────────────────────────
function RoleDropdown({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const pill = ROLE_PILL[value] || ROLE_PILL.viewer
  const current = ROLES.find(r => r.value === value)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 500, padding: '4px 10px 4px 9px',
          borderRadius: 20, cursor: disabled ? 'default' : 'pointer',
          background: pill.bg, color: pill.color,
          border: `1px solid ${pill.border}`, outline: 'none',
          whiteSpace: 'nowrap',
        }}>
        {current?.label}
        {!disabled && <ChevronDown size={10} style={{ opacity: 0.6 }} />}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
            background: '#fff', border: '1px solid #e5e0e0', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(41,32,33,0.1)', minWidth: 200, overflow: 'hidden',
          }}>
            {ROLES.map(r => {
              const p = ROLE_PILL[r.value] || ROLE_PILL.viewer
              return (
                <button key={r.value}
                  onClick={() => { onChange(r.value); setOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', cursor: 'pointer', border: 'none', textAlign: 'left',
                    background: value === r.value ? '#f8f7f7' : '#fff',
                    borderBottom: '1px solid #f5f3f3',
                  }}>
                  <span style={{
                    marginTop: 2, flexShrink: 0, display: 'inline-block',
                    padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                    background: p.bg, color: p.color, border: `1px solid ${p.border}`,
                  }}>{r.label}</span>
                  <span style={{ fontSize: 11.5, color: '#8a7070', lineHeight: 1.4 }}>{r.desc}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function PeoplePage() {
  const { organization } = useAuth()
  const [tab, setTab] = useState('members')

  const {
    members, invitations, loading, isAdmin, currentUserId,
    inviteMany, revokeInvitation, deleteInvitation, regenerateInvitation,
    updateMemberRole, removeMember, refetch,
  } = usePeople()

  // ── Entra directory state ──────────────────────────────────────────────────
  const [entraUsers, setEntraUsers]         = useState([])
  const [entraLoading, setEntraLoading]     = useState(false)
  const [entraConnected, setEntraConnected] = useState(false)
  const [dirSearch, setDirSearch]           = useState('')
  const [dirFilter, setDirFilter]           = useState('all')
  const [selected, setSelected]             = useState(new Set())
  const [inviteRole, setInviteRole]         = useState('member')
  const [inviting, setInviting]             = useState(false)
  const [inviteResults, setInviteResults]   = useState(null)
  const [noEmailWarning, setNoEmailWarning] = useState([])

  const fetchDirectory = useCallback(async () => {
    if (!organization?.id) return
    setEntraLoading(true)
    const { data: conn } = await supabase
      .from('org_connectors')
      .select('status')
      .eq('org_id', organization.id)
      .eq('connector_id', 'entra')
      .single()
    setEntraConnected(conn?.status === 'active')
    if (conn?.status === 'active') {
      const { data } = await supabase
        .from('entra_users')
        .select('*')
        .eq('org_id', organization.id)
        .eq('account_enabled', true)
        .order('display_name')
      setEntraUsers(data || [])
    }
    setEntraLoading(false)
  }, [organization?.id])

  useEffect(() => {
    if (tab === 'directory') fetchDirectory()
  }, [tab, fetchDirectory])

  // ── Member state ──────────────────────────────────────────────────────────
  const [search, setSearch]               = useState('')
  const [showInvite, setShowInvite]       = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [busyId, setBusyId]               = useState(null)
  const [error, setError]                 = useState('')

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase()
    return members.filter(m =>
      !q || (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
    )
  }, [members, search])

  const visibleInvitations = useMemo(
    () => invitations.filter(i => invitationState(i) !== 'accepted'),
    [invitations]
  )
  const pendingCount = visibleInvitations.filter(i => invitationState(i) === 'pending').length

  // ── Entra derived data ─────────────────────────────────────────────────────
  const memberEmails  = new Set(members.map(m => (m.email || '').toLowerCase()))
  const invitedEmails = new Set(invitations.map(i => (i.email || '').toLowerCase()))

  const filteredDirUsers = useMemo(() => {
    const q = dirSearch.toLowerCase()
    return entraUsers.filter(u => {
      const email = resolveEntraEmail(u)?.toLowerCase() || ''
      const alreadyMember  = email && memberEmails.has(email)
      const alreadyInvited = email && invitedEmails.has(email)
      const hasValidEmail  = !!resolveEntraEmail(u)

      const matchFilter =
        dirFilter === 'all'         ? true :
        dirFilter === 'not_added'   ? (!alreadyMember && !alreadyInvited) :
        dirFilter === 'no_mfa'      ? !u.is_mfa_registered :
        dirFilter === 'privileged'  ? u.is_privileged :
        dirFilter === 'no_email'    ? !hasValidEmail : true

      const matchSearch = !q ||
        (u.display_name || '').toLowerCase().includes(q) ||
        email.includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.job_title || '').toLowerCase().includes(q)

      return matchFilter && matchSearch
    })
  }, [entraUsers, dirSearch, dirFilter, memberEmails, invitedEmails])

  const toggleSelect = (id) => {
    const u = entraUsers.find(u => u.entra_id === id)
    if (!resolveEntraEmail(u)) return // can't invite without a valid email
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const toggleAll = () => {
    const invitableIds = filteredDirUsers
      .filter(u => resolveEntraEmail(u))
      .map(u => u.entra_id)
    if (selected.size === invitableIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(invitableIds))
    }
  }

  const handleInviteSelected = async () => {
    const toInvite = entraUsers.filter(u => selected.has(u.entra_id))

    // Separate users with valid emails from those without
    const withEmail    = toInvite.filter(u => resolveEntraEmail(u))
    const withoutEmail = toInvite.filter(u => !resolveEntraEmail(u))

    if (withoutEmail.length > 0) {
      setNoEmailWarning(withoutEmail.map(u => u.display_name || u.user_principal_name))
    }

    const emails = withEmail.map(u => resolveEntraEmail(u)).filter(Boolean)
    if (!emails.length) return

    setInviting(true)
    try {
      // Deduplicate emails before sending
      const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase()))]
      const results = await inviteMany(uniqueEmails, inviteRole)
      setInviteResults(results)
      // Audit: log each successfully sent invite
      const sent = results.filter(r => r.ok).map(r => r.email)
      for (const email of sent) {
        await logAudit(organization?.id, AUDIT.MEMBER_INVITED, 'member', null, email, { role: inviteRole })
      }
      setSelected(new Set())
      refetch()
    } finally { setInviting(false) }
  }

  // ── Role change handler ────────────────────────────────────────────────────
  const handleRole = async (m, role) => {
    // Guard: cannot demote the last admin/owner
    const wasAdmin = ['admin', 'owner'].includes(m.role)
    const becomingNonAdmin = !['admin', 'owner'].includes(role)
    if (wasAdmin && becomingNonAdmin) {
      const adminCount = members.filter(x => ['admin', 'owner'].includes(x.role)).length
      if (adminCount <= 1) {
        setError('Cannot demote the last admin. Promote another member to admin first.')
        return
      }
    }
    setBusyId(m.id); setError('')
    try {
      await updateMemberRole(m.id, role)
      await logAudit(organization?.id, AUDIT.MEMBER_ROLE, 'member', m.id, m.full_name || m.email, { from: m.role, to: role })
    }
    catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const handleRemove = async (m) => {
    // Guard: cannot remove the last admin/owner
    const isAdminOrOwner = ['admin', 'owner'].includes(m.role)
    if (isAdminOrOwner) {
      const adminCount = members.filter(x => ['admin', 'owner'].includes(x.role)).length
      if (adminCount <= 1) {
        setError('Cannot remove the last admin. Promote another member to admin first.')
        setConfirmRemove(null)
        return
      }
    }
    setBusyId(m.id); setError('')
    try {
      await removeMember(m.id)
      await logAudit(organization?.id, AUDIT.MEMBER_REMOVED, 'member', m.id, m.full_name || m.email, { role: m.role })
    }
    catch (err) { setError(err.message) }
    finally { setBusyId(null); setConfirmRemove(null) }
  }

  const handleRevoke = async (inv) => {
    setBusyId(inv.id); setError('')
    try { await revokeInvitation(inv.id) }
    catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const handleDeleteInvite = async (inv) => {
    setBusyId(inv.id); setError('')
    try { await deleteInvitation(inv.id) }
    catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const handleRegenerate = async (inv) => {
    setBusyId(inv.id); setError('')
    try { await regenerateInvitation(inv) }
    catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Employee Dashboard"
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            {tab === 'members' && isAdmin && (
              <button onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                <UserPlus size={13} /> Invite by Email
              </button>
            )}
            {tab === 'directory' && entraConnected && (
              <button onClick={fetchDirectory}
                className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
                style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
                <RefreshCw size={13} />
              </button>
            )}
          </div>
        }
      />

      {showInvite && <InviteModal onClose={() => { setShowInvite(false); refetch() }} />}
      {confirmRemove && (
        <RemoveMemberModal
          member={confirmRemove}
          busy={busyId === confirmRemove.id}
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => handleRemove(confirmRemove)}
        />
      )}

      <div className="flex-1 overflow-y-auto page-content">

        {/* Summary cards */}
        <div className="grid grid-cols-4 mb-5 rounded-xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          {[
            { icon: Users,       label: 'Workspace Members',   value: members.length },
            { icon: Clock,       label: 'Pending Invitations', value: pendingCount },
            { icon: ShieldCheck, label: 'Admins',              value: members.filter(m => ['admin','owner'].includes(m.role)).length },
            { icon: Building2,   label: 'Directory Users',     value: entraUsers.length || '—' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '14px 16px', borderRight: i < 3 ? '1px solid #e5e0e0' : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f8f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={16} strokeWidth={1.5} style={{ color: '#895353' }} />
              </div>
              <div>
                <p className="eyebrow">{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: '#1a1314', lineHeight: 1.1 }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-5" style={{ borderBottom: '1px solid #e5e0e0' }}>
          {[
            { id: 'members',   label: 'Workspace Members', icon: UserCheck },
            { id: 'directory', label: 'Entra ID Directory', icon: Building2 },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs -mb-px border-b-2 transition-colors"
              style={{
                color: tab === id ? '#1a1314' : '#8a7070',
                borderBottomColor: tab === id ? '#5D0F0F' : 'transparent',
                fontWeight: tab === id ? 500 : 400,
              }}>
              <Icon size={13} />{label}
              {id === 'directory' && entraConnected && (
                <span className="ml-1 text-[10px] px-1.5 py-0 rounded-full"
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  Connected
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg"
            style={{ background: '#FBEAEA', border: '1px solid #F0CECE' }}>
            <AlertTriangle size={13} style={{ color: '#8C1616', flexShrink: 0 }} />
            <p className="text-xs flex-1" style={{ color: '#8C1616' }}>{error}</p>
            <button onClick={() => setError('')} style={{ color: '#8C1616', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
          </div>
        )}

        {/* ── WORKSPACE MEMBERS TAB ────────────────────────────────────── */}
        {tab === 'members' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-title">Members</p>
                <p className="section-desc">Everyone with access to this workspace</p>
              </div>
              <div className="relative" style={{ width: 220 }}>
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people..."
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-md border outline-none"
                  style={{ borderColor: '#e5e0e0', background: '#fff' }} />
              </div>
            </div>

            {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
              <div className="rounded-xl overflow-hidden mb-7" style={{ border: '1px solid #e5e0e0' }}>
                <div className="grid items-center px-4 py-2.5 table-head"
                  style={{ gridTemplateColumns: '2.2fr 1.4fr 1.4fr 1fr 1fr 80px' }}>
                  <span>Person</span><span>Role</span><span>Title</span><span>Joined</span><span>Last Active</span><span />
                </div>
                <div style={{ background: '#fff' }}>
                  {filteredMembers.map((m, i) => {
                    const isSelf = m.user_id === currentUserId
                    return (
                      <div key={m.id} className="row-hover grid items-center px-4 py-3"
                        style={{ gridTemplateColumns: '2.2fr 1.4fr 1.4fr 1fr 1fr 80px', borderTop: i > 0 ? '1px solid #e5e0e0' : 'none' }}>

                        {/* Avatar + name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#5D0F0F', color: '#F3E7E4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {initialsOf(m)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.full_name || m.email || m.user_id?.slice(0, 8)}
                              {isSelf && <span style={{ fontSize: 10, color: '#8a7070', fontWeight: 400 }}> (you)</span>}
                            </p>
                            {m.full_name && <p style={{ fontSize: 11, color: '#8a7070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>}
                          </div>
                        </div>

                        {/* Role — custom dropdown for admin, pill for self */}
                        {isAdmin && !isSelf ? (
                          <RoleDropdown
                            value={m.role}
                            onChange={role => handleRole(m, role)}
                            disabled={busyId === m.id}
                          />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, width: 'fit-content',
                            background: (ROLE_PILL[m.role] || ROLE_PILL.viewer).bg,
                            color: (ROLE_PILL[m.role] || ROLE_PILL.viewer).color,
                            border: `1px solid ${(ROLE_PILL[m.role] || ROLE_PILL.viewer).border}` }}>
                            {roleLabel(m.role)}
                          </span>
                        )}

                        <span style={{ fontSize: 12, color: m.title ? '#4a3a3a' : '#8a7070' }}>{m.title || '—'}</span>
                        <span style={{ fontSize: 12, color: '#8a7070' }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-GB') : '—'}</span>
                        <span style={{ fontSize: 12, color: '#8a7070' }}>{m.last_active ? new Date(m.last_active).toLocaleDateString('en-GB') : '—'}</span>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {isAdmin && !isSelf && (
                            <button onClick={() => setConfirmRemove(m)} title="Remove from workspace"
                              style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#8a7070' }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Invitations section */}
            {isAdmin && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <p className="section-title">Invitations</p>
                  <p className="section-desc">Single-use links locked to the invited email · valid for 7 days</p>
                </div>
                {visibleInvitations.length === 0 ? (
                  <div className="rounded-xl py-10 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                    <Mail size={26} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#4a3a3a' }}>No open invitations</p>
                    <p style={{ fontSize: 12, color: '#8a7070', marginTop: 2 }}>Invite from the Directory tab or use "Invite by Email"</p>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                    <div className="grid items-center px-4 py-2.5 table-head" style={{ gridTemplateColumns: '2.2fr 1.2fr 1fr 1.2fr auto' }}>
                      <span>Email</span><span>Role</span><span>Status</span><span>Expires</span><span style={{ textAlign: 'right' }}>Actions</span>
                    </div>
                    <div style={{ background: '#fff' }}>
                      {visibleInvitations.map((inv, i) => {
                        const state   = invitationState(inv)
                        const sp      = INV_PILL[state] || INV_PILL.pending
                        const rolePill = ROLE_PILL[inv.role] || ROLE_PILL.viewer
                        return (
                          <div key={inv.id} className="row-hover grid items-center px-4 py-3"
                            style={{ gridTemplateColumns: '2.2fr 1.2fr 1fr 1.2fr auto', borderTop: i > 0 ? '1px solid #e5e0e0' : 'none' }}>
                            <span style={{ fontSize: 13, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: rolePill.bg, color: rolePill.color, border: `1px solid ${rolePill.border}`, width: 'fit-content' }}>
                              {roleLabel(inv.role)}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: sp.bg, color: sp.color, width: 'fit-content' }}>{sp.label}</span>
                            <span style={{ fontSize: 12, color: state === 'expired' ? '#8C1616' : '#8a7070' }}>
                              {new Date(inv.expires_at).toLocaleDateString('en-GB')}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              {state === 'pending' && <CopyButton text={inviteLink(inv)} />}
                              {(state === 'expired' || state === 'revoked') && (
                                <button onClick={() => handleRegenerate(inv)} disabled={busyId === inv.id}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', background: '#f8f7f7', color: '#5D0F0F', border: '1px solid #e5e0e0' }}>
                                  <RotateCw size={11} /> New link
                                </button>
                              )}
                              {state === 'pending' && (
                                <button onClick={() => handleRevoke(inv)} disabled={busyId === inv.id} title="Revoke"
                                  style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#8a7070' }}>
                                  <Ban size={13} />
                                </button>
                              )}
                              <button onClick={() => handleDeleteInvite(inv)} disabled={busyId === inv.id} title="Delete"
                                style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#8C1616' }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── ENTRA DIRECTORY TAB ──────────────────────────────────────── */}
        {tab === 'directory' && (
          <>
            {!entraConnected ? (
              <div className="rounded-xl py-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                <Building2 size={32} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>Microsoft Entra ID not connected</p>
                <p className="text-xs mb-4" style={{ color: '#8a7070' }}>
                  Connect Entra ID from Settings → Integrations to import your employee directory
                </p>
                <a href="/app/settings" className="text-xs px-4 py-2 rounded-lg inline-block"
                  style={{ background: '#5D0F0F', color: '#fff' }}>
                  Go to Integrations →
                </a>
              </div>
            ) : entraLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : (
              <>
                {/* Invite results banner */}
                {inviteResults && (
                  <div className="mb-4 p-4 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#166534' }}>
                          <Check size={14} className="inline mr-1" />
                          {inviteResults.filter(r => r.ok).length} invitation{inviteResults.filter(r => r.ok).length !== 1 ? 's' : ''} sent
                        </p>
                        {inviteResults.filter(r => !r.ok).length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#b91c1c' }}>
                            {inviteResults.filter(r => !r.ok).map(r => `${r.email}: ${r.error}`).join(' · ')}
                          </p>
                        )}
                        {noEmailWarning.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#92400e' }}>
                            Skipped (no valid email): {noEmailWarning.join(', ')}
                          </p>
                        )}
                      </div>
                      <button onClick={() => { setInviteResults(null); setNoEmailWarning([]) }}
                        style={{ color: '#166534', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* No-email warning banner */}
                {entraUsers.some(u => !resolveEntraEmail(u)) && !inviteResults && (
                  <div className="mb-4 flex items-start gap-2 p-3 rounded-lg text-xs"
                    style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <Info size={13} style={{ color: '#92400e', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ color: '#92400e' }}>
                      Some users have no SMTP email address (only a guest UPN with #EXT#) and cannot be invited.
                      They appear greyed out. To invite them, add a proper email address in Azure Portal → their user profile → Contact info → Email.
                    </span>
                  </div>
                )}

                {/* Selection action bar */}
                {selected.size > 0 && (
                  <div className="mb-4 flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: '#fdf5f5', border: '1px solid #f0dada' }}>
                    <span className="text-xs font-medium" style={{ color: '#5D0F0F' }}>
                      {selected.size} employee{selected.size !== 1 ? 's' : ''} selected
                    </span>
                    <span className="text-xs" style={{ color: '#8a7070' }}>Invite as:</span>
                    <div style={{ position: 'relative' }}>
                      <RoleDropdown value={inviteRole} onChange={setInviteRole} />
                    </div>
                    <button onClick={handleInviteSelected} disabled={inviting}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ml-auto"
                      style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: inviting ? 0.6 : 1 }}>
                      {inviting ? <Spinner size="sm" /> : <Send size={12} />}
                      {inviting ? 'Sending...' : `Send ${selected.size} Invitation${selected.size !== 1 ? 's' : ''}`}
                    </button>
                    <button onClick={() => setSelected(new Set())}
                      style={{ color: '#8a7070', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Filter + search */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#f5f3f3' }}>
                    {[
                      ['all',       'All'],
                      ['not_added', 'Not in RISYS'],
                      ['no_mfa',    'No MFA'],
                      ['privileged','Privileged'],
                    ].map(([val, lbl]) => (
                      <button key={val} onClick={() => setDirFilter(val)}
                        className="px-3 py-1.5 rounded-md text-xs transition-colors"
                        style={{
                          background: dirFilter === val ? '#fff' : 'transparent',
                          color:      dirFilter === val ? '#1a1314' : '#8a7070',
                          border:     dirFilter === val ? '1px solid #e5e0e0' : '1px solid transparent',
                          fontWeight: dirFilter === val ? 500 : 400,
                        }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7070' }} />
                    <input value={dirSearch} onChange={e => setDirSearch(e.target.value)}
                      placeholder="Search name, email, department..."
                      className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border outline-none"
                      style={{ borderColor: '#e5e0e0', background: '#fff', color: '#1a1314' }} />
                  </div>
                </div>

                {/* Directory table */}
                {entraUsers.length === 0 ? (
                  <div className="rounded-xl py-12 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                    <Building2 size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                    <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>No directory data yet</p>
                    <p className="text-xs mb-4" style={{ color: '#8a7070' }}>Go to Settings → Integrations → Entra ID → Sync Now</p>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                    <div className="grid items-center px-4 py-2.5 table-head"
                      style={{ gridTemplateColumns: '36px 2.2fr 1.4fr 1fr 1fr 110px' }}>
                      <input type="checkbox"
                        checked={selected.size > 0 && selected.size === filteredDirUsers.filter(u => resolveEntraEmail(u)).length}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }} />
                      <span>Employee</span>
                      <span>Department / Title</span>
                      <span>MFA</span>
                      <span>Roles</span>
                      <span>Status in RISYS</span>
                    </div>
                    <div style={{ background: '#fff' }}>
                      {filteredDirUsers.map((u, i) => {
                        const email       = resolveEntraEmail(u)
                        const emailLower  = email?.toLowerCase()
                        const isMember    = emailLower && memberEmails.has(emailLower)
                        const isInvited   = emailLower && invitedEmails.has(emailLower)
                        const isSelected  = selected.has(u.entra_id)
                        const canInvite   = !!email && !isMember

                        return (
                          <div key={u.entra_id}
                            onClick={() => canInvite && toggleSelect(u.entra_id)}
                            className="grid items-center px-4 py-3 transition-colors"
                            style={{
                              gridTemplateColumns: '36px 2.2fr 1.4fr 1fr 1fr 110px',
                              borderTop: i > 0 ? '1px solid #f5f3f3' : 'none',
                              background: isSelected ? '#fdf5f5' : 'transparent',
                              cursor: canInvite ? 'pointer' : 'default',
                              opacity: !email ? 0.45 : 1,
                            }}>

                            <input type="checkbox"
                              checked={isSelected}
                              disabled={!canInvite}
                              onChange={() => canInvite && toggleSelect(u.entra_id)}
                              onClick={e => e.stopPropagation()}
                              style={{ cursor: canInvite ? 'pointer' : 'not-allowed' }} />

                            {/* Name + email */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f5f3f3', color: '#5D0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                                {(u.display_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {u.display_name || u.user_principal_name}
                                  </p>
                                  {u.is_privileged && <ShieldAlert size={11} style={{ color: '#92400e', flexShrink: 0 }} />}
                                </div>
                                <p style={{ fontSize: 11, color: email ? '#8a7070' : '#b91c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {email || 'No valid email — cannot invite'}
                                </p>
                              </div>
                            </div>

                            {/* Department / Title */}
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 12, color: '#4a3a3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.department || '—'}</p>
                              <p style={{ fontSize: 11, color: '#8a7070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.job_title || ''}</p>
                            </div>

                            {/* MFA */}
                            {u.is_mfa_registered ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', width: 'fit-content' }}>
                                <Check size={10} /> MFA On
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', width: 'fit-content' }}>
                                <AlertTriangle size={10} /> No MFA
                              </span>
                            )}

                            {/* Roles */}
                            <div>
                              {u.directory_roles?.length > 0 ? (
                                <p style={{ fontSize: 11, color: '#92400e', fontWeight: 500 }}>
                                  {u.directory_roles[0]?.displayName}
                                  {u.directory_roles.length > 1 && ` +${u.directory_roles.length - 1}`}
                                </p>
                              ) : (
                                <span style={{ fontSize: 11, color: '#d4cccc' }}>—</span>
                              )}
                            </div>

                            {/* Status in RISYS */}
                            {isMember ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', width: 'fit-content' }}>
                                <UserCheck size={10} /> Member
                              </span>
                            ) : isInvited ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', width: 'fit-content' }}>
                                <Mail size={10} /> Invited
                              </span>
                            ) : !email ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', width: 'fit-content' }}>
                                <AlertTriangle size={10} /> No email
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#d4cccc' }}>Not added</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Invite by Email Modal ─────────────────────────────────────────────────────
function InviteModal({ onClose }) {
  const { inviteMany } = usePeople()
  const [emailsRaw, setEmailsRaw] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  const emails = emailsRaw.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean)
  // Deduplicate client-side
  const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase()))]
  const valid = uniqueEmails.length > 0

  const send = async () => {
    setSending(true)
    try { setResults(await inviteMany(uniqueEmails, role)) }
    finally { setSending(false) }
  }

  const successes = results?.filter(r => r.ok) || []
  const failures  = results?.filter(r => !r.ok) || []
  const allLinks  = successes.map(r => `${r.email}: ${inviteLink(r.invitation)}`).join('\n')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(41,32,33,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', border: '1px solid #e5e0e0', maxHeight: '88vh' }}>

        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0', background: '#f8f7f7' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1a1314' }}>Invite by Email</h2>
            <p style={{ fontSize: 11.5, color: '#8a7070', marginTop: 2 }}>Each person gets a single-use link · valid for 7 days · locked to their email</p>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070', background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {!results ? (
            <>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Email addresses</label>
                <textarea value={emailsRaw} onChange={e => setEmailsRaw(e.target.value)} rows={4} autoFocus
                  placeholder={'sara@company.com\nahmed@company.com'}
                  className="risys-input" style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
                <p style={{ fontSize: 11, color: '#8a7070', marginTop: 4 }}>
                  Separate with commas or new lines.
                  {uniqueEmails.length > 1 && <strong style={{ color: '#895353' }}> {uniqueEmails.length} unique addresses.</strong>}
                  {emails.length !== uniqueEmails.length && <span style={{ color: '#92400e' }}> ({emails.length - uniqueEmails.length} duplicate{emails.length - uniqueEmails.length !== 1 ? 's' : ''} removed)</span>}
                </p>
              </div>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Role</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => setRole(r.value)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                        background: role === r.value ? '#F6EBE8' : '#fff',
                        border: `1px solid ${role === r.value ? '#895353' : '#e5e0e0'}` }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', marginTop: 1, flexShrink: 0, border: `4.5px solid ${role === r.value ? '#5D0F0F' : '#d4cccc'}`, background: '#fff' }} />
                      <span>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1314' }}>{r.label}</p>
                        <p style={{ fontSize: 11.5, color: '#8a7070', marginTop: 1 }}>{r.desc}</p>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {successes.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#2F6B3C' }}>
                      <Check size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {successes.length} invitation{successes.length > 1 ? 's' : ''} created
                    </p>
                    {successes.length > 1 && <CopyButton text={allLinks} label="Copy all links" />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {successes.map(r => (
                      <div key={r.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
                        <span style={{ fontSize: 12, color: '#1a1314', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</span>
                        <CopyButton text={inviteLink(r.invitation)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {failures.length > 0 && (
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#8C1616', marginBottom: 8 }}>
                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {failures.length} could not be invited
                  </p>
                  {failures.map(r => (
                    <div key={r.email} style={{ padding: '8px 10px', borderRadius: 8, background: '#FBEAEA', border: '1px solid #F0CECE', marginBottom: 6 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#1a1314' }}>{r.email}</p>
                      <p style={{ fontSize: 11.5, color: '#8C1616', marginTop: 1 }}>{r.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2.5 px-5 pb-5 pt-3" style={{ borderTop: '1px solid #e5e0e0' }}>
          {!results ? (
            <>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={send} disabled={sending || !valid} className="btn-primary flex-1" style={{ opacity: valid ? 1 : 0.5 }}>
                {sending ? <Spinner size="sm" /> : <UserPlus size={13} />}
                Invite {uniqueEmails.length > 1 ? `${uniqueEmails.length} people` : ''}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-primary flex-1">Done</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Remove Member Modal ───────────────────────────────────────────────────────
function RemoveMemberModal({ member, busy, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(41,32,33,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e0e0', background: '#f8f7f7' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1a1314' }}>
            Remove {member.full_name || member.email} from this workspace?
          </h2>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 12.5, color: '#4a3a3a', lineHeight: 1.65 }}>
            Their access is revoked <strong>immediately</strong>. Their name remains on all historical records and they can be re-invited later.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
              padding: '9px 0', borderRadius: 8, cursor: 'pointer', background: '#8C1616', color: '#fff', border: 'none' }}>
            {busy ? <Spinner size="sm" /> : <Trash2 size={13} />} Remove access
          </button>
        </div>
      </div>
    </div>
  )
}
