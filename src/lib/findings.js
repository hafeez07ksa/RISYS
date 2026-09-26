import {
  Smartphone, Crown, Globe, UserX, Clock, Mail, ShieldAlert,
  Shield, AlertTriangle, MonitorSmartphone, Cloud, Fingerprint,
  FileX, Users, Share2, Bug,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tx } from '@/lib/i18n'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  RISYS — Findings Engine (single source of truth)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every connector contributes "security findings" derived from the data it
 *  syncs. This module is the one place those findings are defined and the one
 *  place the org-wide Findings page pulls from.
 *
 *  To add a NEW connector's findings to the Findings page in the future, you
 *  only register a provider in FINDING_PROVIDERS below — nothing else changes.
 *  A provider must expose:
 *    - connectorId / connectorName / accent   (identity + colour for the UI)
 *    - fetch(orgId)                            → returns raw source rows
 *    - derive(row)                             → returns NormalisedFinding[]
 *
 *  NormalisedFinding shape (what the Findings page renders):
 *    {
 *      key, connectorId, connectorName, accent,
 *      severity, label, title, description, control, recommendation, icon,
 *      subject: { id, name, email, route, meta },   // who/what it's about
 *      raw                                           // original row (modal prefill)
 *    }
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SEVERITY_CONFIG = {
  critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: tx('Critical') },
  warning:  { color: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: tx('Warning')  },
  info:     { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6', label: tx('Info')     },
}

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 }

/**
 * A finding's display title. Adds the subject only when it says something the
 * title doesn't (posture findings use the control title as their subject).
 */
export function findingDisplayTitle(title, subjectName) {
  const t = String(title || '').trim()
  const s = String(subjectName || '').trim()
  if (!s || s.toLowerCase() === t.toLowerCase() || s === 'Tenant') return t
  return `${t} — ${s}`
}

// ── Entra ID findings ─────────────────────────────────────────────────────────
// NCA ECC-2:2024 references, verified against nca_ecc. Identity findings sit in
// 2-2 (Identity and Access Management); 2-1 is Asset Management and does not apply.
export const ECC_IAM = {
  mfa:    tx('NCA ECC 2-2-3-2 · Multi-factor Authentication'),
  authz:  tx('NCA ECC 2-2-3-3 · User Authorization (need-to-know, least privilege)'),
  pam:    tx('NCA ECC 2-2-3-4 · Privileged Access Management'),
  review: tx('NCA ECC 2-2-3-5 · Periodic Review of Identities and Access Rights'),
}

// Method names come either from the registration report ("microsoftAuthenticatorPush")
// or, on tenants without Entra ID P1, from each user's registered methods
// ("microsoftauthenticatorauthenticationmethod"). Both are shown in plain words.
export function mfaMethodLabel(raw) {
  const m = String(raw || '').toLowerCase().replace(/authenticationmethod$/, '')
  if (m.includes('microsoftauthenticator') || m.includes('authenticatorpush')) return 'Microsoft Authenticator'
  if (m.includes('passwordless')) return 'Passwordless sign-in'
  if (m.includes('fido2')) return 'Security key (FIDO2)'
  if (m.includes('windowshello')) return 'Windows Hello'
  if (m.includes('softwareoath') || m.includes('onetimepasscode') || m.includes('totp')) return 'Authenticator app code (TOTP)'
  if (m.includes('temporaryaccesspass')) return 'Temporary Access Pass'
  if (m.includes('certificatebased')) return 'Certificate'
  if (m.includes('phone') || m.includes('sms') || m.includes('voice')) return 'Phone (SMS or call)'
  if (m.includes('email')) return 'Email (password reset only)'
  if (m.includes('password')) return 'Password'
  return raw
}

