# RISYS / Sentrix — Technical & Logical Product Brief

*Internal preparation document. Derived from reading the codebase at commit `029e5ad` and the
`RISYS_Executive_Briefing.pdf`. Confidential.*

---

## 1. What the product is, in one paragraph

It is a **multi-tenant GRC (Governance, Risk & Compliance) platform, localised for the Saudi
regulatory environment**, whose differentiator is that it does not wait for humans to type risk
data in. It connects to the customer's Microsoft estate (Entra ID, M365, Defender, SharePoint),
continuously reads the security posture there, converts what it sees into **findings**, and lets a
compliance officer promote any finding into a **tracked risk or incident** with an owner, a due
date, and an audit trail. Those risks are mitigated by **controls**; those same controls are mapped
once to **regulatory clauses** across many frameworks at once, which produces a **live compliance
score** per framework. Everything material that happens is written to an immutable **audit log**.

The commercial wedge is the Saudi framework library: NCA, SAMA, SDAIA and CST frameworks come
pre-loaded and broken down to their native clause structure, so a customer is not configuring from
a blank page.

---

## 2. Naming — resolve this before the meeting

The briefing document is branded **RISYS — Risk Intelligence System**. The code, the UI logo, the
page title, the npm package name and every user-facing string say **Sentrix**. A prospective member
who is shown the deck and then shown the product will see two different names.

Either rebrand the code or rebrand the deck, but do not present both.

---

## 3. Technical architecture

### The shape of it

This is a **thin-client / thick-database** architecture. There is no application server of the
traditional kind.

```
┌────────────────────────────────────────────────────────────┐
│  BROWSER  — React 18 + Vite 5 SPA                          │
│  Routing: React Router v6   State: Zustand   CSS: Tailwind │
│  ~90 source files, 37 of which talk to the database        │
└───────────────┬────────────────────────────────────────────┘
                │  HTTPS, authenticated as the logged-in user
                │  (anon key + user JWT on every request)
                ▼
┌────────────────────────────────────────────────────────────┐
│  SUPABASE (managed Postgres)                               │
│  • Auth (GoTrue) — email/password + OAuth                  │
│  • Postgres — ~30 tables + framework clause tables         │
│  • ROW LEVEL SECURITY — the actual security boundary       │
│  • RPCs — log_audit_event, platform_* provisioning fns     │
└───────────────┬────────────────────────────────────────────┘
                │  service-role, server-side only
                ▼
┌────────────────────────────────────────────────────────────┐
│  EDGE FUNCTIONS (Deno)                                     │
│  • oauth-exchange.ts — swaps OAuth code for tokens         │
│  • entra-sync.ts     — pulls Microsoft Graph sign-in logs  │
└───────────────┬────────────────────────────────────────────┘
                ▼
        Microsoft Graph API / Atlassian / Slack / Notion
```

### Why this shape matters commercially

- **No servers to run.** Infrastructure cost is a Supabase bill, not a fleet. Gross margin story is
  strong.
- **Security is enforced in the database, not the UI.** Row Level Security policies mean a
  compromised or manipulated frontend still cannot read another tenant's data. This is the right
  answer to the first question any security-conscious buyer will ask.
- **The trade-off:** business logic lives in Postgres (RLS policies, RPCs, triggers) rather than in
  the repo. See §8 — this is currently the single biggest technical risk.

---

## 4. The data model

Roughly 30 tables. Grouped by what they do:

| Group | Tables | Purpose |
|---|---|---|
| **Tenancy** | `organizations`, `organization_members`, `org_invitations`, `org_groups` | Who exists, who belongs to which org, at what role |
| **Connectors** | `org_connectors`, `connector_mappings` | OAuth tokens + config per org per integration |
| **Ingested data** | `entra_users`, `entra_signin_logs`, `defender_findings`, `sharepoint_findings`, `m365_findings` | Raw and derived posture data pulled from Microsoft |
| **Risk** | `risks`, `risk_controls`, `risk_control_tests`, `risk_control_mappings`, `risk_evidence`, `risk_exceptions`, `risk_reviews`, `risk_treatment_actions`, `risk_treatment_updates`, `risk_kris`, `risk_loss_events`, `risk_collaborators`, `risk_workflow_history`, `risk_audit_log` | The risk register and everything hanging off a risk |
| **Compliance** | `compliance_statuses`, `control_framework_mappings`, + one table per framework (`nca_ecc`, `sama_csf`, `sdaia_pdpl`, …) | Clause libraries and per-clause status |
| **Work** | `incidents`, `tasks`, `notifications` | Things people have to do |
| **Governance** | `audit_log` | Immutable record of material actions |
| **Platform** | `platform_admins` | Your staff, above the tenant boundary |

