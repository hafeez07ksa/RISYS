import { useState, useMemo } from 'react'
import {
  ArrowLeft, ChevronRight, ChevronDown, ChevronUp,
  Search, Check, X, Plus, Link2, Trash2, SlidersHorizontal,
  ShieldCheck, AlertTriangle, Minus, Loader2, Zap, Layers, Contrast, FileText,
} from 'lucide-react'
import {
  FRAMEWORKS, STATUS_CONFIG, STATUS_OPTIONS,
  useFrameworkRequirements, useComplianceStatuses, useFrameworkMappings,
  useRequirementAutomation,
  computeEffectiveStatus, computeFrameworkScore, isSubControl,
  isAutomated, hasAutomatedResult, isOverridingEvidence,
  sortRequirements, compareRequirementIds,
} from '@/hooks/useCompliance'
import { usePermissions } from '@/hooks/usePermissions'
import { Spinner } from '@/components/ui/Spinner'
import { BackLink } from '@/components/ui/BackLink'
import { AUTOMATION_CLASSES, AUTOMATION_META, automationClassFor } from '@/data/eccAutomation'

const AUTOMATION_ICONS = { automated: Zap, semi_automated: Contrast, manual_evidence: FileText }

// ── Automation class chip ─────────────────────────────────────────────────────
function AutomationChip({ cls }) {
  const meta = AUTOMATION_META[cls]
  if (!meta) return null
  const Icon = AUTOMATION_ICONS[cls]
  return (
    <span title={`${meta.label} — ${meta.note}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
      fontFamily: 'var(--font-sans)', letterSpacing: 0,
      color: meta.tone, background: meta.bg, border: `1px solid ${meta.border}`,
    }}>
      <Icon size={9} /> {meta.short}
    </span>
  )
}

// ── Evidence-type filter ──────────────────────────────────────────────────────
// One segmented control rather than a dropdown: the three classes and their
// counts are the point, so they stay visible instead of hiding behind a click.
function EvidenceTypeFilter({ value, onChange, counts }) {
  const options = [
    { value: '', label: 'All controls', Icon: Layers, count: counts ? counts.all : '—', meta: null },
    ...AUTOMATION_CLASSES.map(c => ({
      value: c, label: AUTOMATION_META[c].label, Icon: AUTOMATION_ICONS[c], count: counts ? counts[c] : '—', meta: AUTOMATION_META[c],
    })),
  ]
  const active = value ? AUTOMATION_META[value] : null

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="eyebrow">Evidence type</span>
        <div role="radiogroup" aria-label="Filter by evidence type" style={{
          display: 'inline-flex', flexWrap: 'wrap', gap: 2, padding: 3,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        }}>
          {options.map(o => {
            const selected = value === o.value
            const tone = o.meta?.tone || 'var(--crimson)'
            return (
              <button key={o.value || 'all'} type="button" role="radio" aria-checked={selected}
                onClick={() => onChange(o.value)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 11px', borderRadius: 'var(--r)', cursor: 'pointer',
                  fontSize: 12, fontWeight: selected ? 600 : 500,
                  color: selected ? tone : 'var(--text-2)',
                  background: selected ? 'var(--bg-2)' : 'transparent',
                  border: `1px solid ${selected ? (o.meta?.border || 'var(--border-2)') : 'transparent'}`,
                  boxShadow: selected ? 'var(--e-1)' : 'none',
                  transition: 'background var(--dur-2) var(--ease), color var(--dur-2) var(--ease)',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--hover)' }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
              >
                <o.Icon size={12} style={{ color: o.meta ? o.meta.tone : 'var(--text-3)' }} />
                {o.label}
                <span className="tnum" style={{
                  fontSize: 10.5, fontWeight: 600, minWidth: 18, textAlign: 'center',
                  padding: '0 5px', borderRadius: 99,
                  color: selected ? tone : 'var(--text-3)',
                  background: selected ? (o.meta?.bg || 'var(--crimson-wash)') : 'var(--surface-2)',
                }}>{o.count}</span>
              </button>
            )
          })}
        </div>
      </div>
      {active && (
        <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', marginTop: 6 }}>
          {active.note} Subcontrols follow their main control.
        </p>
      )}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started
  const pad = size === 'sm' ? '2px 8px' : '4px 12px'
  const fs  = size === 'sm' ? 11 : 12
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: fs, padding: pad, borderRadius: 99, fontWeight: 600,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

// ── Status picker dropdown ────────────────────────────────────────────────────
function StatusPicker({ currentStatus, onSet, disabled, hideCompliant }) {
  // Manual-evidence controls reach Compliant only through the evidenced Comply flow.
  const options = hideCompliant ? STATUS_OPTIONS.filter(o => o.value !== 'compliant') : STATUS_OPTIONS
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const handle = async (value) => {
    setSaving(true)
    setOpen(false)
    try { await onSet(value) } finally { setSaving(false) }
  }

  if (disabled) return <StatusBadge status={currentStatus} />

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={saving}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {saving
          ? <Loader2 size={14} style={{ color: 'var(--text-3)', animation: 'spin 1s linear infinite' }} />
          : <StatusBadge status={currentStatus} />
        }
        {!saving && <ChevronDown size={11} style={{ color: 'var(--text-3)', marginLeft: 2 }} />}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(26,19,20,0.12)', minWidth: 180, overflow: 'hidden',
          }}>
            {options.map(opt => (
              <button key={opt.value} onClick={() => handle(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 12px', background: currentStatus === opt.value ? 'var(--surface)' : 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12,
                  color: opt.color, fontWeight: currentStatus === opt.value ? 600 : 400,
                }}
                onMouseEnter={e => { if (currentStatus !== opt.value) e.currentTarget.style.background = 'var(--surface)' }}
                onMouseLeave={e => { if (currentStatus !== opt.value) e.currentTarget.style.background = 'none' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.dot, flexShrink: 0 }} />
                {opt.label}
                {currentStatus === opt.value && <Check size={11} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Link control modal ────────────────────────────────────────────────────────
export function LinkControlModal({ open, requirementId, requirementText, controls, mappingsFor, onLink, onUnlink, onClose }) {
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(null)

  if (!open) return null

  const linked = mappingsFor(requirementId)
  const linkedIds = linked.map(m => m.control_id)
  const filtered = controls.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleLink = async (controlId) => {
    setSaving(controlId)
    try { await onLink(controlId, requirementId) } finally { setSaving(null) }
  }

  const handleUnlink = async (mappingId) => {
    setSaving(mappingId)
    try { await onUnlink(mappingId) } finally { setSaving(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(26,19,20,0.14)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Map Controls</h3>
            <button onClick={onClose} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>{requirementId}</strong> — {requirementText}
          </p>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your controls…"
              className="risys-input" style={{ paddingLeft: 30, fontSize: 12 }} autoFocus />
          </div>
        </div>

        {/* Currently linked */}
        {linked.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: '#fdf9f9' }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Mapped Controls</p>
            {linked.map(m => {
              const ctrl = controls.find(c => c.id === m.control_id)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <Check size={13} style={{ color: '#166534', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{ctrl?.name || m.control_id}</span>
                  <button onClick={() => handleUnlink(m.id)} disabled={saving === m.id}
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                    {saving === m.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* All controls list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {controls.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No active controls in your library yet.</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Add controls from the Controls page first.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No controls match your search.</p>
            </div>
          ) : (
            filtered.map(ctrl => {
              const isLinked = linkedIds.includes(ctrl.id)
              return (
                <div key={ctrl.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  borderBottom: '1px solid var(--surface)', background: isLinked ? '#f9fdfb' : '#fff',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{ctrl.name}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {ctrl.control_type && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ctrl.control_type}</span>}
                      {ctrl.testing_status && ctrl.testing_status !== 'Not Tested' && (
                        <span style={{ fontSize: 10, color: ctrl.testing_status === 'Pass' ? '#166534' : '#991b1b', fontWeight: 600 }}>
                          {ctrl.testing_status}
                        </span>
                      )}
                    </div>
                  </div>
                  {isLinked ? (
                    <span style={{ fontSize: 11, color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} /> Mapped
                    </span>
                  ) : (
                    <button onClick={() => handleLink(ctrl.id)} disabled={saving === ctrl.id} className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>
                      {saving === ctrl.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                      Map
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} className="btn-primary" style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Single requirement row ────────────────────────────────────────────────────
function RequirementRow({ req, fw, status, effectiveStatus, mappedControls, auto, canManage, onSetStatus, onOpenControl }) {
  const reqId = req.control_id || req.clause_id || req.requirement_id
  const text  = req.control_text || req.clause_text || req.requirement_text || ''
  const isSubCtrl = isSubControl(req)
  const automationClass = fw?.id === 'NCA ECC' ? automationClassFor(reqId) : null

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: isSubCtrl ? 'var(--surface)' : '#fff',
      // Rail marks the subcontrol as belonging to the control above it
      boxShadow: isSubCtrl ? 'inset 3px 0 0 var(--border-2)' : 'none',
    }}>
      <div
        onClick={() => onOpenControl(reqId)}
        title="Open control"
        style={{
          display: 'grid',
          gridTemplateColumns: isSubCtrl ? '28px 130px 1fr 160px 200px 80px' : '28px 130px 1fr 160px 200px 80px',
          alignItems: 'center',
          padding: '10px 16px',
          cursor: 'pointer',
          gap: 12,
        }}
        onMouseEnter={e => e.currentTarget.style.background = isSubCtrl ? '#f0ebe9' : '#faf3f1'}
        onMouseLeave={e => e.currentTarget.style.background = isSubCtrl ? 'var(--surface)' : '#fff'}
      >
        {/* Opens the control's own page */}
        <span style={{
          color: isSubCtrl ? 'var(--border-2)' : 'var(--text-3)',
          display: 'flex', alignItems: 'center',
        }}>
          <ChevronRight size={13} />
        </span>

        {/* ID, with the automation class beside main controls */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: isSubCtrl ? 11 : 12, fontWeight: isSubCtrl ? 400 : 600,
            color: isSubCtrl ? 'var(--text-3)' : 'var(--crimson)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
            paddingLeft: isSubCtrl ? 22 : 0,
          }}>
            {isSubCtrl ? String(reqId).replace(/-/g, '.') : reqId}
          </span>
          {!isSubCtrl && automationClass && <AutomationChip cls={automationClass} />}
        </span>

        {/* Text preview */}
        <span style={{
          fontSize: 12.5, color: isSubCtrl ? 'var(--text-3)' : 'var(--text-2)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontStyle: isSubCtrl ? 'italic' : 'normal',
        }}>
          {text}
        </span>

        {/* Mapped controls — automated signals take the slot when present */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAutomated(auto) && (
            <span
              title={`${auto.signal_count} signal${auto.signal_count === 1 ? '' : 's'}${hasAutomatedResult(auto) ? '' : ' — not yet measured'}`}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 3,
                color: hasAutomatedResult(auto) ? '#1e40af' : 'var(--text-3)',
                background: hasAutomatedResult(auto) ? '#eff6ff' : 'var(--surface-2)',
                border: `1px solid ${hasAutomatedResult(auto) ? '#bfdbfe' : 'var(--border)'}`,
              }}>
              <Zap size={9} /> {auto.signal_count} auto
            </span>
          )}
          {isOverridingEvidence(status?.status, auto) && (
            <span
              title={`Manual status differs from the measured result (${auto.automated_status})`}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 600,
                color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
              }}>
              override
            </span>
          )}
          {mappedControls.length === 0 && !isAutomated(auto) ? (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
          ) : (
            mappedControls.slice(0, 2).map(c => (
              <span key={c.id} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99,
                background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)',
                maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c.name}</span>
            ))
          )}
          {mappedControls.length > 2 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>+{mappedControls.length - 2}</span>
          )}
        </div>

        {/* Status */}
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StatusPicker
            currentStatus={effectiveStatus}
            onSet={(s) => onSetStatus(reqId, s)}
            disabled={!canManage}
            hideCompliant={automationClass === 'manual_evidence' && !isSubCtrl}
          />
          {status?.review_overdue && (
            <span title={`Evidence review was due ${status.review_due_at}`} style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap',
              color: 'var(--critical)', background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)',
            }}>
              Review overdue
            </span>
          )}
        </div>

        {/* Everything else — guidance, evidence, mapping, signal detail —
            lives on the control's own page, one click away. */}
        <span />
      </div>

    </div>
  )
}

// ── Domain/article group ──────────────────────────────────────────────────────
function DomainGroup({ domainId, domainName, requirements, fw, statuses, mappings, controls, automation = {}, canManage, onSetStatus, onOpenControl, domainLabel }) {
  const [open, setOpen] = useState(true)
  const scoreAll = fw?.scoreAllControls

  // For scoring the group header bar: use scoreable rows
  const scoreable = scoreAll ? requirements : requirements.filter(r => !isSubControl(r))
  const compliant = scoreable.filter(r => {
    const reqId = r.control_id || r.clause_id
    const mapped = controls.filter(c => mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id).includes(c.id))
    return computeEffectiveStatus(statuses[reqId]?.status, mapped, automation[reqId]) === 'compliant'
  }).length

  const pct = scoreable.length > 0 ? Math.round((compliant / scoreable.length) * 100) : 0

  // Keep status-picker menus free to extend below a row. Hidden overflow
  // clipped the menu as soon as its chevron was clicked.
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'visible', marginBottom: 10 }}>
      {/* Domain header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '12px 16px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
      >
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
               : <ChevronDown size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--crimson)', minWidth: 40, fontFamily: 'var(--font-mono)' }}>{domainId}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{domainName}</span>
          {domainLabel && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>— {domainLabel}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 8 }}>{scoreable.length} controls</span>
        {/* Mini score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 75 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444', borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 28 }}>{pct}%</span>
        </div>
      </button>

      {/* Requirements */}
      {open && (
        <div>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '28px 130px 1fr 160px 200px 80px',
            padding: '6px 16px', gap: 12, background: '#faf3f1',
            borderBottom: '1px solid var(--border)',
          }}>
            {['', 'ID', 'Requirement', 'Controls Mapped', 'Status', ''].map((h, i) => (
              <span key={i} className="eyebrow">{h}</span>
            ))}
          </div>
          {requirements.map(req => {
            const reqId = req.control_id || req.clause_id
            const mapped = controls.filter(c => mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id).includes(c.id))
            const auto      = automation[reqId]
            const effective = computeEffectiveStatus(statuses[reqId]?.status, mapped, auto)
            return (
              <RequirementRow
                key={reqId}
                req={req}
                fw={fw}
                status={statuses[reqId]}
                effectiveStatus={effective}
                mappedControls={mapped}
                auto={auto}
                canManage={canManage}
                onSetStatus={onSetStatus}
                onOpenControl={onOpenControl}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Framework detail page ─────────────────────────────────────────────────────
export function ComplianceFrameworkPage({ frameworkId, onBack, onOpenControl, evidenceFilter: evidenceProp, onEvidenceFilterChange }) {
  const fw = FRAMEWORKS.find(f => f.id === frameworkId)
  const perms = usePermissions()
  const canManage = perms.isManager || perms.isAdmin

  const { requirements, loading: reqLoading } = useFrameworkRequirements(frameworkId)
  const { statuses, loading: statusLoading, setStatus } = useComplianceStatuses(frameworkId)
  const { mappings, controls, loading: mapLoading, linkControl, unlinkControl, mappingsFor, controlsFor } = useFrameworkMappings(frameworkId)
  const { automation } = useRequirementAutomation(frameworkId)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Only ECC carries an automation class; local state covers rendering without a router.
  const hasClassification = fw?.id === 'NCA ECC'
  const [localEvidence, setLocalEvidence] = useState('')
  const rawEvidence = evidenceProp ?? localEvidence
  const evidenceFilter = hasClassification && AUTOMATION_CLASSES.includes(rawEvidence) ? rawEvidence : ''
  const setEvidenceFilter = onEvidenceFilterChange ?? setLocalEvidence

  const loading = reqLoading || statusLoading || mapLoading

  // Score
  const score = useMemo(() =>
    computeFrameworkScore(requirements, statuses, mappings, controls, fw, automation),
    [requirements, statuses, mappings, controls, fw, automation]
  )

  // Search and status first; the evidence tabs count from this set, so each shows what it would leave.
  const baseReqs = useMemo(() => {
    let reqs = requirements
    if (search) reqs = reqs.filter(r => {
      const text = r.control_text || r.clause_text || ''
      const id   = r.control_id   || r.clause_id   || ''
      return text.toLowerCase().includes(search.toLowerCase()) || id.toLowerCase().includes(search.toLowerCase())
    })
    if (statusFilter) {
      reqs = reqs.filter(r => {
        const reqId  = r.control_id || r.clause_id
        const mapped = controls.filter(c => mappings.filter(m => m.requirement_id === reqId).map(m => m.control_id).includes(c.id))
        return computeEffectiveStatus(statuses[reqId]?.status, mapped, automation[reqId]) === statusFilter
      })
    }
    return reqs
  }, [requirements, search, statusFilter, statuses, mappings, controls, automation])

  const evidenceCounts = useMemo(() => {
    const counts = { all: 0, automated: 0, semi_automated: 0, manual_evidence: 0 }
    if (!hasClassification) return counts
    for (const r of baseReqs) {
      if (isSubControl(r)) continue
      counts.all++
      const cls = automationClassFor(r.control_id)
      if (cls) counts[cls]++
    }
    return counts
  }, [baseReqs, hasClassification])

  // Group by domain, subdomain, or article depending on framework config
  const grouped = useMemo(() => {
    let reqs = baseReqs
    if (evidenceFilter) reqs = reqs.filter(r => automationClassFor(r.control_id) === evidenceFilter)

    const groups = {}
    for (const req of reqs) {
      let gId, gName
      if (fw?.groupBy === 'subdomain') {
        // SAMA CSF: group by subdomain (3.1.1, 3.1.2…), show domain as parent label
        gId   = req.subdomain_id   || req.domain_id   || '—'
        gName = req.subdomain_name || req.domain_name || '—'
      } else if (fw?.groupBy === 'article') {
        gId   = req.article_id    || '—'
        gName = req.article_title || '—'
      } else {
        gId   = req.domain_id   || '—'
        gName = req.domain_name || '—'
      }
      if (!groups[gId]) groups[gId] = { id: gId, name: gName, reqs: [], domainId: req.domain_id, domainName: req.domain_name }
      groups[gId].reqs.push(req)
    }

    // Document order within each group, and across the groups themselves.
    // Without this the rows arrive in primary-key order, which lists every
    // main control first and strands the subcontrols at the foot of the group.
    for (const g of Object.values(groups)) g.reqs = sortRequirements(g.reqs, fw)
    return Object.values(groups).sort((a, b) => compareRequirementIds(a.id, b.id))
  }, [baseReqs, evidenceFilter, fw])

  if (!fw) return null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Topbar */}
        {/* Not .page-header: that is a fixed 52px single-line bar, and this
            header carries a back link above a title. */}
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 20, padding: 'var(--s-5) var(--gutter) var(--s-4)',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <BackLink to={onBack} label="Compliance" style={{ marginBottom: 8 }} />
            <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {fw.label} — {fw.fullName}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fw.version}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, color: fw.color, background: fw.bg, border: `1px solid ${fw.color}22` }}>
              {fw.tag}
            </span>
          </div>
        </header>

        <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>

          {/* Score summary */}
          <div className="card mb-5" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>
            {/* Left: overall score */}
            <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <Spinner /> : (
                <>
                  <div style={{ position: 'relative' }}>
                    <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx={50} cy={50} r={42} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
                      <circle cx={50} cy={50} r={42} fill="none"
                        stroke={score.score >= 75 ? '#22c55e' : score.score >= 50 ? '#eab308' : score.score >= 25 ? '#f97316' : '#ef4444'}
                        strokeWidth={8}
                        strokeDasharray={`${(score.score / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.8s ease' }}
                      />
                      <text x={50} y={50} textAnchor="middle" dominantBaseline="middle"
                        style={{
                          fill: score.score >= 75 ? '#166534' : score.score >= 50 ? '#92400e' : '#991b1b',
                          fontSize: 22, fontWeight: 800,
                          transform: 'rotate(90deg)', transformOrigin: '50px 50px',
                        }}>
                        {score.score}%
                      </text>
                    </svg>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Compliance Score</p>
                </>
              )}
            </div>

            {/* Right: breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {[
                { label: 'Compliant',    value: score.compliant,    color: STATUS_CONFIG.compliant.color,      filter: 'compliant' },
                { label: 'Partial',      value: score.partial,       color: STATUS_CONFIG.partial.color,        filter: 'partial' },
                { label: 'Non-Compliant', value: score.notCompliant, color: STATUS_CONFIG.not_compliant.color,  filter: 'not_compliant' },
                { label: 'In Progress',  value: score.inProgress,    color: STATUS_CONFIG.in_progress.color,    filter: 'in_progress' },
                { label: 'Not Started',  value: score.notStarted,    color: 'var(--text-3)',                    filter: 'not_started' },
              ].map((s, i) => (
                <button key={s.label}
                  onClick={() => setStatusFilter(f => f === s.filter ? '' : s.filter)}
                  style={{
                    padding: '20px 12px', background: statusFilter === s.filter ? '#F6EBE8' : 'transparent',
                    border: 'none', borderRight: i < 4 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', textAlign: 'center', position: 'relative',
                  }}
                  onMouseEnter={e => { if (statusFilter !== s.filter) e.currentTarget.style.background = '#FAF3F1' }}
                  onMouseLeave={e => { e.currentTarget.style.background = statusFilter === s.filter ? '#F6EBE8' : 'transparent' }}
                >
                  {statusFilter === s.filter && <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#5D0F0F' }} />}
                  <p className="eyebrow mb-1">{s.label}</p>
                  <p className="tnum" style={{ fontSize: 28, fontWeight: 300, color: s.color }}>{loading ? '—' : s.value}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          {hasClassification && (
            <EvidenceTypeFilter value={evidenceFilter} onChange={setEvidenceFilter} counts={loading ? null : evidenceCounts} />
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${fw.label} requirements…`}
                className="risys-input" style={{ paddingLeft: 30 }} />
            </div>
            {(statusFilter || search || evidenceFilter) && (
              <button onClick={() => { setStatusFilter(''); setSearch(''); setEvidenceFilter('') }} className="btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <X size={13} /> Clear filters
              </button>
            )}
          </div>

          {/* Requirements grouped by domain */}
          {loading ? (
            <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          ) : grouped.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {evidenceFilter
                  ? `No ${AUTOMATION_META[evidenceFilter].label.toLowerCase()} controls match your search or status filter.`
                  : 'No requirements match your filters.'}
              </p>
            </div>
          ) : (
            grouped.map(g => (
              <DomainGroup
                key={g.id}
                domainId={g.id}
                domainName={g.name}
                domainLabel={fw?.groupBy === 'subdomain' && g.domainName !== g.name ? g.domainName : null}
                requirements={g.reqs}
                fw={fw}
                statuses={statuses}
                mappings={mappings}
                controls={controls}
                automation={automation}
                canManage={canManage}
                onSetStatus={setStatus}
                onOpenControl={onOpenControl}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}
