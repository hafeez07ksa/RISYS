import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  ArrowLeft, Building2, Users, ShieldAlert, ClipboardList, FileText,
  Pause, Play, Trash2, Pencil, RotateCw, Link2, Ban, AlertTriangle, X, Check
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePlatform, activationLink } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import {
  CopyBtn, PlatformHeader, EditLimitsModal, ReissueModal, SuspendModal, DeleteCompanyModal
} from './shared'

const ROLE_PILL = {
  admin:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9', label: 'Admin' },
  owner:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9', label: 'Owner' },
  risk_manager: { bg: '#FAF3E2', color: '#9C6F0F', border: '#EBDCB6', label: 'Risk Manager' },
  member:       { bg: '#ECF4EE', color: '#2F6B3C', border: '#C8DECD', label: 'Member' },
  viewer:       { bg: 'var(--surface)', color: 'var(--text-3)', border: 'var(--border)', label: 'Viewer' },
}
const INV_PILL = {
  pending: { bg: '#FAF3E2', color: '#9C6F0F', label: 'Pending' },
  expired: { bg: '#FBEAEA', color: '#8C1616', label: 'Expired' },
  accepted:{ bg: '#ECF4EE', color: '#2F6B3C', label: 'Accepted' },
  revoked: { bg: 'var(--surface)', color: 'var(--text-3)', label: 'Revoked' },
}
const invState = (inv) =>
  inv.status === 'pending' && new Date(inv.expires_at) < new Date() ? 'expired' : inv.status

