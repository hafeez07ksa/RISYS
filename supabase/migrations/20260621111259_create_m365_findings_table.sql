
CREATE TABLE IF NOT EXISTS m365_findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  finding_id      text NOT NULL,           -- stable key e.g. 'exchange:fwd:user@x.com'
  category        text NOT NULL,           -- 'exchange' | 'sharepoint' | 'teams'
  severity        text NOT NULL,           -- 'critical' | 'warning' | 'info'
  title           text NOT NULL,
  description     text,
  control         text,                    -- NCA ECC / PDPL clause
  recommendation  text,
  subject_id      text,                    -- user UPN or site id
  subject_name    text,                    -- display name or site title
  subject_email   text,
  raw_data        jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT m365_findings_org_finding_unique UNIQUE (org_id, finding_id)
);

ALTER TABLE m365_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read m365_findings"
  ON m365_findings FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_m365_findings_org ON m365_findings(org_id);
CREATE INDEX idx_m365_findings_category ON m365_findings(org_id, category);
CREATE INDEX idx_m365_findings_severity ON m365_findings(org_id, severity);
;
