import { useState, useEffect, useMemo } from 'react'
import {
  Zap, ShieldCheck, BookOpen, FileText, Link2, Info, ChevronRight,
  CheckCircle2, XCircle, MinusCircle, HelpCircle, AlertTriangle, Clock,
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { SelectField } from '@/components/ui/Combobox'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { BackLink } from '@/components/ui/BackLink'
import {
  getFramework, STATUS_CONFIG, STATUS_OPTIONS,
  useFrameworkRequirements, useComplianceStatuses, useFrameworkMappings,
  useRequirementAutomation,
  computeEffectiveStatus, isSubControl,
  isAutomated, hasAutomatedResult, isOverridingEvidence,
} from '@/hooks/useCompliance'
import { LinkControlModal } from './ComplianceFrameworkPage'

/*
 * ── Control detail ──────────────────────────────────────────────────────────
 *
 * One page per requirement. It answers, in order:
 *
 *   What does the regulation actually say?     — verbatim clause + subcontrols
 *   What does it mean and how do I do it?      — NCA guidance, RISYS commentary
 *   Where do we stand and how do we know?      — signals, status, evidence
 *
 * The ordering is deliberate. An auditor reads the clause first and the
 * entity's position last, and every claim on the page can be traced to a
 * source: published text, named guidance with its version, a measured signal
 * with its timestamp, or a named person who set a status.
 *
 * ── On the layout ───────────────────────────────────────────────────────────
 *
 * The measure is capped at ~72 characters. This page is the one place in the
 * product people actually *read* rather than scan, and NCA's guidance bullets
 * run long — at full viewport width a single bullet was setting at 150+
 * characters, where the eye loses its place on the return sweep. Everything
 * else here follows from that: the column is narrow, so the page has to earn
 * its hierarchy through weight and spacing rather than through width.
 *
 * Sources are never merged. Each panel is badged with its publisher and
 * version, because "the regulator says" and "we think" are different claims
 * and an auditor is entitled to tell them apart at a glance.
 */

/* The page uses the full width: the rail sits hard against the right edge and
 * the reading column takes everything else. An earlier pass pinned the column
 * to 720px and left-aligned the pair, which put a dead band of empty canvas
 * down the right of a 1900px screen.
 *
 * Prose still needs a ceiling — past ~95 characters the eye loses the return
 * sweep — but the ceiling is now generous and only bites on very wide monitors,
 * where the alternative was that empty band. On a laptop nothing is capped. */
const MEASURE_MAX = 1040     // ~95ch at 14px; only engages above ~1500px viewport
const RAIL        = 340

const AUTOMATION_LABELS = {
  automated:       { label: 'Automated',       tone: 'var(--info)',    bg: 'var(--info-bg)',    border: 'var(--info-bd)',
                     note: 'Scoreable from connector data rather than asserted.' },
  semi_automated:  { label: 'Semi-automated',  tone: 'var(--medium)',  bg: 'var(--medium-bg)',  border: 'var(--medium-bd)',
                     note: 'Partly measurable; the rest needs documented evidence.' },
  manual_evidence: { label: 'Manual evidence', tone: 'var(--text-2)',  bg: 'var(--surface-2)',  border: 'var(--border)',
                     note: 'Cannot be measured from a system. Evidence must be uploaded and reviewed.' },
}

const SIGNAL_TONES = {
  pass:           { color: 'var(--low)',      bg: 'var(--low-bg)',      label: 'Pass',         Icon: CheckCircle2 },
  fail:           { color: 'var(--critical)', bg: 'var(--critical-bg)', label: 'Fail',         Icon: XCircle },
  partial:        { color: 'var(--medium)',   bg: 'var(--medium-bg)',   label: 'Partial',      Icon: AlertTriangle },
  not_applicable: { color: 'var(--text-3)',   bg: 'var(--surface)',     label: 'N/A',          Icon: MinusCircle },
  unknown:        { color: 'var(--text-3)',   bg: 'var(--surface)',     label: 'Not measured', Icon: HelpCircle },
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

/* A source panel. The heading sits outside the card so the card holds only
 * content — the old version put title, subtitle and badge inside the same
 * bordered box as the prose, which is what made the page read as one
 * undifferentiated slab. */
function Source({ icon: Icon, title, attribution, badge, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 14, marginBottom: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: 0,
          }}>
            {Icon && <Icon size={14} style={{ color: 'var(--rose)', flexShrink: 0 }} />}
            {title}
          </h2>
          {attribution && (
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '3px 0 0 21px' }}>
              {attribution}
            </p>
          )}
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)', padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

