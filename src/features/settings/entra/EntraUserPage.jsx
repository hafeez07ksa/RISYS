import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ShieldAlert, AlertCircle, CheckCircle, Crown,
  AlertTriangle, Calendar, Mail, Building2, Briefcase, Shield,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { getEntraFindings as getFindings, SEVERITY_CONFIG } from '@/lib/findings'
import { CreateFindingIncidentModal } from '@/features/findings/FindingActionModals'
import { toTriageState } from '@/lib/triage'

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 56 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const palettes = [
    ['#EAF0FB','#2B5797'],['#ECF4EE','#2F6B3C'],['#FAF3E2','#9C6F0F'],
    ['#F6EBE8','#5D0F0F'],['#F2EEF9','#4C1D95'],['#E6F4FB','#0F5A8A'],
  ]
  const [bg, color] = palettes[initials.charCodeAt(0) % palettes.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.36, fontWeight: 700, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em',
    }}>{initials}</div>
  )
}

/*
 * Convert a raw finding (from getEntraFindings) into the normalised shape that
 * the shared FindingActionModals expect. This is the adapter layer so the user
 * profile page can use the same modals as the Findings page.
 */
function toNormalised(finding, user) {
  return {
    ...finding,
    connectorId:   'entra',
    connectorName: 'Microsoft Entra ID',
    accent:        '#0078D4',
    subject: {
      id:    user.entra_id,
      name:  user.display_name || user.user_principal_name,
      email: user.mail || user.user_principal_name || null,
      route: `/app/findings/entra/users/${user.entra_id}`,
      meta:  [user.job_title, user.department].filter(Boolean).join(' · '),
    },
    raw: user,
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function EntraUserPage() {
  const { entraId } = useParams()
  const navigate    = useNavigate()
  const { organization } = useAuth()

  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [incidentModal, setIncidentModal] = useState(null)  // normalised finding

  useEffect(() => {
    if (!organization?.id || !entraId) return
    supabase.from('entra_users').select('*')
      .eq('org_id', organization.id)
      .eq('entra_id', entraId)
      .single()
      .then(({ data }) => { setUser(data); setLoading(false) })
  }, [organization?.id, entraId])

  if (loading) return (
    <div className="h-full flex flex-col">
      <Topbar title="Loading..." subtitle="" />
      <div className="flex-1 flex items-center justify-center"><Spinner /></div>
    </div>
  )

  if (!user) return (
    <div className="h-full flex flex-col">
      <Topbar title="User not found" subtitle="" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#8a7070' }}>This user no longer exists in the synced directory.</p>
          <button onClick={() => navigate('/app/findings/entra')} className="btn-secondary text-xs">← Back to Directory</button>
        </div>
      </div>
    </div>
  )

  const findings      = getFindings(user)
  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount  = findings.filter(f => f.severity === 'warning').length
  const riskScore  = criticalCount > 0 ? 'High Risk'    : warningCount > 0 ? 'Medium Risk' : 'Low Risk'
  const riskColor  = criticalCount > 0 ? '#b91c1c'      : warningCount > 0 ? '#92400e'     : '#166534'
  const riskBg     = criticalCount > 0 ? '#fef2f2'      : warningCount > 0 ? '#fffbeb'     : '#f0fdf4'
  const riskBorder = criticalCount > 0 ? '#fecaca'      : warningCount > 0 ? '#fde68a'     : '#bbf7d0'

  return (
    <div className="h-full flex flex-col">
      {/* Shared modals — receive a normalised finding object */}
      {incidentModal && (
        <CreateFindingIncidentModal
          finding={incidentModal}
          onClose={() => setIncidentModal(null)}
          onCreated={() => {}}
        />
      )}

      <Topbar
        title={user.display_name || user.user_principal_name}
        subtitle="Security Findings · Microsoft Entra ID · User Profile"
        actions={
          <button onClick={() => navigate('/app/findings/entra')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
            <ArrowLeft size={13} /> Back to Directory
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">
        <div>

          {/* ── Profile header ─────────────────────────────────────────── */}
          <div className="rounded-xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
            <div className="px-6 py-5 flex items-center gap-5" style={{ borderBottom: '1px solid #f0eded' }}>
              <Avatar name={user.display_name || user.user_principal_name} size={64} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h1 className="text-xl font-semibold" style={{ color: '#1a1314' }}>
                    {user.display_name || user.user_principal_name}
                  </h1>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: riskBg, color: riskColor, border: `1px solid ${riskBorder}` }}>
                    {riskScore}
                  </span>
                  {user.user_type === 'Guest' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                      GUEST
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#8a7070' }}>
                  {[user.job_title, user.department].filter(Boolean).join(' · ') || 'No job information'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: user.account_enabled ? '#f0fdf4' : '#f9fafb', border: `1px solid ${user.account_enabled ? '#bbf7d0' : '#e5e7eb'}` }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: user.account_enabled ? '#22c55e' : '#9ca3af' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: user.account_enabled ? '#166534' : '#6b7280' }}>
                  {user.account_enabled ? 'Active Account' : 'Disabled Account'}
                </span>
              </div>
            </div>

            {/* Identity details grid */}
            <div className="grid grid-cols-4 divide-x" style={{ divideColor: '#f0eded' }}>
              {[
                { icon: Mail,      label: 'Email',        value: user.mail || user.user_principal_name || '—' },
                { icon: Building2, label: 'Department',   value: user.department || '—' },
                { icon: Briefcase, label: 'Job Title',    value: user.job_title || '—' },
                { icon: Calendar,  label: 'Last Sign-in', value: user.last_sign_in ? new Date(user.last_sign_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Never recorded' },
              ].map((item, i) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="px-5 py-4" style={{ borderRight: i < 3 ? '1px solid #f0eded' : 'none' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={11} style={{ color: '#8a7070' }} />
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>{item.label}</p>
                    </div>
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Two-column layout ─────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-5">

            {/* Left — findings (2/3) */}
            <div className="col-span-2 flex flex-col gap-4">

              {/* Summary bar */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: findings.length > 0 ? riskBg : '#f0fdf4', border: `1px solid ${findings.length > 0 ? riskBorder : '#bbf7d0'}` }}>
                {findings.length > 0
                  ? <AlertTriangle size={16} style={{ color: riskColor }} />
                  : <CheckCircle size={16} style={{ color: '#166634' }} />
                }
                <p style={{ fontSize: 13, fontWeight: 600, color: findings.length > 0 ? riskColor : '#166634', flex: 1 }}>
                  {findings.length === 0
                    ? 'No security findings — this user is clean'
                    : `${findings.length} security finding${findings.length !== 1 ? 's' : ''} detected`}
                </p>
                {criticalCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: '#b91c1c', color: '#fff' }}>{criticalCount} Critical</span>}
                {warningCount > 0  && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: '#92400e', color: '#fff' }}>{warningCount} Warning</span>}
              </div>

              {findings.length === 0 ? (
                <div className="rounded-xl py-12 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
                  <CheckCircle size={36} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#22c55e' }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1314', marginBottom: 4 }}>All clear</p>
                  <p style={{ fontSize: 12, color: '#8a7070', lineHeight: 1.6 }}>No security findings based on currently synced data.</p>
                </div>
              ) : (
                findings.map(finding => {
                  const s    = SEVERITY_CONFIG[finding.severity]
                  const Icon = finding.icon
                  // Normalise for the shared modals
                  const normFinding = toNormalised(finding, user)
                  return (
                    <div key={finding.id} className="rounded-xl overflow-hidden"
                      style={{ background: '#fff', border: `1px solid ${s.border}` }}>

                      {/* Header */}
                      <div style={{ padding: '14px 20px', background: s.bg, borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${s.border}` }}>
                          <Icon size={18} style={{ color: s.color }} />
                        </div>
                        <div className="flex-1">
                          <p style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{finding.title}</p>
                          <p style={{ fontSize: 11.5, color: s.color, opacity: 0.8, marginTop: 1 }}>{finding.control}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20, background: s.color, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {s.label}
                        </span>
                      </div>

                      {/* Body */}
                      <div style={{ padding: '16px 20px' }}>
                        <p style={{ fontSize: 13, color: '#4a3a3a', lineHeight: 1.7, marginBottom: 14 }}>
                          {finding.description}
                        </p>
                        <div style={{ padding: '12px 14px', borderRadius: 8, background: '#f8f7f7', border: '1px solid #e5e0e0', marginBottom: 16 }}>
                          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8a7070', marginBottom: 6 }}>Recommended Action</p>
                          <p style={{ fontSize: 12.5, color: '#1a1314', lineHeight: 1.65 }}>{finding.recommendation}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => navigate('/app/risks/triage', { state: { finding: toTriageState(normFinding) } })}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: 'pointer', background: '#5D0F0F', color: '#fff', border: 'none' }}>
                            <ShieldAlert size={14} /> Triage finding
                          </button>
                          <button onClick={() => setIncidentModal(normFinding)}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#4a3a3a', border: '1px solid #e5e0e0' }}>
                            <AlertCircle size={14} /> Raise Incident
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Right — identity sidebar (1/3) */}
            <div className="flex flex-col gap-4">

              {/* MFA Status */}
              <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={13} style={{ color: '#8a7070' }} />
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>MFA Status</p>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: user.methods_registered?.length > 0 ? 12 : 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: user.is_mfa_registered ? '#f0fdf4' : '#fef2f2', border: `1px solid ${user.is_mfa_registered ? '#bbf7d0' : '#fecaca'}` }}>
                      {user.is_mfa_registered
                        ? <CheckCircle size={20} style={{ color: '#16a34a' }} />
                        : <AlertTriangle size={20} style={{ color: '#b91c1c' }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: user.is_mfa_registered ? '#166534' : '#b91c1c' }}>
                        {user.is_mfa_registered ? 'MFA Registered' : 'No MFA'}
                      </p>
                      <p style={{ fontSize: 11, color: '#8a7070' }}>
                        {user.is_mfa_capable ? 'MFA enforced by policy' : 'Not enforced by policy'}
                      </p>
                    </div>
                  </div>
                  {user.methods_registered?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {user.methods_registered.map(m => (
                        <span key={m} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                          {m.replace('microsoftAuthenticatorPush','Auth App').replace('softwareOneTimePasscode','TOTP').replace('windowsHelloForBusiness','Windows Hello')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Directory Roles */}
              <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Crown size={13} style={{ color: '#8a7070' }} />
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>Directory Roles</p>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {user.directory_roles?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {user.directory_roles.map(role => (
                        <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                          <Crown size={12} style={{ color: '#92400e' }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#92400e' }}>{role.displayName}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#d4cccc', textAlign: 'center', padding: '8px 0' }}>No directory roles assigned</p>
                  )}
                </div>
              </div>

              {/* Account Details */}
              <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0eded', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={13} style={{ color: '#8a7070' }} />
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>Account Details</p>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'User Type', value: user.user_type || 'Member' },
                    { label: 'UPN',       value: user.user_principal_name || '—' },
                    { label: 'Office',    value: user.office_location || '—' },
                    { label: 'Mobile',    value: user.mobile_phone || '—' },
                    { label: 'Created',   value: user.created_datetime ? new Date(user.created_datetime).toLocaleDateString('en-GB') : '—' },
                  ].map(item => (
                    <div key={item.label}>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 2 }}>{item.label}</p>
                      <p style={{ fontSize: 12, color: '#1a1314', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
