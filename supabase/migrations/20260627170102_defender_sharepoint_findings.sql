
-- ── Defender for Cloud / Security Alerts ─────────────────────────────────────
create table if not exists defender_findings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  finding_id    text not null,
  source        text not null,
  category      text not null,
  severity      text not null check (severity in ('critical','warning','info')),
  title         text not null,
  description   text,
  control       text,
  recommendation text,
  subject_id    text,
  subject_name  text,
  subject_email text,
  raw_data      jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (org_id, finding_id)
);

alter table defender_findings enable row level security;

create policy "org members can read defender findings"
  on defender_findings for select
  using (
    org_id in (
      select org_id from organization_members where user_id = auth.uid()
    )
  );

create index if not exists defender_findings_org_id_idx on defender_findings (org_id);
create index if not exists defender_findings_severity_idx on defender_findings (org_id, severity);

-- ── SharePoint Security Findings ──────────────────────────────────────────────
create table if not exists sharepoint_findings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  finding_id    text not null,
  source        text not null,
  category      text not null,
  severity      text not null check (severity in ('critical','warning','info')),
  title         text not null,
  description   text,
  control       text,
  recommendation text,
  subject_id    text,
  subject_name  text,
  subject_email text,
  subject_url   text,
  raw_data      jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (org_id, finding_id)
);

alter table sharepoint_findings enable row level security;

create policy "org members can read sharepoint findings"
  on sharepoint_findings for select
  using (
    org_id in (
      select org_id from organization_members where user_id = auth.uid()
    )
  );

create index if not exists sharepoint_findings_org_id_idx on sharepoint_findings (org_id);
create index if not exists sharepoint_findings_severity_idx on sharepoint_findings (org_id, severity);

-- ── Updated_at triggers ───────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger defender_findings_updated_at
  before update on defender_findings
  for each row execute function update_updated_at_column();

create trigger sharepoint_findings_updated_at
  before update on sharepoint_findings
  for each row execute function update_updated_at_column();
;
