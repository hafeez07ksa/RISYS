
CREATE TABLE IF NOT EXISTS cst_rt13 (
  id            SERIAL PRIMARY KEY,
  domain_id     TEXT NOT NULL,
  domain_name   TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  category_name TEXT NOT NULL,
  control_id    TEXT NOT NULL UNIQUE,
  actor         TEXT,
  control_text  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cst_rt13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cst_rt13" ON cst_rt13 FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cst_rt13_domain ON cst_rt13(domain_id);
CREATE INDEX IF NOT EXISTS idx_cst_rt13_actor ON cst_rt13(actor);
;
