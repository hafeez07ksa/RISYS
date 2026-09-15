import { useState } from 'react'
import { X, Plus, Trash2, Copy, Check } from 'lucide-react'
import { useMappings } from '@/hooks/useMappings'
import { SEVERITIES, JIRA_ISSUE_TYPES } from '@/lib/incidents'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { supabase } from '@/lib/supabase'

export function JiraManageModal({ onClose }) {
  const { organization } = useAuth()
  const { mappings, loading, saveMapping, deleteMapping } = useMappings('jira')
  const [newType, setNewType] = useState('')
  const [newSeverity, setNewSeverity] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [ingestToken, setIngestToken] = useState(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenError, setTokenError] = useState(null)

  // V2: n8n authenticates with a per-organisation token sent in a header.
  // Only its hash is stored, so it is shown once when generated.
  const ingestUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-incident?org_id=${organization?.id || 'YOUR_ORG_ID'}&connector_id=jira`
  const n8nPayload = JSON.stringify({ issue: '{{ $json.issue }}' }, null, 2)

  const handleGenerateToken = async () => {
    if (!window.confirm(
      'Generate a new n8n ingest token?\n\nAny n8n workflow using the previous token will stop working. ' +
      'The direct Jira connection is not affected.'
    )) return
    setTokenBusy(true); setTokenError(null)
    try {
      const { data, error } = await supabase.rpc('rotate_ingest_token', {
        p_org: organization.id, p_connector: 'jira-n8n',
      })
      if (error) throw error
      setIngestToken(data)
    } catch (err) {
      setTokenError(err.message || 'Could not generate a token')
    } finally {
      setTokenBusy(false)
    }
  }

  const handleAdd = async () => {
    if (!newType.trim()) return
    setSaving(true)
    try {
      await saveMapping(newType.trim(), newSeverity)
      setNewType('')
      setNewSeverity('medium')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = (text, key = 'url') => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const unmappedTypes = JIRA_ISSUE_TYPES.filter(
    t => !mappings.some(m => m.source_value.toLowerCase() === t.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-xl shadow-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e0e0' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: '#f5f3f3', color: '#0052CC' }}>J</div>
            <div>
              <h2 className="text-sm font-medium" style={{ color: '#1a1314' }}>Manage Jira Integration</h2>
              <p className="text-xs" style={{ color: '#8a7070' }}>Map issue types to incident severity</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#8a7070' }}><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[70vh]">

          {/* Issue type mappings */}
          <div className="mb-6">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#8a7070' }}>
              Issue Type → Severity Mapping
            </h3>
            <p className="text-xs mb-3" style={{ color: '#8a7070' }}>
              When Jira sends an issue, RISYS checks its type against this list to assign severity.
              If no match, it falls back to Jira's priority field.
            </p>

            {loading ? <Spinner size="sm" /> : (
              <>
                {/* Existing mappings */}
                {mappings.length > 0 && (
                  <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #e5e0e0' }}>
                    {mappings.map((m, i) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2.5"
                        style={{ borderTop: i > 0 ? '1px solid #f5f3f3' : 'none' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium" style={{ color: '#1a1314' }}>{m.source_value}</span>
                          <span style={{ color: '#d4cccc' }}>→</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
                            style={{
                              color: SEVERITIES.find(s => s.value === m.target_value)?.color || '#4a3a3a',
                              background: SEVERITIES.find(s => s.value === m.target_value)?.bg || '#f5f3f3',
                              borderColor: SEVERITIES.find(s => s.value === m.target_value)?.border || '#e5e0e0',
                            }}>
                            {SEVERITIES.find(s => s.value === m.target_value)?.label || m.target_value}
                          </span>
                        </div>
                        <button onClick={() => deleteMapping(m.id)} className="p-1 hover:opacity-70 transition-opacity" style={{ color: '#d4cccc' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new mapping */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <SelectField value={newType} onChange={e => setNewType(e.target.value)}
                      className="w-full text-xs pl-3 pr-7 py-2 rounded-md border outline-none appearance-none"
                      style={{ borderColor: '#e5e0e0', color: newType ? '#1a1314' : '#8a7070' }}>
                      <option value="">Select issue type...</option>
                      {unmappedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      <option value="__custom__">Custom type...</option>
                    </SelectField>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
                  </div>
                  {newType === '__custom__' && (
                    <input value={newType === '__custom__' ? '' : newType}
                      onChange={e => setNewType(e.target.value)}
                      placeholder="Type name..."
                      className="flex-1 text-xs px-3 py-2 rounded-md border outline-none"
                      style={{ borderColor: '#e5e0e0' }}
                    />
                  )}
                  <span style={{ color: '#d4cccc' }}>→</span>
                  <div className="relative">
                    <SelectField value={newSeverity} onChange={e => setNewSeverity(e.target.value)}
                      className="text-xs pl-3 pr-7 py-2 rounded-md border outline-none appearance-none"
                      style={{ borderColor: '#e5e0e0', color: '#1a1314' }}>
                      {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SelectField>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]" style={{ color: '#8a7070' }}>▾</span>
                  </div>
                  <button onClick={handleAdd} disabled={!newType || newType === '__custom__' || saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors border-0"
                    style={{ background: '#5D0F0F', color: '#fff', opacity: (!newType || saving) ? 0.5 : 1 }}>
                    {saving ? <Spinner size="sm" /> : <Plus size={13} />}
                    Add
                  </button>
                </div>
              </>
            )}
          </div>

          {/* n8n setup section */}
          <div className="rounded-lg p-4" style={{ background: '#f8f7f7', border: '1px solid #e5e0e0' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#8a7070' }}>n8n Webhook Setup</h3>
            <p className="text-xs mb-3" style={{ color: '#8a7070' }}>
              Use this endpoint in your n8n workflow to send Jira issues to RISYS.
              Not needed if Jira is connected directly — that webhook is registered and secured automatically.
            </p>

            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8a7070' }}>Ingest URL</p>
              <div className="flex items-center gap-2 p-2.5 rounded-md font-mono text-xs" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                <span className="flex-1 truncate" style={{ color: '#1a1314' }}>{ingestUrl}</span>
                <button onClick={() => handleCopy(ingestUrl, 'url')} className="flex-shrink-0 transition-opacity hover:opacity-70">
                  {copied === 'url' ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} style={{ color: '#8a7070' }} />}
                </button>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8a7070' }}>
                Header <code className="px-1 rounded normal-case" style={{ background: '#ede9e9' }}>x-risys-token</code>
              </p>
              {ingestToken ? (
                <>
                  <div className="flex items-center gap-2 p-2.5 rounded-md font-mono text-xs" style={{ background: '#fff', border: '1px solid #e5e0e0' }}>
                    <span className="flex-1 truncate" style={{ color: '#1a1314' }}>{ingestToken}</span>
                    <button onClick={() => handleCopy(ingestToken, 'token')} className="flex-shrink-0 transition-opacity hover:opacity-70">
                      {copied === 'token' ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} style={{ color: '#8a7070' }} />}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>
                    Copy this now and store it in n8n credentials. It won't be shown again.
                  </p>
                </>
              ) : (
                <button onClick={handleGenerateToken} disabled={tokenBusy}
                  className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:bg-[#f5f3f3] disabled:opacity-50"
                  style={{ borderColor: '#e5e0e0', color: '#4a3a3a', background: '#fff' }}>
                  {tokenBusy ? 'Generating…' : 'Generate ingest token'}
                </button>
              )}
              {tokenError && <p className="text-[11px] mt-1" style={{ color: '#dc2626' }}>{tokenError}</p>}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8a7070' }}>n8n HTTP Request Body</p>
              <div className="p-2.5 rounded-md font-mono text-xs overflow-x-auto" style={{ background: '#fff', border: '1px solid #e5e0e0', color: '#1a1314', whiteSpace: 'pre' }}>
                {n8nPayload}
              </div>
            </div>

            <p className="text-[11px] mt-3" style={{ color: '#8a7070' }}>
              In n8n: Jira Trigger → HTTP Request (POST to the URL above, with the
              <code className="px-1 rounded" style={{ background: '#ede9e9' }}>x-risys-token</code> header) → done.
              Requests without a valid token are rejected.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid #e5e0e0' }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border transition-colors hover:bg-[#f5f3f3]"
            style={{ borderColor: '#e5e0e0', color: '#4a3a3a' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
