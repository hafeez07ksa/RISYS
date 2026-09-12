import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import {
  Building2, Plus, X, Check, Pause, Play, Pencil,
  ShieldCheck, Users, RotateCw, AlertTriangle, UserPlus, Trash2
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlatform, activationLink } from '@/hooks/usePlatform'
import { PLANS, CopyBtn, PlatformHeader, EditLimitsModal, ReissueModal, SuspendModal, DeleteCompanyModal } from './shared'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'


export function PlatformConsolePage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuthStore()
  const platform = usePlatform()
  const { isPlatformAdmin, orgs, admins, loading } = platform

  const [showCreate, setShowCreate] = useState(false)
  const [editOrg, setEditOrg] = useState(null)
  const [suspendOrg, setSuspendOrg] = useState(null)
  const [reissueFor, setReissueFor] = useState(null)
  const [deleteFor, setDeleteFor] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  if (!user) return <Navigate to="/platform/login" replace />
  if (isPlatformAdmin === null || (isPlatformAdmin && loading)) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size="lg" /></div>
  }
  if (isPlatformAdmin === false) return <Navigate to="/platform/login" replace />

  const active = orgs.filter(o => o.status === 'active').length
  const totalSeats = orgs.reduce((s, o) => s + (o.member_count || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PlatformHeader />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px 60px' }}>
        {/* Overview strip */}
        <div className="grid grid-cols-4 mb-6 rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
          {[
            { icon: Building2, label: 'Companies', value: orgs.length },
            { icon: Play, label: 'Active', value: active },
            { icon: Pause, label: 'Suspended', value: orgs.length - active },
            { icon: Users, label: 'Total Users', value: totalSeats },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '14px 16px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={16} strokeWidth={1.5} style={{ color: 'var(--rose)' }} />
              </div>
              <div>
                <p className="eyebrow">{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: 'var(--text)', lineHeight: 1.1 }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#ECF4EE', border: '1px solid #C8DECD', marginBottom: 14 }}>
            <Check size={13} style={{ color: '#2F6B3C', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#2F6B3C', flex: 1 }}>{notice}</p>
            <button onClick={() => setNotice('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F6B3C' }}><X size={12} /></button>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#FBEAEA', border: '1px solid #F0CECE', marginBottom: 14 }}>
            <AlertTriangle size={13} style={{ color: '#8C1616', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#8C1616', flex: 1 }}>{error}</p>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C1616' }}><X size={12} /></button>
          </div>
        )}

        {/* Companies */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p className="section-title">Client Companies</p>
            <p className="section-desc">Every tenant on the platform — provision, limit, suspend</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary" style={{ padding: '8px 14px' }}>
            <Plus size={13} /> New Company
          </button>
        </div>

        <div className="rounded-xl overflow-hidden mb-8" style={{ border: '1px solid var(--border)' }}>
          <div className="grid items-center px-4 py-2.5 table-head" style={{ gridTemplateColumns: '2fr 0.9fr 0.9fr 0.9fr 0.8fr 0.8fr auto' }}>
            <span>Company</span><span>Status</span><span>Plan</span><span>Seats</span><span>Risks</span><span>Created</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          <div style={{ background: '#fff' }}>
            {orgs.length === 0 && (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <Building2 size={26} strokeWidth={1} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>No companies yet</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Provision your first client with "New Company"</p>
              </div>
            )}
            {orgs.map((o, i) => {
              const suspended = o.status === 'suspended'
              const seatsFull = o.member_count >= o.max_members
              return (
                <div key={o.id} className="row-hover grid items-center px-4 py-3"
                  onClick={() => navigate(`/platform/companies/${o.id}`)}
                  style={{ gridTemplateColumns: '2fr 0.9fr 0.9fr 0.9fr 0.8fr 0.8fr auto', borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: suspended ? 0.75 : 1, cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{o.name}</p>
                    {(o.admins || []).length > 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.admins.map(a => a.email).join(', ')}
                      </p>
                    ) : (
                      <p style={{ fontSize: 11, color: '#9C6F0F' }}>
                        Awaiting admin activation — use ↻ to copy their activation link
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, width: 'fit-content',
                    background: suspended ? '#FBEAEA' : '#ECF4EE', color: suspended ? '#8C1616' : '#2F6B3C' }}>
                    {suspended ? 'Suspended' : 'Active'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'capitalize' }}>{o.plan}</span>
                  <span style={{ fontSize: 12, color: seatsFull ? '#9C6F0F' : 'var(--text-2)', fontWeight: seatsFull ? 600 : 400 }}>
                    {o.member_count}/{o.max_members}{o.pending_invites > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> (+{o.pending_invites})</span>}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{o.risk_count}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(o.created_at).toLocaleDateString('en-GB')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={(e) => { e.stopPropagation(); setReissueFor(o) }} title="Issue admin activation link"
                      style={{ padding: 6, borderRadius: 6, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--rose)' }}>
                      <RotateCw size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditOrg(o) }} title="Edit plan & limits"
                      style={{ padding: 6, borderRadius: 6, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-3)' }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setSuspendOrg(o) }} title={suspended ? 'Reactivate' : 'Suspend'}
                      style={{ padding: 6, borderRadius: 6, cursor: 'pointer',
                        background: suspended ? '#ECF4EE' : '#FBEAEA',
                        border: `1px solid ${suspended ? '#C8DECD' : '#F0CECE'}`,
                        color: suspended ? '#2F6B3C' : '#8C1616' }}>
                      {suspended ? <Play size={12} /> : <Pause size={12} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteFor(o) }} title="Delete company permanently"
                      style={{ padding: 6, borderRadius: 6, cursor: 'pointer', background: '#8C1616', border: '1px solid #8C1616', color: '#fff' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Platform staff */}
        <div style={{ marginBottom: 10 }}>
          <p className="section-title">Platform Staff</p>
          <p className="section-desc">RISYS employees with console access — completely separate from tenant roles</p>
        </div>
        <StaffPanel platform={platform} currentUserId={user.id} onError={setError} />
      </div>

      {showCreate && <CreateCompanyModal platform={platform} onClose={() => setShowCreate(false)} />}
      {editOrg && <EditLimitsModal org={editOrg} platform={platform} onClose={() => setEditOrg(null)} onError={setError} />}
      {reissueFor && <ReissueModal org={reissueFor} platform={platform} onClose={() => setReissueFor(null)} />}
      {deleteFor && (
        <DeleteCompanyModal org={deleteFor} platform={platform}
          onClose={() => setDeleteFor(null)}
          onDeleted={(res) => {
            setDeleteFor(null)
            setNotice(`${res.deleted_org} was permanently deleted` +
              (res.deleted_user_accounts > 0 ? ` along with ${res.deleted_user_accounts} user account${res.deleted_user_accounts > 1 ? 's' : ''}.` : '.'))
          }} />
      )}
      {suspendOrg && (
        <SuspendModal org={suspendOrg} onClose={() => setSuspendOrg(null)}
          onConfirm={async () => {
            try { await platform.setStatus(suspendOrg.id, suspendOrg.status === 'active' ? 'suspended' : 'active') }
            catch (err) { setError(err.message) }
            setSuspendOrg(null)
          }} />
      )}
    </div>
  )
}

/* ── Staff panel ─────────────────────────────────────────────── */
function StaffPanel({ platform, currentUserId, onError }) {
  const { admins, addPlatformAdmin, removePlatformAdmin } = platform
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!email.trim()) return
    setBusy(true)
    try { await addPlatformAdmin(email.trim()); setEmail('') }
    catch (err) { onError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#fff' }}>
      {admins.map((a, i) => (
        <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#292021', color: '#F3E7E4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600 }}>
            {(a.name || a.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>
              {a.name || a.email}{a.user_id === currentUserId && <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}> (you)</span>}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.email}</p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 500, padding: '3px 9px', borderRadius: 20, background: '#F6EBE8', color: '#5D0F0F', border: '1px solid #E6CFC9' }}>
            <ShieldCheck size={10} /> Platform Admin
          </span>
          {a.user_id !== currentUserId && (
            <button onClick={async () => { try { await removePlatformAdmin(a.user_id) } catch (err) { onError(err.message) } }}
              title="Remove console access"
              style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="colleague@risys.com — must already have a RISYS login"
          className="risys-input" style={{ flex: 1 }} />
        <button onClick={add} disabled={busy || !email.trim()} className="btn-primary" style={{ padding: '8px 14px' }}>
          {busy ? <Spinner size="sm" /> : <UserPlus size={13} />} Grant access
        </button>
      </div>
    </div>
  )
}

/* ── Create company ──────────────────────────────────────────── */
function CreateCompanyModal({ platform, onClose }) {
  const [form, setForm] = useState({ name: '', adminEmail: '', plan: 'standard', maxMembers: 25, storageGb: 5, industry: '', size: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const create = async () => {
    setBusy(true); setError('')
    try {
      setResult(await platform.createCompany({
        ...form, maxMembers: parseInt(form.maxMembers) || 25, storageGb: parseInt(form.storageGb) || 5,
      }))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(41,32,33,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1px solid var(--border)', maxHeight: '88vh' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Provision a new company</h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Creates the tenant and an activation link for their admin — they set their own password</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!result ? (
            <>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Company name</label>
                <input value={form.name} onChange={set('name')} placeholder="e.g. Al Rajhi Trading Co." className="risys-input" autoFocus />
              </div>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Company admin email</label>
                <input type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="it.manager@client.com" className="risys-input" />
                <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>They receive an activation link valid for 14 days and choose their own password</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Plan</label>
                  <SelectField value={form.plan} onChange={set('plan')} style={{ textTransform: 'capitalize' }}>
                    {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Max users</label>
                  <input type="number" min="1" value={form.maxMembers} onChange={set('maxMembers')} className="risys-input" />
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Storage (GB)</label>
                  <input type="number" min="1" value={form.storageGb} onChange={set('storageGb')} className="risys-input" />
                </div>
              </div>
              {error && <p style={{ fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>{error}</p>}
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#ECF4EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <Check size={18} style={{ color: '#2F6B3C' }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{result.org.name} is provisioned</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {result.org.plan} plan · {result.org.max_members} seats · {result.org.storage_quota_gb} GB
                </p>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="eyebrow" style={{ marginBottom: 6 }}>Admin activation link — send to {result.admin_email}</p>
                <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', wordBreak: 'break-all', marginBottom: 8 }}>
                  {activationLink(result.activation_token)}
                </p>
                <CopyBtn text={activationLink(result.activation_token)} label="Copy activation link" />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                The link is single-use, locked to their email, and expires {new Date(result.expires_at).toLocaleDateString('en-GB')}.
                Opening it lets them create their own password — RISYS never knows or stores it.
              </p>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
          {!result ? (
            <>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={create} disabled={busy || !form.name.trim() || !form.adminEmail.trim()} className="btn-primary flex-1">
                {busy ? <Spinner size="sm" /> : <Building2 size={13} />} Provision company
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
