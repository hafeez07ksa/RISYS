create table if not exists nca_cscc_canonical (
  id integer primary key,
  domain_id text not null,
  domain_name text not null,
  subdomain_id text not null,
  subdomain_name text not null,
  subdomain_objective text,
  control_id text not null,
  control_type text not null,
  control_text text not null
);
alter table nca_cscc_canonical enable row level security;
create policy "Public read access" on nca_cscc_canonical for select using (true);;
