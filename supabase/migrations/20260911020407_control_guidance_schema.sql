-- ═══════════════════════════════════════════════════════════════════════════
--  Per-control reference content.
--
--  A control detail page needs several kinds of material about the same
--  requirement: the published clause (already in nca_ecc), NCA's own
--  implementation guidance, and RISYS's internal reading of it. These are
--  different sources with different authority, so they are stored as separate
--  rows against a shared source key rather than merged into one blob — the UI
--  must always be able to say where a sentence came from.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists guidance_sources (
  source        text primary key,
  label         text not null,
  publisher     text,
  version       text,
  authority     text not null default 'reference'
                check (authority in ('regulatory','reference','internal')),
  note          text,
  sort_order    int not null default 100
);

comment on table guidance_sources is
  'Provenance for control guidance. authority drives how prominently the UI presents it and whether it may be cited in a client deliverable.';

insert into guidance_sources (source, label, publisher, version, authority, note, sort_order) values
  ('nca_official', 'NCA implementation guidance', 'National Cybersecurity Authority', 'ECC-1:2018 guide (Oct 2023)', 'regulatory',
   'Published against ECC-1:2018. NCA had not reissued the implementation guide for ECC-2:2024 at time of load, so guidance for controls whose wording changed in ECC-2 may lag the clause text shown above it.', 10),
  ('risys', 'RISYS commentary', 'RISYS', 'Internal, 2026', 'internal',
   'Internal reading of the control: what it means in plain terms, how to implement it, what evidence to keep, and what RISYS can measure. Not a regulatory source.', 20)
on conflict (source) do nothing;

create table if not exists control_guidance (
  id             uuid primary key default gen_random_uuid(),
  framework      text not null,
  requirement_id text not null,
  source         text not null references guidance_sources(source) on delete cascade,
  section        text not null,
  ordinal        int  not null default 0,
  level          int  not null default 0,
  body           text not null,
  created_at     timestamptz default now()
);

create index if not exists control_guidance_lookup
  on control_guidance (framework, requirement_id, source, section, ordinal);

comment on column control_guidance.section is
  'tools | guidelines | deliverables (NCA) — plain_terms | how_to | evidence | platforms | in_risys (RISYS).';
comment on column control_guidance.level is
  'Bullet nesting depth as printed in the source. 0 is top level.';

-- Per-control attributes that are not guidance prose
create table if not exists control_meta (
  framework        text not null,
  requirement_id   text not null,
  automation_class text check (automation_class in ('automated','semi_automated','manual_evidence')),
  note             text,
  primary key (framework, requirement_id)
);

comment on column control_meta.automation_class is
  'How far this control can be scored from connector data rather than asserted. Drives the build roadmap and sets client expectations on the detail page.';

-- ── RLS: reference content, readable by any signed-in user ────────────────
alter table guidance_sources  enable row level security;
alter table control_guidance  enable row level security;
alter table control_meta      enable row level security;

drop policy if exists "authenticated can read guidance sources" on guidance_sources;
create policy "authenticated can read guidance sources"
  on guidance_sources for select to authenticated using (true);

drop policy if exists "authenticated can read control guidance" on control_guidance;
create policy "authenticated can read control guidance"
  on control_guidance for select to authenticated using (true);

drop policy if exists "authenticated can read control meta" on control_meta;
create policy "authenticated can read control meta"
  on control_meta for select to authenticated using (true);
;
