import { tx } from '@/lib/i18n'
import { ROLE_SETS } from '@/lib/roles'

/* ── Navigation: two levels ───────────────────────────────────────────────────
 *
 * The top bar holds the modules; the left sidebar shows only the pages of the
 * module you are in. Which module is active is worked out from the URL, so the
 * routes did not change: /app/policies is still /app/policies, and every link
 * in a notification, an email or a bookmark lands where it always did.
 *
 *   module.match   first URL segments (after /app/) that belong to the module
 *   item.path      the page, relative to /app/
 *   item.gate      who may see it; mirrors the route guards in router/routes.jsx
 *                  and, behind both, the RLS policies. A hidden link is never
 *                  the only thing stopping anyone.
 *
 * A module is shown when at least one of its pages is. Every module has a
 * sidebar, even with one page, so the frame stays the same everywhere.
 * -------------------------------------------------------------------------- */

const findingsReader = (p) => p.canTriageFindings || p.isAuditor
const riskManager = (p) => ROLE_SETS.riskManager.includes(p.role)

export const MODULES = [
  {
    id: 'dashboard', label: tx('Dashboard'), icon: 'LayoutDashboard', match: ['dashboard', 'tasks', 'ask'],
    items: [
      { path: 'dashboard', label: tx('Overview'), icon: 'LayoutDashboard' },
      { path: 'tasks', label: tx('Tasks'), icon: 'CheckSquare2' },
      // Ask RISYS is not a page here: its entry sits at the foot of every
      // module sidebar (components/layout/Sidebar.jsx).
    ],
  },
  {
    id: 'risk', label: tx('Risk Management'), icon: 'ShieldAlert', match: ['risks'],
    items: [
      { path: 'risks', label: tx('Risk Register'), icon: 'ShieldAlert' },
      { path: 'risks/suggestions', label: tx('Suggested risks'), icon: 'Sparkles', gate: findingsReader, badge: 'suggestions' },
      { path: 'risks/triage', label: tx('Finding triage'), icon: 'ListChecks', gate: findingsReader },
      { path: 'risks/tolerances', label: tx('Tolerances and authority'), icon: 'Gauge', gate: riskManager },
    ],
  },
  {
    id: 'compliance', label: tx('Compliance'), icon: 'BookCheck',
    match: ['compliance', 'frameworks', 'controls', 'policies', 'my-policies', 'exceptions', 'evidence'],
    items: [
      { path: 'compliance', label: tx('Overview'), icon: 'BookCheck' },
      { path: 'compliance/dashboard', label: tx('Dashboard'), icon: 'LayoutDashboard' },
      { path: 'compliance/reviews', label: tx('Review calendar'), icon: 'CalendarClock' },
      { path: 'controls', label: tx('Controls'), icon: 'CheckSquare' },
      { path: 'frameworks', label: tx('Frameworks'), icon: 'Library' },
      { group: tx('Policies') },
      { path: 'policies', label: tx('Policies'), icon: 'ScrollText' },
      { path: 'my-policies', label: tx('My policies'), icon: 'FilePen' },
      { path: 'exceptions', label: tx('Exceptions'), icon: 'ShieldOff' },
      { path: 'evidence', label: tx('Evidence library'), icon: 'FolderOpen' },
    ],
  },
  {
    // PDPL. Every member may log a request or report a breach. Requests and
    // breaches name real people, so RLS shows them in full to compliance
    // writers and auditors, and otherwise only to the person who logged or is
    // assigned the record.
    id: 'privacy', label: tx('Privacy'), icon: 'Fingerprint', match: ['privacy'],
    items: [
      { path: 'privacy', label: tx('Overview'), icon: 'Fingerprint' },
      { path: 'privacy/requests', label: tx('Data subject requests'), icon: 'UserRoundSearch' },
      { path: 'privacy/breaches', label: tx('Breaches'), icon: 'Siren' },
      { path: 'privacy/processing', label: tx('Record of processing'), icon: 'Database' },
      { path: 'privacy/assessments', label: tx('Impact assessments'), icon: 'Scale' },
      { group: tx('Setup') },
      { path: 'privacy/settings', label: tx('Controller and DPO'), icon: 'Settings', gate: (p) => p.isComplianceWriter },
    ],
  },
  {
    id: 'security', label: tx('Security'), icon: 'Radar', match: ['incidents', 'findings'],
    items: [
      { path: 'incidents', label: tx('Incidents'), icon: 'AlertTriangle' },
      { path: 'findings', label: tx('Findings'), icon: 'FileWarning', gate: findingsReader },
    ],
  },
  {
    id: 'audits', label: tx('Audits'), icon: 'ClipboardCheck', match: ['audits'],
    items: [{ path: 'audits', label: tx('Engagements'), icon: 'ClipboardCheck' }],
    // Room for the audit plan, findings across engagements and the auditee's inbox.
  },
  {
    id: 'reports', label: tx('Reports'), icon: 'FileText', match: ['reports'],
    items: [
      { path: 'reports/board', label: tx('Board report'), icon: 'Landmark' },
      { path: 'reports/ecc', label: tx('ECC status report'), icon: 'ShieldCheck' },
      { path: 'reports/ccc', label: tx('CCC status report'), icon: 'Cloud', gate: (p, ctx) => !!ctx?.cccOn },
      { path: 'reports/pdpl', label: tx('PDPL status report'), icon: 'Lock', gate: (p, ctx) => !!ctx?.pdplOn },
      { path: 'reports/audit', label: tx('Audit reports'), icon: 'ClipboardCheck' },
      { group: tx('Filed') },
      { path: 'reports', label: tx('Archive'), icon: 'Archive' },
    ],
  },
  {
    id: 'admin', label: tx('Administration'), icon: 'Settings', match: ['people', 'settings', 'audit'],
    items: [
      { path: 'people', label: tx('People'), icon: 'Users', gate: (p) => p.canManagePeople },
      { path: 'settings', label: tx('Settings'), icon: 'Settings', gate: (p) => p.canEditOrgSettings },
      { path: 'audit', label: tx('Audit Log'), icon: 'ScrollText', gate: (p) => p.canViewAudit },
    ],
  },
]

/** Modules and their pages that this person may see. Group headings are kept only when a page follows them. */
export function visibleModules(perms, ctx) {
  return MODULES.map((m) => {
    const items = m.items.filter((i) => i.group || !i.gate || i.gate(perms, ctx))
    const tidy = items.filter((i, k) => !i.group || (items[k + 1] && !items[k + 1].group))
    return { ...m, items: tidy, pages: tidy.filter((i) => !i.group) }
  }).filter((m) => m.pages.length > 0)
}

/** The module a URL belongs to, from its first segment after /app/. */
export function moduleForPath(modules, pathname) {
  const seg = pathname.replace(/^\/app\/?/, '').split('/')[0] || 'dashboard'
  return modules.find((m) => m.match.includes(seg)) || null
}

/** The page in a module that a URL belongs to: the longest matching path wins,
 *  so /app/compliance/reviews lights "Review calendar", not "Overview". */
export function activePage(module, pathname) {
  const rel = pathname.replace(/^\/app\/?/, '')
  let best = null
  for (const i of module?.pages || []) {
    if ((rel === i.path || rel.startsWith(`${i.path}/`)) && (!best || i.path.length > best.path.length)) best = i
  }
  return best
}
