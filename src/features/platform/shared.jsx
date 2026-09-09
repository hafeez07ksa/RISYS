import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TowerControl, LogOut, Check, Copy, Pencil, RotateCw, Pause, Play, Trash2
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { activationLink } from '@/hooks/usePlatform'

export const PLANS = ['standard', 'professional', 'enterprise']

export function CopyBtn({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
      background: copied ? '#ECF4EE' : 'var(--surface)', color: copied ? '#2F6B3C' : 'var(--crimson)', border: `1px solid ${copied ? '#C8DECD' : 'var(--border)'}` }}>
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : label}
    </button>
  )
}

/* ── Console header — shared across platform pages ── */
export function PlatformHeader() {
  const navigate = useNavigate()
  const { user, signOut } = useAuthStore()
  return (
    <header style={{ background: '#292021', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={() => navigate('/platform')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#5D0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TowerControl size={14} style={{ color: '#F3E7E4' }} />
        </div>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: '#F3E7E4' }}>Sentrix</span>
        <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#A98D8C', padding: '3px 8px', border: '1px solid #3a2f30', borderRadius: 20 }}>
          Platform Console
        </span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 12, color: '#b9a5a2' }}>{user?.email}</span>
        <button onClick={async () => { await signOut(); navigate('/platform/login') }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#b9a5a2', background: 'none', border: '1px solid #3a2f30', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </header>
  )
}

/* ── Edit limits ─────────────────────────────────────────────── */
export function EditLimitsModal({ org, platform, onClose, onError }) {
  const [form, setForm] = useState({ plan: org.plan, maxMembers: org.max_members, storageGb: org.storage_quota_gb })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await platform.updateLimits(org.id, { plan: form.plan, maxMembers: parseInt(form.maxMembers), storageGb: parseInt(form.storageGb) })
      onClose()
    } catch (err) { onError(err.message); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(41,32,33,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{org.name} — plan & limits</h2>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Plan</label>
            <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} className="sentrix-input" style={{ textTransform: 'capitalize' }}>
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Max users</label>
              <input type="number" min={org.member_count || 1} value={form.maxMembers}
                onChange={e => setForm(f => ({ ...f, maxMembers: e.target.value }))} className="sentrix-input" />
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{org.member_count} in use</p>
            </div>
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Storage (GB)</label>
              <input type="number" min="1" value={form.storageGb}
                onChange={e => setForm(f => ({ ...f, storageGb: e.target.value }))} className="sentrix-input" />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 18px' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary flex-1">{busy ? <Spinner size="sm" /> : <Check size={13} />} Save</button>
        </div>
      </div>
    </div>
  )
}

/* ── Reissue activation link ─────────────────────────────────── */
export function ReissueModal({ org, platform, onClose }) {
  const [email, setEmail] = useState(org.admins?.[0]?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const go = async () => {
    setBusy(true); setError('')
    try { setResult(await platform.reissueAdminInvite(org.id, email)) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(41,32,33,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{org.name} — admin activation link</h2>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!result ? (
            <>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Admin email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@client.com" className="sentrix-input" autoFocus />
                <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>Fresh 14-day link as Admin — replaces any previous link for this email</p>
              </div>
              {error && <p style={{ fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>{error}</p>}
            </>
          ) : (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Send to {result.admin_email}</p>
              <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-2)', wordBreak: 'break-all', marginBottom: 8 }}>
                {activationLink(result.activation_token)}
              </p>
              <CopyBtn text={activationLink(result.activation_token)} label="Copy activation link" />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 18px' }}>
          {!result ? (
            <>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={go} disabled={busy || !email.trim()} className="btn-primary flex-1">
                {busy ? <Spinner size="sm" /> : <RotateCw size={13} />} Issue link
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

/* ── Suspend / reactivate ────────────────────────────────────── */
export function SuspendModal({ org, onClose, onConfirm }) {
  const suspending = org.status === 'active'
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(41,32,33,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${suspending ? '#F0CECE' : 'var(--border)'}` }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', background: suspending ? '#FBEAEA' : '#ECF4EE' }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: suspending ? '#8C1616' : '#2F6B3C' }}>
            {suspending ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`}
          </h2>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
            {suspending
              ? <>All {org.member_count} member{org.member_count === 1 ? '' : 's'} lose access <strong>immediately</strong> — every screen goes dark for them within a minute. No data is deleted; reactivating restores everything exactly as it was.</>
              : <>All members regain access immediately, with all data intact.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 18px' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={async () => { setBusy(true); await onConfirm() }} disabled={busy}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
              background: suspending ? '#8C1616' : '#2F6B3C', color: '#fff', border: 'none' }}>
            {busy ? <Spinner size="sm" /> : suspending ? <Pause size={13} /> : <Play size={13} />}
            {suspending ? 'Suspend company' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ── Delete company — total demolition, name typed to confirm ── */
export function DeleteCompanyModal({ org, platform, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = typed.trim().toLowerCase() === org.name.trim().toLowerCase()

  const go = async () => {
    setBusy(true); setError('')
    try { onDeleted(await platform.deleteCompany(org.id, typed.trim())) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(41,32,33,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #F0CECE' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', background: '#FBEAEA' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#8C1616', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Trash2 size={14} /> Permanently delete {org.name}
          </h2>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
            This erases <strong>every trace</strong> of the company: all {org.risk_count} risk{org.risk_count === 1 ? '' : 's'} with
            their controls, evidence, history and files, all incidents and tasks, all invitations,
            and the workspace itself. The {org.member_count} member account{org.member_count === 1 ? '' : 's'} whose only
            workspace this is will be <strong>destroyed and signed out everywhere</strong>.
            There is no undo and no recovery.
          </p>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>
              Type <span style={{ textTransform: 'none', fontFamily: 'monospace', color: '#8C1616' }}>{org.name}</span> to confirm
            </label>
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus
              placeholder={org.name} className="sentrix-input" style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={go} disabled={!matches || busy}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
              padding: '9px 0', borderRadius: 8, cursor: matches ? 'pointer' : 'not-allowed', opacity: matches ? 1 : 0.45,
              background: '#8C1616', color: '#fff', border: 'none' }}>
            {busy ? <Spinner size="sm" /> : <Trash2 size={13} />} Delete everything
          </button>
        </div>
      </div>
    </div>
  )
}
