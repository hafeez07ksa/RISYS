import { useState, useEffect, useMemo } from 'react'
import {
  CheckCircle2, Circle, Upload, FileText, X, AlertTriangle, ShieldCheck, Loader2, Info, ClipboardCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useComplianceEvidence } from '@/hooks/useCompliance'
import { evaluateSubmission, isFilled, isVisible, pruneSubmission, localISO } from '@/lib/manualCompliance'
import { DateField } from '@/components/ui/DateField'
import { SelectField } from '@/components/ui/Combobox'

/* ── Evidenced compliance ────────────────────────────────────────────────────
 *
 * One panel, four ways a control is put on record:
 *
 *   manual       no system holds the answer — the artefacts are the proof
 *   semi         a connector measures part; policy and judgement supply the rest
 *   interim      automated, but its connector is not built — the platform's own
 *                export stands in for at most 90 days
 *   attestation  automated and measured — the connector decides the status and
 *                a reviewer attests that the measurement covers the full scope
 *
 * The first three end in Comply, which marks the control compliant. An
 * attestation is recorded without touching the status.
 * -------------------------------------------------------------------------- */

const MAX_BYTES = 25 * 1024 * 1024

const TONES = {
  low:      { color: 'var(--low)',      bg: 'var(--low-bg)',      border: 'var(--low-bd)' },
  medium:   { color: 'var(--medium)',   bg: 'var(--medium-bg)',   border: 'var(--medium-bd)' },
  critical: { color: 'var(--critical)', bg: 'var(--critical-bg)', border: 'var(--critical-bd)' },
  info:     { color: 'var(--info)',     bg: 'var(--info-bg)',     border: 'var(--info-bd)' },
}

const MODE_COPY = {
  manual: {
    heading: 'Evidence & compliance', Icon: ShieldCheck, action: 'Comply',
    intro: 'No system holds the answer to this control. Put on record what an assessor will ask to see — Comply unlocks once every item is complete.',
  },
  semi: {
    heading: 'Evidence & compliance', Icon: ShieldCheck, action: 'Comply',
    intro: 'A connector can measure part of this control; the policy and judgement around it cannot be measured. Put both on record — Comply unlocks once every item is complete.',
  },
  interim: {
    heading: 'Interim evidence', Icon: ShieldCheck, action: 'Comply with interim evidence',
    intro: 'No connector measures this control yet. Record the platform’s own export as interim evidence — it holds for at most 90 days, or until the platform is connected and measured.',
  },
  attestation: {
    heading: 'Reviewer attestation', Icon: ClipboardCheck, action: 'Record attestation',
    intro: 'The connector sets this control’s status. Record a reviewer confirming the measurement covers the full scope — this does not change the status.',
  },
}

// Date-only strings parse as UTC; read them as local dates so they never shift a day.
function formatDate(value) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return d.toLocaleDateString('en-GB')
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function SectionHead({ children, first }) {
  return (
    <p className="eyebrow" style={first
      ? { margin: '16px 0 10px' }
      : { margin: '18px 0 10px', paddingTop: 14, borderTop: '1px solid var(--border-3)' }}>
      {children}
    </p>
  )
}

