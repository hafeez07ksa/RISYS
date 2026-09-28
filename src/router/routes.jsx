import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { BUILD_MODE } from '@/lib/env'
import { consoleRoutes } from './consoleRoutes'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireRole } from '@/layouts/RequireRole'
import { ROLE_SETS } from '@/lib/roles'
import { LoginPage } from '@/features/auth/LoginPage'
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage'
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { IncidentsPage } from '@/features/incidents/IncidentsPage'
import { IncidentDetailPage } from '@/features/incidents/IncidentDetailPage'
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage'
import { FindingsPage } from '@/features/findings/FindingsPage'
import { FindingsPlatformPage } from '@/features/findings/FindingsPlatformPage'
import { RiskRegisterPage } from '@/features/risks/RiskRegisterPage'
import { RiskDetailPage } from '@/features/risks/RiskDetailPage'
import { TolerancePage } from '@/features/risks/TolerancePage'
import { RiskFormPage } from '@/features/risks/RiskFormPage'
import { TriagePage } from '@/features/risks/TriagePage'
import { AssessmentPage } from '@/features/risks/AssessmentFlow'
import { TasksPage } from '@/features/tasks/TasksPage'
import { PeoplePage } from '@/features/people/PeoplePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { JiraManagePage } from '@/features/settings/jira/JiraManagePage'
import { EntraManagePage } from '@/features/settings/entra/EntraManagePage'
import { EntraUserPage } from '@/features/settings/entra/EntraUserPage'
import { M365ManagePage } from '@/features/settings/m365/M365ManagePage'
import { DefenderManagePage } from '@/features/settings/defender/DefenderManagePage'
import { SharePointManagePage } from '@/features/settings/sharepoint/SharePointManagePage'
import { AuditLogPage } from '@/features/audit/AuditLogPage'
import { ControlsPage } from '@/features/controls/ControlsPage'
import { ControlDetailPage } from '@/features/controls/ControlDetailPage'
import { CompliancePage } from '@/features/compliance/CompliancePage'
import { ComplianceFrameworkRoute, ComplianceControlRoute } from '@/features/compliance/ComplianceRoutes'
import { FrameworksPage } from '@/features/frameworks/FrameworksPage'
import { AuditsPage } from '@/features/audits/AuditsPage'
import { AuditDetailPage } from '@/features/audits/AuditDetailPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { CreateTaskPage } from '@/features/tasks/CreateTaskPage'
import { RaiseIncidentPage } from '@/features/incidents/RaiseIncidentPage'
import { EscalateIncidentPage } from '@/features/incidents/EscalateIncidentPage'
import { ControlFormPage } from '@/features/controls/ControlFormPage'
import { InvitePage } from '@/features/people/InvitePage'
import { GenerateReportPage } from '@/features/reports/GenerateReportPage'
import { RecordPresentationPage } from '@/features/reports/RecordPresentationPage'
import { EngagementFormPage } from '@/features/audits/EngagementFormPage'
import { OpinionPage } from '@/features/audits/OpinionPage'
import { ScopeItemFormPage } from '@/features/audits/ScopeItemFormPage'
import { ScopeTestPage } from '@/features/audits/ScopeTestPage'
import { RequestFormPage } from '@/features/audits/RequestFormPage'
import { RequestPage } from '@/features/audits/RequestPage'
import { FindingFormPage } from '@/features/audits/FindingFormPage'
import { FindingPage } from '@/features/audits/FindingPage'

/* The breadcrumb links every segment of the URL, so /app/audits/:id/findings
 * has to go somewhere: to the engagement, on that tab. */
function EngagementTab({ tab }) {
  const { id } = useParams()
  return <Navigate to={`/app/audits/${id}?tab=${tab}`} replace />
}

/* Which half of the product this build serves. Vite replaces the env var with
 * a literal at build time, so the unused branch — and everything it imports —
 * is removed from the bundle entirely. */
const WITH_APP = BUILD_MODE === 'app' || BUILD_MODE === 'all'
const WITH_CONSOLE = BUILD_MODE === 'console' || BUILD_MODE === 'all'

/* On the console host, "/" goes to the console; on the tenant host, to the app. */
const ROOT = WITH_APP
  ? { path: '/', element: <Navigate to="/app/dashboard" replace /> }
  : { path: '/', element: <Navigate to="/platform" replace /> }

