
-- Fix ALL policies missing WITH CHECK to enforce org isolation on writes

-- compliance_statuses
DROP POLICY IF EXISTS "managers and admins can manage compliance statuses" ON compliance_statuses;
CREATE POLICY "managers and admins can manage compliance statuses"
ON compliance_statuses FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['risk_manager','admin'])))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['risk_manager','admin'])));

-- control_framework_mappings
DROP POLICY IF EXISTS "managers and admins can manage mappings" ON control_framework_mappings;
CREATE POLICY "managers and admins can manage mappings"
ON control_framework_mappings FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['risk_manager','admin'])))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['risk_manager','admin'])));

-- risk_audit_log
DROP POLICY IF EXISTS "org_audit" ON risk_audit_log;
CREATE POLICY "org_audit"
ON risk_audit_log FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- risk_control_mappings
DROP POLICY IF EXISTS "org_mappings" ON risk_control_mappings;
CREATE POLICY "org_mappings"
ON risk_control_mappings FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- risk_controls
DROP POLICY IF EXISTS "org_controls" ON risk_controls;
CREATE POLICY "org_controls"
ON risk_controls FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- risk_evidence
DROP POLICY IF EXISTS "org_evidence" ON risk_evidence;
CREATE POLICY "org_evidence"
ON risk_evidence FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- risk_kris
DROP POLICY IF EXISTS "org_kris" ON risk_kris;
CREATE POLICY "org_kris"
ON risk_kris FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- risk_loss_events
DROP POLICY IF EXISTS "org_loss_events" ON risk_loss_events;
CREATE POLICY "org_loss_events"
ON risk_loss_events FOR ALL
USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
;
