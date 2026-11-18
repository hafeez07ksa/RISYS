-- Risk report: one archived PDF per risk, the same path as every other report.
--
--   report_risk_data(p_risk)   SECURITY INVOKER: everything about one risk that
--                              the person generating it is allowed to read, in
--                              one JSON document (the risk, scores and bands,
--                              controls and tests, treatment, acceptances, KRIs,
--                              loss events, reviews, evidence metadata, linked
--                              findings, tasks, discussion and workflow history).
--                              File links and storage paths are left out.
--   report_runs.risk_id        which risk a 'risk_report' run is about. Set null
--                              if the risk is later deleted; the archived
--                              snapshot keeps its reference and content.

alter table public.report_runs add column if not exists risk_id uuid references public.risks(id) on delete set null;
create index if not exists report_runs_risk on public.report_runs (risk_id) where risk_id is not null;

alter table public.report_runs drop constraint if exists report_runs_report_type_check;
alter table public.report_runs add constraint report_runs_report_type_check
  check (report_type = any (array['board_pack', 'ecc_status', 'ccc_status', 'pdpl_status', 'audit_report', 'risk_report']));

create or replace function public.report_risk_data(p_risk uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare r risks; v jsonb;
begin
  select * into r from risks where id = p_risk;
  if not found then raise exception 'Risk not found, or not visible to you'; end if;

  select jsonb_build_object(
    'generated_at', now(),
    'risk', to_jsonb(r),
    'inherent_band', risk_score_band(r.org_id, r.inherent_likelihood * r.inherent_impact),
    'residual_band', risk_score_band(r.org_id, r.residual_likelihood * r.residual_impact),
    'org', (select jsonb_build_object('id', o.id, 'name', o.name) from organizations o where o.id = r.org_id),
    'people', (select coalesce(jsonb_object_agg(p.id, coalesce(nullif(btrim(p.full_name), ''), p.email)), '{}'::jsonb)
                 from profiles p where p.id in (select m.user_id from organization_members m where m.org_id = r.org_id)),
    'tolerance', (select to_jsonb(t) from risk_tolerances t where t.org_id = r.org_id and t.category = r.category limit 1),
    'controls', (select coalesce(jsonb_agg(jsonb_build_object('mapping', to_jsonb(m), 'control', to_jsonb(c)) order by c.control_id, c.name), '[]'::jsonb)
                   from risk_control_mappings m join risk_controls c on c.id = m.control_id where m.risk_id = p_risk),
    'control_tests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.test_date desc nulls last), '[]'::jsonb)
                        from risk_control_tests t where t.control_id in (select control_id from risk_control_mappings where risk_id = p_risk)),
    'score_history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.assessed_at), '[]'::jsonb) from risk_score_history h where h.risk_id = p_risk),
    'treatment_options', (select coalesce(jsonb_agg(to_jsonb(o) order by o.option), '[]'::jsonb) from risk_treatment_options o where o.risk_id = p_risk),
    'treatment_plans', (select coalesce(jsonb_agg(to_jsonb(pl) order by pl.created_at), '[]'::jsonb) from risk_treatment_plans pl where pl.risk_id = p_risk),
    'treatment_actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.target_date nulls last, a.created_at), '[]'::jsonb) from risk_treatment_actions a where a.risk_id = p_risk),
    'acceptances', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from risk_exceptions e where e.risk_id = p_risk),
    'kris', (select coalesce(jsonb_agg(to_jsonb(k) order by k.name), '[]'::jsonb) from risk_kris k where k.risk_id = p_risk),
    'loss_events', (select coalesce(jsonb_agg(to_jsonb(l) order by l.event_date desc nulls last), '[]'::jsonb) from risk_loss_events l where l.risk_id = p_risk),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(rv) order by rv.created_at desc), '[]'::jsonb) from risk_reviews rv where rv.risk_id = p_risk),
    'evidence', (select coalesce(jsonb_agg((to_jsonb(ev) - 'file_url' - 'file_path') order by ev.collected_at desc nulls last, ev.created_at desc), '[]'::jsonb)
                   from risk_evidence ev where ev.risk_id = p_risk),
    'findings', (select coalesce(jsonb_agg(to_jsonb(f) order by f.severity, f.decided_at), '[]'::jsonb) from finding_triage f where f.risk_id = p_risk),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(tk) order by tk.due_at nulls last, tk.created_at), '[]'::jsonb) from tasks tk where tk.risk_id = p_risk),
    'collaborators', (select coalesce(jsonb_agg(c.user_id), '[]'::jsonb) from risk_collaborators c where c.risk_id = p_risk),
    'comments', (select coalesce(jsonb_agg(to_jsonb(cm) order by cm.created_at), '[]'::jsonb) from risk_comments cm where cm.risk_id = p_risk),
    'workflow', (select coalesce(jsonb_agg(to_jsonb(w) order by w.performed_at), '[]'::jsonb) from risk_workflow_history w where w.risk_id = p_risk),
    'submission', (select jsonb_build_object('ref', s.ref, 'submitted_by', s.submitted_by, 'submitted_at', s.submitted_at, 'source', s.source)
                     from risk_submissions s where s.risk_id = p_risk limit 1)
  ) into v;
  return v;
end $$;
revoke all on function public.report_risk_data(uuid) from public, anon;
grant execute on function public.report_risk_data(uuid) to authenticated;
