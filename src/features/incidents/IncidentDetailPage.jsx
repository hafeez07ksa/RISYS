import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, ExternalLink, Send, Trash2,
  ShieldAlert, AlertCircle, CheckCircle, RefreshCw, } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useComments } from '@/hooks/useComments'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { SelectField } from '@/components/ui/Combobox'
import { SeverityBadge, StatusBadge } from '@/components/ui/IncidentBadges'
import { STATUSES, SEVERITIES } from '@/lib/incidents'
import { getSLAStatus, formatTimeRemaining, SLA_DEFAULTS } from '@/lib/sla'
import { logAudit, AUDIT } from '@/lib/audit'
import { ControlReferences } from '@/components/ui/ControlReferences'
import { tx, appLocale } from '@/lib/i18n'

// Every incident, whatever its source (Jira, Defender, manual), is handled under
// ECC 2-13. Reporting to NCA applies to significant incidents; PDPL Art. 24 applies
// when personal data is affected.
const INCIDENT_CONTROLS = [
  'NCA ECC 2-13-3-1 · Incident Response Plans and Escalation Procedures',
  'NCA ECC 2-13-3-2 · Cybersecurity Incident Classification',
  'NCA ECC 2-13-3-3 · Reporting Cybersecurity Incidents to the NCA',
  'SDAIA PDPL-IR Art. 24 · Notification of Personal Data Breach',
].join(' | ')

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
      <span className="font-semibold">{tx('SLA')} {sla.status === 'breached' ? tx('Breached') : sla.status === 'met' ? tx('Met') : tx('Active')}
      </span>
      <span style={{ opacity: 0.7 }}>·</span>
      <span>{label}</span>
      <span style={{ marginInlineStart: 'auto', opacity: 0.7 }}>{SLA_DEFAULTS[severity]?.label} {tx('target')}</span>
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
        <p className="text-xs text-center py-6" style={{ color: '#8a7070' }}>{tx('No comments yet')}</p>
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
                  {c.user_id === user?.id ? tx('You') : tx('Member')}
                </span>
                <span className="text-[11px]" style={{ color: '#8a7070' }}>{timeAgo(c.created_at)}</span>
                {c.user_id === user?.id && (
                  <button onClick={() => deleteComment(c.id)} className='ms-auto' style={{ color: '#d4cccc' }}>
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
            placeholder={tx('Add a comment…')}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()

  const [incident, setIncident]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
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
      <Topbar title={tx('Loading…')} subtitle="" />
      <div className="flex-1 flex items-center justify-center"><Spinner /></div>
    </div>
  )

  if (!incident) return (
    <div className="h-full flex flex-col">
      <Topbar title={tx('Incident not found')} subtitle="" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#8a7070' }}>{tx('This incident no longer exists.')}</p>
          <button onClick={() => navigate('/app/incidents')} className="btn-secondary text-xs">{tx('← Back to Incidents')}</button>
        </div>
      </div>
    </div>
  )

  const statusObj   = STATUSES.find(s => s.value === incident.status)
  const severityObj = SEVERITIES.find(s => s.value === incident.severity)

  return (
    <div className="h-full flex flex-col">
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
            <InlineConfirm triggerClassName="btn-secondary" triggerStyle={{ color: 'var(--critical)', borderColor: 'var(--critical-bd)' }}
              message={tx('Delete this incident and its comments?')} confirmLabel={tx('Delete')}
              onConfirm={async () => {
                const { error: err } = await supabase.from('incidents').delete().eq('id', incident.id)
                if (err) throw err
                await logAudit(organization.id, 'incident.deleted', 'incident', incident.id, incident.title)
                navigate('/app/incidents')
              }}>
              <Trash2 size={13} /> {tx('Delete')}
            </InlineConfirm>
            <button onClick={() => navigate('/app/incidents')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} className='rtl-flip' /> {tx('Back')}</button>
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
                <SelectField value={incident.status} onChange={e => handleStatusChange(e.target.value)}
                  disabled={saving}
                  className='text-xs ps-3 pe-6 py-1.5 rounded-full border appearance-none outline-none cursor-pointer font-medium'
                  style={{ color: statusObj?.color || '#4a3a3a', background: statusObj?.bg || '#f8f7f7', borderColor: statusObj?.border || '#e5e0e0' }}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </SelectField>
                <span className='absolute end-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]'>▾</span>
              </div>

              {incident.source_type && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: '#4a3a3a', background: '#fff', borderColor: '#e5e0e0' }}>
                  {incident.source_type}
                </span>
              )}

              {/* Escalate / already escalated */}
              {escalated ? (
                <span className='ms-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full'
                  style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  <CheckCircle size={11} /> {tx('Escalated to Risk')}</span>
              ) : (
                <button onClick={() => navigate(`/app/incidents/${incident.id}/escalate`)}
                  className='ms-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg'
                  style={{ background: '#5D0F0F', color: '#fff', border: 'none' }}>
                  <ShieldAlert size={12} /> {tx('Escalate to Risk')}</button>
              )}

              {incident.external_url && (
                <a href={incident.external_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs hover:underline" style={{ color: '#5D0F0F' }}>{tx('View in Jira')} <ExternalLink size={11} />
                </a>
              )}
            </div>

            {/* SLA */}
            <SLABanner severity={incident.severity} createdAt={incident.created_at} resolvedAt={incident.resolved_at} />

            {/* Description */}
            {incident.description && (
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 10 }}>{tx('Description')}</p>
                <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{incident.description}</p>
              </div>
            )}

            {/* Framework reference */}
            <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>{tx('Framework reference')}</p>
              <p style={{ fontSize: 12, color: '#6b5555', marginBottom: 10, lineHeight: 1.6 }}>{tx(
                'Handling this incident is evidence for NCA ECC 2-13 (incident and threat management). Report it to the NCA if it is a significant cybersecurity incident, and notify SDAIA within 72 hours if personal data was affected.'
              )}</p>
              <ControlReferences control={INCIDENT_CONTROLS} />
            </div>

            {/* Comments */}
            <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 16 }}>{tx('Comments')}</p>
              <CommentSection incidentId={incident.id} />
            </div>
          </div>

          {/* ── Right column (1/3) ────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Details card */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>{tx('Details')}</p>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Assignee */}
                <div>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 6 }}>{tx('Assignee')}</p>
                  <div className="relative">
                    <SelectField value={incident.assigned_to || ''} onChange={e => handleAssigneeChange(e.target.value)}
                      disabled={saving}
                      className="w-full text-xs px-3 py-2 rounded-lg border outline-none appearance-none cursor-pointer"
                      style={{ borderColor: '#e5e0e0', color: incident.assigned_to ? '#1a1314' : '#8a7070' }}>
                      <option value="">{tx('Unassigned')}</option>
                      {members.map(m => (
                        <option key={m.id} value={m.user_id}>
                          {m.full_name || m.email || m.user_id?.slice(0, 8)}
                        </option>
                      ))}
                    </SelectField>
                    <span className='absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]' style={{ color: '#8a7070' }}>▾</span>
                  </div>
                </div>

                <Field label={tx('Reporter')}>{incident.reporter || '—'}</Field>

                <Field label={tx('Created')}>
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4a3a3a' }}>
                    <Clock size={11} />
                    {new Date(incident.created_at).toLocaleString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Field>

                {incident.resolved_at && (
                  <Field label={tx('Resolved')}>
                    <span className="text-xs" style={{ color: '#166534' }}>
                      {new Date(incident.resolved_at).toLocaleString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </Field>
                )}

                <Field label={tx('Source')}>
                  <span className="text-xs capitalize" style={{ color: '#4a3a3a' }}>
                    {incident.connector_id}{incident.source_type ? ` · ${incident.source_type}` : ''}
                  </span>
                </Field>

                {incident.external_id && (
                  <Field label={tx('External ID')}>
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
