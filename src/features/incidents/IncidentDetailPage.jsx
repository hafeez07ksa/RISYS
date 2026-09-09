import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, ExternalLink, Send, Trash2,
  ShieldAlert, AlertCircle, CheckCircle, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useComments } from '@/hooks/useComments'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { SeverityBadge, StatusBadge } from '@/components/ui/IncidentBadges'
import { STATUSES, SEVERITIES } from '@/lib/incidents'
import { getSLAStatus, formatTimeRemaining, SLA_DEFAULTS } from '@/lib/sla'
import { logAudit, AUDIT } from '@/lib/audit'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Field({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 4 }}>{label}</p>
      <div style={{ fontSize: 13, color: '#1a1314' }}>{children}</div>
    </div>
  )
}

// ── SLA banner ────────────────────────────────────────────────────────────────
function SLABanner({ severity, createdAt, resolvedAt }) {
  const sla = getSLAStatus(severity, createdAt, resolvedAt)
  const colors = {
    ok:       { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    warning:  { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    breached: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    met:      { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  }
  const c = colors[sla.status] || colors.ok
  const label = formatTimeRemaining(sla.diff)
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <AlertCircle size={13} />
      <span className="font-semibold">
        SLA {sla.status === 'breached' ? 'Breached' : sla.status === 'met' ? 'Met' : 'Active'}
      </span>
      <span style={{ opacity: 0.7 }}>·</span>
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{SLA_DEFAULTS[severity]?.label} target</span>
    </div>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────
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

  const initials = name => (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: '#8a7070' }}>No comments yet</p>
      ) : (
        comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white"
              style={{ background: '#5D0F0F' }}>
              {initials(c.user_id === user?.id ? 'You' : 'M')}
            </div>
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
      )}

      <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid #f0eded' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white"
          style={{ background: '#5D0F0F' }}>
          {initials(user?.user_metadata?.full_name || user?.email || 'U')}
        </div>
        <div className="flex-1 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Add a comment…"
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

// ── Escalate to Risk modal ────────────────────────────────────────────────────
const SEVERITY_TO_SCORES = {
  critical:      { inherent_likelihood: 5, inherent_impact: 5 },
  high:          { inherent_likelihood: 4, inherent_impact: 4 },
  medium:        { inherent_likelihood: 3, inherent_impact: 3 },
  low:           { inherent_likelihood: 2, inherent_impact: 2 },
  informational: { inherent_likelihood: 1, inherent_impact: 1 },
}

function EscalateModal({ incident, onClose, onCreated }) {
  const navigate = useNavigate()
  const { organization, user } = useAuth()
  const scores = SEVERITY_TO_SCORES[incident.severity] || SEVERITY_TO_SCORES.medium
  const [form, setForm] = useState({
    title: `Risk: ${incident.title}`,
    description: incident.description || '',
    category: 'Cybersecurity',
    risk_type: 'Operational',
    ...scores,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    setSaving(true); setError(null)
    try {
      const { data: risk, error: err } = await supabase.from('risks').insert({
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
        incident_id:         incident.id,
        created_by:          user?.id,
      }).select().single()
      if (err) throw err
      await logAudit(organization.id, AUDIT.RISK_CREATED, 'risk', risk.id, risk.title, {
        from_incident: incident.id,
      })
      onCreated?.(risk)
      onClose()
      navigate(`/app/risks/${risk.id}`)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl shadow-xl" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} style={{ color: '#5D0F0F' }} />
            <span className="text-sm font-medium" style={{ color: '#1a1314' }}>Escalate to Risk Register</span>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: '#fdf5f5', border: '1px solid #f0dada' }}>
            <AlertCircle size={12} style={{ color: '#5D0F0F', flexShrink: 0, marginTop: 1 }} />
            <div>
              <span className="font-medium" style={{ color: '#5D0F0F' }}>From incident: </span>
              <span style={{ color: '#4a3a3a' }}>{incident.title}</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>Risk Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['likelihood', 'Likelihood (1–5)', 'inherent_likelihood'], ['impact', 'Impact (1–5)', 'inherent_impact']].map(([, label, key]) => (
              <div key={key}>
                <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: '#8a7070' }}>{label}</label>
                <select value={form[key]} onChange={e => set(key, Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none"
                  style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
            <span style={{ color: '#8a7070' }}>Inherent risk score</span>
            <span className="font-semibold" style={{ color: form.inherent_likelihood * form.inherent_impact >= 12 ? '#b91c1c' : '#92400e' }}>
              {form.inherent_likelihood * form.inherent_impact} / 25
            </span>
          </div>
          {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !form.title.trim()}
            className="flex-1 text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1.5"
            style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
            <ShieldAlert size={13} />
            {saving ? 'Creating…' : 'Create Risk'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteModal({ incident, onClose, onDeleted }) {
  const { organization } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const handleDelete = async () => {
    setDeleting(true); setError(null)
    try {
      const { error: err } = await supabase.from('incidents').delete().eq('id', incident.id)
      if (err) throw err
      await logAudit(organization.id, 'incident.deleted', 'incident', incident.id, incident.title)
      onDeleted?.()
      navigate('/app/incidents')
    } catch (e) { setError(e.message); setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div style={{ padding: '16px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: '#b91c1c' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c' }}>Delete Incident?</p>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.6, marginBottom: 8 }}>
            This will permanently delete <strong style={{ color: '#1a1314' }}>{incident.title}</strong> and all its comments. This cannot be undone.
          </p>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#b91c1c', color: '#fff', border: 'none', opacity: deleting ? 0.6 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()

  const [incident, setIncident]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [showEscalate, setShowEscalate] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [escalated, setEscalated]     = useState(false)

  const load = async () => {
    if (!organization?.id || !id) return
    const { data } = await supabase.from('incidents').select('*').eq('id', id).single()
    setIncident(data)
    setEscalated(!!data?.risk_id)
    setLoading(false)
  }

  useEffect(() => { load() }, [organization?.id, id])

  const handleStatusChange = async (status) => {
    setSaving(true)
    const resolved_at = ['resolved','closed'].includes(status) ? new Date().toISOString() : null
    await supabase.from('incidents').update({ status, resolved_at }).eq('id', id)
    await logAudit(organization.id, AUDIT.INC_STATUS, 'incident', id, incident.title, {
      from: incident.status, to: status,
    })
    await load()
    setSaving(false)
  }

  const handleAssigneeChange = async (userId) => {
    setSaving(true)
    await supabase.from('incidents').update({ assigned_to: userId || null }).eq('id', id)
    await load()
    setSaving(false)
  }

  if (loading) return (
    <div className="h-full flex flex-col">
      <Topbar title="Loading…" subtitle="" />
      <div className="flex-1 flex items-center justify-center"><Spinner /></div>
    </div>
  )

  if (!incident) return (
    <div className="h-full flex flex-col">
      <Topbar title="Incident not found" subtitle="" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#8a7070' }}>This incident no longer exists.</p>
          <button onClick={() => navigate('/app/incidents')} className="btn-secondary text-xs">← Back to Incidents</button>
        </div>
      </div>
    </div>
  )

  const statusObj   = STATUSES.find(s => s.value === incident.status)
  const severityObj = SEVERITIES.find(s => s.value === incident.severity)

  return (
    <div className="h-full flex flex-col">
      {showEscalate && (
        <EscalateModal
          incident={incident}
          onClose={() => setShowEscalate(false)}
          onCreated={() => setEscalated(true)}
        />
      )}
      {showDelete && (
        <DeleteModal
          incident={incident}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {}}
        />
      )}

      <Topbar
        title={incident.title}
        subtitle={`Incidents · ${incident.external_id || incident.id.slice(0, 8)}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#fef2f2] transition-colors"
              style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
              <Trash2 size={13} /> Delete
            </button>
            <button onClick={() => navigate('/app/incidents')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">
        <div className="grid grid-cols-3 gap-5">

          {/* ── Left column (2/3) ─────────────────────────────────────── */}
          <div className="col-span-2 flex flex-col gap-4">

            {/* Action bar */}
            <div className="rounded-xl p-4 flex flex-wrap items-center gap-3"
              style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

              {/* Severity */}
              <SeverityBadge value={incident.severity} />

              {/* Status selector */}
              <div className="relative">
                <select value={incident.status} onChange={e => handleStatusChange(e.target.value)}
                  disabled={saving}
                  className="text-xs pl-3 pr-6 py-1.5 rounded-full border appearance-none outline-none cursor-pointer font-medium"
                  style={{ color: statusObj?.color || '#4a3a3a', background: statusObj?.bg || '#f8f7f7', borderColor: statusObj?.border || '#e5e0e0' }}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]">▾</span>
              </div>

              {incident.source_type && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: '#4a3a3a', background: '#fff', borderColor: '#e5e0e0' }}>
                  {incident.source_type}
                </span>
              )}

              {/* Escalate / already escalated */}
              {escalated ? (
                <span className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  <CheckCircle size={11} /> Escalated to Risk
                </span>
              ) : (
                <button onClick={() => setShowEscalate(true)}
                  className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
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
            <SLABanner severity={incident.severity} createdAt={incident.created_at} resolvedAt={incident.resolved_at} />

            {/* Description */}
            {incident.description && (
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 10 }}>Description</p>
                <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{incident.description}</p>
              </div>
            )}

            {/* Comments */}
            <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 16 }}>Comments</p>
              <CommentSection incidentId={incident.id} />
            </div>
          </div>

          {/* ── Right column (1/3) ────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Details card */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>Details</p>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Assignee */}
                <div>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>Assignee</p>
                  <div className="relative">
                    <select value={incident.assigned_to || ''} onChange={e => handleAssigneeChange(e.target.value)}
                      disabled={saving}
                      className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none cursor-pointer"
                      style={{ borderColor: '#e5e0e0', color: incident.assigned_to ? '#1a1314' : '#8a7070' }}>
                      <option value="">Unassigned</option>
                      {members.map(m => (
                        <option key={m.id} value={m.user_id}>
                          {m.full_name || m.email || m.user_id?.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]" style={{ color: '#8a7070' }}>▾</span>
                  </div>
                </div>

                <Field label="Reporter">{incident.reporter || '—'}</Field>

                <Field label="Created">
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4a3a3a' }}>
                    <Clock size={11} />
                    {new Date(incident.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Field>

                {incident.resolved_at && (
                  <Field label="Resolved">
                    <span className="text-xs" style={{ color: '#166534' }}>
                      {new Date(incident.resolved_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </Field>
                )}

                <Field label="Source">
                  <span className="text-xs capitalize" style={{ color: '#4a3a3a' }}>
                    {incident.connector_id}{incident.source_type ? ` · ${incident.source_type}` : ''}
                  </span>
                </Field>

                {incident.external_id && (
                  <Field label="External ID">
                    <span className="text-xs font-mono" style={{ color: '#8a7070' }}>{incident.external_id}</span>
                  </Field>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
