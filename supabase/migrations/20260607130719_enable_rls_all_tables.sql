
-- Enable RLS on all tables
ALTER TABLE public.nca_ecc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sama_csf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nca_ccc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nca_cscc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nca_dcc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nca_tcc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nca_ncnicc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdaia_pdpl ENABLE ROW LEVEL SECURITY;

-- Public read-only policies for all tables
CREATE POLICY "Allow public read" ON public.nca_ecc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.sama_csf FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.nca_ccc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.nca_cscc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.nca_dcc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.nca_tcc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.nca_ncnicc FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.sdaia_pdpl FOR SELECT USING (true);
;
