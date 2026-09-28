
CREATE TABLE public.sdaia_pdpl (
  id SERIAL PRIMARY KEY,
  framework VARCHAR NOT NULL DEFAULT 'SDAIA PDPL',
  version VARCHAR NOT NULL DEFAULT 'PDPL-IR:2023',
  regulation_part VARCHAR NOT NULL,
  article_id VARCHAR NOT NULL,
  article_title VARCHAR NOT NULL,
  clause_id VARCHAR,
  clause_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sdaia_pdpl IS 'SDAIA Personal Data Protection Law - Implementing Regulation and Transfer Regulation';
COMMENT ON COLUMN public.sdaia_pdpl.regulation_part IS 'Implementing Regulation or Transfer Regulation';
COMMENT ON COLUMN public.sdaia_pdpl.article_id IS 'Article number e.g. Article 1, Article 23';
COMMENT ON COLUMN public.sdaia_pdpl.clause_id IS 'Clause reference e.g. 1, 1a, 2b';
;
