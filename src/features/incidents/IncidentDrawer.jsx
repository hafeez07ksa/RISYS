import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, Clock, Send, Trash2, UserPlus, AlertCircle, ShieldAlert, CheckCircle } from 'lucide-react'
import { SeverityBadge, StatusBadge } from '@/components/ui/IncidentBadges'
import { SelectField } from '@/components/ui/Combobox'
import { useComments } from '@/hooks/useComments'
import { usePeople } from '@/hooks/usePeople'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getSLAStatus, formatTimeRemaining, SLA_DEFAULTS } from '@/lib/sla'
import { STATUSES } from '@/lib/incidents'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SLAIndicator({ severity, createdAt, resolvedAt }) {
  const sla = getSLAStatus(severity, createdAt, resolvedAt)
  const label = formatTimeRemaining(sla.diff)

  const colors = {
    ok:       { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    warning:  { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    breached: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    met:      { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  }
  const c = colors[sla.status] || colors.ok

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <AlertCircle size={12} />
      <span className="font-medium">SLA {sla.status === 'breached' ? 'Breached' : sla.status === 'met' ? 'Met' : 'Active'}</span>
      <span className="opacity-70">·</span>
      <span>{label}</span>
      <span className="opacity-70 ml-auto">{SLA_DEFAULTS[severity]?.label} target</span>
    </div>
  )
}

function CommentSection({ incidentId }) {
  const { comments, addComment, deleteComment } = useComments('incident', incidentId)
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    try { await addComment(text); setText('') }
    finally { setSending(false) }
  }

  const initials = (userId) => userId?.slice(0, 2).toUpperCase() || '?'

  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0
        ? <p className="text-xs text-center py-4" style={{ color: '#8a7070' }}>No comments yet</p>
        : comments.map(c => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white"
              style={{ background: '#5D0F0F' }}>{initials(c.user_id)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium" style={{ color: '#1a1314' }}>
                  {c.user_id === user?.id ? 'You' : 'Member'}
                </span>
                <span className="text-[11px]" style={{ color: '#8a7070' }}>{timeAgo(c.created_at)}</span>
                {c.user_id === user?.id && (
                  <button onClick={() => deleteComment(c.id)} className="ml-auto" style={{ color: '#d4cccc' }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#4a3a3a' }}>{c.content}</p>
            </div>
          </div>
        ))
      }

      <div className="flex gap-2 mt-1">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white"
          style={{ background: '#5D0F0F' }}>{initials(user?.id)}</div>
        <div className="flex-1 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Add a comment..."
            className="flex-1 text-xs px-3 py-2 rounded-lg border outline-none"
            style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
          <button onClick={handleSend} disabled={!text.trim() || sending}
            className="px-3 py-2 rounded-lg transition-colors"
            style={{ background: text.trim() ? '#5D0F0F' : '#f5f3f3', color: text.trim() ? '#fff' : '#8a7070', border: 'none' }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Severity → inherent likelihood/impact mapping ────────────────────────────
// Critical incident = high likelihood + high impact on the risk register
const SEVERITY_TO_SCORES = {
  critical:      { inherent_likelihood: 5, inherent_impact: 5 },
  high:          { inherent_likelihood: 4, inherent_impact: 4 },
  medium:        { inherent_likelihood: 3, inherent_impact: 3 },
  low:           { inherent_likelihood: 2, inherent_impact: 2 },
  informational: { inherent_likelihood: 1, inherent_impact: 1 },
}

// ── Escalate to Risk modal ───────────────────────────────────────────────────
function EscalateModal({ incident, onClose, onCreated }) {
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const scores = SEVERITY_TO_SCORES[incident.severity] || SEVERITY_TO_SCORES.medium

  const [form, setForm] = useState({
    title:       `Risk: ${incident.title}`,
    description: incident.description || '',
    category:    'Cybersecurity',
    risk_type:   'Operational',
    ...scores,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const { data: risk, error: err } = await supabase
        .from('risks')
        .insert({
          org_id:              organization.id,
          title:               form.title,
          description:         form.description || null,
          category:            form.category,
          risk_type:           form.risk_type,
          inherent_likelihood: form.inherent_likelihood,
          inherent_impact:     form.inherent_impact,
          likelihood:          form.inherent_likelihood,
          impact:              form.inherent_impact,
          status:              'open',
          workflow_state:      'draft',
          source:              'Incident',
          incident_id:         incident.id,   // ← links back to the incident
          created_by:          user?.id,
        })
        .select()
        .single()

      if (err) throw err
      onCreated?.(risk)
      onClose()
      navigate(`/app/risks/${risk.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl shadow-xl"
        style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} style={{ color: '#5D0F0F' }} />
            <span className="text-sm font-medium" style={{ color: '#1a1314' }}>Escalate to Risk Register</span>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070' }}><X size={15} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Source incident banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{ background: '#fdf5f5', border: '1px solid #f0dada' }}>
            <AlertCircle size={12} style={{ color: '#5D0F0F', flexShrink: 0, marginTop: 1 }} />
            <div>
              <span className="font-medium" style={{ color: '#5D0F0F' }}>From incident: </span>
              <span style={{ color: '#4a3a3a' }}>{incident.title}</span>
              {incident.external_id && (
                <span className="ml-1 font-mono" style={{ color: '#8a7070' }}>({incident.external_id})</span>
              )}
            </div>
          </div>

          {/* Risk title */}
          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>
              Risk Title
            </label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
          </div>

          {/* Category + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>Category</label>
              <SelectField value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none"
                style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                {['Cybersecurity','Compliance & Regulatory','Operational','Data Privacy','Technology / IT','Third Party / Vendor'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </SelectField>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>Type</label>
              <SelectField value={form.risk_type} onChange={e => set('risk_type', e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none"
                style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                {['Operational','Strategic','Financial','Compliance','Reputational','Technology'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </SelectField>
            </div>
          </div>

          {/* Likelihood + Impact (pre-filled from incident severity) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>
                Likelihood (1–5)
              </label>
              <SelectField value={form.inherent_likelihood} onChange={e => set('inherent_likelihood', Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none"
                style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </SelectField>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>
                Impact (1–5)
              </label>
              <SelectField value={form.inherent_impact} onChange={e => set('inherent_impact', Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none"
                style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </SelectField>
            </div>
          </div>

          {/* Score preview */}
          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg"
            style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
            <span style={{ color: '#8a7070' }}>Inherent risk score</span>
            <span className="font-semibold" style={{
              color: form.inherent_likelihood * form.inherent_impact >= 20 ? '#b91c1c'
                   : form.inherent_likelihood * form.inherent_impact >= 12 ? '#c2410c'
                   : form.inherent_likelihood * form.inherent_impact >= 6  ? '#92400e'
                   : '#166534'
            }}>
              {form.inherent_likelihood * form.inherent_impact} / 25
            </span>
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !form.title.trim()}
            className="flex-1 text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1.5"
            style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
            <ShieldAlert size={13} />
            {saving ? 'Creating...' : 'Create Risk'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export function IncidentDrawer({ incident, onClose, onUpdate }) {
  const { members } = usePeople()
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)
  const [showEscalate, setShowEscalate] = useState(false)
  const [escalated, setEscalated] = useState(!!incident?.risk_id)

  if (!incident) return null

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true)
    try {
      await supabase.from('incidents').update({
        status,
        resolved_at: (status === 'resolved' || status === 'closed') ? new Date().toISOString() : null
      }).eq('id', incident.id)
      onUpdate?.()
    } finally { setUpdatingStatus(false) }
  }

  const handleAssigneeChange = async (userId) => {
    setUpdatingAssignee(true)
    try {
      await supabase.from('incidents').update({ assigned_to: userId || null }).eq('id', incident.id)
      onUpdate?.()
    } finally { setUpdatingAssignee(false) }
  }

  return (
    <>
      {showEscalate && (
        <EscalateModal
          incident={incident}
          onClose={() => setShowEscalate(false)}
          onCreated={() => setEscalated(true)}
        />
      )}

      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.15)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] z-50 flex flex-col shadow-2xl"
        style={{ background: '#fff', borderLeft: '1px solid #e5e0e0' }}>

        {/* Header */}
        <div className="flex items-start justify-between p-5" style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2">
              {incident.external_id && (
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: '#f5f3f3', color: '#8a7070' }}>
                  {incident.external_id}
                </span>
              )}
              <span className="text-xs capitalize" style={{ color: '#8a7070' }}>{incident.connector_id}</span>
            </div>
            <h2 className="text-sm font-medium leading-snug" style={{ color: '#1a1314' }}>{incident.title}</h2>
          </div>
          <button onClick={onClose} className="hover:opacity-70 transition-opacity flex-shrink-0" style={{ color: '#8a7070' }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Actions bar */}
          <div className="px-5 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid #f0eded', background: '#fafafa' }}>
            <SeverityBadge value={incident.severity} />

            {/* Status dropdown */}
            <div className="relative">
              <SelectField value={incident.status} onChange={e => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                className="text-xs pl-2.5 pr-6 py-1 rounded-full border appearance-none outline-none cursor-pointer font-medium"
                style={{
                  color: STATUSES.find(s => s.value === incident.status)?.color || '#4a3a3a',
                  background: STATUSES.find(s => s.value === incident.status)?.bg || '#f8f7f7',
                  borderColor: STATUSES.find(s => s.value === incident.status)?.border || '#e5e0e0',
                }}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectField>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]">▾</span>
            </div>

            {incident.source_type && (
              <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: '#4a3a3a', background: '#fff', borderColor: '#e5e0e0' }}>
                {incident.source_type}
              </span>
            )}

            {/* Escalate to Risk button */}
            {escalated ? (
              <span className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                <CheckCircle size={11} /> Escalated to Risk
              </span>
            ) : (
              <button onClick={() => setShowEscalate(true)}
                className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                <ShieldAlert size={12} /> Escalate to Risk
              </button>
            )}

            {incident.external_url && (
              <a href={incident.external_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs hover:underline" style={{ color: '#5D0F0F' }}>
                View in Jira <ExternalLink size={11} />
              </a>
            )}
          </div>

          {/* SLA */}
          <div className="px-5 pt-4">
            <SLAIndicator severity={incident.severity} createdAt={incident.created_at} resolvedAt={incident.resolved_at} />
          </div>

          {/* Details grid */}
          <div className="px-5 py-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#8a7070' }}>Assignee</p>
              <SelectField value={incident.assigned_to || ''} onChange={e => handleAssigneeChange(e.target.value)}
                disabled={updatingAssignee}
                className="w-full text-xs px-2.5 py-2 rounded-lg border outline-none appearance-none cursor-pointer"
                style={{ borderColor: '#e5e0e0', color: incident.assigned_to ? '#1a1314' : '#8a7070' }}>
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.user_id}>
                    {m.full_name || m.email || m.user_id?.slice(0, 8)}
                  </option>
                ))}
              </SelectField>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#8a7070' }}>Reporter</p>
              <p className="text-xs" style={{ color: '#4a3a3a' }}>{incident.reporter || '—'}</p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#8a7070' }}>Created</p>
              <p className="text-xs flex items-center gap-1" style={{ color: '#4a3a3a' }}>
                <Clock size={11} />{new Date(incident.created_at).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#8a7070' }}>Source</p>
              <p className="text-xs capitalize" style={{ color: '#4a3a3a' }}>
                {incident.connector_id}{incident.source_type ? ` · ${incident.source_type}` : ''}
              </p>
            </div>
          </div>

          {/* Description */}
          {incident.description && (
            <div className="px-5 pb-4">
              <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#8a7070' }}>Description</p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#4a3a3a' }}>{incident.description}</p>
            </div>
          )}

          <div style={{ borderTop: '1px solid #f0eded' }} />

          {/* Comments */}
          <div className="px-5 py-4">
            <p className="text-xs font-medium mb-4" style={{ color: '#1a1314' }}>Comments</p>
            <CommentSection incidentId={incident.id} />
          </div>
        </div>
      </div>
    </>
  )
}
