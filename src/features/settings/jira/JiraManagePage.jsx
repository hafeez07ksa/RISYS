import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, Settings, GitBranch,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useMappings } from '@/hooks/useMappings'
import { useAuth } from '@/hooks/useAuth'
import { useConnectors } from '@/hooks/useConnectors'
import { SEVERITIES, JIRA_ISSUE_TYPES } from '@/lib/incidents'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { useEffect } from 'react'
import { ArrowRight, Webhook, Workflow, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Summary } from '@/features/settings/shared/ConnectorScanSettings'
import { formatRelative } from '@/hooks/useConnectorScans'
import { ControlReferences } from '@/components/ui/ControlReferences'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { tx } from '@/lib/i18n'

// Incidents that arrive from Jira are the entity's incident-management process in
// action, so the same ECC 2-13 controls apply as on the incident itself.
const JIRA_CONTROLS = [
  'NCA ECC 2-13-3-1 · Incident Response Plans and Escalation Procedures',
  'NCA ECC 2-13-3-2 · Cybersecurity Incident Classification',
  'SDAIA PDPL-IR Art. 24 · Notification of Personal Data Breach',
].join(' | ')

// Jira pushes to RISYS; there is nothing to poll, so instead of scan sources this
// page shows whether each inbound channel has actually delivered anything.
const INGEST_CHANNELS = [
  {
    key: 'jira',
    Icon: Webhook,
    name: 'Jira webhook',
    what: tx('issues created and updated'),
    detail: tx(
      'Registered automatically when Jira is connected, and authenticated with a per-tenant token. Reconnect Jira if issues stop arriving.'
    ),
  },
  {
    key: 'jira-n8n',
    Icon: Workflow,
    name: 'n8n or other automation',
    what: tx('issues pushed by a workflow'),
    detail: tx(
      'Optional. POST to the ingest-incident function with the x-risys-token header; generate that token below.'
    ),
  },
]

// ── Disconnect ───────────────────────────────────────────────────────────────
/* Confirmation opens in place, with the consequences and a typed keyword —
 * the same safeguard the old dialog had, without covering the page. */
