
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with placeholder webhook URLs
INSERT INTO app_settings (key, value, description) VALUES
  ('n8n_chat_webhook',    'https://your-n8n-instance.com/webhook/chat',    'n8n chatbot webhook URL — swap between test and production here'),
  ('n8n_contact_webhook', 'https://your-n8n-instance.com/webhook/contact', 'n8n contact form webhook URL')
ON CONFLICT (key) DO NOTHING;

-- Public read access (anon key can read settings — no sensitive data stored here)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
  ON app_settings FOR SELECT
  TO anon, authenticated
  USING (true);
;
