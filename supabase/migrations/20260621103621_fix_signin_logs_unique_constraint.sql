
-- Drop old constraint properly
ALTER TABLE entra_signin_logs DROP CONSTRAINT IF EXISTS entra_signin_logs_event_id_key;

-- Add proper multi-tenant unique constraint
ALTER TABLE entra_signin_logs 
ADD CONSTRAINT entra_signin_logs_org_event_unique UNIQUE (org_id, event_id);
;
