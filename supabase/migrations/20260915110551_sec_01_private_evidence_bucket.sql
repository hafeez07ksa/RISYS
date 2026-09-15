-- V1: risk-evidence bucket private + tenant-scoped storage policies
-- Applied to project cfyjfmlhquyxgwrekswe on 2026-09-15.

-- Helper: first path segment of a storage object name as uuid (null if malformed)
create or replace function public.storage_object_org(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end $$;

-- Store object paths instead of public URLs
alter table public.risk_evidence add column if not exists file_path text;

update public.risk_evidence
   set file_path = substring(file_url from '/storage/v1/object/public/risk-evidence/(.*)$')
 where file_path is null
   and file_url like '%/storage/v1/object/public/risk-evidence/%';

update public.risk_evidence set file_url = null where file_path is not null;

comment on column public.risk_evidence.file_url is
  'DEPRECATED: public URLs are no longer issued. Use file_path + short-lived signed URLs.';

-- Make the bucket private
update storage.buckets set public = false where id = 'risk-evidence';

-- Replace cross-tenant storage policies
drop policy if exists risk_evidence_read   on storage.objects;
drop policy if exists risk_evidence_upload on storage.objects;
drop policy if exists risk_evidence_delete on storage.objects;

create policy risk_evidence_read on storage.objects
  for select to authenticated
  using (bucket_id = 'risk-evidence'
         and public.is_org_member(public.storage_object_org(name)));

create policy risk_evidence_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'risk-evidence'
              and public.is_org_member(public.storage_object_org(name)));

create policy risk_evidence_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'risk-evidence'
         and (public.is_risk_manager_or_admin(public.storage_object_org(name))
              or (public.is_org_member(public.storage_object_org(name))
                  and owner_id = auth.uid()::text)));

-- compliance-evidence: same shape, now suspension-aware
drop policy if exists compliance_evidence_read   on storage.objects;
drop policy if exists compliance_evidence_upload on storage.objects;

create policy compliance_evidence_read on storage.objects
  for select to authenticated
  using (bucket_id = 'compliance-evidence'
         and public.is_org_member(public.storage_object_org(name)));

create policy compliance_evidence_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compliance-evidence'
              and public.is_risk_manager_or_admin(public.storage_object_org(name)));
