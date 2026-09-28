alter table public.nca_ecc
  add column if not exists domain_name_ar          text,
  add column if not exists subdomain_name_ar       text,
  add column if not exists subdomain_objective_ar  text,
  add column if not exists control_text_ar         text;
comment on column public.nca_ecc.control_text_ar is
  'Official NCA Arabic text of the control (binding version). Shown when the UI language is Arabic.';;
