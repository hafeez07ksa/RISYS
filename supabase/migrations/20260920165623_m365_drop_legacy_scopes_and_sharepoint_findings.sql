-- The old M365 settings page stored a scope list that no longer matches the
-- connector's sources, and would silently switch the new app-consent source off.
update public.org_connectors
   set meta = meta - 'm365_scopes'
 where connector_id = 'entra' and meta ? 'm365_scopes';

-- Site sharing moved to the SharePoint connector. Close the old M365 rows
-- rather than delete them, so the history stays readable.
update public.m365_findings
   set status = 'resolved', resolved_at = coalesce(resolved_at, now()), updated_at = now()
 where status = 'open' and (category = 'sharepoint' or source = 'sharepoint');;
