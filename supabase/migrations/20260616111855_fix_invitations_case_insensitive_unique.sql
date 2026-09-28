
-- Drop the case-sensitive unique constraint and replace with a
-- case-insensitive functional index so sara@co.com and Sara@co.com
-- are treated as the same invitation within an org.
ALTER TABLE public.org_invitations DROP CONSTRAINT IF EXISTS org_invitations_org_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_org_id_email_lower_idx
  ON public.org_invitations (org_id, lower(email));
;
