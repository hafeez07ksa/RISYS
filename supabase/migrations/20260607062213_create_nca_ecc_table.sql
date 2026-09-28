
CREATE TABLE nca_ecc (
    id SERIAL PRIMARY KEY,
    framework VARCHAR(20) NOT NULL DEFAULT 'NCA ECC',
    version VARCHAR(20) NOT NULL DEFAULT 'ECC-2:2024',
    domain_id VARCHAR(10) NOT NULL,
    domain_name VARCHAR(100) NOT NULL,
    subdomain_id VARCHAR(10) NOT NULL,
    subdomain_name VARCHAR(150) NOT NULL,
    subdomain_objective TEXT,
    control_id VARCHAR(20) NOT NULL UNIQUE,
    control_type VARCHAR(20) NOT NULL CHECK (control_type IN ('Main Control', 'Sub-Control')),
    control_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE nca_ecc IS 'NCA Essential Cybersecurity Controls (ECC-2:2024) - All 4 domains, 28 subdomains, controls and sub-controls';
COMMENT ON COLUMN nca_ecc.domain_id IS 'Top-level domain number e.g. 1, 2, 3, 4';
COMMENT ON COLUMN nca_ecc.subdomain_id IS 'Subdomain reference e.g. 1-1, 2-3';
COMMENT ON COLUMN nca_ecc.control_id IS 'Full control reference number e.g. 1-1-1, 2-2-3-1';
COMMENT ON COLUMN nca_ecc.control_type IS 'Main Control (x-y-z) or Sub-Control (x-y-z-n)';
;