export function getEntraFindings(u) {
  const findings = []

  // raw_data.mfa_known is false when the tenant has no Entra ID P1, so the MFA
  // registration report could not be read. Silence is better than a false finding.
  const mfaKnown = u.raw_data?.mfa_known !== false
  if (mfaKnown && !u.is_mfa_registered && u.account_enabled) {
    findings.push({
      id: 'no_mfa', severity: 'critical',
      label: tx('No MFA'), title: tx('MFA Not Registered'),
      description: tx(
        'This user has not registered any multi-factor authentication method. Any compromised password gives full account access with no additional barrier.'
      ),
      control: u.is_privileged ? `${ECC_IAM.mfa} | ${ECC_IAM.pam}` : ECC_IAM.mfa,
      recommendation: tx(
        'Require MFA registration via Microsoft Authenticator. Enable a Conditional Access policy to block sign-ins without MFA. Consider disabling the account temporarily until MFA is set up.'
      ),
      icon: Smartphone,
    })
  }

  if (u.is_privileged) {
    findings.push({
      id: 'privileged', severity: 'warning',
      label: tx('Privileged Role'), title: tx('Holds Privileged Directory Role'),
      description: `Assigned: ${(u.directory_roles || []).map(r => r.displayName).join(', ')}. Privileged accounts are the highest-value targets for attackers and require additional access controls beyond standard users.`,
      control: ECC_IAM.pam,
      recommendation: tx(
        'Ensure MFA is enforced on this account. Review whether all assigned roles are necessary (principle of least privilege). Consider enabling Privileged Identity Management (PIM) for just-in-time access.'
      ),
      icon: Crown,
    })
  }

  if (u.user_type === 'Guest') {
    findings.push({
      id: 'guest', severity: 'info',
      label: tx('Guest Account'), title: tx('External / Guest Identity'),
      description: tx(
        'This is an external guest account. Guest access should be time-limited and reviewed regularly to ensure it is still required.'
      ),
      control: `${ECC_IAM.review} | ${ECC_IAM.authz}`,
      recommendation: tx(
        'Confirm guest access is still required. Set an expiry date on the guest invitation. Restrict guest access to only the specific resources they need.'
      ),
      icon: Globe,
    })
  }

  if (!u.account_enabled) {
    findings.push({
      id: 'disabled', severity: 'info',
      label: tx('Account Disabled'), title: tx('Account is Disabled'),
      description: tx(
        'This account is currently disabled. If the user has left the organisation, the account should be deleted to maintain a clean directory and prevent potential re-activation.'
      ),
      control: ECC_IAM.review,
      recommendation: tx(
        'Confirm whether the user has left the organisation. If so, delete the account and reclaim any licences. If the disabling is temporary, document the reason and set a review date.'
      ),
      icon: UserX,
    })
  }

  if (u.last_sign_in) {
    const daysSince = Math.floor((Date.now() - new Date(u.last_sign_in).getTime()) / 86400000)
    if (daysSince >= 90 && u.account_enabled) {
      findings.push({
        id: 'inactive', severity: 'warning',
        label: `Inactive ${daysSince}d`, title: `Inactive for ${daysSince} Days`,
        description: `This user has not signed in for ${daysSince} days. Inactive accounts are an access control risk — they may belong to departed employees or forgotten service accounts that have not been properly off-boarded.`,
        control: ECC_IAM.review,
        recommendation: tx(
          'Contact the account owner to confirm active use. If no response within 7 days, disable the account and reclaim the licence. Review group memberships and application assignments.'
        ),
        icon: Clock,
      })
    }
  }

  return findings
}

// ── Defender category → icon map ──────────────────────────────────────────────
const DEFENDER_ICON_MAP = {
  endpoint:      MonitorSmartphone,
  cloud:         Cloud,
  identity:      Fingerprint,
  office:        Mail,
  posture:       Shield,
  threat:        AlertTriangle,
  vulnerability: Bug,
  device:        MonitorSmartphone,
}

const DEFENDER_SOURCE_LABELS = {
  alert:          tx('Alert'),
  secure_score:   tx('Posture Gap'),
  recommendation: tx('Vulnerability'),
  device:         tx('Device Health'),
}

// Columns the finding lists need. raw_data stays out of list queries: it can be
// large and nothing in the list renders it.
const DEFENDER_LIST_COLUMNS =
  'finding_id, source, category, severity, title, description, control, recommendation, ' +
  'subject_id, subject_name, subject_email, source_url, status, first_seen_at, last_seen_at, ' +
  'resolved_at, incident_id, updated_at'

// ── SharePoint category → icon map ────────────────────────────────────────────
const SHAREPOINT_ICON_MAP = {
  tenant_policy:     Shield,
  public_file:       FileX,
  external_share:    Share2,
  org_wide_link:     Globe,
  guest_access:      Users,
  public_group:      Users,
  // pre-2026-09 categories (resolved rows only)
  external_sharing:  Share2,
  internal_exposure: Globe,
}

