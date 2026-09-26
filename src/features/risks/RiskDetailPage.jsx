import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Trash2, Plus, Shield, FileText, AlertTriangle,
  Activity, MessageSquare, Clock, Check, ExternalLink, Trash, Link,
  TrendingUp, TrendingDown, Minus, ChevronRight, Wrench, CalendarCheck,
  Image, ClipboardList, PenLine, FlaskConical, ScrollText, Award, BarChart3,
  ShieldAlert
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { usePeople } from '@/hooks/usePeople'
import { useRisks, useRiskControls, useRiskEvidence, useRiskKRIs, useRiskLossEvents, useRiskAuditLog, useRiskWorkflow, useRiskCollaborators } from '@/hooks/useRisks'
import { useComments } from '@/hooks/useComments'
import { useGateVerdict } from '@/hooks/useRiskGate'
import { useTreatmentOptions, useTreatmentPlans } from '@/hooks/useTreatment'
import { treatmentReadiness } from '@/lib/treatment'
import { coverageGaps } from '@/lib/gate'
import { WorkflowBar } from './WorkflowBar'
import { GatePanel, CoverageGapNotice } from './GatePanel'
import { ScoreHistoryTab } from './ScoreHistoryTab'
import { LinkedFindings } from './LinkedFindings'
import { TreatmentTab } from './TreatmentWorkspace'
import { ReviewsTab } from './ReviewsTab'
import { ControlTestsPanel } from './ControlTestsPanel'
import { ClausePickerField } from '../controls/FrameworkClausePicker'
import {
  getRiskLevel, getRiskStatus, getWorkflowState, getControlTestingStatus, getRAGStatus,
  LIKELIHOOD_LABELS, IMPACT_LABELS, EFFECTIVENESS_LABELS, CONTROL_TYPES, CONTROL_FREQUENCIES, EVIDENCE_TYPES,
  isReviewOverdue, COVERAGE_OPTIONS, REDUCES_OPTIONS, getCoverage
} from '@/lib/risks'
import { logAudit, AUDIT } from '@/lib/audit'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'
import { EvidenceFileLink } from '@/components/ui/EvidenceFileLink'
import { tx, appLocale } from '@/lib/i18n'

const EVIDENCE_ICONS = {
  Document: FileText, Screenshot: Image, Log: ClipboardList, Attestation: PenLine,
  'Test Result': FlaskConical, Policy: ScrollText, Certificate: Award, Report: BarChart3,
}

const TABS = [
  { id: 'overview',  label: tx('Overview'),    icon: Shield },
  { id: 'scoring',   label: tx('Scoring'),     icon: TrendingDown },
  { id: 'controls',  label: tx('Controls'),    icon: Check },
  { id: 'treatment', label: tx('Treatment'),   icon: Wrench },
  { id: 'evidence',  label: tx('Evidence'),    icon: FileText },
  { id: 'kris',      label: tx('KRIs'),        icon: Activity },
  { id: 'loss',      label: tx('Loss Events'), icon: AlertTriangle },
  { id: 'reviews',   label: tx('Reviews'),     icon: CalendarCheck },
  { id: 'comments',  label: tx('Discussion'),  icon: MessageSquare },
  { id: 'audit',     label: tx('History'),     icon: Clock },
]

