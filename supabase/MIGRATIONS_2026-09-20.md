# Database changes applied on 20 September 2026

These 17 migrations are already applied to the RISYS project
(`cfyjfmlhquyxgwrekswe`). They are **not** in `supabase/migrations/` yet,
because that folder still holds the four hand-written base files and does not
mirror the project's history.

Pull them (and the rest) into the repo once, then delete `001`–`004`:

    supabase link --project-ref cfyjfmlhquyxgwrekswe
    supabase migration fetch
    git rm supabase/migrations/001_*.sql supabase/migrations/002_*.sql \
           supabase/migrations/003_*.sql supabase/migrations/004_*.sql

Do not run `supabase db push` until that is done.

| Version | Name | What it does |
|---|---|---|
| 20260920163448 | roles_b10_helpers_and_constraints | `is_contributor()`, `is_org_readonly()`, `is_compliance_writer()`; CHECK constraints pinning `organization_members.role` and `org_invitations.role` to the seven real roles |
| 20260920163514 | roles_b10_policy_rewrite | Contributor tier in 10 risk policies; compliance policies moved to `is_compliance_writer()`; dropped the two permissive `risk_evidence` policies |
| 20260920163530 | roles_b10_readonly_guard | Restrictive `tenant_readonly_guard_{ins,upd,del}` on 41 tenant tables — viewers and auditors read and comment, nothing else |
| 20260920163602 | roles_b10_storage_readonly | Same rule for evidence files in both storage buckets |
| 20260920163728 | roles_b10_owner_role | `create_organization()` gives the creator `owner`; first admin of each existing org backfilled |
| 20260920163744 | roles_b10_protect_owner | An admin cannot edit, demote or remove the owner's membership row |
| 20260920164225 | m365_findings_scan_engine_shape | `m365_findings` gains source/status/first_seen/last_seen/resolved_at/source_url/incident_id and its indexes |
| 20260920164239 | v_finding_status_add_m365 | Triage status view now covers M365 findings |
| 20260920165623 | m365_drop_legacy_scopes_and_sharepoint_findings | Clears the stale `m365_scopes` meta; resolves the old M365 SharePoint-category rows |
| 20260920165759 | signal_engine_fix_seed_direction | `entra.standing_global_admins` and `entra.inactive_accounts` were seeded with the wrong direction; adds `compliance_signals.source_note` |
| 20260920165816 | signal_engine_compute | `record_signal()` and `grade_signal()` |
| 20260920165900 | signal_engine_compute_org_signals | `compute_org_signals()` — the RISYS and Entra directory signals |
| 20260920165942 | signal_engine_platform_signals | `compute_signals_platform()` (Secure Score, DNS, not-collected-yet) and `refresh_org_signals()` |
| 20260920170019 | signal_engine_refresh_triggers | Recompute on every finished scan; nightly `refresh_all_org_signals()` at 02:20 UTC via pg_cron |
| 20260920170227 | views_security_invoker | `v_requirement_automation` and `v_finding_status` now obey the caller's RLS instead of the view owner's |
| 20260920171105 | dispatch_send_bearer | The scheduler sends the publishable key as bearer, so a redeploy that flips `verify_jwt` back to true cannot silently stop every tenant's scheduled scans |
| 20260920171851 | signal_engine_lock_down_internals | Only `refresh_org_signals()` is callable from the browser; the rest are revoked from `anon` and `authenticated` |

## Edge functions deployed the same day

| Function | Version | Change |
|---|---|---|
| m365-security | 9 | Rebuilt on the scan engine: four sources, resolve-not-delete, `$batch` reads, cursor, B2 and B4 fixed, DNS added |
| scan-dispatcher | 4 | `m365` added to `SCHEDULABLE` |

**Note on `scan-dispatcher`:** deploying it from anywhere other than the
Supabase CLI resets `verify_jwt` to `true`, because `config.toml` is only read
by the CLI. The `dispatch_send_bearer` migration makes the scheduler work
either way, but a CLI deploy will restore the intended `verify_jwt = false`.