function Section({ title, desc, action, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <p className="section-title">{title}</p>
          {desc && <p className="section-desc">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function PlatformCompanyPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const platform = usePlatform()
  const { isPlatformAdmin } = platform

  const [detail, setDetail] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showReissue, setShowReissue] = useState(false)
  const [showSuspend, setShowSuspend] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('platform_get_organization', { p_org: id })
    if (error) setLoadError(error.message)
    else setDetail(data)
  }, [id])

  useEffect(() => { if (isPlatformAdmin) load() }, [isPlatformAdmin, load])

  if (!user) return <Navigate to="/platform/login" replace />
  if (isPlatformAdmin === false) return <Navigate to="/platform/login" replace />
  if (isPlatformAdmin === null || (!detail && !loadError)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <PlatformHeader />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spinner size="lg" /></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <PlatformHeader />
        <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#8C1616' }}>{loadError}</p>
          <button onClick={() => navigate('/platform')} className="btn-secondary" style={{ marginTop: 14 }}>
            <ArrowLeft size={13} /> Back to console
          </button>
        </div>
      </div>
    )
  }

  const org = detail.org
  const suspended = org.status === 'suspended'
  const members = detail.members || []
  const invitations = (detail.invitations || []).filter(i => invState(i) !== 'accepted')
  const pendingAdminInvite = invitations.find(i => i.role === 'admin' && invState(i) === 'pending')
  const seatsFull = detail.member_count >= org.max_members

  // For the shared modals, shape the org like the console list rows expect
  const orgForModals = { ...org, member_count: detail.member_count, risk_count: detail.risk_count, admins: members.filter(m => ['admin','owner'].includes(m.role)) }

  const stats = [
    { icon: Users, label: 'Seats', value: `${detail.member_count}/${org.max_members}`, warn: seatsFull },
    { icon: ShieldAlert, label: 'Risks', value: detail.risk_count },
    { icon: AlertTriangle, label: 'Incidents', value: detail.incident_count },
    { icon: ClipboardList, label: 'Tasks', value: detail.task_count },
    { icon: FileText, label: 'Evidence Files', value: detail.evidence_count },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PlatformHeader />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 70px' }}>
        <button onClick={() => navigate('/platform')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14 }}>
          <ArrowLeft size={13} /> All companies
        </button>

        {/* Company header card */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, position: 'relative', overflow: 'hidden', marginBottom: 22 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: suspended ? '#8C1616' : 'linear-gradient(180deg, var(--crimson) 0%, var(--rose) 100%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 24px 20px 26px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={19} strokeWidth={1.5} style={{ color: 'var(--rose)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <h1 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)' }}>{org.name}</h1>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2.5px 10px', borderRadius: 20,
                    background: suspended ? '#FBEAEA' : '#ECF4EE', color: suspended ? '#8C1616' : '#2F6B3C' }}>
                    {suspended ? 'Suspended' : 'Active'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                  <span style={{ textTransform: 'capitalize' }}>{org.plan}</span> plan
                  {org.industry ? ` · ${org.industry}` : ''} · provisioned {new Date(org.created_at).toLocaleDateString('en-GB')}
                  {detail.last_risk_activity && ` · last activity ${new Date(detail.last_risk_activity).toLocaleDateString('en-GB')}`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowReissue(true)} className="btn-secondary" style={{ padding: '8px 13px' }}>
                <Link2 size={13} /> Activation link
              </button>
              <button onClick={() => setShowEdit(true)} className="btn-secondary" style={{ padding: '8px 13px' }}>
                <Pencil size={13} /> Plan & limits
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#FBEAEA', border: '1px solid #F0CECE', marginBottom: 16 }}>
            <AlertTriangle size={13} style={{ color: '#8C1616', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#8C1616', flex: 1 }}>{error}</p>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C1616' }}><X size={12} /></button>
          </div>
        )}

        {/* Usage strip */}
        <div className="grid grid-cols-5 mb-7 rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
          {stats.map((s, i) => (
            <div key={s.label} style={{ padding: '13px 16px', borderRight: i < stats.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 21, fontWeight: 300, color: s.warn ? '#9C6F0F' : 'var(--text)', lineHeight: 1.1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Access & activation */}
        <Section
          title="Access & Activation"
          desc="Open invitation links for this company — copy and send to the recipient"
          action={
            <button onClick={() => setShowReissue(true)} className="btn-primary" style={{ padding: '7px 13px' }}>
              <RotateCw size={12} /> Issue new link
            </button>
          }>
          {members.length === 0 && !pendingAdminInvite && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 14px', borderRadius: 10, background: '#FAF3E2', border: '1px solid #EBDCB6', marginBottom: 10 }}>
              <AlertTriangle size={13} style={{ color: '#9C6F0F', marginTop: 1, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#9C6F0F', lineHeight: 1.5 }}>
                Nobody can sign in to this company yet — issue an admin activation link and send it to their administrator.
              </p>
            </div>
          )}
          {invitations.length === 0 ? (
            <div className="rounded-xl py-9 text-center" style={{ background: '#fff', border: '1px dashed var(--border)' }}>
              <Link2 size={24} strokeWidth={1} className="mx-auto mb-2" style={{ color: 'var(--border-2)' }} />
              <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No open invitations</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="grid items-center px-4 py-2.5 table-head" style={{ gridTemplateColumns: '2fr 1fr 0.9fr 1fr auto' }}>
                <span>Email</span><span>Role</span><span>Status</span><span>Expires</span><span style={{ textAlign: 'right' }}>Link</span>
              </div>
              <div style={{ background: '#fff' }}>
                {invitations.map((inv, i) => {
                  const st = invState(inv)
                  const sp = INV_PILL[st] || INV_PILL.pending
                  const rp = ROLE_PILL[inv.role] || ROLE_PILL.viewer
                  return (
                    <div key={inv.id} className="grid items-center px-4 py-3"
                      style={{ gridTemplateColumns: '2fr 1fr 0.9fr 1fr auto', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, width: 'fit-content', background: rp.bg, color: rp.color, border: `1px solid ${rp.border}` }}>{rp.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, width: 'fit-content', background: sp.bg, color: sp.color }}>{sp.label}</span>
                      <span style={{ fontSize: 12, color: st === 'expired' ? '#8C1616' : 'var(--text-3)' }}>{new Date(inv.expires_at).toLocaleDateString('en-GB')}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {st === 'pending'
                          ? <CopyBtn text={activationLink(inv.token)} />
                          : <span style={{ fontSize: 11, color: 'var(--text-3)' }}><Ban size={11} style={{ display: 'inline', marginRight: 4 }} />link dead</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* Members roster */}
        <Section title="Members" desc="Everyone inside this company's workspace — read-only; their admin manages roles">
          {members.length === 0 ? (
            <div className="rounded-xl py-9 text-center" style={{ background: '#fff', border: '1px dashed var(--border)' }}>
              <Users size={24} strokeWidth={1} className="mx-auto mb-2" style={{ color: 'var(--border-2)' }} />
              <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No members yet — awaiting admin activation</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="grid items-center px-4 py-2.5 table-head" style={{ gridTemplateColumns: '2.2fr 1.1fr 1.3fr 1fr 1fr' }}>
                <span>Person</span><span>Role</span><span>Title</span><span>Joined</span><span>Last Active</span>
              </div>
              <div style={{ background: '#fff' }}>
                {members.map((m, i) => {
                  const rp = ROLE_PILL[m.role] || ROLE_PILL.viewer
                  return (
                    <div key={m.id} className="grid items-center px-4 py-3"
                      style={{ gridTemplateColumns: '2.2fr 1.1fr 1.3fr 1fr 1fr', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--crimson)', color: '#F3E7E4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>
                          {(m.name || m.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}</p>
                          {m.name && <p style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, width: 'fit-content', background: rp.bg, color: rp.color, border: `1px solid ${rp.border}` }}>{rp.label}</span>
                      <span style={{ fontSize: 12, color: m.title ? 'var(--text-2)' : 'var(--text-3)' }}>{m.title || '—'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-GB') : '—'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.last_active ? new Date(m.last_active).toLocaleDateString('en-GB') : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* Danger zone */}
        <Section title="Danger Zone" desc="Suspension is reversible and keeps all data — deletion is forever">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F0CECE', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{suspended ? 'Reactivate company' : 'Suspend company'}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {suspended
                    ? 'Restore access for all members instantly — everything is exactly as they left it'
                    : `All ${detail.member_count} member${detail.member_count === 1 ? '' : 's'} lose access within a minute; no data is touched (use for non-payment)`}
                </p>
              </div>
              <button onClick={() => setShowSuspend(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  background: suspended ? '#ECF4EE' : '#FAF3E2', color: suspended ? '#2F6B3C' : '#9C6F0F',
                  border: `1px solid ${suspended ? '#C8DECD' : '#EBDCB6'}` }}>
                {suspended ? <Play size={13} /> : <Pause size={13} />} {suspended ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#8C1616' }}>Delete company permanently</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  Erases every trace — all risks, evidence, history, members and their accounts. No recovery.
                </p>
              </div>
              <button onClick={() => setShowDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  background: '#8C1616', color: '#fff', border: 'none' }}>
                <Trash2 size={13} /> Delete everything
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Modals — shared with the console list */}
      {showEdit && (
        <EditLimitsModal org={orgForModals} platform={platform}
          onClose={() => { setShowEdit(false); load() }} onError={setError} />
      )}
      {showReissue && (
        <ReissueModal org={orgForModals} platform={platform}
          onClose={() => { setShowReissue(false); load() }} />
      )}
      {showSuspend && (
        <SuspendModal org={orgForModals}
          onClose={() => setShowSuspend(false)}
          onConfirm={async () => {
            try { await platform.setStatus(org.id, suspended ? 'active' : 'suspended') }
            catch (err) { setError(err.message) }
            setShowSuspend(false); load()
          }} />
      )}
      {showDelete && (
        <DeleteCompanyModal org={orgForModals} platform={platform}
          onClose={() => setShowDelete(false)}
          onDeleted={() => navigate('/platform')} />
      )}
    </div>
  )
}
