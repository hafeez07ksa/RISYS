
CREATE TABLE IF NOT EXISTS public.nca_dcc (
  id SERIAL PRIMARY KEY,
  framework VARCHAR NOT NULL DEFAULT 'NCA DCC',
  version VARCHAR NOT NULL DEFAULT 'DCC-1:2022',
  domain_id VARCHAR NOT NULL,
  domain_name VARCHAR NOT NULL,
  subdomain_id VARCHAR NOT NULL,
  subdomain_name VARCHAR NOT NULL,
  subdomain_objective TEXT,
  control_id VARCHAR NOT NULL,
  control_type VARCHAR NOT NULL CHECK (control_type IN ('Main Control', 'Sub-Control')),
  control_text TEXT NOT NULL,
  data_classification_public BOOLEAN DEFAULT FALSE,
  data_classification_confidential BOOLEAN DEFAULT FALSE,
  data_classification_secret BOOLEAN DEFAULT FALSE,
  data_classification_top_secret BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nca_tcc (
  id SERIAL PRIMARY KEY,
  framework VARCHAR NOT NULL DEFAULT 'NCA TCC',
  version VARCHAR NOT NULL DEFAULT 'TCC-1:2021',
  domain_id VARCHAR NOT NULL,
  domain_name VARCHAR NOT NULL,
  subdomain_id VARCHAR NOT NULL,
  subdomain_name VARCHAR NOT NULL,
  subdomain_objective TEXT,
  control_id VARCHAR NOT NULL,
  control_type VARCHAR NOT NULL CHECK (control_type IN ('Main Control', 'Sub-Control')),
  control_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
;
