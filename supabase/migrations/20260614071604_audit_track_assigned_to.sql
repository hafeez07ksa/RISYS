create or replace function public.audit_risk_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  col text;
  oldv text; newv text;
  tracked text[] := array['title','description','risk_statement','category','subcategory','risk_type',
    'business_unit','status','treatment','treatment_notes','owner_id','assigned_to','reviewer_id','approver_id',
    'inherent_likelihood','inherent_impact','residual_likelihood','residual_impact',
    'risk_appetite','risk_direction','review_frequency','review_date','workflow_state','source'];
begin
  if tg_op = 'INSERT' then
    insert into risk_audit_log (org_id, risk_id, action, performed_by, note)
    values (new.org_id, new.id, 'created', new.created_by, 'Risk "' || new.title || '" created (' || coalesce(new.risk_id,'') || ')');
    return new;
  end if;
  foreach col in array tracked loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into oldv, newv using old, new;
    if oldv is distinct from newv then
      insert into risk_audit_log (org_id, risk_id, action, field_name, old_value, new_value, performed_by)
      values (new.org_id, new.id, 'field_changed', col, oldv, newv, auth.uid());
    end if;
  end loop;
  return new;
end $$;;
