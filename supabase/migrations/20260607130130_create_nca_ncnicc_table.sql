
CREATE TABLE public.nca_ncnicc (
  id SERIAL PRIMARY KEY,
  framework VARCHAR NOT NULL DEFAULT 'NCA NCNICC',
  version VARCHAR NOT NULL DEFAULT 'NCNICC-1:2024',
  domain_id VARCHAR NOT NULL,
  domain_name VARCHAR NOT NULL,
  subdomain_id VARCHAR NOT NULL,
  subdomain_name VARCHAR NOT NULL,
  subdomain_objective TEXT,
  control_id VARCHAR NOT NULL,
  control_type VARCHAR NOT NULL CHECK (control_type IN ('Main Control', 'Sub-Control')),
  control_text TEXT NOT NULL,
  applicability_s1 VARCHAR CHECK (applicability_s1 IN ('Required', 'Recommended', NULL)),
  applicability_s2 VARCHAR CHECK (applicability_s2 IN ('Required', 'Recommended', NULL)),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.nca_ncnicc IS 'NCA Non-CNI Private Sector Organizations Cybersecurity Controls (NCNICC-1:2024)';
COMMENT ON COLUMN public.nca_ncnicc.applicability_s1 IS 'Applicability for Segment 1: Large Organizations (>250 employees or >200M SAR revenue)';
COMMENT ON COLUMN public.nca_ncnicc.applicability_s2 IS 'Applicability for Segment 2: Small and Medium Organizations (6-249 employees or 3-200M SAR revenue)';
;
