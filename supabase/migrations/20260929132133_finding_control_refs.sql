-- ── Finding → framework requirement keys ─────────────────────────────────────
--
-- Until now a finding carried its control references only as a display label,
-- e.g. "NCA ECC 2-7-2 · Data and Information Protection | SDAIA PDPL-IR Art. 23 · …".
-- Nothing in the database could join on that, so findings and the compliance
-- engine sat side by side instead of being one system.
--
-- This migration gives every stored finding real keys:
--   • finding_control_refs — one row per (finding, requirement). ECC references
--     are a foreign key into nca_ecc, so a label that points at a control that
--     does not exist can no longer be stored silently.
--   • The label stays the source the connectors write (no edge function change
--     and no redeploy); a trigger on each findings table parses it on insert and
--     whenever the label changes. The parser mirrors src/lib/controlRefs.js.
--   • Anything that does not resolve goes to finding_control_ref_issues with the
--     reason, instead of being dropped. A reference problem must never fail the
--     scan that produced the finding.
--
-- Entra ID findings are derived in the browser from entra_users and are not
-- stored, so they are not keyed here; the Entra signals already measure the same
-- requirements (2-2-3-x).
--
-- PDPL references are stored with their regulation part and article. They are
-- not foreign-keyed yet because PDPL is not in framework_requirements_v; that
-- comes with the Frameworks work.

-- ── Parser ───────────────────────────────────────────────────────────────────
create or replace function public.parse_control_label(p_label text)
returns table (pos int, framework text, requirement_id text, pdpl_part text, pdpl_article int, segment text)
language sql immutable set search_path to 'public' as $$
  select s.ord::int,
         case when m.ecc is not null then 'NCA ECC'
              when m.pdpl is not null then 'SDAIA PDPL' end,
         coalesce(m.ecc[1], upper(m.pdpl[1]) || '-' || m.pdpl[2]),
         upper(m.pdpl[1]),
         m.pdpl[2]::int,
         s.seg
    from unnest(string_to_array(coalesce(p_label, ''), '|')) with ordinality as u(raw, ord)
    cross join lateral (select trim(u.raw) as seg, u.ord) s
    cross join lateral (
      select regexp_match(s.seg, 'NCA ECC\s+(\d+(?:-\d+){2,3})', 'i') as ecc,
             regexp_match(s.seg, 'SDAIA PDPL-(IR|TR)\s+Art\.?\s*(\d+)', 'i') as pdpl
    ) m
   where s.seg <> '';
$$;

-- ── Keys ─────────────────────────────────────────────────────────────────────
create table if not exists public.finding_control_refs (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  source_table    text not null check (source_table in ('m365_findings', 'defender_findings', 'sharepoint_findings')),
  finding_row_id  uuid not null,
  connector_id    text not null check (connector_id in ('m365', 'defender', 'sharepoint')),
  framework       text not null check (framework in ('NCA ECC', 'SDAIA PDPL')),
  ecc_control_id  varchar(20) references public.nca_ecc(control_id) on update cascade on delete restrict,
  pdpl_part       text check (pdpl_part in ('IR', 'TR')),
  pdpl_article    int,
  requirement_id  text generated always as (coalesce(ecc_control_id::text, pdpl_part || '-' || pdpl_article::text)) stored,
  position        smallint not null,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint finding_control_refs_ecc_key  check ((framework = 'NCA ECC') = (ecc_control_id is not null)),
  constraint finding_control_refs_pdpl_key check ((framework = 'SDAIA PDPL') = (pdpl_part is not null and pdpl_article is not null)),
  constraint finding_control_refs_unique unique (source_table, finding_row_id, framework, requirement_id)
);

create index if not exists finding_control_refs_req_idx
  on public.finding_control_refs (org_id, framework, requirement_id);
create index if not exists finding_control_refs_row_idx
  on public.finding_control_refs (source_table, finding_row_id);

comment on table public.finding_control_refs is
  'One row per finding and the framework requirement it evidences. Maintained by trigger from the finding''s control label; never written by clients.';

-- Labels that could not be keyed, with the reason. Platform diagnostics only.
create table if not exists public.finding_control_ref_issues (
  id              bigint generated always as identity primary key,
  org_id          uuid references public.organizations(id) on delete cascade,
  source_table    text not null,
  finding_row_id  uuid not null,
  finding_id      text,
  segment         text,
  problem         text not null,
  seen_at         timestamptz not null default now()
);
create unique index if not exists finding_control_ref_issues_uniq
  on public.finding_control_ref_issues (source_table, finding_row_id, coalesce(segment, ''), problem);

