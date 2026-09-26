import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import {
  TowerControl, LogOut, Check, Copy, Pause, Play, Trash2
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { usePlatform } from '@/hooks/usePlatform'
import { supabase } from '@/lib/supabase'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { RisysLogo } from '@/components/ui/RisysLogo'

export const PLANS = ['standard', 'professional', 'enterprise']

export function CopyBtn({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
      background: copied ? '#ECF4EE' : 'var(--surface)', color: copied ? '#2F6B3C' : 'var(--crimson)', border: `1px solid ${copied ? '#C8DECD' : 'var(--border)'}` }}>
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : label}
    </button>
  )
}

/* ── Console header — shared across platform pages ── */
export function PlatformHeader() {
  const navigate = useNavigate()
  const { user, signOut } = useAuthStore()
  return (
    <header style={{ background: '#292021', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={() => navigate('/platform')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#5D0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TowerControl size={14} style={{ color: '#F3E7E4' }} />
        </div>
        <RisysLogo size="sm" tone="light" />
        <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#A98D8C', padding: '3px 8px', border: '1px solid #3a2f30', borderRadius: 20 }}>
          Platform Console
        </span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 12, color: '#b9a5a2' }}>{user?.email}</span>
        <button onClick={async () => { await signOut(); navigate('/platform/login') }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#b9a5a2', background: 'none', border: '1px solid #3a2f30', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
          <LogOut size={12} className='rtl-flip' /> Sign out
                  </button>
      </div>
    </header>
  )
}

/* ── Page shell ──────────────────────────────────────────────
 * Console pages share the header and the platform-admin check. Anyone who is
 * not a platform admin is sent to the console sign-in; the RPCs behind every
 * page check again in the database. */
export function PlatformShell({ children }) {
  const { user } = useAuthStore()
  const { isPlatformAdmin } = usePlatform()
  if (!user || isPlatformAdmin === false) return <Navigate to="/platform/login" replace />
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlatformHeader />
      {isPlatformAdmin === null
        ? <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spinner size="lg" /></div>
        : <div style={{ flex: 1 }}>{children}</div>}
    </div>
  )
}

/* One company's full record, for the console's form pages. */
export function useCompanyDetail(id) {
  const [state, setState] = useState({ detail: null, error: '' })
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('platform_get_organization', { p_org: id })
    setState({ detail: error ? null : data, error: error ? error.message : '' })
  }, [id])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

/* ── Suspend / reactivate — confirmed in place ───────────────── */
export function SuspendControl({ org, memberCount, platform, onDone, compact }) {
  const suspending = org.status === 'active'
  const n = memberCount ?? org.member_count ?? 0
  const message = suspending ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`
  const detail = suspending
    ? `All ${n} member${n === 1 ? '' : 's'} lose access within a minute. No data is deleted; reactivating restores everything exactly as it was.`
    : 'All members regain access immediately, with all data intact.'
  const run = async () => { await platform.setStatus(org.id, suspending ? 'suspended' : 'active'); onDone?.() }
  const trigger = compact
    ? { triggerStyle: { padding: 6, borderRadius: 6, cursor: 'pointer', background: suspending ? '#FBEAEA' : '#ECF4EE', border: `1px solid ${suspending ? '#F0CECE' : '#C8DECD'}`, color: suspending ? '#8C1616' : '#2F6B3C' } }
    : { triggerClassName: 'btn-secondary', triggerStyle: { color: suspending ? '#9C6F0F' : '#2F6B3C' } }
  return (
    <InlineConfirm variant={compact ? 'strip' : 'panel'} tone={suspending ? 'danger' : 'neutral'}
      message={compact ? message : message} detail={compact ? undefined : detail}
      confirmLabel={suspending ? 'Suspend company' : 'Reactivate'} onConfirm={run}
      triggerTitle={suspending ? 'Suspend' : 'Reactivate'} {...trigger}>
      {suspending ? <Pause size={compact ? 12 : 13} /> : <Play size={compact ? 12 : 13} />}{!compact && (suspending ? ' Suspend' : ' Reactivate')}
    </InlineConfirm>
  )
}

/* ── Delete company — name typed to confirm, in place ────────── */
export function DeleteCompanyControl({ org, memberCount, riskCount, platform, onDeleted }) {
  const name = org.name.trim()
  return (
    <InlineConfirm variant="panel" requireText={name} confirmLabel="Delete everything"
      triggerClassName="btn-danger" triggerStyle={{ padding: '7px 14px' }}
      message={`Permanently delete ${org.name}?`}
      detail={`This erases every trace of the company: all ${riskCount ?? 0} risk${riskCount === 1 ? '' : 's'} with their controls, evidence, history and files, all incidents and tasks, all invitations, and the workspace itself. Member accounts whose only workspace this is (${memberCount ?? 0} member${memberCount === 1 ? '' : 's'} today) are destroyed and signed out everywhere. There is no undo and no recovery.`}
      onConfirm={async () => onDeleted(await platform.deleteCompany(org.id, name))}>
      <Trash2 size={13} /> Delete everything
    </InlineConfirm>
  )
}
