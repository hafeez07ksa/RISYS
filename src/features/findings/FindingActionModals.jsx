import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, AlertCircle, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SEVERITY_CONFIG } from '@/lib/findings'
import { logAudit, AUDIT } from '@/lib/audit'

/*
 * Connector-agnostic modals that turn a normalised finding into a Risk or an
 * Incident. They read everything they need off the finding object produced by
 * lib/findings.js (finding.subject, finding.connectorId, etc.), so any
 * connector's findings can use them unchanged.
 */

function SourceCard({ finding }) {
  const s = SEVERITY_CONFIG[finding.severity]
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}` }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: s.color, marginBottom: 2 }}>
        Source finding · {finding.connectorName}
      </p>
      <p style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{finding.title}</p>
      <p style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{finding.subject.name} · {finding.control}</p>
    </div>
  )
}

// ── Add to Risk Register ──────────────────────────────────────────────────────
export function CreateFindingRiskModal({ finding, onClose, onCreated }) {
  const { organization, user: authUser } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [form, setForm]     = useState({
    title:      `${finding.title} — ${finding.subject.name}`,
    likelihood: finding.severity === 'critical' ? 4 : 3,
    impact:     finding.severity === 'critical' ? 4 : 3,
  })

  const handleCreate = async () => {
    setSaving(true); setError(null)
    try {
      const { data: risk, error: err } = await supabase.from('risks').insert({
        org_id:              organization.id,
        title:               form.title,
        description:         `${finding.description}\n\nSubject: ${finding.subject.name}${finding.subject.email ? ` (${finding.subject.email})` : ''}\nSource: ${finding.connectorName}\nFinding: ${finding.title}\nControl reference: ${finding.control}`,
        category:            'Cybersecurity',
        risk_type:           'Operational',
        source:              'Incident',
        inherent_likelihood: form.likelihood,
        inherent_impact:     form.impact,
        likelihood:          form.likelihood,
        impact:              form.impact,
        status:              'open',
        workflow_state:      'draft',
        source_connector:    finding.connectorId,
        source_entity_id:    finding.subject?.id || null,
        source_entity_name:  finding.subject?.name || null,
        source_finding:      finding.title,
        created_by:          authUser?.id,
      }).select().single()
      if (err) throw err
      await logAudit(organization.id, AUDIT.FINDING_RISK, 'risk', risk.id, risk.title, {
        finding: finding.title, connector: finding.connectorId, subject: finding.subject.name,
      })
      onCreated?.()
      onClose()
      navigate(`/app/risks/${risk.id}`)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 14, background: '#fff', border: '1px solid #e5e0e0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e0e0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert size={16} style={{ color: '#5D0F0F' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1314', flex: 1 }}>Add to Risk Register</p>
          <button onClick={onClose} style={{ color: '#8a7070', background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SourceCard finding={finding} />

          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>Risk Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e0e0', color: '#1a1314', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['likelihood', 'Likelihood (1–5)'], ['impact', 'Impact (1–5)']].map(([key, label]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>{label}</label>
                <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e0e0', color: '#1a1314', outline: 'none', background: '#fff' }}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
            <span style={{ fontSize: 12, color: '#8a7070' }}>Inherent risk score</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: form.likelihood * form.impact >= 12 ? '#b91c1c' : '#92400e' }}>
              {form.likelihood * form.impact} / 25
            </span>
          </div>

          {error && <p style={{ fontSize: 12, color: '#b91c1c' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || !form.title.trim()}
            style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#5D0F0F', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating...' : 'Create Risk'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Raise Incident ────────────────────────────────────────────────────────────
export function CreateFindingIncidentModal({ finding, onClose, onCreated }) {
  const { organization } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [title, setTitle]   = useState(`${finding.title} — ${finding.subject.name}`)

  const sevLabel = finding.severity === 'critical' ? 'High' : finding.severity === 'warning' ? 'Medium' : 'Low'

  const handleCreate = async () => {
    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase.from('incidents').insert({
        org_id:       organization.id,
        connector_id: finding.connectorId,
        title,
        description:  `${finding.description}\n\nSubject: ${finding.subject.name}${finding.subject.email ? ` (${finding.subject.email})` : ''}\nControl reference: ${finding.control}\n\nRecommendation: ${finding.recommendation}`,
        severity:     finding.severity === 'critical' ? 'high' : finding.severity === 'warning' ? 'medium' : 'low',
        status:       'open',
        source_type:  `${finding.connectorName} Security Finding`,
      })
      if (err) throw err
      await logAudit(organization.id, AUDIT.FINDING_INCIDENT, 'incident', null, title, {
        finding: finding.title, connector: finding.connectorId, subject: finding.subject.name,
      })
      onCreated?.()
      onClose()
      navigate('/app/incidents')
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 14, background: '#fff', border: '1px solid #e5e0e0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e0e0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} style={{ color: '#5D0F0F' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1314', flex: 1 }}>Raise Incident</p>
          <button onClick={onClose} style={{ color: '#8a7070', background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SourceCard finding={finding} />

          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>Incident Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e0e0', color: '#1a1314', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ padding: '8px 12px', borderRadius: 8, background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
            <p style={{ fontSize: 11, color: '#8a7070' }}>Severity will be set to <strong style={{ color: '#1a1314' }}>{sevLabel}</strong> · Source: {finding.connectorName}</p>
          </div>

          {error && <p style={{ fontSize: 12, color: '#b91c1c' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || !title.trim()}
            style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#5D0F0F', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating...' : 'Raise Incident'}
          </button>
        </div>
      </div>
    </div>
  )
}