### Multi-tenancy

Every tenant-scoped table carries an `org_id`. RLS policies restrict every read and write to the
orgs the caller belongs to, via a helper (`auth.user_org_ids()`). **Isolation is a database
guarantee, not an application convention** — this is the defensible version of multi-tenancy and
worth saying explicitly in the room.

Verified live: querying `organizations` with only the anon key returns `[]` rather than data. RLS
is on and working.

---

## 5. The logical model — five layers stacked

The whole product is one idea repeated: **connect an object to the objects that justify it.**

```
   FRAMEWORK CLAUSE      "NCA ECC 2-1-2 requires MFA on privileged accounts"
          ▲
          │  control_framework_mappings   (many-to-many)
          │
       CONTROL           "We enforce MFA via Conditional Access"
          ▲                    │
          │                    └── tested on a schedule → Pass / Fail / Partial
          │  risk_control_mappings (many-to-many)
          │
        RISK             "Credential compromise of an admin account"
          ▲
          │  escalation
          │
       FINDING           "user X holds a privileged role and has no MFA"
          ▲
          │  derived by the findings engine
          │
    INGESTED FACT        entra_users row, synced from Microsoft Graph
```

**The commercial punchline of this diagram:** because a control maps to *many* clauses, testing one
control once updates the compliance score of every framework that clause belongs to. That is the
"map once, satisfy many" claim in the deck, and it is genuinely implemented — the mapping tables
and the scoring function both exist.

---

## 6. The flows

### 6.1 Onboarding — top-down, not self-serve

This is a deliberate and important product decision. There is **no public signup**.
`/signup` and `/onboarding` both redirect to `/login` ([routes.jsx:36-37](src/router/routes.jsx)).

```
Your staff sign in at /platform/login
   → verified against platform_admins (anyone else is signed straight back out)
   → PlatformConsolePage: create a company
      RPC platform_create_organization(name, admin_email, plan,
                                       max_members, storage_gb, industry, size)
   → returns an activation token + expiry
   → customer admin lands on /invite/:token, sets a password, is in
   → that admin invites their own team from /app/people
```

Sell this as: *centrally provisioned, licensed and metered — no lengthy implementation project.*
Seats, storage and service tier are set at provisioning time and adjustable later. It is the
mechanism behind the "fast onboarding" claim, and it also happens to be your billing control point.

### 6.2 Connecting a source

```
Admin → /app/settings → picks a connector → OAuth popup
   → provider redirects to /oauth/callback with a code
   → edge function oauth-exchange.ts swaps code for access + refresh token
   → tokens stored server-side in org_connectors.meta
   → connector shows as Connected
```

Eight connectors are defined: Google Workspace, Microsoft Entra ID, Microsoft 365 Security,
Microsoft Defender, SharePoint Security, Jira, Notion, Slack.

Note the **piggyback design**: M365, Defender and SharePoint declare `piggybacksOn: 'entra'` — they
require no separate OAuth consent and reuse the Entra token. One consent screen unlocks four
sources. This is a genuinely good demo moment: *one connection, four security surfaces.*

### 6.3 The findings engine — the actual differentiator

`src/lib/findings.js` is the heart of the automation claim. It is a **provider registry**: each
connector registers a `fetch(orgId)` and a `derive(row)`, and the Findings page aggregates across
every connected provider into one severity-sorted list. Adding a connector later means adding one
object to an array — nothing else changes.

The Entra rules are written out explicitly and each carries a severity, a plain-English
explanation, **the NCA ECC clause it maps to**, and a remediation recommendation:

