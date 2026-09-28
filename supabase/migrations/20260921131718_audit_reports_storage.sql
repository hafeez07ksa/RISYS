-- Two private buckets. Paths follow the existing convention: <org_id>/<folder>/<file>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('audit-evidence', 'audit-evidence', false, 52428800),
       ('reports',        'reports',        false, 26214400)
on conflict (id) do update set public = false;

-- Audit evidence: every member reads; anyone but a viewer uploads (an auditor
-- files workpapers, a control owner answers a request — the table policy
-- decides whether the upload is recorded against a request); only audit writers
-- or the uploader delete.
create policy audit_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'audit-evidence' and is_org_member(storage_object_org(name)));
create policy audit_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-evidence' and is_org_member(storage_object_org(name))
              and my_role(storage_object_org(name)) <> 'viewer');
create policy audit_evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audit-evidence'
         and (is_audit_writer(storage_object_org(name)) or owner_id = (auth.uid())::text));

-- Reports: every member reads the archive; the reporting roles write it;
-- nobody deletes an archived report.
create policy reports_read on storage.objects for select to authenticated
  using (bucket_id = 'reports' and is_org_member(storage_object_org(name)));
create policy reports_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and can_generate_reports(storage_object_org(name)));;
