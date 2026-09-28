-- Reverting control_guidance_schema.
--
-- The NCA implementation guidance and the RISYS commentary are static reference
-- content: identical for every tenant, versioned with the framework rather than
-- with the client, and never written at runtime. Putting it in Postgres would
-- mean a network round trip per control view to fetch text that could have
-- shipped with the bundle, and a migration every time the guide is reissued.
--
-- It now lives in src/data/eccGuidance.json, lazy-imported by the control
-- detail page so it costs nothing until someone opens a control.
--
-- Org-specific material stays in the database where it belongs:
-- compliance_statuses, control_framework_mappings, org_signal_results.

drop table if exists control_guidance;
drop table if exists control_meta;
drop table if exists guidance_sources;
;
