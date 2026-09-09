import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert, AlertTriangle, CheckSquare2, TrendingUp, Clock,
  ArrowRight, RefreshCw, Circle, Users, ShieldCheck, BookCheck,
  AlertCircle, CheckCircle, Building2,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SeverityBadge, StatusBadge } from '@/components/ui/IncidentBadges'
import { getSLAStatus, formatTimeRemaining, getTaskStatus } from '@/lib/sla'
import { getRiskLevel } from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, warn, amber, to, accent }) {
  const color = warn ? '#b91c1c' : amber ? '#92400e' : accent || '#1a1314'
  const borderColor = warn ? '#fecaca' : amber ? '#fde68a' : '#e5e0e0'
  const bg = warn ? '#fef2f2' : amber ? '#fffbeb' : '#fff'
  const iconColor = warn ? '#fca5a5' : amber ? '#fcd34d' : '#d4cccc'

  const card = (
    <div className="rounded-xl p-4 transition-all hover:shadow-sm"
      style={{ background: bg, border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-widest" style={{ color: warn ? '#b91c1c' : amber ? '#92400e' : '#8a7070' }}>
          {label}
        </p>
        {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: iconColor }} />}
      </div>
      <p className="text-3xl font-light mb-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: warn ? '#b91c1c' : amber ? '#92400e' : '#8a7070' }}>{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

// ── SLA alerts bar ────────────────────────────────────────────────────────────
function SLABar({ incidents }) {
  const breached = incidents.filter(i => {
    if (i.status === 'resolved' || i.status === 'closed') return false
    return getSLAStatus(i.severity, i.created_at).status === 'breached'
  })
  const warning = incidents.filter(i => {
    if (i.status === 'resolved' || i.status === 'closed') return false
    const s = getSLAStatus(i.severity, i.created_at).status
    return s === 'warning' || s === 'critical'
  })
  if (breached.length === 0 && warning.length === 0) return null
  return (
    <div className="rounded-xl p-4 mb-5" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} style={{ color: '#b91c1c' }} />
        <p className="text-xs font-medium" style={{ color: '#b91c1c' }}>SLA Alerts</p>
      </div>
      <div className="flex flex-col gap-2">
        {[...breached, ...warning].map(i => (
          <Link to="/app/incidents" key={i.id} className="flex items-center justify-between hover:opacity-80">
            <span className="text-xs truncate" style={{ color: '#1a1314' }}>{i.title}</span>
            <span className="text-[11px] ml-4 flex-shrink-0"
              style={{ color: breached.includes(i) ? '#b91c1c' : '#92400e' }}>
              {formatTimeRemaining(getSLAStatus(i.severity, i.created_at).diff)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Risk summary widget ────────────────────────────────────────────────────────
function RiskSummary({ risks }) {
  const byLevel = {
    Critical: risks.filter(r => (r.inherent_score || r.risk_score || 0) >= 20),
    High:     risks.filter(r => { const s = r.inherent_score || r.risk_score || 0; return s >= 12 && s < 20 }),
    Medium:   risks.filter(r => { const s = r.inherent_score || r.risk_score || 0; return s >= 6 && s < 12 }),
    Low:      risks.filter(r => (r.inherent_score || r.risk_score || 0) < 6),
  }
  const colors = {
    Critical: { color: '#8C1616', bg: '#FBEAEA', border: '#F0CECE' },
    High:     { color: '#B5491B', bg: '#FBEFE7', border: '#F0D4C2' },
    Medium:   { color: '#9C6F0F', bg: '#FAF3E2', border: '#EBDCB6' },
    Low:      { color: '#2F6B3C', bg: '#ECF4EE', border: '#C8DECD' },
  }
  const openRisks = risks.filter(r => r.status !== 'closed')

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Risk Register</p>
        <Link to="/app/risks" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View all <ArrowRight size={11} />
        </Link>
      </div>

      {openRisks.length === 0 ? (
        <div className="py-8 text-center">
          <ShieldAlert size={22} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d4cccc' }} />
          <p className="text-xs" style={{ color: '#8a7070' }}>No open risks</p>
        </div>
      ) : (
        <>
          {/* Level breakdown */}
          <div className="grid grid-cols-4 divide-x" style={{ borderBottom: '1px solid #f0eded', divideColor: '#f0eded' }}>
            {Object.entries(byLevel).map(([level, items]) => {
              const c = colors[level]
              return (
                <div key={level} className="py-3 text-center" style={{ borderRight: '1px solid #f0eded' }}>
                  <p className="text-lg font-light" style={{ color: c.color }}>{items.length}</p>
                  <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: c.color }}>{level}</p>
                </div>
              )
            })}
          </div>

          {/* Top 4 risks */}
          <div>
            {openRisks
              .sort((a, b) => (b.inherent_score || b.risk_score || 0) - (a.inherent_score || a.risk_score || 0))
              .slice(0, 4)
              .map((risk, i) => {
                const score = risk.inherent_score || risk.risk_score || 0
                const level = getRiskLevel(score)
                return (
                  <Link to={`/app/risks/${risk.id}`} key={risk.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded flex-shrink-0"
                      style={{ background: level.bg, color: level.color, border: `1px solid ${level.border}` }}>
                      {score}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate font-medium" style={{ color: '#1a1314' }}>{risk.title}</p>
                      <p className="text-[11px]" style={{ color: '#8a7070' }}>{risk.category || '—'}</p>
                    </div>
                    <span className="text-[11px] capitalize flex-shrink-0" style={{ color: '#8a7070' }}>
                      {risk.status}
                    </span>
                  </Link>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Compliance score widget ───────────────────────────────────────────────────
function ComplianceWidget({ complianceStatuses }) {
  const total    = complianceStatuses.length
  const compliant = complianceStatuses.filter(s => s.status === 'compliant').length
  const partial   = complianceStatuses.filter(s => s.status === 'partial').length
  const nonCompliant = complianceStatuses.filter(s => s.status === 'not_compliant').length
  const score = total > 0 ? Math.round((compliant / total) * 100) : null

  // Group by framework
  const frameworks = {}
  for (const s of complianceStatuses) {
    if (!frameworks[s.framework]) frameworks[s.framework] = { total: 0, compliant: 0 }
    frameworks[s.framework].total++
    if (s.status === 'compliant') frameworks[s.framework].compliant++
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Compliance Posture</p>
        <Link to="/app/compliance" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View all <ArrowRight size={11} />
        </Link>
      </div>

      {total === 0 ? (
        <div className="py-8 text-center">
          <BookCheck size={22} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d4cccc' }} />
          <p className="text-xs mb-1" style={{ color: '#8a7070' }}>No compliance data yet</p>
          <Link to="/app/compliance" className="text-[11px]" style={{ color: '#5D0F0F' }}>
            Set up frameworks →
          </Link>
        </div>
      ) : (
        <>
          {/* Overall score */}
          <div className="px-4 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid #f0eded' }}>
            {/* Donut-style score */}
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f0eded" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'}
                  strokeWidth="3"
                  strokeDasharray={`${score} ${100 - score}`}
                  strokeLinecap="round" />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 600,
                color: score >= 70 ? '#166534' : score >= 40 ? '#92400e' : '#b91c1c',
              }}>
                {score}%
              </div>
            </div>

            <div className="flex-1">
              <p className="text-xs font-medium mb-2" style={{ color: '#1a1314' }}>
                {score >= 70 ? 'Good posture' : score >= 40 ? 'Needs attention' : 'Critical gaps'}
              </p>
              <div className="flex gap-3 text-[11px]">
                <span style={{ color: '#166534' }}><span className="font-medium">{compliant}</span> compliant</span>
                <span style={{ color: '#92400e' }}><span className="font-medium">{partial}</span> partial</span>
                <span style={{ color: '#b91c1c' }}><span className="font-medium">{nonCompliant}</span> non-compliant</span>
              </div>
            </div>
          </div>

          {/* Per-framework breakdown */}
          {Object.entries(frameworks).slice(0, 3).map(([fw, data]) => {
            const pct = Math.round((data.compliant / data.total) * 100)
            return (
              <div key={fw} className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderTop: '1px solid #f5f3f3' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium truncate" style={{ color: '#1a1314' }}>{fw}</p>
                    <span className="text-[11px] ml-2 flex-shrink-0"
                      style={{ color: pct >= 70 ? '#166534' : pct >= 40 ? '#92400e' : '#b91c1c' }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#f0eded', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${pct}%`,
                      background: pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Identity posture widget (Entra) ───────────────────────────────────────────
function IdentityPosture({ entraUsers, entraConnected }) {
  if (!entraConnected) {
    return (
      <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Identity Posture</p>
          <Building2 size={14} strokeWidth={1.5} style={{ color: '#d4cccc' }} />
        </div>
        <div className="py-4 text-center">
          <Building2 size={22} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d4cccc' }} />
          <p className="text-xs mb-2" style={{ color: '#8a7070' }}>Entra ID not connected</p>
          <Link to="/app/settings" className="text-[11px] font-medium" style={{ color: '#5D0F0F' }}>
            Connect Entra ID →
          </Link>
        </div>
      </div>
    )
  }

  const total      = entraUsers.length
  const noMfa      = entraUsers.filter(u => !u.is_mfa_registered && u.account_enabled).length
  const privileged = entraUsers.filter(u => u.is_privileged).length
  const guests     = entraUsers.filter(u => u.user_type === 'Guest').length

  const mfaCoverage = total > 0 ? Math.round(((total - noMfa) / total) * 100) : 0

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Identity Posture</p>
        <Link to="/app/findings/entra" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View detail <ArrowRight size={11} />
        </Link>
      </div>

      {/* MFA coverage bar */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px]" style={{ color: '#4a3a3a' }}>MFA Coverage</p>
          <span className="text-[11px] font-medium"
            style={{ color: mfaCoverage >= 80 ? '#166534' : mfaCoverage >= 50 ? '#92400e' : '#b91c1c' }}>
            {mfaCoverage}%
          </span>
        </div>
        <div style={{ height: 6, background: '#f0eded', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${mfaCoverage}%`,
            background: mfaCoverage >= 80 ? '#16a34a' : mfaCoverage >= 50 ? '#d97706' : '#dc2626',
            transition: 'width 0.6s ease',
          }} />
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#8a7070' }}>
          {total - noMfa} of {total} users have MFA registered
        </p>
      </div>

      {/* Findings */}
      <div className="divide-y" style={{ borderColor: '#f5f3f3' }}>
        {[
          {
            label: `${noMfa} user${noMfa !== 1 ? 's' : ''} without MFA`,
            sub: 'Access control risk — NCA ECC 2-1-2',
            warn: noMfa > 0,
            icon: noMfa > 0 ? AlertCircle : CheckCircle,
          },
          {
            label: `${privileged} privileged account${privileged !== 1 ? 's' : ''}`,
            sub: 'Global Admin or directory role assigned',
            warn: privileged > 2,
            amber: privileged > 0 && privileged <= 2,
            icon: ShieldCheck,
          },
          {
            label: `${guests} guest user${guests !== 1 ? 's' : ''}`,
            sub: 'External / third-party access',
            warn: false,
            amber: guests > 0,
            icon: Users,
          },
        ].map((item, i) => {
          const Icon = item.icon
          const color = item.warn ? '#b91c1c' : item.amber ? '#92400e' : '#166534'
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
              <Icon size={13} style={{ color, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: item.warn ? '#b91c1c' : '#1a1314' }}>
                  {item.label}
                </p>
                <p className="text-[11px]" style={{ color: '#8a7070' }}>{item.sub}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Recent incidents ──────────────────────────────────────────────────────────
function RecentIncidents({ incidents }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Recent Incidents</p>
        <Link to="/app/incidents" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {incidents.length === 0 ? (
        <div className="py-8 text-center">
          <AlertTriangle size={22} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d4cccc' }} />
          <p className="text-xs" style={{ color: '#8a7070' }}>No incidents yet</p>
        </div>
      ) : (
        incidents.slice(0, 5).map((inc, i) => (
          <div key={inc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] transition-colors"
            style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate font-medium" style={{ color: '#1a1314' }}>{inc.title}</p>
              <p className="text-[11px]" style={{ color: '#8a7070' }}>
                {inc.external_id && `${inc.external_id} · `}{inc.connector_id}
              </p>
            </div>
            <SeverityBadge value={inc.severity} />
            <StatusBadge value={inc.status} />
          </div>
        ))
      )}
    </div>
  )
}

// ── Recent tasks ──────────────────────────────────────────────────────────────
function RecentTasks({ tasks }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Tasks</p>
        <Link to="/app/tasks" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <CheckSquare2 size={22} strokeWidth={1} className="mx-auto mb-2" style={{ color: '#d4cccc' }} />
          <p className="text-xs" style={{ color: '#8a7070' }}>No tasks yet</p>
        </div>
      ) : (
        tasks.slice(0, 4).map((task, i) => {
          const s = getTaskStatus(task.status)
          const overdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done'
          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] transition-colors"
              style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
              <Circle size={13} strokeWidth={1.5} style={{ color: s.color, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${task.status === 'done' ? 'line-through opacity-50' : ''}`}
                  style={{ color: '#1a1314' }}>{task.title}</p>
                {task.due_at && (
                  <p className="text-[11px]" style={{ color: overdue ? '#b91c1c' : '#8a7070' }}>
                    {overdue ? 'Overdue · ' : 'Due · '}{new Date(task.due_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0"
                style={{ color: s.color, background: s.bg, borderColor: s.border }}>
                {s.label}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ auditLog }) {
  const timeAgo = d => {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const ACTION_COLORS = {
    'risk.created':           '#92400e',
    'risk.submitted_for_review': '#1e40af',
    'risk.approved':          '#166534',
    'risk.rejected':          '#b91c1c',
    'incident.created':       '#5D0F0F',
    'incident.resolved':      '#166534',
    'incident.status_changed':'#5D0F0F',
    'task.created':           '#1e40af',
    'task.completed':         '#166534',
    'task.status_changed':    '#1e40af',
    'finding.escalated_to_risk':     '#92400e',
    'finding.escalated_to_incident': '#5D0F0F',
    'connector.connected':    '#166534',
    'connector.synced':       '#1e40af',
    'member.invited':         '#5D0F0F',
  }

  const ACTION_LABELS = {
    'risk.created':           'Risk created',
    'risk.submitted_for_review': 'Risk submitted for review',
    'risk.approved':          'Risk approved',
    'risk.rejected':          'Risk rejected',
    'incident.created':       'Incident raised',
    'incident.resolved':      'Incident resolved',
    'incident.status_changed':'Incident updated',
    'task.created':           'Task created',
    'task.completed':         'Task completed',
    'task.status_changed':    'Task status changed',
    'finding.escalated_to_risk':     'Finding → Risk',
    'finding.escalated_to_incident': 'Finding → Incident',
    'connector.connected':    'Connector connected',
    'connector.synced':       'Sync completed',
    'member.invited':         'Member invited',
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f0eded' }}>
        <p className="text-xs font-medium" style={{ color: '#1a1314' }}>Recent Activity</p>
        <Link to="/app/audit" className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#5D0F0F' }}>
          View all →
        </Link>
      </div>
      {auditLog.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs" style={{ color: '#8a7070' }}>No activity yet</p>
        </div>
      ) : (
        auditLog.map((item, i) => (
          <div key={item.id} className="flex items-start gap-3 px-4 py-2.5"
            style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
              style={{ background: ACTION_COLORS[item.action] || '#8a7070' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ color: '#1a1314' }}>{item.entity_title || '—'}</p>
              <p className="text-[11px]" style={{ color: '#8a7070' }}>
                {ACTION_LABELS[item.action] || item.action} · {item.actor_name || 'System'}
              </p>
            </div>
            <span className="text-[11px] flex-shrink-0" style={{ color: '#8a7070' }}>{timeAgo(item.created_at)}</span>
          </div>
        ))
      )}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { organization } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    incidents: [], tasks: [], risks: [],
    complianceStatuses: [], entraUsers: [],
    entraConnected: false, members: 0, auditLog: [],
  })

  const fetchData = async () => {
    if (!organization?.id) return
    setLoading(true)
    const [incRes, taskRes, riskRes, compRes, entraRes, connRes, memberRes, auditRes] = await Promise.all([
      supabase.from('incidents').select('*').eq('org_id', organization.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('org_id', organization.id).order('created_at', { ascending: false }),
      supabase.from('risks').select('*').eq('org_id', organization.id).order('inherent_score', { ascending: false }),
      supabase.from('compliance_statuses').select('*').eq('org_id', organization.id),
      supabase.from('entra_users').select('*').eq('org_id', organization.id),
      supabase.from('org_connectors').select('connector_id,status').eq('org_id', organization.id).eq('connector_id', 'entra').single(),
      supabase.from('organization_members').select('id', { count: 'exact' }).eq('org_id', organization.id),
      supabase.from('audit_log').select('*').eq('org_id', organization.id).order('created_at', { ascending: false }).limit(10),
    ])
    setData({
      incidents:          incRes.data  || [],
      tasks:              taskRes.data || [],
      risks:              riskRes.data || [],
      complianceStatuses: compRes.data || [],
      entraUsers:         entraRes.data || [],
      entraConnected:     connRes.data?.status === 'active',
      members:            memberRes.count || 0,
      auditLog:           auditRes.data || [],
    })
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [organization?.id])

  const { incidents, tasks, risks, complianceStatuses, entraUsers, entraConnected, members, auditLog } = data

  const openIncidents     = incidents.filter(i => i.status === 'open')
  const criticalIncidents = incidents.filter(i => i.severity === 'critical' && !['resolved','closed'].includes(i.status))
  const openRisks         = risks.filter(r => r.status !== 'closed')
  const criticalRisks     = openRisks.filter(r => (r.inherent_score || r.risk_score || 0) >= 20)
  const openTasks         = tasks.filter(t => ['todo','in_progress'].includes(t.status))
  const overdueTasks      = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date() && !['done','cancelled'].includes(t.status))
  const noMfaCount        = entraUsers.filter(u => !u.is_mfa_registered && u.account_enabled).length

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Dashboard"
        subtitle={organization?.name}
        actions={
          <button onClick={fetchData}
            className="w-8 h-8 flex items-center justify-center rounded-md border transition-colors hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#8a7070' }}>
            <RefreshCw size={13} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            {/* ── Stat cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <StatCard
                label="Open Incidents" value={openIncidents.length} icon={AlertTriangle}
                sub={criticalIncidents.length > 0 ? `${criticalIncidents.length} critical` : 'No critical'}
                warn={criticalIncidents.length > 0} to="/app/incidents" />
              <StatCard
                label="Open Risks" value={openRisks.length} icon={ShieldAlert}
                sub={criticalRisks.length > 0 ? `${criticalRisks.length} critical` : 'No critical risks'}
                warn={criticalRisks.length > 0} to="/app/risks" />
              <StatCard
                label="Active Tasks" value={openTasks.length} icon={CheckSquare2}
                sub={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : 'On track'}
                warn={overdueTasks.length > 0} to="/app/tasks" />
              <StatCard
                label="Users Without MFA" value={entraConnected ? noMfaCount : '—'} icon={ShieldCheck}
                sub={entraConnected ? (noMfaCount > 0 ? 'Identity risk — NCA ECC 2-1-2' : 'All users protected') : 'Connect Entra ID'}
                warn={entraConnected && noMfaCount > 0} to={entraConnected ? '/app/findings/entra' : '/app/settings'} />
            </div>

            {/* ── SLA alerts ─────────────────────────────────────────────── */}
            <SLABar incidents={incidents} />

            {/* ── Main grid ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 flex flex-col gap-4">
                <RiskSummary risks={risks} />
                <RecentIncidents incidents={incidents} />
              </div>
              <div className="flex flex-col gap-4">
                <IdentityPosture entraUsers={entraUsers} entraConnected={entraConnected} />
                <ComplianceWidget complianceStatuses={complianceStatuses} />
                <ActivityFeed auditLog={auditLog} />
              </div>
            </div>

            <RecentTasks tasks={tasks} />
          </>
        )}
      </div>
    </div>
  )
}
