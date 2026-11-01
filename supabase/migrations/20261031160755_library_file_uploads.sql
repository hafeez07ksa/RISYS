-- ============================================================
-- Files for the evidence library and policy drafts.
--
-- Policy owners and authors, and anyone who adds library evidence, are not
-- always compliance writers, so they could not upload to compliance-evidence.
-- They may now upload under <org>/library/ only. Reading stays as before
-- (any member of the workspace); nobody can overwrite or delete through the
-- API. Viewers and auditors still cannot upload.
-- ============================================================
drop policy if exists compliance_evidence_library_upload on storage.objects;
create policy compliance_evidence_library_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'compliance-evidence'
    and (storage.foldername(name))[2] = 'library'
    and (storage.foldername(name))[3] in ('policies', 'evidence')
    and is_org_member(storage_object_org(name))
    and coalesce(my_role(storage_object_org(name)), '') not in ('viewer', 'auditor')
  );