/* Subsection label inside a guidance panel. Previously three uppercase rose
 * headings stacked in every panel, which shouted louder than the clause they
 * were explaining. Now sentence case, quiet, with a rule to separate. */
function SubHead({ children }) {
  return (
    <p style={{
      fontSize: 'var(--t-meta)', fontWeight: 600, letterSpacing: '0.02em',
      color: 'var(--text-2)', margin: '0 0 9px',
    }}>{children}</p>
  )
}

function BulletList({ items }) {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingLeft: b.level * 20 }}>
          <span style={{
            width: b.level === 0 ? 4 : 3, height: b.level === 0 ? 4 : 3,
            borderRadius: '50%', flexShrink: 0, marginTop: b.level === 0 ? 8 : 8.5,
            background: b.level === 0 ? 'var(--rose)' : 'var(--taupe)',
          }} />
          <span style={{
            fontSize: b.level === 0 ? 13.5 : 13, lineHeight: 1.7,
            color: b.level === 0 ? 'var(--text-2)' : 'var(--text-3)',
          }}>{b.text}</span>
        </li>
      ))}
    </ul>
  )
}

/* A caveat is not body text and must not read as one. It carries an icon and a
 * tinted ground so it is legible as an editorial note about the source above
 * it — here, that NCA's guide predates ECC-2 and may lag the clause. */
function Caveat({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start',
      marginTop: 18, padding: '11px 13px',
      background: 'var(--surface)', borderRadius: 'var(--r)',
      border: '1px solid var(--border)',
    }}>
      <Info size={13} style={{ color: 'var(--taupe)', flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', lineHeight: 1.65, margin: 0 }}>
        {children}
      </p>
    </div>
  )
}

/* Right-rail card. Lighter chrome than the main column so the rail reads as
 * supporting apparatus rather than a second article. */
function RailCard({ icon: Icon, title, action, children, muted }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--border-3)',
        background: 'var(--bg-2)',
      }}>
        <h3 style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)', margin: 0,
        }}>
          {Icon && <Icon size={12.5} style={{ color: 'var(--taupe)' }} />}
          {title}
        </h3>
        {action}
      </div>
      <div style={{ padding: '12px 14px', background: muted ? 'var(--bg-2)' : undefined }}>
        {children}
      </div>
    </div>
  )
}

