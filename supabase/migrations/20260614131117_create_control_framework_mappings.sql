
-- Maps org controls to specific framework requirement clauses
CREATE TABLE IF NOT EXISTS public.control_framework_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  control_id    uuid NOT NULL REFERENCES public.risk_controls(id) ON DELETE CASCADE,
  framework     text NOT NULL,  -- 'NCA ECC' | 'SAMA CSF' | 'SDAIA PDPL' | etc.
  requirement_id text NOT NULL, -- matches control_id / clause_id in the framework table
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (org_id, control_id, framework, requirement_id)
);

ALTER TABLE public.control_framework_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read mappings"
  ON public.control_framework_mappings FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "managers and admins can manage mappings"
  ON public.control_framework_mappings FOR ALL
  USING (org_id IN (
    SELECT org_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('risk_manager','admin')
  ));

-- Compliance status overrides per org per framework requirement
-- Allows manual override of computed status (e.g. N/A, In Progress)
CREATE TABLE IF NOT EXISTS public.compliance_statuses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  framework      text NOT NULL,
  requirement_id text NOT NULL,
  status         text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('compliant','partial','not_compliant','not_applicable','in_progress','not_started')),
  notes          text,
  updated_by     uuid REFERENCES auth.users(id),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (org_id, framework, requirement_id)
);

ALTER TABLE public.compliance_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read compliance statuses"
  ON public.compliance_statuses FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "managers and admins can manage compliance statuses"
  ON public.compliance_statuses FOR ALL
  USING (org_id IN (
    SELECT org_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('risk_manager','admin')
  ));
;
