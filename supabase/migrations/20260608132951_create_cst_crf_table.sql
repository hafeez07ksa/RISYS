
CREATE TABLE IF NOT EXISTS cst_crf (
  id            SERIAL PRIMARY KEY,
  domain_id     TEXT NOT NULL,
  domain_name   TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  category_name TEXT NOT NULL,
  control_id    TEXT NOT NULL UNIQUE,
  control_level TEXT,
  control_text  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cst_crf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cst_crf" ON cst_crf FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cst_crf_domain ON cst_crf(domain_id);
CREATE INDEX IF NOT EXISTS idx_cst_crf_category ON cst_crf(category_id);
;
