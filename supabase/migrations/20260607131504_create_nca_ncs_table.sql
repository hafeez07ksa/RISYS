
CREATE TABLE public.nca_ncs (
  id SERIAL PRIMARY KEY,
  framework VARCHAR NOT NULL DEFAULT 'NCA NCS',
  version VARCHAR NOT NULL DEFAULT 'NCS-1:2020',
  section_id VARCHAR NOT NULL,
  section_name VARCHAR NOT NULL,
  subsection_id VARCHAR,
  subsection_name VARCHAR,
  requirement_id VARCHAR,
  requirement_type VARCHAR CHECK (requirement_type IN ('Accepted Algorithm', 'Accepted Scheme', 'Accepted Protocol', 'Requirement', 'Note', 'Key Lifecycle')),
  strength_level VARCHAR CHECK (strength_level IN ('MODERATE', 'ADVANCED', 'BOTH', NULL)),
  requirement_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.nca_ncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.nca_ncs FOR SELECT USING (true);

COMMENT ON TABLE public.nca_ncs IS 'NCA National Cryptographic Standards (NCS-1:2020) - Cryptographic primitives, schemes, protocols, PKI and Key Lifecycle Management requirements';
;
