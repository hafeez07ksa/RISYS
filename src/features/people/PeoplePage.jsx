import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, Search, Copy, Check, RotateCw, Ban, Trash2, Mail,
  ShieldCheck, Users, Clock, AlertTriangle, X, ChevronDown,
  Building2, Shield, ShieldAlert, UserCheck, RefreshCw, Send,
  ChevronUp, Info,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { usePeople, ROLES, roleLabel, invitationState, inviteLink } from '@/hooks/usePeople'
import { isAdminRole } from '@/lib/roles'
import { logAudit, AUDIT } from '@/lib/audit'
import { tx, appLocale } from '@/lib/i18n'

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_PILL = {
  admin:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  owner:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  risk_manager: { bg: '#FAF3E2', color: '#9C6F0F', border: '#EBDCB6' },
  compliance_officer: { bg: '#EFF1FA', color: '#3B4A8C', border: '#CFD5EB' },
  member:       { bg: '#ECF4EE', color: '#2F6B3C', border: '#C8DECD' },
  auditor:      { bg: '#F2F0F6', color: '#5B4B79', border: '#DCD5E6' },
  viewer:       { bg: '#f8f7f7', color: '#8a7070', border: '#e5e0e0' },
}
const INV_PILL = {
  pending:  { bg: '#FAF3E2', color: '#9C6F0F', label: tx('Pending') },
  expired:  { bg: '#FBEAEA', color: '#8C1616', label: tx('Expired') },
  accepted: { bg: '#ECF4EE', color: '#2F6B3C', label: tx('Accepted') },
  revoked:  { bg: '#f8f7f7', color: '#8a7070', label: tx('Revoked') },
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

export function CopyButton({ text, label = 'Copy link' }) {
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
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? tx('Copied') : label}
    </button>
  )
}

