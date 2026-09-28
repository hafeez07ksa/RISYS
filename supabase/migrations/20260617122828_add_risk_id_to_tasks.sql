ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS risk_id uuid REFERENCES public.risks(id) ON DELETE SET NULL;;
