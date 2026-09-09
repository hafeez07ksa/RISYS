import { useState } from 'react'
import { X, Send } from 'lucide-react'
import { usePeople } from '@/hooks/usePeople'
import { ROLES } from '@/lib/constants'
import { Spinner } from '@/components/ui/Spinner'

export function InviteMemberModal({ onClose }) {
  const { inviteMember } = usePeople()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      await inviteMember({ email, role })
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err.message || 'Failed to send invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl shadow-xl p-6" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>Invite a member</h2>
            <p className="text-xs mt-0.5" style={{ color: '#8a7070' }}>They'll receive an invitation link via email</p>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#f0fdf4' }}>
              <Send size={18} style={{ color: '#16a34a' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#1a1314' }}>Invitation sent!</p>
            <p className="text-xs mt-1" style={{ color: '#8a7070' }}>They'll receive an email with a link to join.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="sentrix-input"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider" style={{ color: '#8a7070' }}>Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => setRole(r.value)}
                      className="text-left p-3 rounded-lg border transition-colors"
                      style={{
                        borderColor: role === r.value ? '#5D0F0F' : '#e5e0e0',
                        background: role === r.value ? '#fdf5f5' : '#fff',
                      }}>
                      <p className="text-xs font-medium" style={{ color: '#1a1314' }}>{r.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#8a7070' }}>{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="flex gap-2.5 mt-5">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSubmit} disabled={!email.trim() || loading}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-md px-4 py-2.5 transition-colors"
                style={{ background: '#5D0F0F', color: '#fff', opacity: !email.trim() ? 0.5 : 1, border: 'none' }}>
                {loading ? <Spinner size="sm" /> : <Send size={13} />}
                Send Invite
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