// ── Custom role dropdown (replaces native <select>) ───────────────────────────
function RoleDropdown({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const pill = ROLE_PILL[value] || ROLE_PILL.viewer
  // roleLabel, not a lookup in the assignable list: `owner` is a real role
  // that is never offered in the dropdown, and it still has to render.
  const currentLabel = roleLabel(value)

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
        {currentLabel}
        {!disabled && <ChevronDown size={10} style={{ opacity: 0.6 }} />}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', insetInlineStart: 0, zIndex: 50,
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
                    padding: '10px 12px', cursor: 'pointer', border: 'none', textAlign: 'start',
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
  const navigate = useNavigate()
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
    const wasAdmin = isAdminRole(m.role)
    const becomingNonAdmin = !isAdminRole(role)
    if (wasAdmin && becomingNonAdmin) {
      const adminCount = members.filter(x => isAdminRole(x.role)).length
      if (adminCount <= 1) {
        setError(tx('Cannot demote the last admin. Promote another member to admin first.'))
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
    const isAdminOrOwner = isAdminRole(m.role)
    if (isAdminOrOwner) {
      const adminCount = members.filter(x => isAdminRole(x.role)).length
      if (adminCount <= 1) {
        setError(tx('Cannot remove the last admin. Promote another member to admin first.'))
        return
      }
    }
    setBusyId(m.id); setError('')
    try {
      await removeMember(m.id)
      await logAudit(organization?.id, AUDIT.MEMBER_REMOVED, 'member', m.id, m.full_name || m.email, { role: m.role })
    }
    catch (err) { setError(err.message) }
    finally { setBusyId(null) }
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
        title={tx('Employee Dashboard')}
        subtitle={organization?.name}
        actions={
          <div className="flex items-center gap-2">
            {tab === 'members' && isAdmin && (
              <button onClick={() => navigate('/app/people/invite')}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                <UserPlus size={13} /> {tx('Invite by Email')}</button>
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


      <div className="flex-1 overflow-y-auto page-content">

        {/* Summary cards */}
        <div className="grid grid-cols-4 mb-5 rounded-xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          {[
            { icon: Users,       label: tx('Workspace Members'),   value: members.length },
            { icon: Clock,       label: tx('Pending Invitations'), value: pendingCount },
            { icon: ShieldCheck, label: tx('Admins'),              value: members.filter(m => isAdminRole(m.role)).length },
            { icon: Building2,   label: tx('Directory Users'),     value: entraUsers.length || '—' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '14px 16px', borderInlineEnd: i < 3 ? '1px solid #e5e0e0' : 'none',
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
            { id: 'members',   label: tx('Workspace Members'), icon: UserCheck },
            { id: 'directory', label: tx('Entra ID Directory'), icon: Building2 },
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
                <span className='ms-1 text-[10px] px-1.5 py-0 rounded-full'
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{tx('Connected')}</span>
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
                <p className="section-title">{tx('Members')}</p>
                <p className="section-desc">{tx('Everyone with access to this workspace')}</p>
              </div>
              <div className="relative" style={{ width: 220 }}>
                <Search size={13} className='absolute start-3 top-1/2 -translate-y-1/2' style={{ color: '#8a7070' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tx('Search people...')}
                  className='w-full text-xs ps-8 pe-3 py-2 rounded-md border outline-none'
                  style={{ borderColor: '#e5e0e0', background: '#fff' }} />
              </div>
            </div>

            {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
              <div className="rounded-xl overflow-hidden mb-7" style={{ border: '1px solid #e5e0e0' }}>
                <div className="grid items-center px-4 py-2.5 table-head"
                  style={{ gridTemplateColumns: '2.2fr 1.4fr 1.4fr 1fr 1fr 80px' }}>
                  <span>{tx('Person')}</span><span>{tx('Role')}</span><span>{tx('Title')}</span><span>{tx('Joined')}</span><span>{tx('Last Active')}</span><span />
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
                              {isSelf && <span style={{ fontSize: 10, color: '#8a7070', fontWeight: 400 }}> {tx('(you)')}</span>}
                            </p>
                            {m.full_name && <p style={{ fontSize: 11, color: '#8a7070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>}
                          </div>
                        </div>

                        {/* Role — custom dropdown for admin, pill for self */}
                        {isAdmin && !isSelf && m.role !== 'owner' ? (
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
                        <span style={{ fontSize: 12, color: '#8a7070' }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString(appLocale()) : '—'}</span>
                        <span style={{ fontSize: 12, color: '#8a7070' }}>{m.last_active ? new Date(m.last_active).toLocaleDateString(appLocale()) : '—'}</span>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {isAdmin && !isSelf && (
                            <InlineConfirm triggerTitle={tx('Remove from workspace')} triggerStyle={{ padding: 5 }}
                              message={`${tx('Remove')} ${m.full_name || m.email}? ${tx('Access is revoked immediately.')}`}
                              confirmLabel={tx('Remove access')} onConfirm={() => handleRemove(m)}>
                              <Trash2 size={13} />
                            </InlineConfirm>
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
                  <p className="section-title">{tx('Invitations')}</p>
                  <p className="section-desc">{tx('Single-use links locked to the invited email · valid for 7 days')}</p>
                </div>
                {visibleInvitations.length === 0 ? (
                  <div className="rounded-xl py-10 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                    <Mail size={26} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#4a3a3a' }}>{tx('No open invitations')}</p>
                    <p style={{ fontSize: 12, color: '#8a7070', marginTop: 2 }}>{tx('Invite from the Directory tab or use "Invite by Email"')}</p>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                    <div className="grid items-center px-4 py-2.5 table-head" style={{ gridTemplateColumns: '2.2fr 1.2fr 1fr 1.2fr auto' }}>
                      <span>{tx('Email')}</span><span>{tx('Role')}</span><span>{tx('Status')}</span><span>{tx('Expires')}</span><span style={{ textAlign: 'end' }}>{tx('Actions')}</span>
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
                              {new Date(inv.expires_at).toLocaleDateString(appLocale())}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              {state === 'pending' && <CopyButton text={inviteLink(inv)} />}
                              {(state === 'expired' || state === 'revoked') && (
                                <button onClick={() => handleRegenerate(inv)} disabled={busyId === inv.id}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', background: '#f8f7f7', color: '#5D0F0F', border: '1px solid #e5e0e0' }}>
                                  <RotateCw size={11} /> {tx('New link')}</button>
                              )}
                              {state === 'pending' && (
                                <button onClick={() => handleRevoke(inv)} disabled={busyId === inv.id} title={tx('Revoke')}
                                  style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#8a7070' }}>
                                  <Ban size={13} />
                                </button>
                              )}
                              <button onClick={() => handleDeleteInvite(inv)} disabled={busyId === inv.id} title={tx('Delete')}
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
                <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>{tx('Microsoft Entra ID not connected')}</p>
                <p className="text-xs mb-4" style={{ color: '#8a7070' }}>{tx(
                  'Connect Entra ID from Settings → Integrations to import your employee directory'
                )}</p>
                <a href="/app/settings" className="text-xs px-4 py-2 rounded-lg inline-block"
                  style={{ background: '#5D0F0F', color: '#fff' }}>{tx('Go to Integrations →')}</a>
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
                          <Check size={14} className='inline me-1' />
                          {inviteResults.filter(r => r.ok).length} {tx('invitation')}{inviteResults.filter(r => r.ok).length !== 1 ? 's' : ''} {tx('sent')}</p>
                        {inviteResults.filter(r => !r.ok).length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#b91c1c' }}>
                            {inviteResults.filter(r => !r.ok).map(r => `${r.email}: ${r.error}`).join(' · ')}
                          </p>
                        )}
                        {noEmailWarning.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#92400e' }}>{tx('Skipped (no valid email):')} {noEmailWarning.join(', ')}
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
                    <span style={{ color: '#92400e' }}>{tx(
                      'Some users have no SMTP email address (only a guest UPN with #EXT#) and cannot be invited. They appear greyed out. To invite them, add a proper email address in Azure Portal → their user profile → Contact info → Email.'
                    )}</span>
                  </div>
                )}

                {/* Selection action bar */}
                {selected.size > 0 && (
                  <div className="mb-4 flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: '#fdf5f5', border: '1px solid #f0dada' }}>
                    <span className="text-xs font-medium" style={{ color: '#5D0F0F' }}>
                      {selected.size} {tx('employee')}{selected.size !== 1 ? 's' : ''} {tx('selected')}</span>
                    <span className="text-xs" style={{ color: '#8a7070' }}>{tx('Invite as:')}</span>
                    <div style={{ position: 'relative' }}>
                      <RoleDropdown value={inviteRole} onChange={setInviteRole} />
                    </div>
                    <button onClick={handleInviteSelected} disabled={inviting}
                      className='flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ms-auto'
                      style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: inviting ? 0.6 : 1 }}>
                      {inviting ? <Spinner size="sm" /> : <Send size={12} />}
                      {inviting ? tx('Sending...') : `Send ${selected.size} Invitation${selected.size !== 1 ? 's' : ''}`}
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
                    <Search size={13} className='absolute start-3 top-1/2 -translate-y-1/2' style={{ color: '#8a7070' }} />
                    <input value={dirSearch} onChange={e => setDirSearch(e.target.value)}
                      placeholder={tx('Search name, email, department...')}
                      className='w-full text-xs ps-8 pe-3 py-2 rounded-lg border outline-none'
                      style={{ borderColor: '#e5e0e0', background: '#fff', color: '#1a1314' }} />
                  </div>
                </div>

                {/* Directory table */}
                {entraUsers.length === 0 ? (
                  <div className="rounded-xl py-12 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                    <Building2 size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                    <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>{tx('No directory data yet')}</p>
                    <p className="text-xs mb-4" style={{ color: '#8a7070' }}>{tx('Go to Settings → Integrations → Entra ID → Sync Now')}</p>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e0e0' }}>
                    <div className="grid items-center px-4 py-2.5 table-head"
                      style={{ gridTemplateColumns: '36px 2.2fr 1.4fr 1fr 1fr 110px' }}>
                      <input type="checkbox"
                        checked={selected.size > 0 && selected.size === filteredDirUsers.filter(u => resolveEntraEmail(u)).length}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }} />
                      <span>{tx('Employee')}</span>
                      <span>{tx('Department / Title')}</span>
                      <span>{tx('MFA')}</span>
                      <span>{tx('Roles')}</span>
                      <span>{tx('Status in RISYS')}</span>
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
                                  {email || tx('No valid email — cannot invite')}
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
                                <Check size={10} /> {tx('MFA On')}</span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', width: 'fit-content' }}>
                                <AlertTriangle size={10} /> {tx('No MFA')}</span>
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
                                <UserCheck size={10} /> {tx('Member')}</span>
                            ) : isInvited ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', width: 'fit-content' }}>
                                <Mail size={10} /> {tx('Invited')}</span>
                            ) : !email ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', width: 'fit-content' }}>
                                <AlertTriangle size={10} /> {tx('No email')}</span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#d4cccc' }}>{tx('Not added')}</span>
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
