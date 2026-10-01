# 1 October 2026 — Suggested risks (RISYS raises risks from what it detects)

## Database — already applied

| Version | Name | What it does |
|---|---|---|
| 20261001104603 | risk_suggestions | `risk_suggestion_templates` (wording per ECC area), `risk_suggestions`, `refresh_risk_suggestions(org)` (the generator), `request_risk_suggestions(org)` ("Check now"), `update_risk_suggestion`, `accept_risk_suggestion`, `dismiss_risk_suggestion`, `restore_risk_suggestion`; generator wired into the after-scan trigger and the nightly refresh |

| 20261001113156 | risk_suggestions_tidy_cause | Generator joins detected items without their own closing full stop ("achieved; Advanced…" instead of "achieved.; Advanced…"). Existing unedited suggestions were refreshed. |

Do not run these again with `db push`.

## How it works

1. **Evidence.** Open critical/warning connector findings (via
   `finding_control_refs`, primary requirement) and failing/partial signals
   from connected systems (not RISYS's internal governance checks), grouped
   by **ECC area** (subdomain: 2-2 Identity, 2-4 Email, 2-7 Data …).
2. **One suggestion per area**, written from `risk_suggestion_templates`
   (title, cause, event, impact, category, subcategory, inherent L×I), with the
   actual evidence written into the cause and description. Likelihood +1 when
   any finding is critical or there are 10+ items. Areas without a template get
   a generic version from the ECC area name.
3. **Possible duplicate**: an open risk whose `framework_ref` mentions the area
   is shown as "may already cover this".
4. **Refresh** after every scan (after signals) and nightly at 02:20 UTC, or on
   demand ("Check now"). Untouched wording follows the evidence; edited
   wording is kept. Dismissed → back only when a finding newer than the
   dismissal appears. Pending with no evidence left → `resolved` (fixed before
   approval); reappears if the problem returns.
5. **Notifications**: owner/admin/risk managers get "RISYS suggested N new
   risks" in the bell — and by email through the outbox.

## Decisions (all database functions, role-checked)

| Action | Who | Result |
|---|---|---|
| Approve to register | owner, admin, risk_manager | Risk created **registered** (admitted), approved_by/at set, workflow history "admitted", `source = 'Automated detection'`, `framework_ref = 'NCA ECC <area> (<controls>)'`, every finding in the evidence recorded in `finding_triage` as `created` → this risk (earlier triage decisions stand) |
| Add as draft | + compliance_officer | Same, but **draft** for a reviewer to admit |
| Edit | owner, admin, risk_manager, compliance_officer | Any field, pending only; marks it edited |
| Dismiss (reason ≥ 5 chars) / Restore | owner, admin, risk_manager | |
| Read | the above + auditor | |

Tested in a rolled-back transaction on the test workspace: 5 suggestions
(2-4 Email 5×4, 2-7 Data 4×4, 2-2 Identity 3×4, 2-12 Logging 3×4, 2-6 Mobile
3×3); approving 2-7 created RSK-0009 as registered with 7 findings linked; a
second run created nothing and sent no second notification; dismiss worked.

## Front end

- `src/features/risks/SuggestedRisksPage.jsx` — `/app/risks/suggestions`:
  awaiting approval / approved / dismissed / fixed before approval; each row
  has a one-click Approve to register and opens its own page.
- `src/features/risks/SuggestionDetailPage.jsx` — `/app/risks/suggestions/:id`:
  the risk on its own page (record layout): editable risk, classification and
  score, ownership on the left; inherent score, possible duplicate, the
  evidence that raised it and Dismiss on the right; Save / Add as draft /
  Approve to register in the header. Leave guard on unsaved edits.
- `src/features/risks/suggestionParts.jsx` — shared score badge, scale, evidence list.
- `src/hooks/useRiskSuggestions.js` — data and actions; `usePendingSuggestionCount`.
- Sidebar: **Suggested risks** under Risk Register with a count badge.
- Risk Register: a banner when suggestions are waiting.
- `src/lib/risks.js` — `Automated detection` added to `RISK_SOURCES`.
- `src/locales/ar.json` — new strings and the official Arabic ECC area names.

Suggestion text (title, cause …) is generated in English.

## To do by hand

Nothing to deploy server-side. The first suggestions appear after the next
scan, the nightly run, or **Check now** on the page.

## Recommended actions — 20261001150310 (applied)

`risk_suggestions_recommended_actions`:

- Each finding in a suggestion's evidence now carries its `recommendation`
  (the fix, e.g. "SharePoint admin center → Policies → Sharing …") and its
  link; each failing measurement carries its target ("Target: SharePoint and
  OneDrive do not allow links that open without signing in.").
- `risk_suggestions.evidence_at_approval` — the evidence when the suggestion
  was approved: the baseline for the risk's to-do list.
- Approved suggestions keep being refreshed; when the area has nothing open
  any more their evidence empties.
- People who can read a risk can read the suggestion behind it (new select
  policy), so the risk owner sees the actions even without a risk-manager role.

Front end:

- `src/features/risks/RecommendedActions.jsx` — on the Overview tab of any risk
  with source "Automated detection": progress ("1 of 5 done"), open actions
  with their fix, critical first, "New since approval" for problems found
  later, links to the finding / control / Microsoft, **Create task** (opens
  New task linked to the risk with title, fix and priority pre-filled), and
  the actions fixed since approval. Nothing is ticked by hand: an action is
  done when the next scan no longer reports it.
- `CreateTaskPage.jsx` accepts `?title=&description=&priority=` as well as
  `?risk=`.
- The suggestion page says the evidence becomes the risk's Recommended actions.

Tested in a rolled-back transaction: approve 2-7 → RSK-0009 with 10 actions;
resolve the "Anyone links allowed" finding and refresh → 9 open, 1 done.
