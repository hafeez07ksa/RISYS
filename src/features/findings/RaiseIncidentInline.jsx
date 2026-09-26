import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Siren } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { findingDisplayTitle } from '@/lib/findings'
import { logAudit, AUDIT } from '@/lib/audit'
import { Spinner } from '@/components/ui/Spinner'
import { tx } from '@/lib/i18n'

/*
 * Turns a normalised connector finding into an incident, from a panel that
 * opens under the finding itself (nothing is laid over the page). Risks are
 * not raised here: a finding goes through triage first (TriagePage), which
 * checks for an existing risk. It reads only the normalised finding from
 * lib/findings.js, so every connector's findings can use it unchanged.
 */
const SEVERITY = { critical: 'high', warning: 'medium' }

export function RaiseIncidentInline({ finding, onCancel }) {
  const { organization } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState(findingDisplayTitle(finding.title, finding.subject?.name))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const severity = SEVERITY[finding.severity] ?? 'low'

  const create = async () => {
    if (!title.trim()) { setError(tx('Give the incident a title.')); return }
    setBusy(true); setError('')
    try {
      const { data, error: err } = await supabase.from('incidents').insert({
        org_id: organization.id,
        connector_id: finding.connectorId,
        title: title.trim(),
        description: [
          finding.description,
          finding.subject?.name && finding.subject.name !== finding.title
            ? `Subject: ${finding.subject.name}${finding.subject.email ? ` (${finding.subject.email})` : ''}` : null,
          finding.control ? `Control reference: ${finding.control}` : null,
          finding.recommendation ? `Recommendation: ${finding.recommendation}` : null,
          finding.sourceUrl ? `Source: ${finding.sourceUrl}` : null,
        ].filter(Boolean).join('\n\n'),
        severity,
        status: 'open',
        source_type: `${finding.connectorName} Security Finding`,
      }).select('id').single()
      if (err) throw err
      await logAudit(organization.id, AUDIT.FINDING_INCIDENT, 'incident', data?.id ?? null, title.trim(), {
        finding: finding.title, connector: finding.connectorId, subject: finding.subject?.name,
      })
      navigate(data?.id ? `/app/incidents/${data.id}` : '/app/incidents')
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="ic-panel is-neutral" style={{ marginTop: 10 }}>
      <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>
        <Siren size={13} style={{ display: 'inline', verticalAlign: -2, marginInlineEnd: 6 }} />{tx('Raise an incident from this finding')}
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span className="field-label">{tx('Incident title')}</span>
        <input className="risys-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
               onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onCancel() }} />
      </label>
      <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>
        {tx('Severity will be set to')} <strong>{tx(severity[0].toUpperCase() + severity.slice(1))}</strong> · {tx('Source:')} {finding.connectorName}.
        {' '}{tx('The finding’s description, control reference and recommendation are copied into the incident.')}
      </p>
      {error && <p className="field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={busy} onClick={create}>{busy && <Spinner size="sm" />}{tx('Raise incident')}</button>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>{tx('Cancel')}</button>
      </div>
    </div>
  )
}