| Rule | Severity | Mapped control |
|---|---|---|
| No MFA registered on an enabled account | Critical | NCA ECC 2-1-2 · Privileged Access Management |
| Holds a privileged directory role | Warning | NCA ECC 2-1-3 · Privileged Account Management |
| External / guest identity | Info | NCA ECC 2-1-4 · Third-Party Access |
| Account disabled but not deleted | Info | NCA ECC 2-1-1 · Account Lifecycle |
| No sign-in for ≥ 90 days | Warning | NCA ECC 2-1-1 · Account Lifecycle |

That clause mapping on every finding is the thing to demo. It is what separates this from a generic
security scanner: the finding arrives **already speaking the regulator's language**.

### 6.4 Finding → Risk / Incident escalation

```
/app/findings → severity-ranked list across all connectors
   → open a finding → "Escalate"
      → Raise as Incident   (severity, SLA clock starts)
      → Raise as Risk       (prefilled title/description/category, enters register as draft)
   → audit_log records finding.escalated_to_risk / .escalated_to_incident
```

This closes the "security gaps and risk records live apart" problem from the deck, and it is the
single most demo-able sequence in the product: **a real MFA gap in a real tenant becomes a formally
owned, time-bound risk record in about three clicks.** Build the demo around this.

### 6.5 The risk lifecycle

Scoring is 5×5 likelihood × impact, scored **twice** — inherent (before controls) and residual
(after). Bands: ≥20 Critical, ≥12 High, ≥6 Medium, else Low.

Workflow is an explicit state machine ([risks.js](src/lib/risks.js) `WORKFLOW_ACTIONS`):

```
draft ──submit──▶ under_review ──approve──▶ approved ──close*──▶ closed
  ▲                    │                        │                   │
  └────reject*─────────┘                        └──reopen──▶ draft ◀┘
                                                         (* = comment required)
```

Around a risk hang: treatment actions (owner, due date, priority, progress), control tests,
evidence, KRIs, loss events, collaborators, scheduled reviews, and **exceptions with a mandatory
expiry date** — the "accepted risk never silently becomes permanent" point in the deck is real and
enforced by the `EXCEPTION_STATUSES` including `expired`.

### 6.6 Compliance scoring

```
score = (compliant + 0.5 × partial) / (applicable clauses) × 100
```

Per clause, status is either **manually overridden** or **auto-derived from mapped control test
results** (`computeEffectiveStatus`): any mapped control failing → *partial*; all passing →
*compliant*; mapped but untested → *in progress*; nothing mapped → *not started*. Frameworks are
grouped by their native structure — domain, sub-domain, article or clause — per framework, which is
the "nothing has to be re-interpreted" claim.

### 6.7 Incidents, SLA and audit

Incidents carry a severity-driven SLA clock: Critical 4h, High 24h, Medium 3d, Low 7d,
Informational 30d, with live states of ok → warning (<4h) → critical (<1h) → breached.

Audit logging goes through a single RPC (`log_audit_event`) wrapped by `logAudit()`. Two properties
worth stating aloud: it is **written server-side**, and it **fails silently** by design so a logging
error can never block the user's actual action.

---

## 7. Roles and permissions

Two enforcement layers that mirror each other: `usePermissions.js` in the UI (hides and disables
things) and RLS in the database (actually prevents them). The comment in the code is the right line
to use in the room: *"a blocked button is never the only thing standing between a user and an
action."*

Rank order: `viewer(0) < member(1) < risk_manager(2) < admin(3) = owner(3)`.

The model is a real **three-lines-of-defence** structure, not generic CRUD roles: a *member* (first
line) owns risks and evidence; a *risk_manager* (second line) reviews, approves, and is the only
role that can log a control test or decide an exception; an *admin* manages people and settings.
Ownership is also per-record — a member can edit a risk they own, are assigned, or collaborate on,
regardless of rank.

---

## 8. Claimed vs. built — read this before you present

Everything below is verifiable from the repo. None of it is fatal; all of it is answerable if you
know it in advance.

### Solid — claim it confidently