export const SHAREPOINT_CATEGORY_LABELS = {
  tenant_policy:     'Sharing Policy',
  public_file:       '"Anyone" Link',
  external_share:    'External Share',
  org_wide_link:     'Org-wide Link',
  guest_access:      'Guest Access',
  public_group:      'Public Group',
  external_sharing:  'External Sharing',
  internal_exposure: 'Exposure',
}

// raw_data is left out of list queries (it can be large).
export const SHAREPOINT_LIST_COLUMNS =
  'finding_id, source, category, severity, title, description, control, recommendation, ' +
  'subject_id, subject_name, subject_email, subject_url, source_url, status, first_seen_at, last_seen_at, ' +
  'resolved_at, incident_id, updated_at'

// ── Microsoft 365 category → icon / label ─────────────────────────────────────
const M365_ICON_MAP = {
  external_forwarding: Mail,
  guest_access:        Users,
  app_consent:         ShieldAlert,
  app_privilege:       ShieldAlert,
  mail_dns:            Mail,
  // pre-2026-09 categories (resolved rows only)
  exchange:            Mail,
  sharepoint:          Globe,
  guests:              Users,
}

export const M365_CATEGORY_LABELS = {
  external_forwarding: tx('External Forwarding'),
  guest_access:        tx('Guest Access'),
  app_consent:         tx('App Consent'),
  app_privilege:       tx('App Privilege'),
  mail_dns:            tx('Mail Domain DNS'),
  exchange:            tx('Exchange'),
  sharepoint:          tx('SharePoint'),
  guests:              tx('Guests'),
}

// raw_data is left out of list queries (it can be large).
export const M365_LIST_COLUMNS =
  'finding_id, source, category, severity, title, description, control, recommendation, ' +
  'subject_id, subject_name, subject_email, subject_url, source_url, status, first_seen_at, last_seen_at, ' +
  'resolved_at, incident_id, updated_at'