-- ── Sync ─────────────────────────────────────────────────────────────────────
create or replace function public.sync_finding_control_refs(
  p_table text, p_row uuid, p_org uuid, p_finding_id text, p_label text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
  v_conn text := case p_table when 'm365_findings' then 'm365'
                              when 'defender_findings' then 'defender'
                              when 'sharepoint_findings' then 'sharepoint' end;
begin
  if v_conn is null then raise exception 'Unsupported findings table %', p_table; end if;

  delete from finding_control_refs       where source_table = p_table and finding_row_id = p_row;
  delete from finding_control_ref_issues where source_table = p_table and finding_row_id = p_row;

  for r in select * from parse_control_label(p_label) loop
    if r.framework is null then
      insert into finding_control_ref_issues (org_id, source_table, finding_row_id, finding_id, segment, problem)
      values (p_org, p_table, p_row, p_finding_id, r.segment, 'unparsed')
      on conflict do nothing;
    elsif r.framework = 'NCA ECC' and not exists (select 1 from nca_ecc where control_id = r.requirement_id) then
      insert into finding_control_ref_issues (org_id, source_table, finding_row_id, finding_id, segment, problem)
      values (p_org, p_table, p_row, p_finding_id, r.segment, 'unknown_ecc_control')
      on conflict do nothing;
    else
      insert into finding_control_refs
        (org_id, source_table, finding_row_id, connector_id, framework, ecc_control_id, pdpl_part, pdpl_article, position, is_primary)
      values
        (p_org, p_table, p_row, v_conn, r.framework,
         case when r.framework = 'NCA ECC' then r.requirement_id end,
         r.pdpl_part, r.pdpl_article, r.pos, r.pos = 1)
      on conflict on constraint finding_control_refs_unique do nothing;
    end if;
  end loop;
end $$;

create or replace function public.trg_finding_control_refs()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    delete from finding_control_refs       where source_table = tg_table_name and finding_row_id = old.id;
    delete from finding_control_ref_issues where source_table = tg_table_name and finding_row_id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' or new.control is distinct from old.control then
    begin
      perform sync_finding_control_refs(tg_table_name, new.id, new.org_id, new.finding_id, new.control);
    exception when others then
      -- A reference that cannot be keyed must never fail the scan that wrote
      -- the finding. Record why and move on.
      raise warning 'finding_control_refs for %.% failed: %', tg_table_name, new.id, sqlerrm;
      begin
        insert into finding_control_ref_issues (org_id, source_table, finding_row_id, finding_id, segment, problem)
        values (new.org_id, tg_table_name, new.id, new.finding_id, left(new.control, 500), 'error: ' || left(sqlerrm, 300))
        on conflict do nothing;
      exception when others then null;
      end;
    end;
  end if;
  return new;
end $$;

drop trigger if exists finding_control_refs_sync on public.m365_findings;
create trigger finding_control_refs_sync
  after insert or update of control or delete on public.m365_findings
  for each row execute function public.trg_finding_control_refs();

drop trigger if exists finding_control_refs_sync on public.defender_findings;
create trigger finding_control_refs_sync
  after insert or update of control or delete on public.defender_findings
  for each row execute function public.trg_finding_control_refs();

drop trigger if exists finding_control_refs_sync on public.sharepoint_findings;
create trigger finding_control_refs_sync
  after insert or update of control or delete on public.sharepoint_findings
  for each row execute function public.trg_finding_control_refs();

-- ── Access ───────────────────────────────────────────────────────────────────
alter table public.finding_control_refs       enable row level security;
alter table public.finding_control_ref_issues enable row level security;

drop policy if exists "org members can read finding control refs" on public.finding_control_refs;
create policy "org members can read finding control refs" on public.finding_control_refs
  for select to authenticated using (is_org_member(org_id));

drop policy if exists tenant_active_guard on public.finding_control_refs;
create policy tenant_active_guard on public.finding_control_refs
  as restrictive for all
  using ((org_id is null) or is_org_active(org_id))
  with check ((org_id is null) or is_org_active(org_id));

drop policy if exists "platform admins can read ref issues" on public.finding_control_ref_issues;
create policy "platform admins can read ref issues" on public.finding_control_ref_issues
  for select to authenticated using (is_platform_admin());

-- Written only by the trigger.
revoke all on public.finding_control_refs       from anon, authenticated;
revoke all on public.finding_control_ref_issues from anon, authenticated;
grant select on public.finding_control_refs       to authenticated;
grant select on public.finding_control_ref_issues to authenticated;

revoke execute on function public.sync_finding_control_refs(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.trg_finding_control_refs() from public, anon, authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select 'm365_findings' as t, id, org_id, finding_id, control from public.m365_findings
    union all select 'defender_findings', id, org_id, finding_id, control from public.defender_findings
    union all select 'sharepoint_findings', id, org_id, finding_id, control from public.sharepoint_findings
  loop
    perform public.sync_finding_control_refs(r.t, r.id, r.org_id, r.finding_id, r.control);
  end loop;
end $$;
