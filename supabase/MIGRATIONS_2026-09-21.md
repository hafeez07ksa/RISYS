# Database changes applied on 21 September 2026 — audit module, reporting, hardening

These 12 migrations are already applied to the RISYS project
(`cfyjfmlhquyxgwrekswe`). Like the 20 September batch they are not in
`supabase/migrations/` yet — run `supabase migration fetch` once to pull the
whole history into the repo (see MIGRATIONS_2026-09-20.md) before any
`supabase db push`.

| Version | Name | What it does |
|---|---|---|
| 20260921131530 | audit_module_tables | `is_audit_writer()`, `can_generate_reports()`; tables `audit_engagements`, `audit_scope_items`, `audit_evidence_requests`, `audit_evidence_files`, `audit_findings` with their CHECK constraints (closing needs an opinion; tester ≠ reviewer; an issued finding needs condition and recommendation) |
| 20260921131542 | report_runs_table | `report_runs` — the report archive: type, period, snapshot of the rendered model, file path, size, SHA-256, presentation status |
| 20260921131600 | audit_reports_rls | RLS on all six tables, `tenant_active_guard`, member read, writes per role; `report_runs` has no DELETE policy at all |
| 20260921131640 | audit_reports_triggers | `AUD-0001` / `AUD-0001-F01` references; tester and reviewer stamped from `auth.uid()`; a changed result clears the review; request and finding guards (the business may answer and remediate, only the audit team accepts evidence or closes a finding); `report_runs_guard` locks everything except the presentation fields |
| 20260921131707 | audit_reports_notify_and_log | Notifications to the person asked for evidence, the finding owner and the lead auditor; every state change written to `audit_log` |
| 20260921131718 | audit_reports_storage | Private buckets `audit-evidence` (50 MB/file) and `reports` (25 MB/file) with org-scoped policies; no delete on `reports` |
| 20260921131810 | signal_engine_fix_tolerance_evaluated | `risys.risk_methodology` counted risks whose tolerance was `not_evaluated` as having passed the gate. Now only `within`/`breached` count |
| 20260921131907 | report_data_board_pack | `report_board_pack_data(org, start, end)` — SECURITY INVOKER, one consistent read of everything the board pack shows |
| 20260921131936 | report_data_board_pack_status_values | Correct status values for treatment plans (`complete`/`cancelled`) and active exceptions (`approved`) |
| 20260921131959 | report_data_ecc_and_audit | `report_ecc_status_data(org)` and `report_audit_data(engagement)` — both SECURITY INVOKER |
| 20260921132352 | report_board_pack_domain_totals | ECC domain rows carry their main-control count so "not assessed" is visible per domain |
| 20260921134658 | sec_hardening_v7_v8_view_invoker | V7: EXECUTE revoked on every trigger function and on sign-in-only RPCs for `anon`. V8: `search_path` pinned on the 14 remaining functions. `framework_requirements_v` switched to security_invoker. Supabase security advisor: 0 errors |

## Still to do by hand

- **Leaked-password protection (V13):** Supabase dashboard → Authentication →
  Sign In / Providers → Password → enable "Prevent use of leaked passwords".
  It is an Auth setting, not SQL.
- The remaining advisor warnings are intentional: RLS helper functions stay
  callable by `anon` (policies evaluated for an anonymous request call them;
  revoking would turn "no rows" into an error), and the `platform_*`, invite
  and admin RPCs are callable by signed-in users because each checks the
  caller's role itself before doing anything.

## Front end

`package.json` gains `@react-pdf/renderer` — run `npm install` after
extracting. Reports are rendered in the browser and loaded on first use, so the
~1.2 MB renderer is not in the main bundle.
