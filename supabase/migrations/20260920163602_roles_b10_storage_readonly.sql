-- Read-only roles cannot upload or delete evidence files either.
alter policy risk_evidence_upload on storage.objects
  with check (bucket_id = 'risk-evidence' and is_org_member(storage_object_org(name)) and not is_org_readonly(storage_object_org(name)));

alter policy risk_evidence_delete on storage.objects
  using (bucket_id = 'risk-evidence'
         and not is_org_readonly(storage_object_org(name))
         and (is_risk_manager_or_admin(storage_object_org(name))
              or (is_org_member(storage_object_org(name)) and owner_id = (auth.uid())::text)));

alter policy compliance_evidence_upload on storage.objects
  with check (bucket_id = 'compliance-evidence' and is_compliance_writer(storage_object_org(name)));;