- Multi-tenant isolation via RLS, verified working against the live project
- Risk register with dual scoring, full workflow state machine, treatments, exceptions, reviews
- Control library with many-to-many mapping to both risks and framework clauses
- Compliance auto-scoring from control test results
- Findings engine with clause-mapped rules and escalation to risk/incident
- Audit log written server-side via RPC
- Platform console for provisioning tenants with seats/storage/plan
- SLA clocks on incidents
- CSV export of the register (26 columns)

### Gaps to be ready for

| # | Issue | Impact | Say this if asked |
|---|---|---|---|
| 1 | **Deck says 12 frameworks; code registers 8.** Missing: NCA NCS, SAMA BCM, CST CRF, CST ISIR | A prospect may count them on screen | "Eight are live in the product today; four more are loaded and being wired into the UI." Or correct the deck to 8. |
| 2 | **~1,700 clauses claim is unverified from the repo.** Clause tables live only in the hosted database | Can't be checked offline | Verify the row counts yourself before the meeting. |
| 3 | **Schema is not in version control.** The migration file has 3 tables; the code uses ~30 | Real engineering risk — the database cannot be rebuilt from the repo. No second environment, no disaster recovery, no way to onboard an engineer | Highest-priority fix. Dump the live schema into `supabase/migrations/` this week. |
| 4 | **Hardcoded Microsoft tenant ID** in [entra-sync.ts:8](supabase/functions/entra-sync.ts) — `8ee79250-…` | The sync function is pinned to one tenant. It will not work for a second customer as written | Trivially fixable (read tenant from `org_connectors`), but fix it *before* anyone technical reads that file. |
| 5 | **Two conflicting role lists.** [InviteMemberModal.jsx:4](src/features/people/InviteMemberModal.jsx) imports the stale list from `constants.js`, offering "Compliance Officer" and "Auditor" — neither exists in the permission ranks, so both resolve to rank −1 and get **no access at all**, not even read | If you invite someone as Auditor during a live demo, they are locked out of everything | ~10-minute fix: import `ROLES` from `usePeople.js` instead. **Do this before the demo.** |
| 6 | **Only Entra sync is implemented.** Defender, M365 and SharePoint findings tables are read by the UI, but no sync function in the repo populates them | The "continuously observes" claim rests on one connector today | "Entra is live; the others follow the same pattern and share its token." Honest and defensible. |
| 7 | **Google, Notion, Slack are configured but have no findings providers or sync** | They connect and then do nothing visible | Present them as roadmap, not capability. |
| 8 | **README is badly out of date** — describes risks/controls/compliance as "stub — next session" | Anyone who opens the repo reads that first | 20-minute rewrite. |
| 9 | **No automated tests, no CI.** `lint` script exists; no test framework | Standard diligence question | "Pre-revenue; test suite is planned alongside the schema migration work." |
| 10 | 1 MB JS bundle, unsplit | Slow first load on a bad connection | Cosmetic. Code-splitting is an afternoon. |

---

## 9. Suggested demo narrative

The strongest 5-minute story the product can actually tell today:

1. **Platform console** — provision "Acme Bank" in fifteen seconds, with a seat limit and a plan.
   *"No implementation project."*
2. **Connect Entra ID** — one OAuth consent. Point out that M365, Defender and SharePoint light up
   from the same consent.
3. **Findings** — a real list of real gaps in a real tenant. Open one. Point at the line that says
   `NCA ECC 2-1-2`. *"It arrives already mapped to the regulator's language."*
4. **Escalate to risk** — three clicks. Now it has an owner, a score, a workflow state and an audit
   entry.
5. **Compliance** — show the ECC score. Mark a mapped control as tested. Show the score move.
   *"That is the loop no spreadsheet can close."*
6. **Audit log** — every step you just performed is already recorded, with who and when.

Do steps 3→5 as one continuous motion. The product's entire thesis is that those three screens are
the same data, and seeing them move together is more persuasive than any slide.

---

## 10. Priorities before the meeting

1. Fix the role-list bug (#5) — it can break a live demo. ~10 minutes.
2. Fix or note the hardcoded tenant ID (#4).
3. Reconcile the framework count, 8 vs 12 (#1), and verify the clause count (#2).
4. Decide RISYS or Sentrix (§2).
5. Rewrite the README (#8).
6. Commit the real schema to migrations (#3) — the most important *engineering* item, though it is
   invisible in a demo.
