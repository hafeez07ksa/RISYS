import { PlatformLoginPage } from '@/features/platform/PlatformLoginPage'
import { PlatformOverviewPage } from '@/features/platform/PlatformOverviewPage'
import { PlatformCompaniesPage } from '@/features/platform/PlatformCompaniesPage'
import { PlatformStaffPage } from '@/features/platform/PlatformStaffPage'
import { PlatformActivityPage } from '@/features/platform/PlatformActivityPage'
import { PlatformCompanyPage } from '@/features/platform/PlatformCompanyPage'
import {
  CreateCompanyPage, CompanyProfilePage, CompanyLimitsPage,
  CompanyActivationPage, CompanySuspendPage, CompanyDeletePage,
} from '@/features/platform/PlatformFormPages'
/* Routes for the platform console build (VITE_APP_MODE=console).
 *
 * Kept in their own module so the tenant build can drop the whole file: with
 * the mode fixed at build time, the import below is unreachable there and the
 * bundler removes it, which is why /platform simply does not exist on
 * app.risysgrc.com rather than existing and refusing.
 *
 * Access is enforced in three independent places: Cloudflare Access at the
 * edge, the platform_admins check in the app, and is_platform_admin() inside
 * every RPC. */
export const consoleRoutes = [
  { path: '/platform/login', element: <PlatformLoginPage /> },
  // ── Platform console (RISYS staff only) ──
  // Gated by platform_admins; every RPC behind these pages re-checks in the
  // database, and writes to the append-only platform_audit_log.
  { path: '/platform',            element: <PlatformOverviewPage /> },
  { path: '/platform/companies',  element: <PlatformCompaniesPage /> },
  { path: '/platform/companies/new', element: <CreateCompanyPage /> },
  { path: '/platform/companies/:id', element: <PlatformCompanyPage /> },
  { path: '/platform/companies/:id/edit',       element: <CompanyProfilePage /> },
  { path: '/platform/companies/:id/limits',     element: <CompanyLimitsPage /> },
  { path: '/platform/companies/:id/activation', element: <CompanyActivationPage /> },
  { path: '/platform/companies/:id/suspend',    element: <CompanySuspendPage /> },
  { path: '/platform/companies/:id/delete',     element: <CompanyDeletePage /> },
  { path: '/platform/staff',      element: <PlatformStaffPage /> },
  { path: '/platform/activity',   element: <PlatformActivityPage /> },
]
