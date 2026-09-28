
-- ============================================================
-- ARCHER-PARITY RISK REGISTER MIGRATION
-- ============================================================

-- 1. Extend risks table with all missing Archer fields
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS risk_id          TEXT,
  ADD COLUMN IF NOT EXISTS subcategory      TEXT,
  ADD COLUMN IF NOT EXISTS risk_type        TEXT DEFAULT 'Operational',
  ADD COLUMN IF NOT EXISTS business_unit    TEXT,
  ADD COLUMN IF NOT EXISTS risk_statement   TEXT,
  ADD COLUMN IF NOT EXISTS risk_drivers     TEXT,
  ADD COLUMN IF NOT EXISTS risk_direction   TEXT DEFAULT 'Stable',
  -- Inherent risk (before controls)
  ADD COLUMN IF NOT EXISTS inherent_likelihood INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS inherent_impact     INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS inherent_score      INTEGER GENERATED ALWAYS AS (inherent_likelihood * inherent_impact) STORED,
  -- Residual risk (after controls)
  ADD COLUMN IF NOT EXISTS residual_likelihood INTEGER,
  ADD COLUMN IF NOT EXISTS residual_impact     INTEGER,
  ADD COLUMN IF NOT EXISTS residual_score      INTEGER GENERATED ALWAYS AS (COALESCE(residual_likelihood, inherent_likelihood) * COALESCE(residual_impact, inherent_impact)) STORED,
  -- Risk appetite & review
  ADD COLUMN IF NOT EXISTS risk_appetite    TEXT DEFAULT 'Cautious',
  ADD COLUMN IF NOT EXISTS review_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_frequency TEXT DEFAULT 'Quarterly',
  ADD COLUMN IF NOT EXISTS reviewer_id      UUID,
  ADD COLUMN IF NOT EXISTS approver_id      UUID,
  -- Workflow
  ADD COLUMN IF NOT EXISTS workflow_state   TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by      UUID;

