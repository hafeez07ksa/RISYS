# Database changes applied on 29 September 2026 — findings keyed to ECC requirements

These 3 migrations are already applied to the RISYS project
(`cfyjfmlhquyxgwrekswe`) and are in `supabase/migrations/` under the versions
Supabase recorded, so `supabase migration list` shows local and remote aligned.
Do not run them again with `db push`.

| Version | Name | What it does |
|---|---|---|
| 20260929132133 | finding_control_refs | `finding_control_refs`: one row per stored finding and the requirement it evidences. ECC references are a foreign key into `nca_ecc`; PDPL references keep part and article (not FK'd until PDPL joins `framework_requirements_v`). A trigger on `m365_findings`, `defender_findings` and `sharepoint_findings` parses the `control` label on insert and when it changes (`parse_control_label` mirrors `src/lib/controlRefs.js`). Labels that do not resolve go to `finding_control_ref_issues` (platform admins only) instead of being dropped; a keying error never fails a scan. RLS: members read, `tenant_active_guard`, no client writes. Backfilled: 54 findings, 0 issues |
| 20260929132201 | requirement_findings_view | `v_requirement_findings` (security_invoker): open findings per requirement by severity, rolled up from subcontrol to main control like the signals, with `needs_attention` when any open finding is critical or warning |
| 20260929132305 | signals_from_keyed_findings | Ten signals and `compute_signals_findings(org)`, wired into `refresh_org_signals`, `refresh_all_org_signals` and the after-scan trigger. Requirements with an automated status: 14 → 23 |

Also added: `20260928141439_email_log_for_outbound_mail.sql`. It was applied
on 28 September but missing from the repo copy these changes were made
against; the file is the exact SQL recorded in `supabase_migrations`.

## Product rule

A finding is evidence of a gap, not a verdict. Open findings **never change**
the automated or effective status. The requirement page shows them beside the
status, and warns when a requirement measures compliant while critical or
warning findings are open against it. Changing this to an "at risk" status
later means using `needs_attention` in `computeEffectiveStatus`.

## New signals

| Signal | Requirement | Source |
|---|---|---|
| `defender.email_filtering` | 2-4-3-1 | Secure Score controls keyed (primary) to the requirement: achieved / total |
| `defender.email_advanced_protection` | 2-4-3-4 | same |
| `defender.audit_logging` | 2-12-3-1 | same |
| `defender.data_protection_posture` | 2-7-2 | same |
| `m365.external_forwarding` | 2-4-2, 2-7-2 | Scanned mailboxes with no external forwarding / mailboxes scanned |
| `sharepoint.anyone_links_disabled` | 2-7-2 | `counts.tenant_settings` on the SharePoint scan run |
| `sharepoint.sharing_domain_restricted` | 2-7-2 | same (N/A when external sharing is off) |
| `sharepoint.guest_reshare_blocked` | 2-2-3-3 | same (N/A when external sharing is off) |
| `sharepoint.idle_signout` | 2-2-2 | same |
| `sharepoint.unmanaged_sync_blocked` | 2-6-3-1, 2-6-3-2 | same |

The SharePoint signals read the settings themselves, not the absence of a
finding: `sharepoint-security` raises a finding only for a readable, bad value,
so "no finding" also covers "could not read it". A setting Microsoft does not
report stays `unknown`.

## To do by hand

1. **Deploy `sharepoint-security`** — it now writes `counts.tenant_settings`:
   `supabase functions deploy sharepoint-security`
   Then run a SharePoint scan. Until then the five SharePoint signals read
   "unknown — the last SharePoint scan did not record tenant settings".
2. Commit the migrations with the front-end changes.

## Front end

- `src/hooks/useCompliance.js` — `useRequirementFindings(frameworkId)` and
  `hasFindingsWarning(status, findings)`.
- `src/features/compliance/ComplianceControlPage.jsx` — "Open findings" card
  in the right rail on ECC requirement pages, under "Measured".
- `src/locales/ar.json` — the card's 8 strings.

`npm run check` (RTL + 61 gate tests) and `npm run build` pass.

## Not covered

- Entra ID findings are derived in the browser and never stored, so they are
  not keyed. The Entra signals already measure the same requirements (2-2-3-x).
- Findings still store the label as text and the Findings page still parses it
  for display (`controlRefs.js`). The label is now the input to the keys, not
  the only record of them.
