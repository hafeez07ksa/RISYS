import { useRef, useState } from 'react'
import { Paperclip, Upload, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { Spinner } from '@/components/ui/Spinner'
import { fmtDateTime } from '@/lib/reports/models'
import { ErrorText } from './parts'

const MAX_BYTES = 50 * 1024 * 1024 // the audit-evidence bucket's limit

/** Files attached to a request or scope item. Each is fingerprinted (SHA-256) on upload. */
export function EvidenceList({ audit, files, canUpload, onUpload, locked }) {
  const { user } = useAuth()
  const perms = usePermissions()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = ''
    if (!list.length) return
    const tooBig = list.find((f) => f.size > MAX_BYTES)
    if (tooBig) { setError(`${tooBig.name} is larger than 50 MB.`); return }
    setBusy(true); setError('')
    try { for (const f of list) await onUpload(f) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const run = (fn) => async () => { setError(''); try { await fn() } catch (err) { setError(err.message) } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.length === 0 && <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)' }}>No files attached.</span>}
      {files.map((f) => (
        <div key={f.id} className="flex items-center" style={{ gap: 8, fontSize: 'var(--t-sm)' }}>
          <Paperclip size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <button className="btn-ghost" style={{ padding: 0, color: 'var(--crimson)' }} onClick={run(() => audit.openEvidence(f))}>{f.file_name}</button>
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--t-meta)' }} title={f.sha256 ? `SHA-256 ${f.sha256}` : undefined}>
            {f.file_size ? `${Math.max(1, Math.round(f.file_size / 1024))} KB · ` : ''}{fmtDateTime(f.uploaded_at)}
          </span>
          {!locked && (perms.canManageAudits || f.uploaded_by === user.id) && (
            <button className="btn-ghost" style={{ padding: 2, marginLeft: 'auto' }} title="Remove file"
              onClick={run(async () => { if (window.confirm(`Remove ${f.file_name}?`)) await audit.deleteEvidence(f) })}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      {canUpload && !locked && (
        <div>
          <input ref={input} type="file" multiple hidden onChange={pick} />
          <button className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Spinner size="sm" /> : <Upload size={13} />} Attach files
          </button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