function DisconnectControl({ onDisconnected }) {
  const { disconnect } = useConnectors()
  return (
    <InlineConfirm variant="panel" requireText="DISCONNECT" confirmLabel={tx('Disconnect')}
      triggerClassName="btn-secondary" triggerStyle={{ color: 'var(--critical)', borderColor: 'var(--critical-bd)' }}
      message={tx('Disconnect Jira?')}
      detail={tx('Jira webhooks stop sending new issues immediately. Existing incidents from Jira remain in RISYS, issue type mappings are kept, and you can reconnect at any time.')}
      onConfirm={async () => { await disconnect('jira'); onDisconnected?.() }}>
      {tx('Disconnect')}
    </InlineConfirm>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function JiraManagePage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { mappings, loading, saveMapping, deleteMapping } = useMappings('jira')
  const [tab, setTab] = useState('mappings')

  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!organization?.id) return
    let cancelled = false
    ;(async () => {
      const [{ data: rows }, { count: openCount }] = await Promise.all([
        supabase.from('incidents').select('created_at, source_type, status')
          .eq('org_id', organization.id).eq('connector_id', 'jira')
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('incidents').select('id', { count: 'exact', head: true })
          .eq('org_id', organization.id).eq('connector_id', 'jira').neq('status', 'resolved'),
      ])
      if (cancelled) return
      const list = rows || []
      setStats({
        total: list.length,
        open: openCount ?? 0,
        last: list[0]?.created_at || null,
        viaWebhook: list.some(r => !String(r.source_type || '').toLowerCase().includes('n8n')),
        viaN8n: list.some(r => String(r.source_type || '').toLowerCase().includes('n8n')),
      })
    })()
    return () => { cancelled = true }
  }, [organization?.id])

  const [newType, setNewType]         = useState('')
  const [customType, setCustomType]   = useState('')
  const [newSeverity, setNewSeverity] = useState('medium')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const unmappedTypes = JIRA_ISSUE_TYPES.filter(
    t => !mappings.some(m => m.source_value.toLowerCase() === t.toLowerCase())
  )

  const handleAdd = async () => {
    const typeToSave = newType === '__custom__' ? customType.trim() : newType.trim()
    if (!typeToSave) return
    setSaving(true); setError('')
    try {
      await saveMapping(typeToSave, newSeverity)
      setNewType(''); setCustomType(''); setNewSeverity('medium')
    } catch (err) {
      setError(err.message || tx('Failed to save mapping'))
    } finally { setSaving(false) }
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={tx('Jira')}
        subtitle={tx('Integration Settings')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/app/incidents')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>{tx('View incidents')} <ArrowRight size={13} className='rtl-flip' />
            </button>
            <button onClick={() => navigate('/app/settings')}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors hover:bg-[#f5f3f3]"
              style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
              <ArrowLeft size={13} className='rtl-flip' /> {tx('Back')}</button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto page-content">

        {/* ── Header card ──────────────────────────────────────────────── */}
        <div className="rounded-xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-4 px-5 py-4">
            {/* Jira logo */}
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: '#0052CC',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-sans)' }}>J</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#1a1314' }}>{tx('Jira')}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{tx('● Active')}</span>
              </div>
              <p className="text-xs" style={{ color: '#8a7070' }}>{tx('Connected · Atlassian · Issues flow in as RISYS incidents in real time')}</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'end' }}>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070', marginBottom: 2 }}>{tx('Incidents ingested')}</p>
                <p style={{ fontSize: 20, fontWeight: 300, color: '#1a1314' }}>{/* dynamic later */}—</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Summary label={tx('Incidents from Jira')} value={stats ? stats.total : '—'} sub={tx('Last 500 ingested')} />
          <Summary label={tx('Open')} value={stats ? stats.open : '—'} sub={tx('Not yet resolved')} warn={!!stats?.open} />
          <Summary label={tx('Last received')} value={stats?.last ? formatRelative(stats.last) : '—'}
            sub={stats && !stats.last ? tx('Nothing has arrived yet') : tx('Most recent Jira issue')}
            warn={!!stats && !stats.last} />
          <Summary label={tx('Issue type mappings')} value={loading ? '—' : mappings.length} sub={tx('Type → severity rules')} />
        </div>

        {/* ── Inbound channels ─────────────────────────────────────────── */}
        <div className="rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #f0ecec' }}>
            <Info size={14} style={{ color: '#5D0F0F' }} />
            <p className="text-sm font-medium flex-1" style={{ color: '#1a1314' }}>{tx('Inbound channels')}</p>
            <span className="text-[11px]" style={{ color: '#8a7070' }}>{tx('Jira pushes to RISYS — there is no scan to run')}</span>
          </div>
          <div className="px-4">
            {INGEST_CHANNELS.map((ch, i) => {
              const delivered = ch.key === 'jira' ? stats?.viaWebhook : stats?.viaN8n
              return (
                <div key={ch.key} className="flex gap-3 py-3" style={{ borderTop: i ? '1px solid #f5f3f3' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0052CC12', border: '1px solid #0052CC30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ch.Icon size={14} style={{ color: '#0052CC' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium" style={{ color: '#1a1314' }}>{ch.name}</p>
                      <span className="text-xs" style={{ color: '#8a7070' }}>{ch.what}</span>
                      <span style={{ marginInlineStart: 'auto', fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        color: delivered ? '#166534' : '#6b5555', background: delivered ? '#f0fdf4' : '#f8f7f7',
                        border: `1px solid ${delivered ? '#bbf7d0' : '#e5e0e0'}` }}>
                        {delivered ? tx('Receiving') : tx('Nothing received yet')}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: '#8a7070' }}>{ch.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-3" style={{ borderTop: '1px solid #f0ecec' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#8a7070' }}>{tx('Framework reference')}</p>
            <ControlReferences control={JIRA_CONTROLS} />
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex mb-5" style={{ borderBottom: '1px solid #e5e0e0' }}>
          {[
            { id: 'mappings', label: tx('Issue Type Mappings'), icon: GitBranch },
            { id: 'settings', label: tx('Settings'),            icon: Settings  },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs -mb-px border-b-2 transition-colors"
              style={{
                color: tab === id ? '#1a1314' : '#8a7070',
                borderBottomColor: tab === id ? '#5D0F0F' : 'transparent',
                fontWeight: tab === id ? 500 : 400,
              }}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            ISSUE TYPE MAPPINGS TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'mappings' && (
          <div className="flex flex-col gap-5">

            {/* Mappings table */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: '#1a1314' }}>{tx('Issue Type → Severity Mapping')}</h2>
                <p className="text-xs" style={{ color: '#8a7070', lineHeight: 1.6 }}>{tx(
                  'Define how Jira issue types map to RISYS incident severity levels. If an issue type has no mapping, severity is determined by Jira\'s priority field.'
                )}</p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12"><Spinner /></div>
              ) : mappings.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <GitBranch size={28} strokeWidth={1} className="mx-auto mb-3" style={{ color: '#d4cccc' }} />
                  <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>{tx('No mappings yet')}</p>
                  <p className="text-xs" style={{ color: '#8a7070' }}>{tx(
                    'Add your first mapping below to control how Jira issues become RISYS incidents.'
                  )}</p>
                </div>
              ) : (
                <>
                  <div className="grid px-5 py-2.5 text-[11px] uppercase tracking-wider"
                    style={{ gridTemplateColumns: '1fr 200px 48px', background: '#f8f7f7', borderBottom: '1px solid #e5e0e0', color: '#8a7070' }}>
                    <span>{tx('Jira Issue Type')}</span>
                    <span>{tx('RISYS Severity')}</span>
                    <span />
                  </div>
                  {mappings.map((m, i) => {
                    const sev = SEVERITIES.find(s => s.value === m.target_value)
                    return (
                      <div key={m.id} className="grid items-center px-5 py-3 hover:bg-[#fafafa] transition-colors"
                        style={{ gridTemplateColumns: '1fr 200px 48px', borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
                        <span style={{ fontSize: 13, color: '#1a1314', fontWeight: 500 }}>{m.source_value}</span>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: sev?.color, background: sev?.bg, border: `1px solid ${sev?.border}` }}>
                            {sev?.label || m.target_value}
                          </span>
                        </div>
                        <button onClick={() => deleteMapping(m.id)}
                          className="p-1.5 rounded-md transition-colors hover:bg-[#fef2f2] justify-self-center"
                          style={{ color: '#d4cccc' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </>
              )}

              {/* Add mapping row */}
              <div className="px-5 py-4" style={{ borderTop: '1px solid #e5e0e0', background: '#f8f7f7' }}>
                <p className="text-xs font-medium mb-3" style={{ color: '#4a3a3a' }}>{tx('Add mapping')}</p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <SelectField value={newType} onChange={e => { setNewType(e.target.value); setCustomType('') }}
                      className='w-full text-xs ps-3 pe-7 py-2.5 rounded-lg border outline-none appearance-none'
                      style={{ background: '#fff', borderColor: '#e5e0e0', color: newType ? '#1a1314' : '#8a7070' }}>
                      <option value="">{tx('Select issue type...')}</option>
                      {unmappedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      <option value="__custom__">{tx('Custom type...')}</option>
                    </SelectField>
                    <span className='absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]' style={{ color: '#8a7070' }}>▾</span>
                  </div>

                  {newType === '__custom__' && (
                    <input value={customType} onChange={e => setCustomType(e.target.value)}
                      placeholder={tx('Enter type name...')}
                      className="flex-1 text-xs px-3 py-2.5 rounded-lg border outline-none"
                      style={{ borderColor: '#e5e0e0', color: '#1a1314' }} />
                  )}

                  <span style={{ color: '#d4cccc', fontSize: 18, flexShrink: 0 }}>→</span>

                  <div className="relative flex-shrink-0">
                    <SelectField value={newSeverity} onChange={e => setNewSeverity(e.target.value)}
                      className='text-xs ps-3 pe-7 py-2.5 rounded-lg border outline-none appearance-none'
                      style={{ background: '#fff', borderColor: '#e5e0e0', color: '#1a1314' }}>
                      {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SelectField>
                    <span className='absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]' style={{ color: '#8a7070' }}>▾</span>
                  </div>

                  <button onClick={handleAdd}
                    disabled={saving || !newType || (newType === '__custom__' && !customType.trim())}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold flex-shrink-0"
                    style={{ background: '#5D0F0F', color: '#fff', border: 'none', opacity: (saving || !newType || (newType === '__custom__' && !customType.trim())) ? 0.5 : 1 }}>
                    {saving ? <Spinner size="sm" /> : <Plus size={13} />} {tx('Add')}</button>
                </div>
                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
              </div>
            </div>

            {/* Default behaviour */}
            <div className="rounded-xl p-4 text-xs" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0', color: '#8a7070', lineHeight: 1.7 }}>
              <p className="font-semibold mb-1" style={{ color: '#4a3a3a' }}>{tx('Default behaviour')}</p>{tx(
                'When a Jira issue arrives with no matching issue type mapping, RISYS automatically maps Jira\'s priority field:'
              )} <strong style={{ color: '#1a1314' }}>{tx('Highest → Critical')}</strong>, <strong style={{ color: '#1a1314' }}>{tx('High → High')}</strong>, <strong style={{ color: '#1a1314' }}>{tx('Medium → Medium')}</strong>, <strong style={{ color: '#1a1314' }}>{tx('Low → Low')}</strong>, <strong style={{ color: '#1a1314' }}>{tx('Lowest → Informational')}</strong>.
                          </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            SETTINGS TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-5">

            {/* Connection info */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>{tx('Connection')}</p>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: tx('Connector'),       value: 'Jira (Atlassian)' },
                  { label: tx('Status'),          value: 'Active', color: '#166534' },
                  { label: tx('Sync direction'),  value: 'One-way — Jira → RISYS (inbound only)' },
                  { label: tx('Trigger'),         value: 'Real-time webhook — issues appear in RISYS within seconds' },
                  { label: tx('Scope'),           value: 'All projects · Webhook fires on issue create, update, delete' },
                  { label: tx('Data retained'),   value: 'All ingested incidents are kept if disconnected' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 12, color: '#8a7070', width: 140, flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: item.color || '#1a1314' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>{tx('Permissions & Scopes')}</p>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { scope: 'read:jira-work',      desc: tx('Read issues, projects, boards, and sprints') },
                  { scope: 'read:jira-user',       desc: tx('Read user profiles and account details') },
                  { scope: 'manage:jira-webhook',  desc: tx('Register and manage webhook subscriptions') },
                  { scope: 'offline_access',       desc: tx('Maintain connection without repeated logins') },
                ].map(p => (
                  <div key={p.scope} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 7, background: '#f8f7f7' }}>
                    <CheckCircle size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#1a1314', fontFamily: 'var(--font-mono)' }}>{p.scope}</p>
                      <p style={{ fontSize: 11, color: '#8a7070' }}>{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What RISYS captures */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0eded', background: '#f8f7f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7070' }}>{tx('What RISYS Captures')}</p>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { field: 'Issue key',     desc: tx('e.g. SEC-142 · used to link back to Jira') },
                  { field: 'Summary',       desc: tx('Becomes the RISYS incident title') },
                  { field: 'Description',   desc: tx('Full issue description, stored on the incident') },
                  { field: 'Issue type',    desc: tx('Mapped to RISYS severity via your mappings above') },
                  { field: 'Priority',      desc: tx('Fallback severity when no issue type mapping exists') },
                  { field: 'Status',        desc: tx('Synced when issue transitions (open → in progress → done)') },
                  { field: 'Assignee',      desc: tx('Mapped to RISYS incident assignee if email matches') },
                  { field: 'Reporter',      desc: tx('Stored as incident source metadata') },
                  { field: 'Labels / tags', desc: tx('Stored for search and filtering') },
                ].map(p => (
                  <div key={p.field} style={{ display: 'flex', gap: 16, padding: '4px 0', borderBottom: '1px solid #f5f3f3' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1314', width: 120, flexShrink: 0 }}>{p.field}</span>
                    <span style={{ fontSize: 12, color: '#8a7070' }}>{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #fecaca' }}>
              <div style={{ padding: '12px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={13} style={{ color: '#b91c1c' }} />
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b91c1c' }}>{tx('Danger Zone')}</p>
              </div>
              <div style={{ padding: '16px 20px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1314', marginBottom: 3 }}>{tx('Disconnect Jira')}</p>
                  <p style={{ fontSize: 12, color: '#8a7070', lineHeight: 1.6 }}>{tx(
                    'Stops all webhook delivery and issue syncs immediately. Existing incidents are preserved. Mappings are kept for when you reconnect.'
                  )}</p>
                </div>
                <DisconnectControl onDisconnected={() => navigate('/app/settings')} />
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
