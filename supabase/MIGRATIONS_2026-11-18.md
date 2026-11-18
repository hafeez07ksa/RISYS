# Migrations — 18 November 2026 (ERM, step 6)

Both were applied to Tokyo through the Supabase MCP on 18 Nov 2026. The files carry the applied versions. **Do not `db push` them.** `supabase migration list` should show nothing pending.

## 20261117224148_erm_intake_assessment_acceptance

| Part | What it adds |
|---|---|
| Raise a risk (6.1) | `risk_submissions` (SUB-), with clients on SELECT only. RPCs: `submit_risk`, `update_risk_submission` (the submitter edits, or answers a question), `withdraw_risk_submission` and `triage_risk_submission` (clarify / decline / accept → a draft risk for a named owner). A risk manager or admin triages, and never their own submission. Viewers cannot raise. |
| Assessment deadline (6.2) | `risks.assessment_due_at` and `assessed_at`, set only by the trigger `trg_risks_assessment_clock`. Admission (draft → registered) starts it, the first scored state stops it, and a return to draft clears it. Clients cannot change either column. `extend_risk_assessment` lets a risk manager move the date by at most 90 days, with a reason, and logs it. Existing registered risks were backfilled from their admission date. |
| Settings | `risk_settings`: `assessment_sla_days` (default 30) and `acceptance_decision_days` (default 14). Changed only through `set_risk_settings`, by a risk manager or admin. |
| Acceptance governance (6.3) | New columns on `risk_exceptions`: `purpose` (9 values), `decision_due_on`, `conditions`, `decided_by`, a management review (`management_review_*`) and the revocation fields. RPCs: `request_risk_acceptance`, `review_risk_acceptance` and `decide_risk_acceptance` (approved / rejected / revoked). The database computes band and authority (`risk_acceptance_terms`, `risk_score_band`) and enforces: the approver's authority; no self-approval except a risk owner inside their own authority; no "within tolerance" purpose when the risk is outside tolerance; and term limits (interim purposes or critical risks 6 months, exceptions 12, otherwise 24). A pending management review blocks the decision, and approving over an objection needs a 20-character reason. |
| Visibility | `risks_select` now also lets the named approver and management reviewer read the risk (`user_decides_on_risk`). |
| Expiry | `risk_acceptances_expire()` puts an expired acceptance's risk back to Assessed and writes the history. `expire_risk_exceptions(org)` now calls it. |
| Daily job | `erm_daily()` on cron `risys-erm-daily` (`25 2 * * *`): expiry; assessment reminders at 7 days, on the day and weekly when overdue; overdue decisions; acceptances ending in 30 and 7 days; triage waiting more than 5 days. Reminders are de-duplicated in `erm_reminders`. |
| my_work | New kinds: `risk_triage`, `risk_clarify`, `risk_assessment`, `acceptance_review` and `acceptance_decision`. |

## 20261117224312_risk_register_policy_tidy

This drops the legacy member-wide permissive policies (`org_all`, `org_kris`, `org_controls`, `org_mappings`, `org_loss_events` and their `*_insert` twins). Because policies combine with OR, these let any member, viewers included, write to risk child tables.

- `risk_exceptions` is now SELECT-only for clients.
- `risk_workflow_history` is append-only: insert is allowed for a risk manager or a contributor working on the risk.
- `risk_treatment_options` and `risk_treatment_plans` now use the same rule as the other risk child tables.

## Tests

38 checks were run in a rolled-back transaction before applying (as member, owner/board, admin/committee and admin/CISO). All passed. They covered: the submit → clarify → answer → accept flow, triage refused to the submitter, direct writes refused, the deadline set on admission and ignored when a client writes it, extension rules, self-acceptance of a low risk, critical-risk governance (authority, purpose, term, management review, objection), revoke, expiry through `erm_daily`, and a viewer refused.

## 20261118000839_risk_report

This supports the per-risk PDF (the Export PDF button on a risk).

- `report_risk_data(p_risk)` is SECURITY INVOKER, so it returns only what the caller can already read. It returns the risk and its bands, the category tolerance, mapped controls and tests, score history, treatment options, plans and actions, acceptances, KRIs, loss events, reviews, evidence metadata (no storage paths), linked findings, tasks, collaborators, comments, workflow history and the intake submission. If RLS hides the risk, it raises "Risk not found, or not visible to you".
- `report_runs.risk_id` was added (on delete set null, indexed), and `risk_report` was added to the report type check.
- Archiving uses the existing `report_runs` rules: people who may generate reports get a copy fingerprinted and filed; anyone else who can see the risk still gets the PDF, marked on its cover as not archived.

Tested: the owner gets RSK-0001 (19 findings, critical band); a member who is not on the risk is refused.

Applied to Tokyo through the MCP. Do not `db push` it.

## Risk report evidence appendix (frontend only, no migration)

Export PDF now includes the evidence by default. The menu beside the button can export without it.

- **Images** (PNG, JPEG, GIF, WebP) are drawn in an appendix. Images are scaled to at most 2,200 px; GIF and WebP are redrawn as PNG.
- **PDFs** are appended after the report with `pdf-lib`, at most 30 pages each. Each page is stamped "RISYS RSK-xxxx - Evidence En - page i of n".
- **Other file types**, and files that are too large, password-protected or unreadable, are listed with the reason.
- **Limits:** 12 MB per image, 15 MB per PDF and 18 MB in total, so the archived file stays under the 25 MB limit of the reports bucket. A report that would still be over 25 MB is refused with a hint to export without evidence.
- **Access:** files are read with the user's session, so storage RLS applies.
- **Snapshot:** only a summary (`evidence_appendix`) goes into `report_runs.snapshot`, never the file contents.

New dependency: `pdf-lib` (loaded only on export). Run `npm install` after applying the zip.

The shared `Table` primitive now keeps a table's heading, column header and first row together. This fixes headings left alone at the foot of a page, in every report.