// ── Provider registry ─────────────────────────────────────────────────────────
export const FINDING_PROVIDERS = [
  // ── Microsoft Entra ID ────────────────────────────────────────────────────
  {
    connectorId: 'entra',
    connectorName: tx('Microsoft Entra ID'),
    accent: '#0078D4',
    async fetch(orgId) {
      const { data } = await supabase
        .from('entra_users').select('*')
        .eq('org_id', orgId).order('display_name')
      return data || []
    },
    derive(user) {
      const name = user.display_name || user.user_principal_name || 'Unknown user'
      const email = user.mail || user.user_principal_name || null
      return getEntraFindings(user).map(f => ({
        key: `entra:${user.entra_id}:${f.id}`,
        connectorId: 'entra',
        connectorName: tx('Microsoft Entra ID'),
        accent: '#0078D4',
        severity: f.severity,
        label: f.label,
        title: f.title,
        description: f.description,
        control: f.control,
        recommendation: f.recommendation,
        icon: f.icon,
        subject: {
          id: user.entra_id,
          name,
          email,
          route: `/app/settings/entra/users/${user.entra_id}`,
          meta: [user.job_title, user.department].filter(Boolean).join(' · '),
        },
        raw: user,
      }))
    },
  },

  // ── Microsoft 365 Security ────────────────────────────────────────────────
  {
    connectorId: 'm365',
    connectorName: tx('Microsoft 365 Security'),
    accent: '#0078D4',
    piggybakcsOn: 'entra',
    // Open findings by default; { status: 'resolved' } for history. M365
    // findings are resolved, never deleted, like the other connectors (B11).
    async fetch(orgId, { status = 'open' } = {}) {
      const { data, error } = await supabase
        .from('m365_findings')
        .select(M365_LIST_COLUMNS)
        .eq('org_id', orgId)
        .eq('status', status)
        .order('last_seen_at', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error.message)
      return data || []
    },
    supportsStatus: true,
    derive(finding) {
      const icon = M365_ICON_MAP[finding.category] || ShieldAlert
      return [{
        key: `m365:${finding.finding_id}`,
        connectorId: 'm365',
        connectorName: tx('Microsoft 365 Security'),
        accent: '#0078D4',
        severity: finding.severity,
        label: M365_CATEGORY_LABELS[finding.category] || 'M365',
        title: finding.title,
        description: finding.description,
        control: finding.control,
        recommendation: finding.recommendation,
        icon,
        subject: {
          id:    finding.subject_id,
          name:  finding.subject_name,
          email: finding.subject_email,
          route: '/app/findings/m365',
          meta:  M365_CATEGORY_LABELS[finding.category] || finding.category,
        },
        status: finding.status || 'open',
        sourceUrl: finding.source_url || finding.subject_url || null,
        incidentId: finding.incident_id || null,
        source: finding.source,
        firstSeenAt: finding.first_seen_at || null,
        resolvedAt: finding.resolved_at || null,
        raw: finding,
      }]
    },
  },

  // ── Microsoft Defender for Cloud / Security Alerts ────────────────────────
  {
    connectorId: 'defender',
    connectorName: tx('Microsoft Defender'),
    accent: '#00B4D8',
    piggybakcsOn: 'entra',   // reuses Entra token, no separate OAuth
    // Open findings by default; { status: 'resolved' } for history.
    async fetch(orgId, { status = 'open' } = {}) {
      const { data, error } = await supabase
        .from('defender_findings')
        .select(DEFENDER_LIST_COLUMNS)
        .eq('org_id', orgId)
        .eq('status', status)
        .order('last_seen_at', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error.message)
      return data || []
    },
    supportsStatus: true,
    derive(finding) {
      const icon = DEFENDER_ICON_MAP[finding.category] || Shield
      return [{
        key: `defender:${finding.finding_id}`,
        connectorId: 'defender',
        connectorName: tx('Microsoft Defender'),
        accent: '#00B4D8',
        severity: finding.severity,
        label: DEFENDER_SOURCE_LABELS[finding.source] || tx('Finding'),
        title: finding.title,
        description: finding.description,
        control: finding.control,
        recommendation: finding.recommendation,
        icon,
        subject: {
          id:    finding.subject_id,
          name:  finding.subject_name,
          email: finding.subject_email,
          route: '/app/findings/defender',
          meta:  finding.category,
        },
        status: finding.status || 'open',
        sourceUrl: finding.source_url || null,
        incidentId: finding.incident_id || null,
        source: finding.source,
        firstSeenAt: finding.first_seen_at || null,
        resolvedAt: finding.resolved_at || null,
        raw: finding,
      }]
    },
  },

  // ── SharePoint Deep Scan ──────────────────────────────────────────────────
  {
    connectorId: 'sharepoint',
    connectorName: tx('SharePoint Security'),
    accent: '#038387',
    piggybakcsOn: 'entra',
    async fetch(orgId, { status = 'open' } = {}) {
      const { data, error } = await supabase
        .from('sharepoint_findings')
        .select(SHAREPOINT_LIST_COLUMNS)
        .eq('org_id', orgId)
        .eq('status', status)
        .order('last_seen_at', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error.message)
      return data || []
    },
    supportsStatus: true,
    derive(finding) {
      const icon = SHAREPOINT_ICON_MAP[finding.category] || Globe
      return [{
        key: `sharepoint:${finding.finding_id}`,
        connectorId: 'sharepoint',
        connectorName: tx('SharePoint Security'),
        accent: '#038387',
        severity: finding.severity,
        label: SHAREPOINT_CATEGORY_LABELS[finding.category] || tx('Exposure'),
        title: finding.title,
        description: finding.description,
        control: finding.control,
        recommendation: finding.recommendation,
        icon,
        subject: {
          id:    finding.subject_id,
          name:  finding.subject_name,
          email: finding.subject_email,
          route: '/app/findings/sharepoint',
          meta:  finding.category,
        },
        status: finding.status || 'open',
        sourceUrl: finding.source_url || finding.subject_url || null,
        incidentId: finding.incident_id || null,
        source: finding.source,
        firstSeenAt: finding.first_seen_at || null,
        resolvedAt: finding.resolved_at || null,
        raw: finding,
      }]
    },
  },
]

// Aggregate findings from every connected provider into one flat, sorted list.
export async function aggregateFindings(orgId, connectedIds) {
  if (!orgId) return { findings: [], providers: [] }

  const connected = new Set(connectedIds || [])
  const active = FINDING_PROVIDERS.filter(p =>
    p.piggybakcsOn ? connected.has(p.piggybakcsOn) : connected.has(p.connectorId)
  )

  const results = await Promise.all(
    active.map(async (p) => {
      try {
        const rows = await p.fetch(orgId)
        return rows.flatMap(r => p.derive(r))
      } catch (_) {
        return []
      }
    })
  )

  const findings = results.flat().sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (s !== 0) return s
    return (a.subject.name || '').localeCompare(b.subject.name || '')
  })

  return {
    findings,
    providers: active.map(p => ({ id: p.connectorId, name: p.connectorName, accent: p.accent })),
  }
}
