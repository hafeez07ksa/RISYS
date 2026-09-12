import { useState } from 'react'
import { ShieldAlert, Trash2, X, Check, Info } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { usePeople, roleLabel } from '@/hooks/usePeople'

/*
 * Settings → Members: permanent account deletion.
 * Distinct from People → "Remove from organization":
 *   remove  = membership is deleted, the login survives
 *   delete  = membership is deleted AND, if the person belongs to no other
 *             workspace, their login is destroyed permanently.
 * All rules live in the database function — this UI is just the front door:
 *   admins only · never yourself · the last admin can never be deleted.
 */

const ROLE_PILL = {
  admin:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  owner:        { bg: '#F6EBE8', color: '#5D0F0F', border: '#E6CFC9' },
  risk_manager: { bg: '#FAF3E2', color: '#9C6F0F', border: '#EBDCB6' },
  member:       { bg: '#ECF4EE', color: '#2F6B3C', border: '#C8DECD' },
  viewer:       { bg: 'var(--surface)', color: 'var(--text-3)', border: 'var(--border)' },
}

function initialsOf(m) {
  const n = m.full_name || m.email || '?'
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function MembersSettings() {
  const { members, loading, isAdmin, currentUserId, deleteAccount } = usePeople()
  const [target, setTarget] = useState(null)   // member being deleted
  const [result, setResult] = useState(null)   // outcome banner

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  if (!isAdmin) {
    return (
      <div className="rounded-xl py-12 text-center" style={{ background: '#fff', border: '1px solid var(--border)' }}>
        <ShieldAlert size={26} strokeWidth={1} className="mx-auto mb-3" style={{ color: 'var(--border-2)' }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Admin access required</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, maxWidth: 380, margin: '3px auto 0' }}>
          Account management is restricted to organization admins. Your own account can only be
          deleted by an admin — contact one if you need to leave.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {result && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: '#ECF4EE', border: '1px solid #C8DECD' }}>
          <Check size={13} style={{ color: '#2F6B3C', marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12.5, color: '#2F6B3C', flex: 1, lineHeight: 1.5 }}>
            <strong>{result.name}</strong> was removed from the organization
            {result.account_deleted
              ? ' and their account was permanently deleted.'
              : `. ${result.note || ''}`}
          </p>
          <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F6B3C' }}><X size={12} /></button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 18,
        background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Info size={13} style={{ color: 'var(--rose)', marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Deleting an account removes the person from this workspace and — if they belong to no other
          workspace — permanently destroys their login and signs them out everywhere.
          Their name stays attached to past risk history and audit entries.
          You cannot delete yourself, and the last admin can never be deleted.
        </p>
      </div>

      <p className="section-title" style={{ marginBottom: 4 }}>Danger zone — delete accounts</p>
      <p className="section-desc" style={{ marginBottom: 12 }}>This action cannot be undone</p>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F0CECE' }}>
        {members.map((m, i) => {
          const pill = ROLE_PILL[m.role] || ROLE_PILL.viewer
          const isSelf = m.user_id === currentUserId
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: '#fff', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--crimson)', color: '#F3E7E4',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                {initialsOf(m)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {m.full_name || m.email}{isSelf && <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}> (you)</span>}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.email}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>
                {roleLabel(m.role)}
              </span>
              {isSelf ? (
                <span style={{ fontSize: 11, color: 'var(--text-3)', width: 130, textAlign: 'right' }}>Cannot delete yourself</span>
              ) : (
                <button onClick={() => setTarget(m)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '6px 12px',
                    borderRadius: 7, cursor: 'pointer', background: '#FBEAEA', color: '#8C1616', border: '1px solid #F0CECE', width: 130, justifyContent: 'center' }}>
                  <Trash2 size={12} /> Delete account
                </button>
              )}
            </div>
          )
        })}
      </div>

      {target && (
        <DeleteConfirmModal
          member={target}
          onClose={() => setTarget(null)}
          onConfirm={async () => {
            const res = await deleteAccount(target.id)
            setResult(res)
            setTarget(null)
          }}
        />
      )}
    </div>
  )
}

function DeleteConfirmModal({ member, onClose, onConfirm }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const expected = member.email || member.full_name || ''
  const matches = typed.trim().toLowerCase() === expected.toLowerCase()

  const go = async () => {
    setBusy(true); setError('')
    try { await onConfirm() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(41,32,33,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #F0CECE' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', background: '#FBEAEA' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#8C1616', display: 'flex', alignItems: 'center', gap: 7 }}>
            <ShieldAlert size={15} /> Permanently delete account
          </h2>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            You are about to delete <strong style={{ color: 'var(--text)' }}>{member.full_name || member.email}</strong>'s
            account ({roleLabel(member.role)}). They will be removed from this workspace immediately and,
            if they belong to no other workspace, their login will be destroyed and they will be signed
            out everywhere. <strong>This cannot be undone.</strong> Their name remains on historical records.
          </p>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>
              Type <span style={{ textTransform: 'none', fontFamily: 'var(--font-mono)', color: '#8C1616' }}>{expected}</span> to confirm
            </label>
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus
              placeholder={expected} className="risys-input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#8C1616', background: '#FBEAEA', padding: '9px 12px', borderRadius: 8 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={go} disabled={!matches || busy}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
              padding: '9px 0', borderRadius: 8, cursor: matches ? 'pointer' : 'not-allowed', opacity: matches ? 1 : 0.45,
              background: '#8C1616', color: '#fff', border: 'none' }}>
            {busy ? <Spinner size="sm" /> : <Trash2 size={13} />} Delete permanently
          </button>
        </div>
      </div>
    </div>
  )
}