-- Auto-generate risk_id on insert
CREATE OR REPLACE FUNCTION generate_risk_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(risk_id FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM risks
    WHERE org_id = NEW.org_id AND risk_id IS NOT NULL;
  NEW.risk_id := 'RSK-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_risk_id ON risks;
CREATE TRIGGER set_risk_id
  BEFORE INSERT ON risks
  FOR EACH ROW
  WHEN (NEW.risk_id IS NULL)
  EXECUTE FUNCTION generate_risk_id();

-- 2. Controls register
CREATE TABLE IF NOT EXISTS risk_controls (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL,
  control_id        TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  control_type      TEXT DEFAULT 'Preventive', -- Preventive / Detective / Corrective / Compensating
  control_frequency TEXT DEFAULT 'Continuous', -- Continuous / Daily / Weekly / Monthly / Quarterly / Annual / Ad-hoc
  owner_id          UUID,
  effectiveness     INTEGER DEFAULT 3,         -- 1-5: 1=Ineffective, 5=Fully Effective
  testing_status    TEXT DEFAULT 'Not Tested', -- Not Tested / Pass / Fail / Partial
  last_tested_at    TIMESTAMPTZ,
  next_test_date    TIMESTAMPTZ,
  is_automated      BOOLEAN DEFAULT FALSE,
  framework_ref     TEXT,
  notes             TEXT,
  status            TEXT DEFAULT 'active',     -- active / inactive / under_review
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate control_id
CREATE OR REPLACE FUNCTION generate_control_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(control_id FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM risk_controls
    WHERE org_id = NEW.org_id AND control_id IS NOT NULL;
  NEW.control_id := 'CTL-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_control_id ON risk_controls;
CREATE TRIGGER set_control_id
  BEFORE INSERT ON risk_controls
  FOR EACH ROW
  WHEN (NEW.control_id IS NULL)
  EXECUTE FUNCTION generate_control_id();

-- 3. Risk-Control mapping (many-to-many)
CREATE TABLE IF NOT EXISTS risk_control_mappings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  risk_id      UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  control_id   UUID NOT NULL REFERENCES risk_controls(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (risk_id, control_id)
);

-- 4. Evidence table
CREATE TABLE IF NOT EXISTS risk_evidence (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL,
  risk_id         UUID REFERENCES risks(id) ON DELETE SET NULL,
  control_id      UUID REFERENCES risk_controls(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  evidence_type   TEXT DEFAULT 'Document',  -- Document / Screenshot / Log / Attestation / Test Result / Policy
  file_url        TEXT,
  file_name       TEXT,
  file_size       INTEGER,
  evidence_period TEXT,                     -- e.g. "Q1 2025", "FY2024"
  collected_by    UUID,
  collected_at    TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  is_approved     BOOLEAN DEFAULT FALSE,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 5. Loss events
CREATE TABLE IF NOT EXISTS risk_loss_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL,
  risk_id             UUID REFERENCES risks(id) ON DELETE SET NULL,
  event_id            TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  event_date          TIMESTAMPTZ NOT NULL,
  discovery_date      TIMESTAMPTZ,
  gross_loss          NUMERIC(15,2),
  net_loss            NUMERIC(15,2),
  recovery_amount     NUMERIC(15,2),
  currency            TEXT DEFAULT 'USD',
  loss_type           TEXT,                 -- Operational / Legal / Regulatory / Reputational
  root_cause          TEXT,
  root_cause_category TEXT,                 -- People / Process / System / External
  business_unit       TEXT,
  status              TEXT DEFAULT 'open',  -- open / under_review / closed
  workflow_state      TEXT DEFAULT 'draft',
  reported_by         UUID,
  reviewed_by         UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate event_id
CREATE OR REPLACE FUNCTION generate_event_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(event_id FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM risk_loss_events
    WHERE org_id = NEW.org_id AND event_id IS NOT NULL;
  NEW.event_id := 'EVT-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_event_id ON risk_loss_events;
CREATE TRIGGER set_event_id
  BEFORE INSERT ON risk_loss_events
  FOR EACH ROW
  WHEN (NEW.event_id IS NULL)
  EXECUTE FUNCTION generate_event_id();

-- 6. KRIs (Key Risk Indicators)
CREATE TABLE IF NOT EXISTS risk_kris (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL,
  risk_id          UUID REFERENCES risks(id) ON DELETE CASCADE,
  kri_id           TEXT,
  name             TEXT NOT NULL,
  description      TEXT,
  metric_formula   TEXT,
  current_value    NUMERIC,
  unit             TEXT,                    -- %, count, $, days, etc.
  green_threshold  NUMERIC,                 -- value at or below = green
  amber_threshold  NUMERIC,                 -- value at or below = amber
  red_threshold    NUMERIC,                 -- value above = red
  trend            TEXT DEFAULT 'Stable',   -- Increasing / Stable / Decreasing
  rag_status       TEXT DEFAULT 'Green',    -- Green / Amber / Red
  last_updated     TIMESTAMPTZ DEFAULT now(),
  next_review      TIMESTAMPTZ,
  owner_id         UUID,
  frequency        TEXT DEFAULT 'Monthly',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 7. Risk assessments / RCSA campaigns
CREATE TABLE IF NOT EXISTS risk_assessments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  assessment_type   TEXT DEFAULT 'RCSA',     -- RCSA / Top-Down / Bottom-Up / CSA
  scope             TEXT,
  status            TEXT DEFAULT 'draft',    -- draft / active / in_review / completed / archived
  due_date          TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_by        UUID,
  assigned_to       UUID,
  reviewer_id       UUID,
  approver_id       UUID,
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- 8. Assessment risk responses (answers within an RCSA campaign)
CREATE TABLE IF NOT EXISTS risk_assessment_responses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id     UUID NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  risk_id           UUID REFERENCES risks(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL,
  inherent_likelihood INTEGER,
  inherent_impact     INTEGER,
  control_effectiveness INTEGER,
  residual_likelihood INTEGER,
  residual_impact     INTEGER,
  treatment           TEXT,
  notes               TEXT,
  responded_by        UUID,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 9. Risk audit trail
CREATE TABLE IF NOT EXISTS risk_audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL,
  risk_id      UUID,
  control_id   UUID,
  action       TEXT NOT NULL,   -- created / updated / status_changed / approved / control_added / evidence_uploaded
  field_name   TEXT,
  old_value    TEXT,
  new_value    TEXT,
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT now(),
  note         TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risks_org_id ON risks(org_id);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_workflow ON risks(workflow_state);
CREATE INDEX IF NOT EXISTS idx_controls_org_id ON risk_controls(org_id);
CREATE INDEX IF NOT EXISTS idx_control_mappings_risk ON risk_control_mappings(risk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_risk ON risk_evidence(risk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_control ON risk_evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_loss_events_org ON risk_loss_events(org_id);
CREATE INDEX IF NOT EXISTS idx_kris_risk ON risk_kris(risk_id);
CREATE INDEX IF NOT EXISTS idx_audit_risk ON risk_audit_log(risk_id);

-- RLS
ALTER TABLE risk_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_control_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_loss_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_kris ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_controls" ON risk_controls FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_mappings" ON risk_control_mappings FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_evidence" ON risk_evidence FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_loss_events" ON risk_loss_events FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_kris" ON risk_kris FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_assessments" ON risk_assessments FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_responses" ON risk_assessment_responses FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_audit" ON risk_audit_log FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
;
