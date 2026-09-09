import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireRole } from '@/layouts/RequireRole'
import { LoginPage } from '@/features/auth/LoginPage'
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage'
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage'
import { PlatformLoginPage } from '@/features/platform/PlatformLoginPage'
import { PlatformConsolePage } from '@/features/platform/PlatformConsolePage'
import { PlatformCompanyPage } from '@/features/platform/PlatformCompanyPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { IncidentsPage } from '@/features/incidents/IncidentsPage'
import { IncidentDetailPage } from '@/features/incidents/IncidentDetailPage'
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage'
import { FindingsPage } from '@/features/findings/FindingsPage'
import { FindingsPlatformPage } from '@/features/findings/FindingsPlatformPage'
import { RiskRegisterPage } from '@/features/risks/RiskRegisterPage'
import { RiskDetailPage } from '@/features/risks/RiskDetailPage'
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

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <Navigate to="/login" replace /> },
  { path: '/onboarding', element: <Navigate to="/login" replace /> },
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  { path: '/platform/login', element: <PlatformLoginPage /> },
  { path: '/platform', element: <PlatformConsolePage /> },
  { path: '/platform/companies/:id', element: <PlatformCompanyPage /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },

      // ── Available to all authenticated members ──────────────────
      { path: 'dashboard',    element: <DashboardPage /> },
      { path: 'incidents',      element: <IncidentsPage /> },
      { path: 'incidents/:id',  element: <IncidentDetailPage /> },
      { path: 'risks',        element: <RiskRegisterPage /> },
      { path: 'risks/:id',    element: <RiskDetailPage /> },
      { path: 'controls',     element: <ControlsPage /> },
      { path: 'controls/:id', element: <ControlDetailPage /> },
      { path: 'compliance',   element: <CompliancePage /> },
      { path: 'tasks',        element: <TasksPage /> },
      { path: 'tasks/:id',   element: <TaskDetailPage /> },
      { path: 'audit',        element: <AuditLogPage /> },

      // ── Admin only ──────────────────────────────────────────────

      // Findings hierarchy:
      //   /app/findings                            → platform cards
      //   /app/findings/:connectorId               → users list with finding badges
      //   /app/findings/:connectorId/users/:id     → user profile (full page)
      {
        path: 'findings',
        element: <RequireRole roles={['admin', 'owner']}><FindingsPage /></RequireRole>,
      },
      {
        path: 'findings/:connectorId',
        element: <RequireRole roles={['admin', 'owner']}><FindingsPlatformPage /></RequireRole>,
      },
      {
        path: 'findings/entra/users/:entraId',
        element: <RequireRole roles={['admin', 'owner']}><EntraUserPage /></RequireRole>,
      },

      // People
      {
        path: 'people',
        element: <RequireRole roles={['admin', 'owner']}><PeoplePage /></RequireRole>,
      },

      // Settings = connection management only, no findings
      {
        path: 'settings',
        element: <RequireRole roles={['admin', 'owner']}><SettingsPage /></RequireRole>,
      },
      {
        path: 'settings/jira',
        element: <RequireRole roles={['admin', 'owner']}><JiraManagePage /></RequireRole>,
      },
      {
        path: 'settings/m365',
        element: <RequireRole roles={['admin', 'owner']}><M365ManagePage /></RequireRole>,
      },
      {
        path: 'settings/defender',
        element: <RequireRole roles={['admin', 'owner']}><DefenderManagePage /></RequireRole>,
      },
      {
        path: 'settings/sharepoint',
        element: <RequireRole roles={['admin', 'owner']}><SharePointManagePage /></RequireRole>,
      },
      {
        path: 'settings/entra',
        element: <RequireRole roles={['admin', 'owner']}><EntraManagePage /></RequireRole>,
      },

      // Old direct link to user profile via settings → redirect to findings hierarchy
      {
        path: 'settings/entra/users/:entraId',
        element: <Navigate to="/app/findings/entra" replace />,
      },
    ],
  },
])
