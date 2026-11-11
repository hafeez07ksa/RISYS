import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { BUILD_MODE, ASK_RISYS_ENABLED } from '@/lib/env'
import { consoleRoutes } from './consoleRoutes'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireRole } from '@/layouts/RequireRole'
import { ROLE_SETS } from '@/lib/roles'
import { LoginPage } from '@/features/auth/LoginPage'
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage'
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
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
import { ReviewCalendarPage } from '@/features/compliance/ReviewCalendarPage'
import { ComplianceDashboardPage } from '@/features/compliance/ComplianceDashboardPage'
import { FrameworksPage } from '@/features/frameworks/FrameworksPage'
import { AuditsPage } from '@/features/audits/AuditsPage'
import { AuditDetailPage } from '@/features/audits/AuditDetailPage'
import { ReportsPage, ReportTypePage } from '@/features/reports/ReportsPage'
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
import { SuggestedRisksPage } from '@/features/risks/SuggestedRisksPage'
import { SuggestionDetailPage } from '@/features/risks/SuggestionDetailPage'
import { AskRisysPage } from '@/features/ask/AskRisysPage'
import { PoliciesPage } from '@/features/policies/PoliciesPage'
import { PolicyCoveragePage } from '@/features/policies/PolicyCoveragePage'
import { PolicyFormPage } from '@/features/policies/PolicyFormPage'
import { PolicyDetailPage } from '@/features/policies/PolicyDetailPage'
import { PolicyVersionPage } from '@/features/policies/PolicyVersionPage'
import { MyPoliciesPage } from '@/features/policies/MyPoliciesPage'
import { AttestPage } from '@/features/policies/AttestPage'
import { ExceptionsPage } from '@/features/exceptions/ExceptionsPage'
import { ExceptionFormPage } from '@/features/exceptions/ExceptionFormPage'
import { ExceptionDetailPage } from '@/features/exceptions/ExceptionDetailPage'
import { EvidenceLibraryPage } from '@/features/evidence/EvidenceLibraryPage'
import { EvidenceFormPage } from '@/features/evidence/EvidenceFormPage'
import { EvidenceDetailPage } from '@/features/evidence/EvidenceDetailPage'
import { PrivacyOverviewPage } from '@/features/privacy/PrivacyOverviewPage'
import { DsrListPage, DsrFormPage, DsrDetailPage } from '@/features/privacy/RequestPages'
import { BreachListPage, BreachFormPage, BreachDetailPage } from '@/features/privacy/BreachPages'
import { ProcessingListPage, ProcessingFormPage, ProcessingDetailPage } from '@/features/privacy/ProcessingPages'
import { PiaListPage, PiaFormPage, PiaDetailPage } from '@/features/privacy/AssessmentPages'
import { PrivacySettingsPage } from '@/features/privacy/PrivacySettingsPage'

/* The breadcrumb links every segment of the URL, so /app/audits/:id/findings
 * has to go somewhere: to the engagement, on that tab. */
function EngagementTab({ tab }) {
  const { id } = useParams()
  return <Navigate to={`/app/audits/${id}?tab=${tab}`} replace />
}

