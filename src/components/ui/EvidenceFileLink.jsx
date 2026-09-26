import { useState } from 'react'
import { openEvidenceFile } from '@/lib/evidence'
import { tx } from '@/lib/i18n'

// Renders like the old <a href={file_url}> link, but fetches a short-lived
// signed URL on click (the evidence bucket is private).
export function EvidenceFileLink({ evidence, style, className, children, title }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await openEvidenceFile(evidence)
    } catch (err) {
      setError(err.message || tx('Could not open the file.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <a
      href="#"
      onClick={handleClick}
      className={className}
      title={title || evidence?.file_name || tx('Open file')}
      aria-busy={busy}
      style={{ cursor: busy ? 'progress' : 'pointer', opacity: busy ? 0.6 : 1, ...style }}
    >
      {children}
    </a>
    {error && <span role="alert" style={{ marginInlineStart: 6, fontSize: 'var(--t-meta)', color: 'var(--critical)' }}>{error}</span>}
    </>
  )
}
