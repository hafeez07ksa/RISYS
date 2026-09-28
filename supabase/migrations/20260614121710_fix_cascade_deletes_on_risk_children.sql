
-- Fix risk_evidence: SET NULL → CASCADE
ALTER TABLE public.risk_evidence
  DROP CONSTRAINT IF EXISTS risk_evidence_risk_id_fkey;

ALTER TABLE public.risk_evidence
  ADD CONSTRAINT risk_evidence_risk_id_fkey
  FOREIGN KEY (risk_id)
  REFERENCES public.risks(id)
  ON DELETE CASCADE;

-- Fix risk_loss_events: SET NULL → CASCADE
ALTER TABLE public.risk_loss_events
  DROP CONSTRAINT IF EXISTS risk_loss_events_risk_id_fkey;

ALTER TABLE public.risk_loss_events
  ADD CONSTRAINT risk_loss_events_risk_id_fkey
  FOREIGN KEY (risk_id)
  REFERENCES public.risks(id)
  ON DELETE CASCADE;

-- Fix risk_treatment_updates: cascade through treatment_actions (already cascades risk→actions, now actions→updates)
ALTER TABLE public.risk_treatment_updates
  DROP CONSTRAINT IF EXISTS risk_treatment_updates_action_id_fkey;

ALTER TABLE public.risk_treatment_updates
  ADD CONSTRAINT risk_treatment_updates_action_id_fkey
  FOREIGN KEY (action_id)
  REFERENCES public.risk_treatment_actions(id)
  ON DELETE CASCADE;
;
