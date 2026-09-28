
-- Entra directory users synced from Microsoft Graph
CREATE TABLE IF NOT EXISTS public.entra_users (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Graph identity
  entra_id            text NOT NULL,                   -- Graph user objectId
  user_principal_name text,                            -- UPN / work email
  display_name        text,
  given_name          text,
  surname             text,
  job_title           text,
  department          text,
  office_location     text,
  mail                text,                            -- SMTP address (may differ from UPN)
  mobile_phone        text,

  -- Account state
  account_enabled     boolean DEFAULT true,
  user_type           text DEFAULT 'Member',           -- Member | Guest
  created_datetime    timestamptz,
  last_sign_in        timestamptz,                     -- from signInActivity (requires P1)

  -- MFA / auth methods (from userRegistrationDetails)
  is_mfa_registered   boolean DEFAULT false,
  is_mfa_capable      boolean DEFAULT false,
  is_sspr_registered  boolean DEFAULT false,
  is_passwordless_capable boolean DEFAULT false,
  default_mfa_method  text,                            -- e.g. microsoftAuthenticatorPush
  methods_registered  jsonb DEFAULT '[]',              -- array of method names

  -- Assigned roles (directory roles this user holds)
  directory_roles     jsonb DEFAULT '[]',              -- [{id, displayName}]
  is_privileged       boolean DEFAULT false,           -- true if holds any dir role

  -- Risk signals
  risk_level          text DEFAULT 'none',             -- none | low | medium | high (from Identity Protection)

  -- Sync metadata
  synced_at           timestamptz DEFAULT now(),
  raw_data            jsonb DEFAULT '{}',

  UNIQUE (org_id, entra_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS entra_users_org_id_idx          ON public.entra_users(org_id);
CREATE INDEX IF NOT EXISTS entra_users_account_enabled_idx ON public.entra_users(org_id, account_enabled);
CREATE INDEX IF NOT EXISTS entra_users_mfa_idx             ON public.entra_users(org_id, is_mfa_registered);
CREATE INDEX IF NOT EXISTS entra_users_privileged_idx      ON public.entra_users(org_id, is_privileged);

-- RLS
ALTER TABLE public.entra_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read entra_users"
  ON public.entra_users FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service role full access entra_users"
  ON public.entra_users FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.entra_users IS
  'Microsoft Entra ID directory users synced via Graph API. Includes MFA registration state, directory roles, and risk signals. Synced by the entra-directory edge function.';
;
