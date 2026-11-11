-- ── 1. sdaia_pdpl ───────────────────────────────────────────────────────────
alter table public.sdaia_pdpl
  alter column regulation_part type text,
  alter column article_id type text,
  alter column article_title type text,
  alter column clause_id type text,
  add column if not exists control_id          varchar,
  add column if not exists control_type        text,
  add column if not exists control_text        text,
  add column if not exists control_text_ar     text,
  add column if not exists domain_id           varchar,
  add column if not exists domain_name         text,
  add column if not exists domain_name_ar      text,
  add column if not exists subdomain_id        varchar,
  add column if not exists subdomain_name      text,
  add column if not exists subdomain_name_ar   text,
  add column if not exists subdomain_objective text,
  add column if not exists parent_control_id   varchar,
  add column if not exists part                text,
  add column if not exists article_no          integer,
  add column if not exists is_requirement      boolean not null default false,
  add column if not exists applies_when        text,
  add column if not exists law_refs            text[] not null default '{}',
  add column if not exists sort_order          integer;

-- Nothing references sdaia_pdpl rows (checked 9 Nov 2026): no statuses,
-- evidence, mappings, policy links or audit scope for PDPL exist yet. Finding
-- keys use the article id (IR-23), which the new ids keep.
delete from public.sdaia_pdpl;

insert into public.sdaia_pdpl
  (framework, version, regulation_part, article_id, article_title, clause_id, clause_text,
   control_id, control_type, control_text, control_text_ar,
   domain_id, domain_name, domain_name_ar, subdomain_id, subdomain_name, subdomain_name_ar, subdomain_objective,
   parent_control_id, part, article_no, is_requirement, applies_when, law_refs, sort_order)
values
/*ROWS*/;

alter table public.sdaia_pdpl
  alter column control_id set not null,
  alter column control_type set not null,
  alter column control_text set not null,
  add constraint sdaia_pdpl_control_id_key unique (control_id),
  add constraint sdaia_pdpl_control_type_check check (control_type in ('Main Control', 'Sub-Control')),
  add constraint sdaia_pdpl_part_check check (part in ('L', 'IR', 'TR')),
  add constraint sdaia_pdpl_applies_when_check check (applies_when is null or applies_when in
    ('public_entity', 'legitimate_interest', 'dpo_required', 'health', 'credit', 'advertising',
     'marketing', 'research', 'minors', 'transfers'));

comment on table public.sdaia_pdpl is
  'SDAIA Personal Data Protection Law, its Implementing Regulation and the Transfer Regulation. One row per article (Main Control) and per numbered paragraph (Sub-Control). is_requirement marks the articles RISYS scores; applies_when names the PDPL scope condition a conditional article depends on.';