export function EvidenceCompliancePanel({
  frameworkId, requirementId, mode = 'manual', def, statusRow, canManage, onComplied, measuredBlocker = null,
}) {
  const { organization } = useAuth()
  const { members } = usePeople()
  const { latest, loaded, migrated, uploadFile, signedUrl, comply, recordEvidence } = useComplianceEvidence(frameworkId, requirementId)
  const copy = MODE_COPY[mode] || MODE_COPY.manual

  // Keyed by mode too: an automated control's interim checklist and its attestation are different forms.
  const draftKey = organization?.id ? `risys:ecc-evidence-draft:${organization.id}:${requirementId}:${mode}` : null
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})
  const [seeded, setSeeded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recorded, setRecorded] = useState(false)

  // The last submission seeds the form only when it was made with this same checklist.
  const latestForMode = latest && (latest.answers?.__mode || 'manual') === mode ? latest : null

  // Seed once: an unsaved draft wins, otherwise the last submission, so re-complying starts from the record.
  useEffect(() => {
    if (seeded || !loaded || !draftKey) return
    let draft = null
    try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null') } catch { /* storage unavailable */ }
    const source = draft || latestForMode
    if (source) {
      const { __mode, ...rest } = source.answers || {}
      setAnswers(rest)
      setFiles(source.files || {})
    }
    setSeeded(true)
  }, [seeded, loaded, draftKey, latestForMode])

  useEffect(() => {
    if (!dirty || !draftKey) return
    try { localStorage.setItem(draftKey, JSON.stringify({ answers, files })) } catch { /* storage unavailable */ }
  }, [answers, files, dirty, draftKey])

  const result = useMemo(() => {
    const r = evaluateSubmission(def, answers, files)
    if (!measuredBlocker) return r
    return { ...r, blockers: [measuredBlocker, ...r.blockers], ready: false }
  }, [def, answers, files, measuredBlocker])

  const fields = def.fields.filter(f => isVisible(f, answers))
  const canEdit = canManage && migrated && !saving

  const setAnswer = (key, value) => { setDirty(true); setRecorded(false); setAnswers(a => ({ ...a, [key]: value })) }

  const addFiles = async (key, list) => {
    const picked = Array.from(list || [])
    if (!picked.length) return
    const tooBig = picked.find(f => f.size > MAX_BYTES)
    if (tooBig) { setError(`${tooBig.name} is larger than 25 MB.`); return }
    setError('')
    setUploading(key)
    try {
      const uploaded = []
      for (const f of picked) uploaded.push(await uploadFile(f))
      setDirty(true)
      setFiles(prev => ({ ...prev, [key]: [...(prev[key] || []), ...uploaded] }))
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(null)
    }
  }

  const removeFile = (key, path) => {
    setDirty(true)
    setFiles(prev => ({ ...prev, [key]: (prev[key] || []).filter(x => x.path !== path) }))
  }

  // Open the tab synchronously so the popup blocker allows it, then point it at the signed link.
  const openFile = async (path) => {
    const win = window.open('', '_blank')
    try {
      const url = await signedUrl(path)
      if (win) { win.opener = null; win.location.href = url }
    } catch (e) {
      win?.close()
      setError(e.message)
    }
  }

  const submit = async () => {
    if (!result.ready || !canEdit) return
    setSaving(true)
    setError('')
    try {
      const pruned = pruneSubmission(def, answers, files)
      const payload = { answers: { ...pruned.answers, __mode: mode }, files: pruned.files, nextReviewDate: pruned.answers.next_review }
      if (mode === 'attestation') {
        await recordEvidence(payload)
      } else {
        await comply({
          ...payload,
          summary: mode === 'interim'
            ? `Complied with interim evidence — ${result.total} checklist items on record.`
            : `Complied with evidence — ${result.total} checklist items on record.`,
        })
      }
      try { localStorage.removeItem(draftKey) } catch { /* storage unavailable */ }
      setDirty(false)
      setRecorded(true)
      onComplied?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const nameOf = uid => {
    if (!uid) return null
    const m = members.find(x => x.user_id === uid)
    return m?.full_name || m?.email || 'a team member'
  }

  const today = localISO()
  let banner = null
  if (mode === 'attestation') {
    if (latestForMode) {
      const overdue = latestForMode.next_review_date && String(latestForMode.next_review_date).slice(0, 10) < today
      banner = overdue
        ? { tone: 'medium', Icon: AlertTriangle, title: 'Attestation overdue',
            text: `The last attestation was due for review ${formatDate(latestForMode.next_review_date)}. The measured status is unaffected; record a fresh attestation.` }
        : { tone: 'info', Icon: ClipboardCheck, title: 'Attested',
            text: [
              `${formatDate(latestForMode.submitted_at)} by ${nameOf(latestForMode.answers?.reviewer) || nameOf(latestForMode.submitted_by)}`,
              latestForMode.next_review_date ? `next review ${formatDate(latestForMode.next_review_date)}` : null,
            ].filter(Boolean).join(' · ') }
    }
  } else {
    const evidenced = statusRow?.status === 'compliant' && !!statusRow?.evidence_id
    if (statusRow?.review_overdue) {
      banner = { tone: 'critical', Icon: AlertTriangle, title: 'Review overdue',
        text: `The next review was due ${formatDate(statusRow.review_due_at)}. This control counts as Partial until evidence is re-submitted.` }
    } else if (evidenced) {
      const byline = latest
        ? `Evidenced ${formatDate(latest.submitted_at)} by ${nameOf(latest.answers?.reviewer) || nameOf(latest.submitted_by)}`
        : 'Evidence on record'
      banner = { tone: 'low', Icon: ShieldCheck,
        title: latest?.answers?.__mode === 'interim' ? 'Compliant — interim evidence' : 'Compliant',
        text: [byline, statusRow.review_due_at ? `next review ${formatDate(statusRow.review_due_at)}` : null].filter(Boolean).join(' · ') }
    } else if (statusRow?.status === 'compliant') {
      banner = { tone: 'medium', Icon: AlertTriangle, title: 'Marked compliant without evidence',
        text: 'This status was set before evidence was recorded. Complete the checklist and comply to put the evidence on record.' }
    }
  }

  const pctDone = result.total ? Math.round((result.done / result.total) * 100) : 0
  const again = mode === 'attestation'
    ? !!latestForMode
    : (statusRow?.status === 'compliant' && !!statusRow?.evidence_id) || statusRow?.review_overdue
  const actionLabel = saving
    ? 'Recording…'
    : again ? (mode === 'attestation' ? 'Record a new attestation' : 'Re-comply with this evidence') : copy.action

  const renderInput = (f) => {
    const v = answers[f.key]
    switch (f.type) {
      case 'text':
        return <input className="risys-input" value={v || ''} disabled={!canEdit} onChange={e => setAnswer(f.key, e.target.value)} />
      case 'number':
        return (
          <input className="risys-input tnum" type="number" min={f.min} max={f.max} style={{ maxWidth: 160 }}
            value={v ?? ''} disabled={!canEdit} onChange={e => setAnswer(f.key, e.target.value)} />
        )
      case 'date':
        return (
          <div style={{ maxWidth: 220 }}>
            <DateField value={v || ''} disabled={!canEdit} onChange={e => setAnswer(f.key, e.target.value)} aria-label={f.label} />
          </div>
        )
      case 'select':
        return (
          <div style={{ maxWidth: 280 }}>
            <SelectField className="w-full" value={v || ''} disabled={!canEdit} onChange={e => setAnswer(f.key, e.target.value)}>
              <option value="">Select…</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectField>
          </div>
        )
      case 'member':
        return (
          <div style={{ maxWidth: 320 }}>
            <SelectField className="w-full" value={v || ''} disabled={!canEdit} onChange={e => setAnswer(f.key, e.target.value)}>
              <option value="">Select a member…</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id?.slice(0, 8)}</option>
              ))}
            </SelectField>
          </div>
        )
      case 'yesno':
        return (
          <div role="radiogroup" aria-label={f.label} style={{ display: 'inline-flex', gap: 6 }}>
            {['yes', 'no'].map(opt => {
              const on = v === opt
              return (
                <button key={opt} type="button" role="radio" aria-checked={on} disabled={!canEdit}
                  onClick={() => setAnswer(f.key, opt)}
                  style={{
                    padding: '5px 16px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: on ? 600 : 500,
                    cursor: canEdit ? 'pointer' : 'not-allowed',
                    color: on ? '#fff' : 'var(--text-2)',
                    background: on ? 'var(--crimson)' : 'var(--bg-2)',
                    border: `1px solid ${on ? 'var(--crimson)' : 'var(--border-2)'}`,
                  }}>
                  {opt === 'yes' ? 'Yes' : 'No'}
                </button>
              )
            })}
          </div>
        )
      case 'check':
        return (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: canEdit ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={v === true} disabled={!canEdit}
              onChange={e => setAnswer(f.key, e.target.checked)} style={{ accentColor: 'var(--crimson)', marginTop: 3 }} />
            <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)' }}>Confirmed</span>
          </label>
        )
      case 'checklist':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {f.items.map(item => (
              <label key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: canEdit ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={v?.[item.key] === true} disabled={!canEdit}
                  onChange={e => setAnswer(f.key, { ...(v || {}), [item.key]: e.target.checked })}
                  style={{ accentColor: 'var(--crimson)', marginTop: 3 }} />
                <span style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.5 }}>{item.label}</span>
              </label>
            ))}
          </div>
        )
      case 'multiselect':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {f.options.map(opt => {
              const list = Array.isArray(v) ? v : []
              const on = list.includes(opt)
              return (
                <button key={opt} type="button" aria-pressed={on} disabled={!canEdit}
                  onClick={() => setAnswer(f.key, on ? list.filter(x => x !== opt) : [...list, opt])}
                  style={{
                    padding: '4px 11px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: on ? 600 : 500,
                    cursor: canEdit ? 'pointer' : 'not-allowed',
                    color: on ? 'var(--crimson)' : 'var(--text-2)',
                    background: on ? 'var(--crimson-wash)' : 'var(--bg-2)',
                    border: `1px solid ${on ? 'var(--crimson)' : 'var(--border-2)'}`,
                  }}>
                  {opt}
                </button>
              )
            })}
          </div>
        )
      case 'file': {
        const list = files[f.key] || []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(m => (
              <div key={m.path} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', maxWidth: 520,
                borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface)',
              }}>
                <FileText size={13} style={{ color: 'var(--taupe)', flexShrink: 0 }} />
                <button type="button" onClick={() => openFile(m.path)} className="truncate" title="Open (signed link)"
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 'var(--t-sm)', color: 'var(--crimson)' }}>
                  {m.name}
                </button>
                <span className="tnum" style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', flexShrink: 0 }}>{formatSize(m.size)}</span>
                {canEdit && (
                  <button type="button" onClick={() => removeFile(f.key, m.path)} aria-label={`Remove ${m.name}`}
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <label className="btn-secondary" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content',
                fontSize: 12, cursor: uploading ? 'wait' : 'pointer', opacity: uploading && uploading !== f.key ? 0.6 : 1,
              }}>
                {uploading === f.key ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading === f.key ? 'Uploading…' : list.length ? 'Add another file' : 'Upload file'}
                <input type="file" multiple disabled={!!uploading} style={{ display: 'none' }}
                  onChange={e => { addFiles(f.key, e.target.files); e.target.value = '' }} />
              </label>
            )}
            {!canEdit && list.length === 0 && (
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>No file on record</span>
            )}
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <copy.Icon size={14} style={{ color: 'var(--crimson)' }} />
        <h2 style={{ fontSize: 'var(--t-section)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {copy.heading}
        </h2>
        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
          {result.done} of {result.total} complete
        </span>
      </div>

      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        padding: '18px 20px',
      }}>
        {banner && (
          <div style={{
            display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', marginBottom: 14,
            background: TONES[banner.tone].bg, border: `1px solid ${TONES[banner.tone].border}`,
          }}>
            <banner.Icon size={15} style={{ color: TONES[banner.tone].color, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: TONES[banner.tone].color, margin: 0 }}>{banner.title}</p>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', margin: '2px 0 0', lineHeight: 1.5 }}>{banner.text}</p>
            </div>
          </div>
        )}

        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 14px' }}>
          {copy.intro}
        </p>

        {!migrated && (
          <div style={{
            display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 'var(--r)', marginBottom: 14,
            background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)',
          }}>
            <Info size={14} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
              Evidence storage is not set up yet. Apply{' '}
              <span className="mono">supabase/migrations/004_compliance_evidence.sql</span> in the Supabase SQL editor.
            </p>
          </div>
        )}

        {!canManage && migrated && (
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '0 0 12px' }}>
            Only risk managers and admins can submit evidence for a control.
          </p>
        )}

        <div aria-hidden style={{ height: 5, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{
            width: `${pctDone}%`, height: '100%', borderRadius: 99,
            background: result.ready ? 'var(--low)' : 'var(--crimson)', transition: 'width 0.3s var(--ease)',
          }} />
        </div>

        {fields.map((f, idx) => {
          const done = f.optional ? null : isFilled(f, answers, files)
          return (
            <div key={f.key}>
              {f.section && <SectionHead first={idx === 0}>{f.section}</SectionHead>}
              <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 10, padding: '8px 0' }}>
                <span style={{ paddingTop: 1 }}>
                  {done === null
                    ? <Circle size={14} style={{ color: 'var(--border-2)' }} />
                    : done
                      ? <CheckCircle2 size={14} style={{ color: 'var(--low)' }} />
                      : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)', margin: '0 0 6px' }}>
                    {f.label}
                    {f.optional && <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> (optional)</span>}
                  </p>
                  {f.help && (
                    <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '-2px 0 8px', lineHeight: 1.5 }}>{f.help}</p>
                  )}
                  {renderInput(f)}
                </div>
              </div>
            </div>
          )
        })}

        {result.blockers.length > 0 && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 'var(--r)',
            background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)',
          }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--critical)', margin: '0 0 4px' }}>
              <AlertTriangle size={13} />
              {mode === 'attestation' ? 'This attestation cannot be recorded yet' : 'This control cannot be complied yet'}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.blockers.map(b => (
                <li key={b} style={{ fontSize: 'var(--t-meta)', color: 'var(--text-2)', lineHeight: 1.6 }}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--critical)', margin: '12px 0 0' }}>{error}</p>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-3)',
        }}>
          <p style={{ fontSize: 'var(--t-meta)', color: recorded ? 'var(--low)' : 'var(--text-3)', margin: 0 }}>
            {recorded
              ? (mode === 'attestation' ? 'Attestation recorded.' : 'Evidence recorded and the control marked compliant.')
              : result.ready
                ? 'Everything an assessor expects is on record.'
                : `${result.total - result.done} item${result.total - result.done === 1 ? '' : 's'} left${result.blockers.length ? ` · ${result.blockers.length} problem${result.blockers.length === 1 ? '' : 's'} to resolve` : ''}`}
            {dirty && ' · draft saved on this device'}
          </p>
          {canManage && (
            <button type="button" className="btn-primary" onClick={submit}
              disabled={!result.ready || !canEdit}
              title={result.ready ? copy.action : 'Complete every item first'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: result.ready && canEdit ? 1 : 0.55 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <copy.Icon size={13} />}
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
