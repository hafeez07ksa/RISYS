
CREATE TABLE IF NOT EXISTS nca_ccc (
  id SERIAL PRIMARY KEY,
  framework VARCHAR,
  version VARCHAR,
  domain_id VARCHAR,
  domain_name VARCHAR,
  subdomain_id VARCHAR,
  subdomain_name VARCHAR,
  subdomain_objective TEXT,
  control_id VARCHAR,
  control_type VARCHAR,
  control_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nca_cscc (
  id SERIAL PRIMARY KEY,
  framework VARCHAR,
  version VARCHAR,
  domain_id VARCHAR,
  domain_name VARCHAR,
  subdomain_id VARCHAR,
  subdomain_name VARCHAR,
  subdomain_objective TEXT,
  control_id VARCHAR,
  control_type VARCHAR,
  control_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
;
