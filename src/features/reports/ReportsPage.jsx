import { useNavigate } from 'react-router-dom'
import { FileText, Landmark, ShieldCheck, ClipboardCheck, Cloud, Lock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useReports } from '@/hooks/useReports'
import { useAudits } from '@/hooks/useAudits'
import { REPORT_TYPES } from '@/lib/reports/theme'
import { ReportArchive } from './ReportArchive'
import { hasCccProfile, hasPdplProfile } from '@/hooks/useCompliance'
import { tx } from '@/lib/i18n'

/* ── Reports ──────────────────────────────────────────────────────────────────
 *
 * Board and regulator reporting. Each report is a PDF generated from the
 * organisation's records at that moment, filed in an archive that cannot be
 * edited or deleted, with the data it was built from and a SHA-256 of the
 * file — so "what did the board see in March?" always has an answer.
 *
 * One page per report (/app/reports/board, /ecc, /audit): what it is, who it
 * is for, Generate, and every copy generated so far. /app/reports is the whole
 * archive.
 * -------------------------------------------------------------------------- */

export const REPORT_PAGES = {
  board: { type: 'board_pack', icon: Landmark, blurb: tx(
    'Quarterly pack for the board or risk committee — what needs attention, risk before and after controls, accepted risks, ECC position, incidents and audit.'
  ) },
  ecc: { type: 'ecc_status', icon: ShieldCheck, blurb: tx(
    'Requirement-by-requirement NCA ECC-2:2024 status with measurements, controls, evidence and gaps — for a regulator, assessor or management.'
  ) },
  ccc: { type: 'ccc_status', icon: Cloud, blurb: tx(
    'Control-by-control NCA CCC-2:2024 status for the role and data level you set — measurements, controls, evidence and gaps — for a regulator, assessor or management.'
  ) },
  pdpl: { type: 'pdpl_status', icon: Lock, blurb: tx(
    'Article-by-article SDAIA PDPL status for your scope — what the Privacy registers and connected systems measure, controls, evidence and gaps — for the DPO, management or SDAIA.'
  ) },
  audit: { type: 'audit_report', icon: ClipboardCheck, blurb: tx(
    'The formal report of an audit engagement — opinion, findings with management responses, and the testing behind them.'
  ) },
}
export const slugForType = (type) => Object.keys(REPORT_PAGES).find((k) => REPORT_PAGES[k].type === type)

/* /app/reports/board · /ecc · /ccc · /pdpl · /audit — one report type. */
export function ReportTypePage({ slug }) {
  const { organization } = useAuth()
  const perms = usePermissions()
  const navigate = useNavigate()
  const { runs, loading } = useReports()
  const { engagements } = useAudits()
  const { type, icon: Icon, blurb } = REPORT_PAGES[slug]
  const def = REPORT_TYPES[type]
  const noEngagement = type === 'audit_report' && !engagements.length
  // CCC and PDPL reports need the framework in scope (Settings → Organization).
  const noScope = (type === 'ccc_status' && !hasCccProfile(organization)) || (type === 'pdpl_status' && !hasPdplProfile(organization))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={def.label} subtitle={organization?.name}
        actions={perms.canGenerateReports && (
          <button className="btn-primary" disabled={noEngagement || noScope}
            title={noEngagement ? tx('Create an audit engagement first') : noScope ? tx('Set the framework scope in Settings → Organization first') : undefined}
            onClick={() => navigate(`/app/reports/new?type=${type}`)}><FileText size={14} /> {tx('Generate')}</button>
        )} />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="section" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--crimson-wash)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={17} style={{ color: 'var(--crimson)' }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 'var(--t-body)', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{blurb}</p>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '6px 0 0' }}>
              {tx('For:')} {def.audience} · {def.classification}</p>
          </div>
        </div>

        <section className="section">
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Generated so far')}</h3>
          </div>
          <ReportArchive runs={runs.filter((r) => r.report_type === type)} loading={loading} canRecord={perms.canGenerateReports} showType={false}
            emptyText={perms.canGenerateReports ? tx('None yet. Generate the first one; it is filed here automatically.') : tx(
              'Reports generated by your risk, compliance or audit team will appear here.'
            )} />
        </section>
      </div>
    </div>
  )
}

/* /app/reports — every report ever generated. */
export function ReportsPage() {
  const { organization } = useAuth()
  const perms = usePermissions()
  const navigate = useNavigate()
  const { runs, loading } = useReports()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Report archive')} subtitle={organization?.name}
        actions={perms.canGenerateReports && (
          <button className="btn-primary" onClick={() => navigate('/app/reports/new')}><FileText size={14} /> {tx('Generate report')}</button>
        )} />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <section className="section">
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('Archive')}</h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)', margin: '3px 0 0' }}>{tx(
              'Every report ever generated, as it was generated. Reports cannot be edited or deleted; use Verify to confirm a file is unchanged.'
            )}</p>
          </div>
          <ReportArchive runs={runs} loading={loading} canRecord={perms.canGenerateReports}
            emptyText={perms.canGenerateReports ? tx('Generate a board pack or an ECC status report to start the archive.') : tx(
              'Reports generated by your risk, compliance or audit team will appear here.'
            )} />
        </section>
      </div>
    </div>
  )
}
