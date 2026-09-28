
-- Add source tracking fields to risks table
ALTER TABLE public.risks 
  ADD COLUMN IF NOT EXISTS source_connector  text,
  ADD COLUMN IF NOT EXISTS source_entity_id  text,
  ADD COLUMN IF NOT EXISTS source_entity_name text,
  ADD COLUMN IF NOT EXISTS source_finding    text;

-- Seed the existing "No MFA or 2FA" risk with source info from description
UPDATE public.risks 
SET source_connector = 'entra',
    source_finding = 'MFA Not Registered'
WHERE title ILIKE '%MFA%' OR title ILIKE '%2FA%';

-- Seed NCA ECC 2-1-2 compliance status as not_compliant 
-- since we have 6 users with No MFA (auto-derived from Entra findings)
INSERT INTO public.compliance_statuses (org_id, framework, requirement_id, status, notes, updated_at)
SELECT 
  o.id,
  'NCA ECC',
  '2-1-2',
  'not_compliant',
  'Auto-derived: 6 of 6 Entra ID users have no MFA registered. Source: Microsoft Entra ID sync.',
  now()
FROM organizations o
ON CONFLICT (org_id, framework, requirement_id) DO UPDATE
  SET status = 'not_compliant',
      notes = EXCLUDED.notes,
      updated_at = now();
;