function RailEmpty({ children }) {
  return (
    <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
      {children}
    </p>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function ComplianceControlPage({ frameworkId, requirementId, onBack, onOpenControl }) {
  const fw = getFramework(frameworkId)
  const perms = usePermissions()
  const canManage = perms.isManager || perms.isAdmin

  const { requirements, loading: reqLoading } = useFrameworkRequirements(frameworkId)
  const { statuses, setStatus } = useComplianceStatuses(frameworkId)
  const { controls, mappingsFor, controlsFor, linkControl, unlinkControl } = useFrameworkMappings(frameworkId)
  const { automation } = useRequirementAutomation(frameworkId)

  const [guidance, setGuidance] = useState(null)
  const [guidanceError, setGuidanceError] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Bundled reference content — loaded on demand, never per tenant.
  useEffect(() => {
    let cancelled = false
    import('@/data/eccGuidance.json')
      .then(m => { if (!cancelled) setGuidance(m.default ?? m) })
      .catch(() => { if (!cancelled) setGuidanceError(true) })
    return () => { cancelled = true }
  }, [])

  const idKey   = fw?.requirementKey || 'control_id'
  const textKey = fw?.textKey || 'control_text'

  const req = useMemo(
    () => requirements.find(r => r[idKey] === requirementId),
    [requirements, requirementId, idKey]
  )

  const children = useMemo(
    () => requirements
      .filter(r => isSubControl(r) && String(r[idKey]).replace(/-[0-9]+$/, '') === requirementId)
      .sort((a, b) => String(a[idKey]).localeCompare(String(b[idKey]), undefined, { numeric: true })),
    [requirements, requirementId, idKey]
  )
  const parentId = isSubControl(req || {}) ? requirementId.replace(/-[0-9]+$/, '') : null

  const statusRow = statuses[requirementId]
  const auto      = automation[requirementId]
  const mapped    = controlsFor(requirementId)
  const effective = computeEffectiveStatus(statusRow?.status, mapped, auto)
  const conflict  = isOverridingEvidence(statusRow?.status, auto)

  useEffect(() => { setNotes(statusRow?.notes || '') }, [statusRow?.notes, requirementId])

  const node = guidance?.controls?.[requirementId]
  const automationClass = node?.automation_class
  const cls = automationClass ? AUTOMATION_LABELS[automationClass] : null

  const childrenWithGuidance = useMemo(
    () => children
      .map(c => c[idKey])
      .filter(sid => guidance?.controls?.[sid]?.nca_official),
    [children, guidance, idKey]
  )

  const saveNotes = async () => {
    setSavingNotes(true)
    try { await setStatus(requirementId, effective, notes) }
    finally { setSavingNotes(false) }
  }

  if (reqLoading) {
    return (
      <div style={{ padding: 'var(--s-6) var(--gutter)', maxWidth: MEASURE_MAX }}>
        <Skeleton width={150} height={10} />
        <div style={{ height: 12 }} />
        <Skeleton width={90} height={22} />
        <div style={{ height: 24 }} />
        <Panel><SkeletonText lines={4} /></Panel>
      </div>
    )
  }

  if (!fw || !req) {
    return (
      <div style={{ padding: 'var(--s-10) var(--gutter)' }}>
        <p style={{ fontSize: 'var(--t-body)', color: 'var(--text-3)' }}>
          No control {requirementId} in {frameworkId}.
        </p>
        <button onClick={onBack} className="btn-secondary" style={{ marginTop: 14 }}>
          Back to {fw?.label || 'framework'}
        </button>
      </div>
    )
  }

  const text = req[textKey] || ''
  const statusCfg = STATUS_CONFIG[effective] || {}

  return (
    <>
      {showMap && (
        <LinkControlModal
          open={showMap}
          requirementId={requirementId}
          requirementText={text.slice(0, 120)}
          controls={controls}
          mappingsFor={mappingsFor}
          onLink={linkControl}
          onUnlink={unlinkControl}
          onClose={() => setShowMap(false)}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────────
          Back steps up the tree by one level rather than running the browser
          history, so it is predictable: a subcontrol goes to its parent
          control, a control goes to the framework, and from there to
          Compliance. Chaining it walks you out of the hierarchy the same way
          every time, which history cannot promise — arriving at 2-2-3-1 from
          a search result would otherwise send "back" to the search.

          The domain path is an eyebrow so the reference number is the first
          thing read. */}
      <header style={{
        padding: 'var(--s-5) var(--gutter) var(--s-4)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
      }}>
        {/* Up one level: subcontrol → parent control → framework */}
        <BackLink
          to={() => (parentId ? onOpenControl(parentId) : onBack?.())}
          style={{ marginBottom: 10 }}
        >
          {parentId
            ? <>Back to <span className="mono">{parentId}</span></>
            : <>Back to {fw.label}</>}
        </BackLink>

        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              {req.domain_name}
              {req.subdomain_name ? ` · ${req.subdomain_id} ${req.subdomain_name}` : ''}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
              <h1 className="mono" style={{
                fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '0.01em',
              }}>
                {requirementId}
              </h1>

              {cls && (
                <span title={cls.note} style={{
                  fontSize: 'var(--t-micro)', padding: '2px 8px', borderRadius: 'var(--r-full)',
                  fontWeight: 600, color: cls.tone, background: cls.bg, border: `1px solid ${cls.border}`,
                }}>{cls.label}</span>
              )}

              {isSubControl(req) && (
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>
                  Subcontrol of <span className="mono">{parentId}</span>
                </span>
              )}
            </div>
          </div>

          <span style={{
            fontSize: 'var(--t-sm)', padding: '5px 12px', borderRadius: 'var(--r-full)',
            fontWeight: 600, flexShrink: 0,
            color: statusCfg.color, background: statusCfg.bg,
            border: `1px solid ${statusCfg.border}`,
          }}>
            {statusCfg.label}
          </span>
        </div>
      </header>

      <div style={{ padding: 'var(--s-6) var(--gutter) var(--s-12)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) ${RAIL}px`,
          gap: 36, alignItems: 'start', width: '100%',
        }}>

          {/* ── Main column ────────────────────────────────────────────── */}
          <div style={{ minWidth: 0, maxWidth: MEASURE_MAX }}>

            {/* The clause. Given the strongest treatment on the page — a
                crimson rule and larger measure — because everything below is
                commentary on it. */}
            <Source
              icon={FileText}
              title="Control"
              attribution={`${fw.fullName} ${fw.version} · reproduced without abridgement`}
            >
              <div style={{
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderLeft: '3px solid var(--crimson)',
                borderRadius: 'var(--r-md)', padding: '20px 22px',
              }}>
                <p style={{ fontSize: 15, lineHeight: 1.78, color: 'var(--text)', margin: 0 }}>
                  {text}
                </p>

                {children.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <SubHead>Subcontrols</SubHead>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {children.map(sub => {
                        const sid = sub[idKey]
                        const sAuto = automation[sid]
                        return (
                          <button
                            key={sid}
                            onClick={() => onOpenControl(sid)}
                            className="row-hover"
                            style={{
                              display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
                              background: 'none', border: 'none', width: '100%',
                              padding: '9px 10px', margin: '0 -10px', cursor: 'pointer',
                              borderRadius: 'var(--r)',
                            }}
                          >
                            <span className="mono" style={{
                              fontSize: 'var(--t-sm)', color: 'var(--crimson)', flexShrink: 0,
                              minWidth: 52, paddingTop: 1, fontWeight: 500,
                            }}>
                              {String(sid).replace(/-/g, '.')}
                            </span>
                            <span style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-2)', flex: 1 }}>
                              {sub[textKey]}
                            </span>
                            {isAutomated(sAuto) && (
                              <Zap size={11} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 4 }}
                                aria-label="Has a measured signal" />
                            )}
                            <ChevronRight size={13} style={{ color: 'var(--taupe)', flexShrink: 0, marginTop: 2 }} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Source>

            {/* Guidance, by source, attributed */}
            {guidanceError && (
              <Panel style={{ marginBottom: 30 }}>
                <RailEmpty>Reference guidance could not be loaded.</RailEmpty>
              </Panel>
            )}

            {!guidance && !guidanceError && (
              <Panel style={{ marginBottom: 30 }}><SkeletonText lines={5} /></Panel>
            )}

            {guidance && ['nca_official', 'risys'].map(srcKey => {
              const sections = node?.[srcKey]
              const src = guidance.sources[srcKey]
              if (!sections || !src) return null
              const regulatory = src.authority === 'regulatory'
              return (
                <Source
                  key={srcKey}
                  icon={srcKey === 'nca_official' ? BookOpen : Info}
                  title={src.label}
                  attribution={`${src.publisher} · ${src.version}`}
                  badge={
                    <span style={{
                      fontSize: 'var(--t-micro)', padding: '2px 8px', borderRadius: 'var(--r-full)',
                      fontWeight: 600, flexShrink: 0,
                      color: regulatory ? 'var(--info)' : 'var(--text-3)',
                      background: regulatory ? 'var(--info-bg)' : 'var(--surface-2)',
                      border: `1px solid ${regulatory ? 'var(--info-bd)' : 'var(--border)'}`,
                    }}>
                      {regulatory ? 'Regulatory' : 'Internal'}
                    </span>
                  }
                >
                  <Panel>
                    {sections.map((sec, i) => (
                      <div key={sec.key} style={{
                        marginTop: i === 0 ? 0 : 20,
                        paddingTop: i === 0 ? 0 : 18,
                        borderTop: i === 0 ? 'none' : '1px solid var(--border-3)',
                      }}>
                        <SubHead>{sec.label}</SubHead>
                        <BulletList items={sec.items} />
                      </div>
                    ))}
                    {src.caveat && <Caveat>{src.caveat}</Caveat>}
                  </Panel>
                </Source>
              )
            })}

            {guidance && !node?.nca_official && !node?.risys && childrenWithGuidance.length === 0 && (
              <Panel style={{ marginBottom: 30 }}>
                <RailEmpty>No implementation guidance loaded for this control.</RailEmpty>
              </Panel>
            )}

            {/* NCA writes its guidance against the subcontrols of a "minimum
                requirements" control, not the lead-in clause. Say so, rather
                than showing an empty panel that looks like a gap. */}
            {guidance && !node?.nca_official && childrenWithGuidance.length > 0 && (
              <Panel style={{ marginBottom: 30, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Info size={14} style={{ color: 'var(--taupe)', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 'var(--t-body)', color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
                    NCA publishes its guidance for this control against each of its
                    subcontrols rather than the lead-in clause. Open{' '}
                    {childrenWithGuidance.map((sid, i) => (
                      <span key={sid}>
                        {i > 0 && (i === childrenWithGuidance.length - 1 ? ' and ' : ', ')}
                        <button
                          onClick={() => onOpenControl(sid)}
                          className="mono"
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            color: 'var(--crimson)', fontSize: 'var(--t-sm)', fontWeight: 500,
                          }}>
                          {String(sid).replace(/-/g, '.')}
                        </button>
                      </span>
                    ))}
                    {' '}for it.
                  </p>
                </div>
              </Panel>
            )}
          </div>

          {/* ── Rail: the entity's position ─────────────────────────────── */}
          <aside style={{
            display: 'flex', flexDirection: 'column', gap: 14,
            position: 'sticky', top: 'var(--s-4)',
          }}>

            {/* Measured */}
            <RailCard icon={Zap} title="Measured">
              {!isAutomated(auto) && (
                <RailEmpty>
                  No connector signal covers this control, so its status is a human
                  judgement recorded below.
                </RailEmpty>
              )}

              {isAutomated(auto) && (
                <>
                  <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.55 }}>
                    Read from connector data, not asserted.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(auto.signals || []).map(sig => {
                      const tone = SIGNAL_TONES[sig.status] || SIGNAL_TONES.unknown
                      return (
                        <div key={sig.signal_key} style={{
                          display: 'flex', gap: 9, alignItems: 'flex-start',
                          padding: '8px 9px', margin: '0 -9px',
                          borderRadius: 'var(--r)', background: tone.bg,
                        }}>
                          <tone.Icon size={13} style={{ color: tone.color, flexShrink: 0, marginTop: 1 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.45, margin: 0 }}>
                              {sig.name}
                              {!sig.direct && (
                                <span title="Inherited from a subcontrol"
                                  style={{ color: 'var(--text-3)' }}> ↳</span>
                              )}
                            </p>
                            {sig.summary && (
                              <p className="tnum" style={{
                                fontSize: 'var(--t-meta)', color: 'var(--text-3)',
                                margin: '2px 0 0', lineHeight: 1.45,
                              }}>{sig.summary}</p>
                            )}
                            {!sig.summary && sig.status === 'unknown' && sig.requires_license && (
                              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '2px 0 0' }}>
                                Requires {String(sig.requires_license).replace(/_/g, ' ')}
                              </p>
                            )}
                          </div>
                          <span style={{
                            fontSize: 'var(--t-micro)', fontWeight: 600,
                            color: tone.color, flexShrink: 0, whiteSpace: 'nowrap',
                          }}>{tone.label}</span>
                        </div>
                      )
                    })}
                  </div>

                  {auto.last_computed_at && (
                    <p style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 'var(--t-micro)', color: 'var(--text-3)', margin: '10px 0 0',
                    }}>
                      <Clock size={10} />
                      Last measured {new Date(auto.last_computed_at).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </RailCard>

            {/* Assessed position */}
            <RailCard title="Assessed status">
              <SelectField
                value={statusRow?.status ?? ''}
                disabled={!canManage}
                onChange={e => setStatus(requirementId, e.target.value || null, notes)}
                className="w-full"
              >
                <option value="">
                  {hasAutomatedResult(auto) ? 'Use measured result' : 'Not set'}
                </option>
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>

              {conflict && (
                <div style={{
                  display: 'flex', gap: 8, padding: '10px 11px', borderRadius: 'var(--r)',
                  marginTop: 10, background: 'var(--medium-bg)', border: '1px solid var(--medium-bd)',
                }}>
                  <AlertTriangle size={13} style={{ color: 'var(--medium)', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 'var(--t-meta)', color: 'var(--medium)', lineHeight: 1.55, margin: 0 }}>
                    This differs from what the connectors measured
                    ({STATUS_CONFIG[auto.automated_status]?.label}). An assessor may
                    need to justify the difference.
                  </p>
                </div>
              )}

              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={!canManage}
                rows={4}
                placeholder="Assessor note — why this position, and what it rests on."
                className="risys-input"
                style={{ resize: 'vertical', lineHeight: 1.6, marginTop: 10 }}
              />

              {canManage && notes !== (statusRow?.notes || '') && (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="btn-primary" style={{ marginTop: 9, width: '100%' }}>
                  {savingNotes ? 'Saving…' : 'Save note'}
                </button>
              )}

              {statusRow?.updated_at && (
                <p style={{ fontSize: 'var(--t-micro)', color: 'var(--text-3)', margin: '10px 0 0' }}>
                  Set {new Date(statusRow.updated_at).toLocaleDateString()}
                </p>
              )}
            </RailCard>

            {/* Mapped controls */}
            <RailCard
              icon={ShieldCheck}
              title="Mapped controls"
              action={canManage && (
                <button onClick={() => setShowMap(true)} className="btn-ghost"
                  style={{ fontSize: 'var(--t-meta)', padding: '3px 7px', gap: 4 }}>
                  <Link2 size={11} /> Map
                </button>
              )}
            >
              {mapped.length === 0 ? (
                <RailEmpty>No internal control mapped to this requirement.</RailEmpty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {mapped.map(c => {
                    const pass = c.testing_status === 'Pass'
                    const fail = c.testing_status === 'Fail'
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 'var(--t-sm)', color: 'var(--text-2)', flex: 1, minWidth: 0,
                        }}>{c.name}</span>
                        <span style={{
                          fontSize: 'var(--t-micro)', padding: '1px 7px', borderRadius: 'var(--r-full)',
                          fontWeight: 600, flexShrink: 0,
                          color: pass ? 'var(--low)' : fail ? 'var(--critical)' : 'var(--text-3)',
                          background: pass ? 'var(--low-bg)' : fail ? 'var(--critical-bg)' : 'var(--surface)',
                          border: `1px solid ${pass ? 'var(--low-bd)' : fail ? 'var(--critical-bd)' : 'var(--border)'}`,
                        }}>{c.testing_status || 'Not tested'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </RailCard>
          </aside>
        </div>
      </div>
    </>
  )
}
