import { Link } from 'react-router-dom'
import { RefreshCw, Plus, AlertTriangle, CheckSquare2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { tx, appLocale } from '@/lib/i18n'
import { ROLE_SETS } from '@/lib/roles'
import { useDashboardData } from './useDashboardData'
import {
  KpiRow, CompliancePosture, EccDomains, NeedsAttention,
  RiskHeatMap, RiskBands, RiskAreas,
  IncidentsPanel, TasksPanel, ActivityPanel,
  AuditsPanel, PlatformsPanel, Highlight,
} from './panels'
import './dashboard.css'

/* ── Dashboard ────────────────────────────────────────────────────────────────
 *
 * Reads top to bottom as the questions a risk owner asks on a Monday:
 *
 *   1. Where do we stand?            KPI strip
 *   2. Are we compliant, and what    ECC posture · ECC by domain · needs attention
 *      needs me now?
 *   3. How much risk are we          heat map · bands before and after controls ·
 *      carrying, and where?           top risk areas
 *   4. What is moving?               incidents and SLA · upcoming work · activity
 *   5. Assurance and sources         audit engagements · connected platforms
 *
 * Every figure links to the page that owns it, and is computed the same way
 * that page computes it (see useDashboardData).
 * -------------------------------------------------------------------------- */

function greeting(d = new Date()) {
  const h = d.getHours()
  if (h < 12) return tx('Good morning')
  if (h < 17) return tx('Good afternoon')
  return tx('Good evening')
}

export function DashboardPage() {
  const { organization, user } = useAuth()
  const { loading, eccLoading, refreshing, refresh, updatedAt, model, ecc, reviews, matrix, perms } = useDashboardData()

  const name = user?.user_metadata?.full_name || ''
  const firstName = name.split(' ')[0]
  const today = new Date().toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const canReadFindings = ROLE_SETS.findingsReader.includes(perms.role)

  return (
    <div className="h-full flex flex-col">
      <Topbar title={tx('Dashboard')} subtitle={organization?.name} />

      <div className="flex-1 overflow-y-auto page-content db">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="db-hero">
          <div>
            <p className="db-hello">{firstName ? `${greeting()}, ${firstName}` : greeting()}</p>
            <h1 className="db-title">{tx('GRC overview')}</h1>
            <p className="db-meta">
              <span>{organization?.name}</span>
              <span className="db-meta-dot" />
              <span>{today}</span>
              {updatedAt && (
                <>
                  <span className="db-meta-dot" />
                  <span className="tnum">
                    {tx('Updated {{t}}', { t: updatedAt.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' }) })}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="db-actions">
            {!perms.isReadOnly && (
              <>
                <Link to="/app/tasks/new" className="db-btn"><CheckSquare2 size={14} /> {tx('New task')}</Link>
                <Link to="/app/incidents/new" className="db-btn"><AlertTriangle size={14} /> {tx('Raise incident')}</Link>
              </>
            )}
            {perms.canCreateRisk && (
              <Link to="/app/risks/new" className="db-btn db-btn--primary"><Plus size={14} /> {tx('New risk')}</Link>
            )}
            <button onClick={refresh} className="db-btn db-btn--icon" title={tx('Refresh')} aria-label={tx('Refresh')}>
              <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>

        {loading || !model ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            <div className="db-rise"><KpiRow ecc={ecc} model={model} /></div>

            <div className="db-grid db-rise" style={{ animationDelay: '60ms' }}>
              <CompliancePosture ecc={ecc} loading={eccLoading} />
              <EccDomains ecc={ecc} reviews={reviews} />
              <NeedsAttention model={model} reviews={reviews} />
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '120ms' }}>
              <RiskHeatMap risks={model.risks} matrix={matrix} />
              <RiskBands risks={model.risks} />
              <RiskAreas risks={model.risks} />
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '180ms' }}>
              <IncidentsPanel incidents={model.incidents} />
              <TasksPanel tasks={model.tasks} />
              {perms.canViewAudit
                ? <ActivityPanel log={model.log} />
                : <PlatformsPanel findings={model.findings} identity={model.identity} canManage={perms.canManageConnectors} />}
            </div>

            <div className="db-grid db-rise" style={{ animationDelay: '240ms' }}>
              <AuditsPanel audits={model.audits} canManage={perms.canManageAudits} wide={!perms.canViewAudit} />
              {perms.canViewAudit && (
                <PlatformsPanel findings={model.findings} identity={model.identity} canManage={perms.canManageConnectors} />
              )}
            </div>

            <div className="db-rise" style={{ animationDelay: '300ms' }}>
              <Highlight suggestions={model.suggestions} canReadFindings={canReadFindings} canReports={perms.canGenerateReports} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