function PolicyVersionsRedirect() {
  const { id } = useParams()
  return <Navigate to={`/app/policies/${id}?tab=history`} replace />
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
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
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
      // Ask RISYS (AI phase 0). Open to every role: the tools behind it read
      // under the person's own RLS, so a viewer only ever hears about what a
      // viewer can open. Compiled in only with VITE_ASK_RISYS=true, and shown
      // only where RISYS staff have switched AI on for the workspace.
      ...(ASK_RISYS_ENABLED ? [
        { path: 'ask',                  element: <AskRisysPage /> },
        { path: 'ask/:conversationId',  element: <AskRisysPage /> },
      ] : []),
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
      { path: 'risks/suggestions', element: <RequireRole roles={ROLE_SETS.findingsReader}><SuggestedRisksPage /></RequireRole> },
      { path: 'risks/suggestions/:id', element: <RequireRole roles={ROLE_SETS.findingsReader}><SuggestionDetailPage /></RequireRole> },
      { path: 'risks/new',        element: <RiskFormPage /> },
      { path: 'risks/:id',        element: <RiskDetailPage /> },
      { path: 'risks/:id/edit',   element: <RiskFormPage /> },
      { path: 'risks/:id/assess', element: <AssessmentPage /> },
      { path: 'controls',     element: <ControlsPage /> },
      { path: 'controls/new', element: <ControlFormPage /> },
      { path: 'controls/:id', element: <ControlDetailPage /> },
      { path: 'controls/:id/edit', element: <ControlFormPage /> },
      { path: 'compliance',   element: <CompliancePage /> },
      { path: 'compliance/reviews', element: <ReviewCalendarPage /> },
      { path: 'compliance/dashboard', element: <ComplianceDashboardPage /> },
      // Framework and control are addressable so an assessment can be linked to
      { path: 'compliance/:frameworkId',                 element: <ComplianceFrameworkRoute /> },
      { path: 'compliance/:frameworkId/:requirementId',  element: <ComplianceControlRoute /> },
      { path: 'frameworks',   element: <FrameworksPage /> },
      // Policies, exceptions and the evidence library. Open to every member:
      // everyone reads and attests to policies; who may write, approve and
      // publish is decided per action in the database.
      { path: 'policies',                    element: <PoliciesPage /> },
      { path: 'policies/coverage',           element: <PolicyCoveragePage /> },
      { path: 'policies/new',                element: <PolicyFormPage /> },
      { path: 'policies/:id',                element: <PolicyDetailPage /> },
      { path: 'policies/:id/edit',           element: <PolicyFormPage /> },
      { path: 'policies/:id/versions',       element: <PolicyVersionsRedirect /> },
      { path: 'policies/:id/versions/:no',   element: <PolicyVersionPage /> },
      { path: 'my-policies',                 element: <MyPoliciesPage /> },
      { path: 'my-policies/:id',             element: <AttestPage /> },
      { path: 'exceptions',                  element: <ExceptionsPage /> },
      { path: 'exceptions/new',              element: <ExceptionFormPage /> },
      { path: 'exceptions/:id',              element: <ExceptionDetailPage /> },
      { path: 'evidence',                    element: <EvidenceLibraryPage /> },
      { path: 'evidence/new',                element: <EvidenceFormPage /> },
      { path: 'evidence/:id',                element: <EvidenceDetailPage /> },
      // Privacy (PDPL). Open to every member: anyone may log a data subject
      // request or report a breach; RLS decides who reads which record and
      // the RPCs decide who may move a clock or a status.
      { path: 'privacy',                       element: <PrivacyOverviewPage /> },
      { path: 'privacy/requests',              element: <DsrListPage /> },
      { path: 'privacy/requests/new',          element: <DsrFormPage /> },
      { path: 'privacy/requests/:id',          element: <DsrDetailPage /> },
      { path: 'privacy/requests/:id/edit',     element: <DsrFormPage /> },
      { path: 'privacy/breaches',              element: <BreachListPage /> },
      { path: 'privacy/breaches/new',          element: <BreachFormPage /> },
      { path: 'privacy/breaches/:id',          element: <BreachDetailPage /> },
      { path: 'privacy/processing',            element: <ProcessingListPage /> },
      { path: 'privacy/processing/new',        element: <ProcessingFormPage /> },
      { path: 'privacy/processing/:id',        element: <ProcessingDetailPage /> },
      { path: 'privacy/processing/:id/edit',   element: <ProcessingFormPage /> },
      { path: 'privacy/assessments',           element: <PiaListPage /> },
      { path: 'privacy/assessments/new',       element: <PiaFormPage /> },
      { path: 'privacy/assessments/:id',       element: <PiaDetailPage /> },
      { path: 'privacy/assessments/:id/edit',  element: <PiaFormPage /> },
      { path: 'privacy/settings',              element: <PrivacySettingsPage /> },
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
      { path: 'reports/board', element: <ReportTypePage key="board" slug="board" /> },
      { path: 'reports/ecc',   element: <ReportTypePage key="ecc" slug="ecc" /> },
      { path: 'reports/ccc',   element: <ReportTypePage key="ccc" slug="ccc" /> },
      { path: 'reports/pdpl',  element: <ReportTypePage key="pdpl" slug="pdpl" /> },
      { path: 'reports/audit', element: <ReportTypePage key="audit" slug="audit" /> },
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