const appRoutes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <Navigate to="/login" replace /> },
  { path: '/onboarding', element: <Navigate to="/login" replace /> },
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },

      // ── Available to all authenticated members ──────────────────
      { path: 'dashboard',    element: <DashboardPage /> },
      { path: 'incidents',      element: <IncidentsPage /> },
      { path: 'incidents/new',  element: <RaiseIncidentPage /> },
      { path: 'incidents/:id',  element: <IncidentDetailPage /> },
      { path: 'incidents/:id/escalate', element: <EscalateIncidentPage /> },
      { path: 'risks',        element: <RiskRegisterPage /> },
      // Declared before ':id' so the literal segment is not swallowed by the param.
      { path: 'risks/tolerances', element: (
        <RequireRole roles={ROLE_SETS.riskManager}>
          <TolerancePage />
        </RequireRole>
      ) },
      // Literal segments come before ':id' so they are not swallowed by the param.
      { path: 'risks/triage',     element: <RequireRole roles={ROLE_SETS.findingsReader}><TriagePage /></RequireRole> },
      { path: 'risks/new',        element: <RiskFormPage /> },
      { path: 'risks/:id',        element: <RiskDetailPage /> },
      { path: 'risks/:id/edit',   element: <RiskFormPage /> },
      { path: 'risks/:id/assess', element: <AssessmentPage /> },
      { path: 'controls',     element: <ControlsPage /> },
      { path: 'controls/new', element: <ControlFormPage /> },
      { path: 'controls/:id', element: <ControlDetailPage /> },
      { path: 'controls/:id/edit', element: <ControlFormPage /> },
      { path: 'compliance',   element: <CompliancePage /> },
      // Framework and control are addressable so an assessment can be linked to
      { path: 'compliance/:frameworkId',                 element: <ComplianceFrameworkRoute /> },
      { path: 'compliance/:frameworkId/:requirementId',  element: <ComplianceControlRoute /> },
      { path: 'frameworks',   element: <FrameworksPage /> },
      { path: 'tasks',        element: <TasksPage /> },
      { path: 'tasks/new',   element: <CreateTaskPage /> },
      { path: 'tasks/:id',   element: <TaskDetailPage /> },
      { path: 'audit',        element: <RequireRole roles={ROLE_SETS.auditReader}><AuditLogPage /></RequireRole> },
      // Audit engagements are visible to every member: the people audited are
      // the ones who answer evidence requests and respond to findings. Who may
      // change what is enforced per action (and in RLS), not by the route.
      //
      // Every create/edit/record step is its own page (no dialogs), so a
      // reload, the back button or a link in a notification lands on it.
      { path: 'audits',       element: <AuditsPage /> },
      { path: 'audits/new',   element: <EngagementFormPage /> },
      { path: 'audits/:id',   element: <AuditDetailPage /> },
      { path: 'audits/:id/edit',     element: <EngagementFormPage /> },
      { path: 'audits/:id/opinion',  element: <OpinionPage /> },
      { path: 'audits/:id/report',   element: <GenerateReportPage /> },
      { path: 'audits/:id/scope',                 element: <EngagementTab tab="scope" /> },
      { path: 'audits/:id/scope/new',             element: <ScopeItemFormPage /> },
      { path: 'audits/:id/scope/:itemId',         element: <ScopeTestPage /> },
      { path: 'audits/:id/requests',              element: <EngagementTab tab="requests" /> },
      { path: 'audits/:id/requests/new',          element: <RequestFormPage /> },
      { path: 'audits/:id/requests/:requestId',   element: <RequestPage /> },
      { path: 'audits/:id/findings',              element: <EngagementTab tab="findings" /> },
      { path: 'audits/:id/findings/new',          element: <FindingFormPage /> },
      { path: 'audits/:id/findings/:findingId',   element: <FindingPage /> },
      { path: 'audits/:id/findings/:findingId/edit', element: <FindingFormPage /> },
      { path: 'reports',      element: <ReportsPage /> },
      { path: 'reports/new',  element: <GenerateReportPage /> },
      { path: 'reports/:runId', element: <Navigate to="/app/reports" replace /> },
      { path: 'reports/:runId/record', element: <RecordPresentationPage /> },

      // ── Admin only ──────────────────────────────────────────────

      // Findings hierarchy:
      //   /app/findings                            → platform cards
      //   /app/findings/:connectorId               → users list with finding badges
      //   /app/findings/:connectorId/users/:id     → user profile (full page)
      {
        path: 'findings',
        element: <RequireRole roles={ROLE_SETS.findingsReader}><FindingsPage /></RequireRole>,
      },
      {
        path: 'findings/:connectorId',
        element: <RequireRole roles={ROLE_SETS.findingsReader}><FindingsPlatformPage /></RequireRole>,
      },
      {
        path: 'findings/entra/users/:entraId',
        element: <RequireRole roles={ROLE_SETS.findingsReader}><EntraUserPage /></RequireRole>,
      },

      // People
      {
        path: 'people',
        element: <RequireRole roles={ROLE_SETS.admin}><PeoplePage /></RequireRole>,
      },
      {
        path: 'people/invite',
        element: <RequireRole roles={ROLE_SETS.admin}><InvitePage /></RequireRole>,
      },

      // Settings = connection management only, no findings
      {
        path: 'settings',
        element: <RequireRole roles={ROLE_SETS.admin}><SettingsPage /></RequireRole>,
      },
      {
        path: 'settings/jira',
        element: <RequireRole roles={ROLE_SETS.admin}><JiraManagePage /></RequireRole>,
      },
      {
        path: 'settings/m365',
        element: <RequireRole roles={ROLE_SETS.admin}><M365ManagePage /></RequireRole>,
      },
      {
        path: 'settings/defender',
        element: <RequireRole roles={ROLE_SETS.admin}><DefenderManagePage /></RequireRole>,
      },
      {
        path: 'settings/sharepoint',
        element: <RequireRole roles={ROLE_SETS.admin}><SharePointManagePage /></RequireRole>,
      },
      {
        path: 'settings/entra',
        element: <RequireRole roles={ROLE_SETS.admin}><EntraManagePage /></RequireRole>,
      },

      // Old direct link to user profile via settings → redirect to findings hierarchy
      {
        path: 'settings/entra/users/:entraId',
        element: <Navigate to="/app/findings/entra" replace />,
      },
    ],
  },
]

export const router = createBrowserRouter([
  ROOT,
  ...(WITH_APP ? appRoutes : []),
  ...(WITH_CONSOLE ? consoleRoutes : []),
  // Anything else on either host returns to that host's home.
  { path: '*', element: <Navigate to="/" replace /> },
])
