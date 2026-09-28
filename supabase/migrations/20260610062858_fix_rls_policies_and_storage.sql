
-- Fix RLS policies to use correct subquery pattern (matching what works for 'risks' table)
DROP POLICY IF EXISTS "org_evidence"  ON risk_evidence;
DROP POLICY IF EXISTS "org_controls"  ON risk_controls;
DROP POLICY IF EXISTS "org_mappings"  ON risk_control_mappings;
DROP POLICY IF EXISTS "org_kris"      ON risk_kris;
DROP POLICY IF EXISTS "org_loss_events" ON risk_loss_events;
DROP POLICY IF EXISTS "org_assessments" ON risk_assessments;
DROP POLICY IF EXISTS "org_responses"   ON risk_assessment_responses;
DROP POLICY IF EXISTS "org_audit"     ON risk_audit_log;

-- Recreate with the same pattern used by the working 'risks' table RLS
CREATE POLICY "org_evidence"      ON risk_evidence          FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_controls"      ON risk_controls          FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_mappings"      ON risk_control_mappings  FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_kris"          ON risk_kris              FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_loss_events"   ON risk_loss_events       FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_audit"         ON risk_audit_log         FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Also add INSERT policies explicitly since ALL sometimes doesn't cover INSERT with RLS check
CREATE POLICY "org_evidence_insert"    ON risk_evidence         FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_controls_insert"    ON risk_controls         FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_mappings_insert"    ON risk_control_mappings FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_kris_insert"        ON risk_kris             FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_loss_events_insert" ON risk_loss_events      FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_audit_insert"       ON risk_audit_log        FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
;
