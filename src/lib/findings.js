import {
  Smartphone, Crown, Globe, UserX, Clock, Mail, ShieldAlert,
  Shield, AlertTriangle, MonitorSmartphone, Cloud, Fingerprint,
  FileX, Users, Share2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
  critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'Critical' },
  warning:  { color: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Warning'  },
  info:     { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6', label: 'Info'     },
}

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 }

// ── Entra ID findings ─────────────────────────────────────────────────────────
export function getEntraFindings(u) {
  const findings = []

  if (!u.is_mfa_registered && u.account_enabled) {
    findings.push({
      id: 'no_mfa', severity: 'critical',
      label: 'No MFA', title: 'MFA Not Registered',
      description: 'This user has not registered any multi-factor authentication method. Any compromised password gives full account access with no additional barrier.',
      control: 'NCA ECC 2-1-2 · Privileged Access Management',
      recommendation: 'Require MFA registration via Microsoft Authenticator. Enable a Conditional Access policy to block sign-ins without MFA. Consider disabling the account temporarily until MFA is set up.',
      icon: Smartphone,
    })
  }

  if (u.is_privileged) {
    findings.push({
      id: 'privileged', severity: 'warning',
      label: 'Privileged Role', title: 'Holds Privileged Directory Role',
      description: `Assigned: ${(u.directory_roles || []).map(r => r.displayName).join(', ')}. Privileged accounts are the highest-value targets for attackers and require additional access controls beyond standard users.`,
      control: 'NCA ECC 2-1-3 · Privileged Account Management',
      recommendation: 'Ensure MFA is enforced on this account. Review whether all assigned roles are necessary (principle of least privilege). Consider enabling Privileged Identity Management (PIM) for just-in-time access.',
      icon: Crown,
    })
  }

  if (u.user_type === 'Guest') {
    findings.push({
      id: 'guest', severity: 'info',
      label: 'Guest Account', title: 'External / Guest Identity',
      description: 'This is an external guest account. Guest access should be time-limited and reviewed regularly to ensure it is still required.',
      control: 'NCA ECC 2-1-4 · Third-Party Access',
      recommendation: 'Confirm guest access is still required. Set an expiry date on the guest invitation. Restrict guest access to only the specific resources they need.',
      icon: Globe,
    })
  }

  if (!u.account_enabled) {
    findings.push({
      id: 'disabled', severity: 'info',
      label: 'Account Disabled', title: 'Account is Disabled',
      description: 'This account is currently disabled. If the user has left the organisation, the account should be deleted to maintain a clean directory and prevent potential re-activation.',
      control: 'NCA ECC 2-1-1 · Account Lifecycle Management',
      recommendation: 'Confirm whether the user has left the organisation. If so, delete the account and reclaim any licences. If the disabling is temporary, document the reason and set a review date.',
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
        control: 'NCA ECC 2-1-1 · Account Lifecycle Management',
        recommendation: 'Contact the account owner to confirm active use. If no response within 7 days, disable the account and reclaim the licence. Review group memberships and application assignments.',
        icon: Clock,
      })
    }
  }

  return findings
}

// ── Defender category → icon map ──────────────────────────────────────────────
const DEFENDER_ICON_MAP = {
  endpoint:  MonitorSmartphone,
  cloud:     Cloud,
  identity:  Fingerprint,
  office:    Mail,
  posture:   Shield,
  threat:    AlertTriangle,
}

// ── SharePoint category → icon map ────────────────────────────────────────────
const SHAREPOINT_ICON_MAP = {
  external_sharing:  Share2,
  public_file:       FileX,
  guest_access:      Users,
  internal_exposure: Globe,
}

// ── Provider registry ─────────────────────────────────────────────────────────
export const FINDING_PROVIDERS = [
  // ── Microsoft Entra ID ────────────────────────────────────────────────────
  {
    connectorId: 'entra',
    connectorName: 'Microsoft Entra ID',
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
        connectorName: 'Microsoft Entra ID',
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
    connectorName: 'Microsoft 365 Security',
    accent: '#0078D4',
    piggybakcsOn: 'entra',
    async fetch(orgId) {
      const { data } = await supabase
        .from('m365_findings')
        .select('*')
        .eq('org_id', orgId)
        .order('severity')
      return data || []
    },
    derive(finding) {
      const ICON_MAP = { exchange: Mail, sharepoint: Globe, teams: Users }
      const icon = ICON_MAP[finding.category] || ShieldAlert
      return [{
        key: `m365:${finding.finding_id}`,
        connectorId: 'm365',
        connectorName: 'Microsoft 365 Security',
        accent: '#0078D4',
        severity: finding.severity,
        label: finding.category === 'exchange' ? 'Exchange' : finding.category === 'sharepoint' ? 'SharePoint' : 'M365',
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
          meta:  finding.category,
        },
        raw: finding,
      }]
    },
  },

  // ── Microsoft Defender for Cloud / Security Alerts ────────────────────────
  {
    connectorId: 'defender',
    connectorName: 'Microsoft Defender',
    accent: '#00B4D8',
    piggybakcsOn: 'entra',   // reuses Entra token, no separate OAuth
    async fetch(orgId) {
      const { data } = await supabase
        .from('defender_findings')
        .select('*')
        .eq('org_id', orgId)
        .order('severity')
      return data || []
    },
    derive(finding) {
      const icon = DEFENDER_ICON_MAP[finding.category] || Shield
      return [{
        key: `defender:${finding.finding_id}`,
        connectorId: 'defender',
        connectorName: 'Microsoft Defender',
        accent: '#00B4D8',
        severity: finding.severity,
        label: finding.source === 'alert' ? 'Alert' : 'Posture Gap',
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
        raw: finding,
      }]
    },
  },

  // ── SharePoint Deep Scan ──────────────────────────────────────────────────
  {
    connectorId: 'sharepoint',
    connectorName: 'SharePoint Security',
    accent: '#038387',
    piggybakcsOn: 'entra',
    async fetch(orgId) {
      const { data } = await supabase
        .from('sharepoint_findings')
        .select('*')
        .eq('org_id', orgId)
        .order('severity')
      return data || []
    },
    derive(finding) {
      const icon = SHAREPOINT_ICON_MAP[finding.category] || Globe
      return [{
        key: `sharepoint:${finding.finding_id}`,
        connectorId: 'sharepoint',
        connectorName: 'SharePoint Security',
        accent: '#038387',
        severity: finding.severity,
        label: finding.category === 'external_sharing' ? 'External Sharing'
             : finding.category === 'public_file'      ? 'Public File'
             : finding.category === 'guest_access'     ? 'Guest Access'
             : 'Exposure',
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
