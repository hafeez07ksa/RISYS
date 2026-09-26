import { useState } from 'react'
import { UserPlus, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { PlatformShell, Card, Table, Td, Empty, Chip, ErrorNote, fmtDate, ago } from './shared'

/* /platform/staff — who can operate the console.
 *
 * Console access is separate from every tenant role: it is not "admin of a
 * workspace", it is the ability to provision, suspend and destroy any tenant
 * on the platform. The database refuses to let anyone remove their own access
 * or the last remaining admin, so the console cannot be locked out of itself. */
export function PlatformStaffPage() {
  const { user } = useAuth()
  const { admins, loading, addPlatformAdmin, removePlatformAdmin } = usePlatform()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const grant = async () => {
    if (!email.trim()) { setError('Enter the email of a RISYS account.'); return }
    setBusy(true); setError('')
    try { await addPlatformAdmin(email.trim()); setEmail('') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <PlatformShell title="Platform staff" description="RISYS employees with console access — entirely separate from tenant roles." width={1100}>
      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card pad={false}>
          {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Spinner size="lg" /></div> : (
            <Table
              columns={[{ label: 'Person' }, { label: 'Granted', width: 170 }, { label: 'Last console action', width: 170 }, { label: '', width: 130, align: 'right' }]}
              empty={admins.length === 0 ? <Empty>No platform staff.</Empty> : null}
            >
              {admins.map((a) => {
                const isSelf = a.user_id === user?.id
                return (
                  <tr key={a.user_id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{a.name || a.email}</span>
                        {isSelf && <Chip tone="blue">You</Chip>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{a.email}</div>
                    </Td>
                    <Td>
                      {fmtDate(a.created_at)}
                      {a.added_by_email && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>by {a.added_by_email}</div>}
                    </Td>
                    <Td>{a.last_action_at ? ago(a.last_action_at) : <span style={{ color: 'var(--text-3)' }}>never</span>}</Td>
                    <Td align="right">
                      {isSelf || admins.length <= 1 ? (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {isSelf ? 'Cannot remove yourself' : 'Last admin'}
                        </span>
                      ) : (
                        <InlineConfirm
                          triggerClassName="btn-secondary"
                          triggerStyle={{ color: '#8C1616', borderColor: '#F0CECE', fontSize: 11.5, padding: '4px 9px' }}
                          message={`Revoke console access for ${a.email}?`}
                          confirmLabel="Revoke access"
                          onConfirm={() => removePlatformAdmin(a.user_id)}>
                          <Trash2 size={12} /> Revoke
                        </InlineConfirm>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </Table>
          )}
        </Card>

        <Card title="Grant console access">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input className="risys-input" style={{ flex: 1, minWidth: 260, fontSize: 12.5 }}
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') grant() }}
              placeholder="colleague@risys.com" />
            <button className="btn-primary" disabled={busy} onClick={grant}>
              {busy ? <Spinner size="sm" /> : <UserPlus size={13} />} Grant access
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '9px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            They must have signed in to RISYS at least once. Console access grants full control over every tenant, including permanent deletion.
          </p>
        </Card>
      </div>
    </PlatformShell>
  )
}