export function RiskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const perms = usePermissions()
  const { members } = usePeople()
  const [risk, setRisk] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showAddCollab, setShowAddCollab] = useState(false)
  const { deleteRisk } = useRisks()
  const { collaborators, addCollaborator, removeCollaborator } = useRiskCollaborators(id)

  // Attach collaborator user-ids so permission checks (canWorkRisk) see them
  const riskWithCollabs = risk ? { ...risk, collaborator_ids: collaborators.map(c => c.user_id) } : risk

  // Read at page level so the gate verdict and the coverage callout are
  // available above the tabs, not just inside whichever tab is open.
  const { controls: linkedControls, mappings } = useRiskControls(id)
  const { kris } = useRiskKRIs(id)
  const { evidence: riskEvidence } = useRiskEvidence(id)
  const verdict = useGateVerdict({
    risk: riskWithCollabs, mappings, controls: linkedControls, kris, evidence: riskEvidence,
  })
  const gaps = coverageGaps(mappings, linkedControls)

  // Step 9 readiness is read at page level because it gates a workflow
  // button that sits above the tabs.
  const { options: treatmentOptions, refetch: refetchOptions } = useTreatmentOptions(id)
  const { plans: treatmentPlans, refetch: refetchPlans } = useTreatmentPlans(id)
  const readiness = treatmentReadiness({ options: treatmentOptions, plans: treatmentPlans })
  const refetchTreatment = () => { refetchOptions(); refetchPlans() }

  const reload = () =>
    supabase.from('risks').select('*').eq('id', id).single()
      .then(({ data }) => setRisk(data))

  useEffect(() => {
    if (!id || !organization?.id) return
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [id, organization?.id])

  const member = (uid) => {
    if (!uid) return null
    const m = members.find(m => m.user_id === uid)
    return m?.full_name || m?.email || uid.slice(0, 8) + '…'
  }

  const handleDelete = async () => {
    await deleteRisk(id)
    navigate('/app/risks')
  }

  if (loading) return (
    <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
      <Spinner />
    </div>
  )

  if (!risk) return (
    <div style={{ padding: '80px 28px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{tx('Risk not found')}</p>
      <button onClick={() => navigate('/app/risks')} style={{ color: 'var(--crimson)', fontSize: 12, marginTop: 8 }}>{tx('← Back to register')}</button>
    </div>
  )

  const iScore = risk.inherent_score || risk.risk_score || 0
  // Residual is scored only when both coordinates exist. The generated
  // residual_score column echoes the inherent score otherwise, which would
  // show an unassessed risk as if its controls had been judged worthless.
  const rScored = !!(risk.residual_likelihood && risk.residual_impact)
  const rScore = rScored ? risk.residual_score : null
  const iLevel = getRiskLevel(iScore)
  const rLevel = getRiskLevel(rScore)
  const reduction = iScore > 0 && rScored ? Math.round((1 - rScore / iScore) * 100) : 0
  const status   = getRiskStatus(risk.status)
  const wf       = getWorkflowState(risk.workflow_state)
  const DirIcon  = risk.risk_direction === 'Increasing' ? TrendingUp
                 : risk.risk_direction === 'Decreasing' ? TrendingDown : Minus
  const dirColor = risk.risk_direction === 'Increasing' ? '#8C1616'
                 : risk.risk_direction === 'Decreasing' ? '#2F6B3C' : 'var(--text-3)'

  return (
    <>

      {/* ── BREADCRUMB ── */}
      <div style={{ padding: '14px 28px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => navigate('/app/risks')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={13} className='rtl-flip' /> {tx('Risk Register')}</button>
        <ChevronRight size={11} style={{ color: 'var(--border-2)' }} className='rtl-flip' />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{risk.risk_id || id.slice(0, 8)}</span>
      </div>

      {/* ── HERO BAND ── */}
      <div style={{ margin: '12px 28px 0', borderRadius: 14, background: '#fff', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        {/* cherry identity rule */}
        <div style={{ position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, var(--crimson) 0%, var(--rose) 100%)' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, padding: '20px 24px 20px 26px' }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* tag row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {risk.risk_id && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--crimson)' }}>
                  {risk.risk_id}
                </span>
              )}
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
                {status.label}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: wf.bg, color: wf.color, border: `1px solid ${wf.border}` }}>
                {wf.label}
              </span>
              {risk.risk_direction && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                  <DirIcon size={11} /> {risk.risk_direction}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>
              {risk.title}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--rose)', marginBottom: risk.risk_statement ? 12 : 0 }}>
              {[risk.risk_type, risk.category, risk.subcategory].filter(Boolean).join(' · ')}
              {risk.business_unit ? ` — ${risk.business_unit}` : ''}
            </p>
            {risk.risk_statement && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', lineHeight: 1.5, maxWidth: 680, borderInlineStart: '2px solid var(--blush)', paddingInlineStart: 10 }}>
                "{risk.risk_statement}"
              </p>
            )}
          </div>

          {/* Right — score chips + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Inherent chip */}
              <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: 10, background: iLevel.bg, border: `1px solid ${iLevel.border}` }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{tx('Inherent')}</p>
                <p style={{ fontSize: 22, fontWeight: 400, color: iLevel.color, lineHeight: 1 }}>{iScore}</p>
                <p style={{ fontSize: 10, color: iLevel.color, marginTop: 2, fontWeight: 600 }}>{iLevel.label}</p>
              </div>

              <span style={{ color: 'var(--border-2)', fontSize: 16 }}>→</span>

              {/* Residual chip */}
              <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: 10, background: rLevel.bg, border: `1px solid ${rLevel.border}` }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{tx('Residual')}</p>
                <p style={{ fontSize: 22, fontWeight: 400, color: rLevel.color, lineHeight: 1 }}>{rScore ?? '—'}</p>
                <p style={{ fontSize: 10, color: rLevel.color, marginTop: 2, fontWeight: 600 }}>{rLevel.label}</p>
              </div>

              {reduction > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: '#ECF4EE', border: '1px solid #C8DECD', textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#2F6B3C' }}>↓{reduction}%</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{tx('reduced')}</p>
                </div>
              )}
            </div>

            {/* Action buttons — gated by role & ownership */}
            <div style={{ display: 'flex', gap: 8 }}>
              {perms.canEditRisk(riskWithCollabs) && (
                <button onClick={() => navigate(`/app/risks/${id}/assess`)}
                  title={tx(
                    'Walk the assessment: statement, inherent score, controls, residual score, then the gate'
                  )}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px', borderRadius: 7, background: 'var(--bg-2)', color: 'var(--crimson)', border: '1px solid var(--crimson)', cursor: 'pointer', fontWeight: 500 }}>
                  <ShieldAlert size={12} /> {tx('Run assessment')}</button>
              )}
              {perms.canEditRisk(riskWithCollabs) && (
                <button onClick={() => navigate(`/app/risks/${id}/edit`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px', borderRadius: 7, background: 'var(--crimson)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <Edit2 size={12} /> {tx('Edit')}</button>
              )}
              {perms.canDeleteRisk && (deleteConfirm ? (
                <>
                  <button onClick={handleDelete}
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 7, background: '#FBEAEA', color: '#8C1616', border: '1px solid #F0CECE', cursor: 'pointer' }}>{tx('Confirm Delete')}</button>
                  <button onClick={() => setDeleteConfirm(false)}
                    style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, background: '#fff', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer' }}>{tx('Cancel')}</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(true)} title={tx('Delete risk')}
                  style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 7, background: '#fff', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SOURCE FINDING BANNER ── */}
      {risk.source_connector && (
        <div style={{ margin: '8px 28px 0', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: '#fdf5f5', border: '1px solid #f0dada' }}>
          <ShieldAlert size={14} style={{ color: '#5D0F0F', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: '#5D0F0F', fontWeight: 600 }}>{tx('Originated from')} {risk.source_connector === 'entra' ? tx('Microsoft Entra ID') : risk.source_connector}
              {risk.source_finding ? ` — ${risk.source_finding}` : ''}
            </p>
            {risk.source_entity_name && (
              <p style={{ fontSize: 11, color: '#8a7070' }}>{tx('User:')} {risk.source_entity_name}</p>
            )}
          </div>
          {risk.source_connector === 'entra' && risk.source_entity_id && (
            <button
              onClick={() => navigate(`/app/findings/entra/users/${risk.source_entity_id}`)}
              style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#5D0F0F', border: '1px solid #f0dada', cursor: 'pointer', flexShrink: 0 }}>{tx('View user →')}</button>
          )}
        </div>
      )}

      {/* ── WORKFLOW ── */}
      <WorkflowBar risk={riskWithCollabs} member={member} onChanged={reload} perms={perms} treatmentReadiness={readiness} />

      {/* ── THE GATE ──
          Everything above this is measurement. This is the step that
          decides whether the register generates work. */}
      <GatePanel
        verdict={verdict}
        risk={risk}
        onOpenTreatment={() => setTab('treatment')}
        onOpenScoring={() => navigate(`/app/risks/${id}/assess`)}
      />

      <LinkedFindings riskId={id} member={member} />

      {isReviewOverdue(risk) && (
        <div style={{ margin: '10px 28px 0', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#FBEAEA', border: '1px solid #F0CECE' }}>
          <AlertTriangle size={13} style={{ color: '#8C1616', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#8C1616' }}>{tx('Periodic review overdue (was due')} {new Date(risk.review_date).toLocaleDateString(appLocale())}) —
                      </p>
          <button onClick={() => setTab('reviews')} style={{ fontSize: 12, color: '#8C1616', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>{tx('complete review')}</button>
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ margin: '0 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0, marginTop: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '10px 14px', fontSize: 12, fontWeight: 500,
              color: tab === t.id ? 'var(--crimson)' : 'var(--text-3)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--crimson)' : '2px solid transparent',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}>
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ padding: '20px 28px 40px' }}>
        {tab === 'overview'  && <OverviewTab  risk={risk} member={member} iScore={iScore}
          perms={perms} riskWithCollabs={riskWithCollabs} organization={organization} members={members}
          collaborators={collaborators} addCollaborator={addCollaborator} removeCollaborator={removeCollaborator}
          showAddCollab={showAddCollab} setShowAddCollab={setShowAddCollab}
          onAssess={perms.canEditRisk(riskWithCollabs) ? () => navigate(`/app/risks/${id}/assess`) : null} />}
        {tab === 'scoring'   && <ScoreHistoryTab risk={risk} memberName={member} />}
        {tab === 'controls'  && <ControlsTab  riskId={risk.id} canManage={perms.canManageRiskChildren(riskWithCollabs)} canTest={perms.canLogControlTest} gaps={gaps} />}
        {tab === 'treatment' && <TreatmentTab risk={riskWithCollabs} member={member} members={members} onRiskChanged={reload} perms={perms} verdict={verdict} onTreatmentChanged={refetchTreatment} />}
        {tab === 'evidence'  && <EvidenceTab  riskId={risk.id} canManage={perms.canManageRiskChildren(riskWithCollabs)} />}
        {tab === 'kris'      && <KRIsTab      riskId={risk.id} canManage={perms.canManageRiskChildren(riskWithCollabs)} />}
        {tab === 'loss'      && <LossTab      riskId={risk.id} canManage={perms.canManageRiskChildren(riskWithCollabs)} />}
        {tab === 'reviews'   && <ReviewsTab   risk={risk} member={member} onRiskChanged={reload} canReview={perms.canAddReview} />}
        {tab === 'comments'  && <DiscussionTab riskId={risk.id} />}
        {tab === 'audit'     && <AuditTab     riskId={risk.id} member={member} />}
      </div>

    </>
  )
}

/* ═══════════════════════════════════════════════════
   OVERVIEW
═══════════════════════════════════════════════════ */
function OverviewTab({ risk, member, iScore, perms, riskWithCollabs, organization, members,
  collaborators, addCollaborator, removeCollaborator, showAddCollab, setShowAddCollab, onAssess }) {
  const [collabError, setCollabError] = useState('')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
      {/* Main column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Cause → Event → Impact.
            Three parts, not one paragraph, because each is used for a
            different job: the cause is what treatment fixes, the event
            is what controls prevent, the impact is what gets scored.
            A risk where one of the three cannot be pointed at is a risk
            nobody can act on. */}
        {(risk.cause || risk.event || risk.impact_statement) ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <FieldLabel>{tx('Cause → Event → Impact')}</FieldLabel>
              {onAssess && (
                <button onClick={onAssess} className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}>{tx('Revise')}</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Cause', risk.cause, 'What is wrong today — this is what the mitigation fixes'],
                ['Event', risk.event, 'What happens as a result — this is what the control prevents'],
                ['Impact', risk.impact_statement, 'What it costs — this is what you score'],
              ].map(([label, value, hint], idx) => (
                <div key={label} style={{
                  display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12, padding: '10px 0',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-3)',
                }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--crimson)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {label}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                      {value || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{tx('Not stated —')} {hint.toLowerCase()}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : onAssess ? (
          <Card>
            <FieldLabel>{tx('Cause → Event → Impact')}</FieldLabel>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginTop: 6 }}>{tx(
              'This risk is still written as a single statement. Splitting it into cause, event and impact makes it testable — and makes it obvious whether the treatment plan is aimed at the right thing.'
            )}</p>
            <button onClick={onAssess} className="btn-secondary" style={{ fontSize: 12, marginTop: 10 }}>{tx('Run assessment')}</button>
          </Card>
        ) : null}

        {(risk.risk_drivers || risk.description) && (
          <Card>
            {risk.risk_drivers && (
              <div style={risk.description ? { marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' } : {}}>
                <FieldLabel>{tx('Risk Drivers & Root Causes')}</FieldLabel>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginTop: 4 }}>{risk.risk_drivers}</p>
              </div>
            )}
            {risk.description && (
              <div>
                <FieldLabel>{tx('Description')}</FieldLabel>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginTop: 4 }}>{risk.description}</p>
              </div>
            )}
          </Card>
        )}

        {risk.treatment_notes && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <FieldLabel>{tx('Treatment Plan')}</FieldLabel>
              {risk.treatment && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface)', color: 'var(--crimson)', fontWeight: 500, textTransform: 'capitalize' }}>
                  {risk.treatment}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{risk.treatment_notes}</p>
          </Card>
        )}

        <Card>
          <FieldLabel>{tx('Risk Assessment')}</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{tx('Inherent — before controls')}</p>
              <ScoreDim label={tx('Likelihood')} value={risk.inherent_likelihood || risk.likelihood} desc={LIKELIHOOD_LABELS[risk.inherent_likelihood || risk.likelihood]} />
              <ScoreDim label={tx('Impact')}     value={risk.inherent_impact     || risk.impact}     desc={IMPACT_LABELS[risk.inherent_impact     || risk.impact]}     />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('Inherent Score')}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: getRiskLevel(iScore).color }}>{iScore} — {getRiskLevel(iScore).label}</span>
              </div>
            </div>
            {risk.residual_likelihood ? (
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{tx('Residual — after controls')}</p>
                <ScoreDim label={tx('Likelihood')} value={risk.residual_likelihood} desc={LIKELIHOOD_LABELS[risk.residual_likelihood]} />
                <ScoreDim label={tx('Impact')}     value={risk.residual_impact}     desc={IMPACT_LABELS[risk.residual_impact]}          />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tx('Residual Score')}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: getRiskLevel(risk.residual_score).color }}>{risk.residual_score} — {getRiskLevel(risk.residual_score).label}</span>
                </div>
              </div>
            ) : (
              // Residual is an assessor's judgement, not a number the
              // system can derive on its own — so this prompts the act
              // rather than claiming controls will do it automatically.
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)', borderRadius: 8, padding: 16, gap: 8, textAlign: 'center',
              }}>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{tx('Residual risk has not been scored.')}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 220 }}>{tx(
                  'Until it is, the gate has nothing to judge and this risk carries its inherent score.'
                )}</p>
                {onAssess && (
                  <button className="btn-secondary" style={{ fontSize: 12, marginTop: 2 }} onClick={onAssess}>{tx('Run assessment')}</button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card>
          <FieldLabel>{tx('Ownership')}</FieldLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Risk Owner', risk.owner_id], ['Assigned To', risk.assigned_to], ['Reviewer', risk.reviewer_id], ['Approver', risk.approver_id]].map(([lbl, uid]) =>
              member(uid) ? (
                <div key={lbl}>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{lbl}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--crimson)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {member(uid).charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{member(uid)}</span>
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* Collaborators */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{tx('Collaborators (')}{collaborators.length}/10)</p>
              {perms.canEditRisk(riskWithCollabs) && collaborators.length < 10 && (
                <button onClick={() => setShowAddCollab(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--crimson)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Plus size={12} /> {tx('Add')}</button>
              )}
            </div>

            {showAddCollab && perms.canEditRisk(riskWithCollabs) && (
              <div style={{ marginBottom: 10 }}>
                <SelectField onChange={async (e) => {
                    if (!e.target.value) return
                    setCollabError('')
                    try { await addCollaborator(e.target.value, organization.id) }
                    catch (err) { setCollabError(err.message) }
                    e.target.value = ''; setShowAddCollab(false)
                  }}
                  defaultValue=""
                  className="risys-input" style={{ fontSize: 12, width: '100%' }}>
                  <option value="" disabled>{tx('Select a person…')}</option>
                  {members
                    .filter(m => m.user_id !== risk.owner_id
                      && m.user_id !== risk.assigned_to
                      && !collaborators.some(c => c.user_id === m.user_id))
                    .map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email} ({m.role})</option>)}
                </SelectField>
              </div>
            )}

            {collabError && <p className="field-error" role="alert" style={{ margin: '0 0 8px' }}>{collabError}</p>}
            {collaborators.length === 0 ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic' }}>{tx('None — owner works alone')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {collaborators.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#895353', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {(member(c.user_id) || '?').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{member(c.user_id)}</span>
                    {perms.canEditRisk(riskWithCollabs) && (
                      <button onClick={async () => { setCollabError(''); try { await removeCollaborator(c.id) } catch (err) { setCollabError(err.message) } }}
                        title={tx('Remove collaborator')}
                        style={{ padding: 3, borderRadius: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <FieldLabel>{tx('Schedule')}</FieldLabel>
          <div style={{ marginTop: 10 }}>
            <SideRow label={tx('Frequency')}   value={risk.review_frequency} />
            <SideRow label={tx('Next Review')} value={risk.review_date ? new Date(risk.review_date).toLocaleDateString(appLocale(), { day:'numeric', month:'short', year:'numeric' }) : null} />
            <SideRow label={tx('Created')}     value={new Date(risk.created_at).toLocaleDateString(appLocale(), { day:'numeric', month:'short', year:'numeric' })} />
          </div>
        </Card>

        <Card>
          <FieldLabel>{tx('Classification')}</FieldLabel>
          <div style={{ marginTop: 10 }}>
            <SideRow label={tx('Category')}      value={risk.category} />
            <SideRow label={tx('Subcategory')}   value={risk.subcategory} />
            <SideRow label={tx('Type')}          value={risk.risk_type} />
            <SideRow label={tx('Business Unit')} value={risk.business_unit} />
            <SideRow label={tx('Framework')}     value={risk.framework_ref} mono />
            <SideRow label={tx('Appetite')}      value={risk.risk_appetite} />
            <SideRow label={tx('Source')}        value={risk.source_connector === 'entra' ? 'Microsoft Entra ID' : risk.source_connector} />
            <SideRow label={tx('Finding')}       value={risk.source_finding} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function ScoreDim({ label, value, desc }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-3)' }}>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value}/5</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 2, background: 'var(--crimson)', width: `${((value-1)/4)*100}%` }} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{desc?.split('—')[0]?.trim()}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   CONTROLS
═══════════════════════════════════════════════════ */
function ControlsTab({ riskId, canManage, canTest, gaps = [] }) {
  const { controls, allControls, loading, createControl, updateControl, linkControl, updateMapping, unlinkControl, mappingFor, refetch: fetchControlsRefetch } = useRiskControls(riskId)
  const [showAdd, setShowAdd] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [editCtrl, setEditCtrl] = useState(null)
  const blank = { name:'', description:'', control_type:'Preventive', control_frequency:'Monthly', effectiveness:3, is_automated:false, framework_ref:'', notes:'' }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const unmapped = allControls.filter(c => !controls.find(x => x.id === c.id))
  const typeColor = { Preventive:'#1e40af', Detective:'#6b21a8', Corrective:'#9C6F0F', Compensating:'#2F6B3C' }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setSaveError('')
    try {
      editCtrl ? await updateControl(editCtrl.id, form) : await createControl(form)
      setShowAdd(false); setEditCtrl(null); setForm(blank)
    } catch(err) {
      setSaveError(err.message || 'Failed to save control')
    } finally { setSaving(false) }
  }

  if (loading) return <CenterSpin />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TabHeader title={`${controls.length} Controls`} sub={tx('Preventive, detective, and corrective controls linked to this risk')}>
        <div style={{ display: 'flex', gap: 8 }}>
          {unmapped.length > 0 && (
            <button onClick={() => setShowLink(!showLink)} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}>
              <Link size={11} /> {tx('Link Existing')}</button>
          )}
          {canManage && <button onClick={() => { setShowAdd(true); setEditCtrl(null); setForm(blank) }} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}>
            <Plus size={11} /> {tx('New Control')}</button>}
        </div>
      </TabHeader>

      {showLink && (
        <Card>
          <FieldLabel>{tx('Link an existing control')}</FieldLabel>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unmapped.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.control_id} · {c.control_type}</p>
                </div>
                <button onClick={() => { linkControl(c.id); setShowLink(false) }}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', cursor: 'pointer' }}>{tx('Link')}</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(showAdd || editCtrl) && (
        <Card>
          <FieldLabel>{editCtrl ? tx('Edit Control') : tx('New Control')}</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input value={form.name} onChange={set('name')} placeholder={tx('Control name *')} className="risys-input" />
            <textarea value={form.description} onChange={set('description')} placeholder={tx('What does this control do?')} rows={2} className="risys-input" style={{ resize: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <LS label={tx('Control Type')} value={form.control_type} onChange={set('control_type')} options={CONTROL_TYPES} />
              <LS label={tx('Frequency')} value={form.control_frequency} onChange={set('control_frequency')} options={CONTROL_FREQUENCIES} />
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Effectiveness:')} <strong style={{ color: 'var(--text)' }}>{form.effectiveness}/5</strong> — {EFFECTIVENESS_LABELS[form.effectiveness]?.split('—')[0]?.trim()}
              </p>
              <input type="range" min="1" max="5" value={form.effectiveness}
                onChange={e => setForm(f => ({ ...f, effectiveness: parseInt(e.target.value) }))} style={{ width: '100%' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_automated} onChange={e => setForm(f => ({ ...f, is_automated: e.target.checked }))} />{tx('Automated (system-enforced)')}</label>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Framework Reference')} <span style={{ fontWeight: 400 }}>{tx('(optional)')}</span></p>
              <ClausePickerField value={form.framework_ref} help={tx('Links this control to a specific framework clause')}
                onChange={(ref) => setForm(f => ({ ...f, framework_ref: ref }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setEditCtrl(null) }} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>{tx('Cancel')}</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary" style={{ flex: 1, fontSize: 13, opacity: !form.name.trim() ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} {tx('Save Control')}</button>
            </div>
          </div>
        </Card>
      )}

      {/* The callout the risk-to-control model exists to make possible. */}
      {gaps.length > 0 && <CoverageGapNotice gaps={gaps} />}

      {controls.length === 0 && !showAdd
        ? <EmptyBox icon={Check} title={tx('No controls linked')} sub={tx('Add preventive, detective, or corrective controls to reduce exposure')} />
        : controls.map(ctrl => {
          const mapping = mappingFor(ctrl.id) || {}
          const ts = getControlTestingStatus(ctrl.testing_status)
          const eff = ctrl.effectiveness || 1
          const ec = eff >= 4 ? '#2F6B3C' : eff >= 3 ? '#9C6F0F' : '#8C1616'
          const tc = typeColor[ctrl.control_type] || '#97817d'
          return (
            <Card key={ctrl.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>{ctrl.control_id}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{ctrl.name}</span>
                    {ctrl.is_automated && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#eff6ff', color: '#1e40af' }}>{tx('Auto')}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: ctrl.description ? 8 : 0 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: tc+'18', color: tc }}>{ctrl.control_type}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{ctrl.control_frequency}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${ts.border}`, background: ts.bg, color: ts.color }}>{ts.label}</span>
                    {ctrl.framework_ref && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--surface)', color: 'var(--rose)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)' }}>
                        {ctrl.framework_ref}
                      </span>
                    )}
                  </div>
                  {ctrl.description && <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{ctrl.description}</p>}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-3)' }}>{tx('Effectiveness')}</span>
                      <span style={{ color: ec, fontWeight: 600 }}>{eff}/5</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: ec, width: `${((eff-1)/4)*100}%` }} />
                    </div>
                  </div>
                  {/* Coverage of THIS risk.
                      Effectiveness above is a property of the control and
                      is the same everywhere it is used. Coverage is a
                      property of this link, and it is what decides whether
                      the control earns any credit here at all. */}
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 8,
                    background: mapping.coverage === 'none' ? 'var(--critical-bg)'
                      : mapping.coverage === 'partial' ? 'var(--medium-bg)' : 'var(--surface)',
                    border: `1px solid ${mapping.coverage === 'none' ? 'var(--critical-bd)'
                      : mapping.coverage === 'partial' ? 'var(--medium-bd)' : 'var(--border)'}`,
                  }}>
                    <p className="eyebrow" style={{ marginBottom: 7 }}>{tx('Coverage of this risk')}</p>
                    {canManage ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <SelectField size="sm" value={mapping.coverage || 'full'}
                            onChange={e => updateMapping(ctrl.id, { coverage: e.target.value })}>
                            {COVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </SelectField>
                          <SelectField size="sm" value={mapping.reduces || 'both'}
                            onChange={e => updateMapping(ctrl.id, { reduces: e.target.value })}>
                            {REDUCES_OPTIONS.map(o => <option key={o.value} value={o.value}>{tx('Reduces')} {o.label.toLowerCase()}</option>)}
                          </SelectField>
                        </div>
                        {(mapping.coverage === 'partial' || mapping.coverage === 'none') && (
                          <input className="risys-input" style={{ width: '100%', marginTop: 8, fontSize: 12 }}
                            defaultValue={mapping.coverage_note || ''}
                            onBlur={e => updateMapping(ctrl.id, { coverage_note: e.target.value })}
                            placeholder={tx('What does it exclude? e.g. SaaS apps only — excludes the VPN')} />
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {getCoverage(mapping.coverage).label}
                        {mapping.coverage_note ? ` — ${mapping.coverage_note}` : ''}
                      </p>
                    )}
                  </div>

                  <ControlTestsPanel control={ctrl} onTestLogged={fetchControlsRefetch} canTest={canTest} />
                </div>
                {canManage && <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { setEditCtrl(ctrl); setForm({ name:ctrl.name, description:ctrl.description||'', control_type:ctrl.control_type, control_frequency:ctrl.control_frequency, effectiveness:ctrl.effectiveness, is_automated:ctrl.is_automated, framework_ref:ctrl.framework_ref||'', notes:ctrl.notes||'' }); setShowAdd(false) }}
                    style={{ padding: '5px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                    onMouseOver={e => e.currentTarget.style.background='var(--surface)'}
                    onMouseOut={e => e.currentTarget.style.background='none'}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => unlinkControl(ctrl.id)}
                    style={{ padding: '5px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                    onMouseOver={e => e.currentTarget.style.background='#FBEAEA'}
                    onMouseOut={e => e.currentTarget.style.background='none'}>
                    <Trash size={13} />
                  </button>
                </div>}
              </div>
            </Card>
          )
        })
      }
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   EVIDENCE
═══════════════════════════════════════════════════ */
function EvidenceTab({ riskId, canManage }) {
  const { evidence, loading, addEvidence, deleteEvidence } = useRiskEvidence(riskId)
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title:'', description:'', evidence_type:'Document', evidence_period:'' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true); setSaveError('')
    try {
      await addEvidence({ ...form, collected_by: user?.id }, file)
      setShowAdd(false)
      setForm({ title:'', description:'', evidence_type:'Document', evidence_period:'' })
      setFile(null)
    } catch(err) {
      setSaveError(err.message || 'Failed to save evidence')
    } finally { setSaving(false) }
  }

  if (loading) return <CenterSpin />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TabHeader title={`${evidence.length} Evidence Items`} sub={tx('Audit-ready proof of controls')}>
        {canManage && <button onClick={() => setShowAdd(!showAdd)} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}>
          <Plus size={11} /> {tx('Add Evidence')}</button>}
      </TabHeader>

      {showAdd && (
        <Card>
          <FieldLabel>{tx('Add Evidence')}</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input value={form.title} onChange={set('title')} placeholder={tx('Title *')} className="risys-input" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <LS label={tx('Type')} value={form.evidence_type} onChange={set('evidence_type')} options={EVIDENCE_TYPES} />
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Period')}</p><input value={form.evidence_period} onChange={set('evidence_period')} placeholder="e.g. Q2 2025" className="risys-input" /></div>
            </div>
            <textarea value={form.description} onChange={set('description')} placeholder={tx('What does this prove?')} rows={2} className="risys-input" style={{ resize: 'none' }} />
            <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('File (optional)')}</p><input type="file" onChange={e => setFile(e.target.files[0])} style={{ fontSize: 12 }} /></div>
            {saveError && <p style={{ fontSize: 12, color: '#8C1616', padding: '6px 10px', background: '#FBEAEA', borderRadius: 6 }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setSaveError('') }} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>{tx('Cancel')}</button>
              <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary" style={{ flex: 1, fontSize: 13, opacity: !form.title.trim() ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} {tx('Save')}</button>
            </div>
          </div>
        </Card>
      )}

      {evidence.length === 0 && !showAdd
        ? <EmptyBox icon={FileText} title={tx('No evidence yet')} sub={tx('Upload documents, screenshots, and attestations')} />
        : (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {evidence.map((ev, i) => {
              const TypeIcon = EVIDENCE_ICONS[ev.evidence_type] || FileText
              const expiring = ev.expires_at && new Date(ev.expires_at) < new Date(Date.now() + 30 * 86400000)
              const expired = ev.expires_at && new Date(ev.expires_at) < new Date()
              return (
                <div key={ev.id} className="row-hover"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}>

                  {/* type chip */}
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TypeIcon size={16} strokeWidth={1.5} style={{ color: 'var(--rose)' }} />
                  </div>

                  {/* content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{ev.title}</span>
                      <span style={{ fontSize: 10, padding: '1.5px 7px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--rose)', fontWeight: 500 }}>{ev.evidence_type}</span>
                      {ev.evidence_period && (
                        <span style={{ fontSize: 10, padding: '1.5px 7px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-3)' }}>{ev.evidence_period}</span>
                      )}
                      {ev.is_approved && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1.5px 7px', borderRadius: 20, background: '#ECF4EE', color: '#2F6B3C', fontWeight: 500 }}>
                          <Check size={9} /> {tx('Approved')}</span>
                      )}
                      {expired ? (
                        <span style={{ fontSize: 10, padding: '1.5px 7px', borderRadius: 20, background: '#FBEAEA', color: '#8C1616', fontWeight: 500 }}>{tx('Expired')}</span>
                      ) : expiring ? (
                        <span style={{ fontSize: 10, padding: '1.5px 7px', borderRadius: 20, background: '#FAF3E2', color: '#9C6F0F', fontWeight: 500 }}>{tx('Expiring soon')}</span>
                      ) : null}
                    </div>
                    {ev.description && <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 3 }}>{ev.description}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                      {ev.file_path && (
                        <EvidenceFileLink evidence={ev}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--crimson)', textDecoration: 'none', padding: '3px 9px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <ExternalLink size={11} /> {ev.file_name || tx('View file')}
                        </EvidenceFileLink>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{tx('Collected')} {new Date(ev.collected_at).toLocaleDateString(appLocale())}</span>
                      {ev.expires_at && <span style={{ fontSize: 11, color: expired ? '#8C1616' : 'var(--text-3)' }}>{tx('Valid until')} {new Date(ev.expires_at).toLocaleDateString(appLocale())}</span>}
                    </div>
                  </div>

                  <button onClick={() => deleteEvidence(ev.id)} title={tx('Remove evidence')}
                    style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}>
                    <Trash size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   KRIs
═══════════════════════════════════════════════════ */
function KRIsTab({ riskId, canManage }) {
  const { kris, loading, createKRI, deleteKRI } = useRiskKRIs(riskId)
  const [showAdd, setShowAdd] = useState(false)
  const blank = { name:'', description:'', current_value:'', unit:'', green_threshold:'', amber_threshold:'', red_threshold:'', frequency:'Monthly', trend:'Stable' }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await createKRI({ ...form, current_value: form.current_value !== '' ? parseFloat(form.current_value) : null, green_threshold: form.green_threshold || null, amber_threshold: form.amber_threshold || null, red_threshold: form.red_threshold || null }); setShowAdd(false); setForm(blank) }
    finally { setSaving(false) }
  }

  if (loading) return <CenterSpin />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TabHeader title={`${kris.length} Key Risk Indicators`} sub={tx('Early warning signals — monitor before the risk materialises')}>
        {canManage && <button onClick={() => setShowAdd(!showAdd)} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}>
          <Plus size={11} /> {tx('Add KRI')}</button>}
      </TabHeader>

      {showAdd && (
        <Card>
          <FieldLabel>{tx('New KRI')}</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input value={form.name} onChange={set('name')} placeholder={tx('KRI name *')} className="risys-input" />
            <textarea value={form.description} onChange={set('description')} placeholder={tx('What does this metric measure?')} rows={2} className="risys-input" style={{ resize: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Current Value')}</p><input value={form.current_value} onChange={set('current_value')} placeholder="42" className="risys-input" /></div>
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Unit')}</p><input value={form.unit} onChange={set('unit')} placeholder={tx('%, count')} className="risys-input" /></div>
              <LS label={tx('Frequency')} value={form.frequency} onChange={set('frequency')} options={['Daily','Weekly','Monthly','Quarterly']} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)' }}>
              <div><p style={{ fontSize: 12, marginBottom: 4, color: '#2F6B3C', fontWeight: 500 }}>{tx('🟢 Green ≤')}</p><input value={form.green_threshold} onChange={set('green_threshold')} placeholder="5" className="risys-input" /></div>
              <div><p style={{ fontSize: 12, marginBottom: 4, color: '#9C6F0F', fontWeight: 500 }}>{tx('🟡 Amber ≤')}</p><input value={form.amber_threshold} onChange={set('amber_threshold')} placeholder="10" className="risys-input" /></div>
              <div><p style={{ fontSize: 12, marginBottom: 4, color: '#8C1616', fontWeight: 500 }}>{tx('🔴 Red >')}</p><input value={form.red_threshold} onChange={set('red_threshold')} placeholder="10" className="risys-input" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>{tx('Cancel')}</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary" style={{ flex: 1, fontSize: 13, opacity: !form.name.trim() ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} {tx('Save KRI')}</button>
            </div>
          </div>
        </Card>
      )}

      {kris.length === 0 && !showAdd
        ? <EmptyBox icon={Activity} title={tx('No KRIs yet')} sub={tx('Add metrics to continuously monitor this risk')} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {kris.map(kri => {
              const rag = getRAGStatus(kri.rag_status)
              const pct = kri.red_threshold && kri.current_value != null ? Math.min(100, (kri.current_value / kri.red_threshold) * 100) : null
              return (
                <Card key={kri.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: rag.color, flexShrink: 0 }} />
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{kri.name}</p>
                    </div>
                    <button onClick={() => deleteKRI(kri.id)} style={{ padding: 4, borderRadius: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Trash size={12} /></button>
                  </div>
                  {kri.current_value != null && (
                    <p style={{ fontSize: 28, fontWeight: 300, color: rag.color, lineHeight: 1, marginBottom: 4 }}>{kri.current_value}{kri.unit||''}</p>
                  )}
                  {pct !== null && (
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginBottom: 8 }}>
                      <div style={{ height: '100%', borderRadius: 3, background: rag.color, width: `${pct}%`, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginBottom: kri.description ? 8 : 0 }}>
                    {kri.green_threshold && <span style={{ fontSize: 11, color: '#2F6B3C' }}>🟢≤{kri.green_threshold}</span>}
                    {kri.amber_threshold && <span style={{ fontSize: 11, color: '#9C6F0F' }}>🟡≤{kri.amber_threshold}</span>}
                    {kri.red_threshold   && <span style={{ fontSize: 11, color: '#8C1616' }}>🔴&gt;{kri.red_threshold}</span>}
                  </div>
                  {kri.description && <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{kri.description}</p>}
                </Card>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   LOSS EVENTS
═══════════════════════════════════════════════════ */
function LossTab({ riskId, canManage }) {
  const { lossEvents, loading, createLossEvent } = useRiskLossEvents(riskId)
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const blank = { title:'', event_date:'', gross_loss:'', net_loss:'', currency:'USD', root_cause:'', root_cause_category:'Process' }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const total = lossEvents.reduce((s, e) => s + (e.net_loss || e.gross_loss || 0), 0)

  const save = async () => {
    if (!form.title.trim() || !form.event_date) return
    setSaving(true)
    try { await createLossEvent({ ...form, gross_loss: form.gross_loss ? parseFloat(form.gross_loss) : null, net_loss: form.net_loss ? parseFloat(form.net_loss) : null, reported_by: user?.id }); setShowAdd(false); setForm(blank) }
    finally { setSaving(false) }
  }

  if (loading) return <CenterSpin />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TabHeader title={`${lossEvents.length} Loss Events`} sub={total > 0 ? `Total recorded: $${total.toLocaleString(appLocale())}` : tx('Log actual incidents when this risk materialises')}>
        {canManage && <button onClick={() => setShowAdd(!showAdd)} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}>
          <Plus size={11} /> {tx('Log Event')}</button>}
      </TabHeader>

      {showAdd && (
        <Card>
          <FieldLabel>{tx('Log Loss Event')}</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input value={form.title} onChange={set('title')} placeholder={tx('Event title *')} className="risys-input" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Event Date *')}</p><input type="date" value={form.event_date} onChange={set('event_date')} className="risys-input" /></div>
              <LS label={tx('Root Cause')} value={form.root_cause_category} onChange={set('root_cause_category')} options={['People','Process','System','External']} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Gross Loss')}</p><input value={form.gross_loss} onChange={set('gross_loss')} placeholder="0.00" className="risys-input" /></div>
              <div><p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{tx('Net Loss')}</p><input value={form.net_loss} onChange={set('net_loss')} placeholder="0.00" className="risys-input" /></div>
              <LS label={tx('Currency')} value={form.currency} onChange={set('currency')} options={['USD','SAR','EUR','GBP','AED']} />
            </div>
            <textarea value={form.root_cause} onChange={set('root_cause')} placeholder={tx('Root cause analysis…')} rows={3} className="risys-input" style={{ resize: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>{tx('Cancel')}</button>
              <button onClick={save} disabled={saving || !form.title.trim() || !form.event_date} className="btn-primary" style={{ flex: 1, fontSize: 13, opacity: (!form.title.trim() || !form.event_date) ? 0.5 : 1 }}>
                {saving ? <Spinner size="sm" /> : null} {tx('Log')}</button>
            </div>
          </div>
        </Card>
      )}

      {lossEvents.length === 0 && !showAdd
        ? <EmptyBox icon={AlertTriangle} title={tx('No loss events')} sub={tx('Log actual incidents to build historical loss data')} />
        : lossEvents.map(ev => (
          <Card key={ev.id}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>{ev.event_id}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{ev.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(ev.event_date).toLocaleDateString(appLocale())}</span>
                  {ev.gross_loss && <span style={{ fontSize: 14, fontWeight: 700, color: '#8C1616' }}>{ev.currency} {ev.gross_loss.toLocaleString(appLocale())}</span>}
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface)', color: 'var(--text-3)' }}>{ev.root_cause_category}</span>
                </div>
                {ev.root_cause && <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginTop: 8 }}>{ev.root_cause}</p>}
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   DISCUSSION
═══════════════════════════════════════════════════ */
function DiscussionTab({ riskId }) {
  const { comments, loading, addComment } = useComments('risk', riskId)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try { await addComment(text); setText('') } finally { setSaving(false) }
  }
  if (loading) return <CenterSpin />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TabHeader title={tx('Discussion')} sub={tx('Comments and notes from the risk team')} />
      {comments.length === 0 && <EmptyBox icon={MessageSquare} title={tx('No comments yet')} sub={tx('Start a discussion about this risk')} />}
      {comments.map(c => (
        <Card key={c.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--crimson)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(c.author_id || 'U').slice(0, 1).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(c.created_at).toLocaleString(appLocale())}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{c.content}</p>
        </Card>
      ))}
      <Card>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={tx('Add a comment…')} rows={3}
          style={{ width: '100%', fontSize: 13, outline: 'none', resize: 'none', border: 'none', color: 'var(--text)', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={submit} disabled={saving || !text.trim()} className="btn-primary"
            style={{ fontSize: 12, padding: '6px 16px', opacity: !text.trim() ? 0.5 : 1 }}>
            {saving ? tx('Posting…') : tx('Post Comment')}
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   AUDIT TRAIL
═══════════════════════════════════════════════════ */
function AuditTab({ riskId, member }) {
  const { auditLog } = useRiskAuditLog(riskId)
  const [wfHistory, setWfHistory] = useState([])

  useEffect(() => {
    if (!riskId) return
    supabase.from('risk_workflow_history').select('*')
      .eq('risk_id', riskId).order('performed_at', { ascending: false })
      .then(({ data }) => setWfHistory(data || []))
  }, [riskId])

  // Merge field-level audit + workflow events into one timeline
  const timeline = [
    ...auditLog.map(e => ({ ...e, _kind: 'audit', _at: e.performed_at })),
    ...wfHistory.map(e => ({ ...e, _kind: 'workflow', _at: e.performed_at })),
  ].sort((a, b) => new Date(b._at) - new Date(a._at))

  const FIELD_LABELS = {
    inherent_likelihood: tx('Inherent likelihood'), inherent_impact: tx('Inherent impact'),
    residual_likelihood: tx('Residual likelihood'), residual_impact: tx('Residual impact'),
    workflow_state: tx('Workflow state'), risk_appetite: tx('Risk appetite'),
    risk_direction: tx('Risk direction'), review_frequency: tx('Review frequency'),
    review_date: tx('Review date'), business_unit: tx('Business unit'),
    owner_id: tx('Owner'), assigned_to: tx('Assigned To'), reviewer_id: tx('Reviewer'), approver_id: tx('Approver'),
    treatment_notes: tx('Treatment notes'), risk_statement: tx('Risk statement'), risk_drivers: tx('Risk drivers'),
  }
  const fieldLabel = f => FIELD_LABELS[f] || (f ? f.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '')
  const fmtVal = (field, v) => {
    if (v === null || v === undefined || v === '') return '—'
    if (['owner_id','assigned_to','reviewer_id','approver_id'].includes(field)) return member(v) || v.slice(0, 8)
    if (field === 'review_date') return new Date(v).toLocaleDateString(appLocale())
    return String(v).length > 60 ? String(v).slice(0, 60) + '…' : v
  }

  const WF_LABELS = { submitted: tx('Submitted for review'), approved: tx('Approved'), rejected: tx('Rejected — returned to draft'), closed: tx('Closed'), reopened: tx('Reopened') }
  const WF_COLORS = { submitted: '#1e40af', approved: '#2F6B3C', rejected: '#8C1616', closed: '#6b7280', reopened: '#9C6F0F' }

  // Activity actions written by the database when anything happens in the tabs
  const ACT = {
    control_linked:      { label: tx('Control linked'),        color: '#2F6B3C' },
    control_unlinked:    { label: tx('Control removed'),       color: '#8C1616' },
    control_updated:     { label: tx('Control updated'),       color: '#895353' },
    control_tested:      { label: tx('Control tested'),        color: '#1e40af' },
    evidence_added:      { label: tx('Evidence added'),        color: '#2F6B3C' },
    evidence_approved:   { label: tx('Evidence approved'),     color: '#2F6B3C' },
    evidence_removed:    { label: tx('Evidence removed'),      color: '#8C1616' },
    kri_added:           { label: tx('KRI added'),             color: '#2F6B3C' },
    kri_updated:         { label: tx('KRI reading updated'),   color: '#895353' },
    kri_removed:         { label: tx('KRI removed'),           color: '#8C1616' },
    loss_event_added:    { label: tx('Loss event recorded'),   color: '#8C1616' },
    loss_event_removed:  { label: tx('Loss event removed'),    color: '#97817d' },
    action_created:      { label: tx('Treatment action created'), color: '#2F6B3C' },
    action_updated:      { label: tx('Treatment action status'),  color: '#895353' },
    action_progress:     { label: tx('Progress update'),       color: '#1e40af' },
    action_removed:      { label: tx('Treatment action removed'), color: '#8C1616' },
    exception_requested: { label: tx('Exception requested'),   color: '#9C6F0F' },
    exception_approved:  { label: tx('Exception approved'),    color: '#2F6B3C' },
    exception_rejected:  { label: tx('Exception rejected'),    color: '#8C1616' },
    exception_expired:   { label: tx('Exception expired'),     color: '#9C6F0F' },
    exception_revoked:   { label: tx('Exception revoked'),     color: '#8C1616' },
    review_completed:    { label: tx('Periodic review completed'), color: '#2F6B3C' },
    comment_added:       { label: tx('Comment'),               color: '#895353' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TabHeader title={tx('History')} sub={tx(
        'Immutable record — every field change and workflow decision is logged automatically by the database'
      )} />
      {timeline.length === 0
        ? <EmptyBox icon={Clock} title={tx('No entries yet')} sub={tx('Actions on this risk appear here automatically')} />
        : (
          <Card>
            {timeline.map((e, i) => (
              <div key={`${e._kind}-${e.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: e._kind === 'workflow' ? (WF_COLORS[e.action] || 'var(--crimson)') : (ACT[e.action]?.color || 'var(--crimson)'), marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {e._kind === 'workflow' ? (
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                      <strong style={{ color: WF_COLORS[e.action] || 'var(--text)' }}>{WF_LABELS[e.action] || e.action}</strong>
                      {e.performed_by && <span style={{ color: 'var(--text-3)' }}> {tx('by')} {member(e.performed_by)}</span>}
                      {e.comment && <span style={{ color: 'var(--text-2)' }}> — "{e.comment}"</span>}
                    </p>
                  ) : e.action === 'field_changed' ? (
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                      <strong>{fieldLabel(e.field_name)}</strong> {tx('changed')}{e.performed_by && <span style={{ color: 'var(--text-3)' }}> {tx('by')} {member(e.performed_by)}</span>}
                      <span style={{ color: 'var(--text-3)' }}> ({fmtVal(e.field_name, e.old_value)} → <strong style={{ color: 'var(--text)' }}>{fmtVal(e.field_name, e.new_value)}</strong>)</span>
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                      <strong style={{ color: ACT[e.action]?.color || 'var(--text)' }}>
                        {ACT[e.action]?.label || e.action.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                      </strong>
                      {e.performed_by && <span style={{ color: 'var(--text-3)' }}> {tx('by')} {member(e.performed_by)}</span>}
                      {e.note ? <span style={{ color: 'var(--text-2)' }}> — {e.note}</span> : ''}
                      {e.old_value && e.new_value && <span style={{ color: 'var(--text-3)' }}> ({e.old_value} → <strong>{e.new_value}</strong>)</span>}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{new Date(e._at).toLocaleString(appLocale())}</span>
              </div>
            ))}
          </Card>
        )
      }
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   SHARED PRIMITIVES
═══════════════════════════════════════════════════ */
function Card({ children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
      {children}
    </div>
  )
}
function FieldLabel({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 0 }}>{children}</p>
}
function TabHeader({ title, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</p>
        {sub && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
}
function SideRow({ label, value, mono }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--surface)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontWeight: mono ? 500 : undefined }}>{value}</span>
    </div>
  )
}
function EmptyBox({ icon: Icon, title, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px dashed var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
      <Icon size={26} strokeWidth={1} style={{ color: 'var(--blush)', margin: '0 auto 10px' }} />
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</p>
    </div>
  )
}
function CenterSpin() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner /></div>
}
function LS({ label, value, onChange, options }) {
  return (
    <div style={{ minWidth: 0 }}>
      {label && <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{label}</p>}
      <SelectField className="w-full" value={value} onChange={onChange}>
        {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </SelectField>
    </div>
  )
}
