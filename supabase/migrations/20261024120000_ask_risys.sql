-- ─────────────────────────────────────────────────────────────────────────────
-- Ask RISYS (AI phase 0) — brought into the main project (24 Oct 2026)
--
-- One migration that reproduces what was built and tested on the Risys TEST AI
-- project (uhcqzcsfdjpupxzlsmkc) between 19 and 22 Oct, where it was applied as
-- four migrations (ai_phase0_ask_risys, ai_tools_overdue_sla,
-- ai_overview_tolerance_fix, ai_inherent_vs_current). The function bodies below
-- are the live definitions from that project, so production gets exactly what
-- passed the benchmark trial.
--
-- One deliberate difference from the test project:
--   • Clients cannot switch AI on. On the test project a workspace admin could
--     write ai_settings, including mode 'global' (a provider outside KSA). Here
--     only RISYS platform staff can, from the console, through
--     platform_set_ai_settings(), and every change lands in platform_audit_log.
--
-- What it adds
--   ai_settings        per-organisation switch. Off unless platform staff turn it on.
--   ai_conversations   one row per chat thread, private to the person who asked.
--   ai_messages        the turns of a thread. Written only by the ai-gateway.
--   ai_requests        one row per request: who, which model, where it ran,
--                      tokens, latency, outcome. The AI audit trail.
--   ai_tool_* RPCs     the ONLY way the model sees data. SECURITY INVOKER, so
--                      they run as the signed-in person and RLS decides what
--                      comes back. Read-only: nothing here writes.
--
-- Rules this encodes (AI strategy §25)
--   • AI never sets or changes a status or a score: there is no write tool.
--   • Context is the least needed and is retrieved under the caller's RLS.
--   • Every request is logged.
--   • Tenant AI is off by default.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Settings ────────────────────────────────────────────────────────────────
create table if not exists public.ai_settings (
  org_id              uuid primary key references public.organizations(id) on delete cascade,
  enabled             boolean not null default false,
  -- off: never call a model. in_kingdom: only providers that process in KSA.
  -- global: providers outside KSA are allowed (test data / explicit opt-in only).
  mode                text not null default 'off' check (mode in ('off', 'in_kingdom', 'global')),
  daily_request_limit integer not null default 200 check (daily_request_limit between 0 and 10000),
  notes               text,
  updated_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now()
);
alter table public.ai_settings enable row level security;

-- Members can see whether AI is on (the app needs it to show or hide Ask
-- RISYS). Nobody writes through the API: platform_set_ai_settings() does.
drop policy if exists ai_settings_read on public.ai_settings;
create policy ai_settings_read on public.ai_settings
  for select to authenticated using (is_org_member(org_id));
drop policy if exists ai_settings_admin_write on public.ai_settings;
drop policy if exists tenant_active_guard on public.ai_settings;
create policy tenant_active_guard on public.ai_settings as restrictive
  for all using ((org_id is null) or is_org_active(org_id)) with check ((org_id is null) or is_org_active(org_id));

-- ── Conversations and messages ──────────────────────────────────────────────
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature     text not null default 'ask_risys',
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (org_id, user_id, updated_at desc);
alter table public.ai_conversations enable row level security;

-- A conversation is private to the person who had it. Writes come only from
-- the ai-gateway (service role), so clients get SELECT and nothing else.
drop policy if exists ai_conversations_own_read on public.ai_conversations;
create policy ai_conversations_own_read on public.ai_conversations
  for select to authenticated using (user_id = auth.uid() and is_org_member(org_id));
drop policy if exists tenant_active_guard on public.ai_conversations;
create policy tenant_active_guard on public.ai_conversations as restrictive
  for all using ((org_id is null) or is_org_active(org_id)) with check ((org_id is null) or is_org_active(org_id));

create table if not exists public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  -- Records the answer was built from: [{kind, ref, label, link}]
  sources          jsonb not null default '[]'::jsonb,
  -- Which tools ran for this answer (names and arguments, never results).
  tools_used       jsonb not null default '[]'::jsonb,
  request_id       uuid,
  created_at       timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
alter table public.ai_messages enable row level security;

drop policy if exists ai_messages_own_read on public.ai_messages;
create policy ai_messages_own_read on public.ai_messages
  for select to authenticated using (user_id = auth.uid() and is_org_member(org_id));
drop policy if exists tenant_active_guard on public.ai_messages;
create policy tenant_active_guard on public.ai_messages as restrictive
  for all using ((org_id is null) or is_org_active(org_id)) with check ((org_id is null) or is_org_active(org_id));

-- ── Request log (the AI audit trail) ────────────────────────────────────────
create table if not exists public.ai_requests (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  conversation_id    uuid references public.ai_conversations(id) on delete set null,
  feature            text not null,
  provider           text not null,
  model              text not null,
  -- Where the model processed the request. 'global' = outside KSA.
  processing_region  text not null,
  status             text not null check (status in ('ok', 'error', 'refused', 'limited')),
  error              text,
  tool_calls         jsonb not null default '[]'::jsonb,
  model_calls        integer not null default 0,
  prompt_tokens      integer,
  completion_tokens  integer,
  latency_ms         integer,
  created_at         timestamptz not null default now()
);
create index if not exists ai_requests_org_day_idx on public.ai_requests (org_id, created_at desc);
alter table public.ai_requests enable row level security;

-- Admins and auditors see the organisation's AI log; everyone sees their own.
drop policy if exists ai_requests_read on public.ai_requests;
create policy ai_requests_read on public.ai_requests
  for select to authenticated using (
    is_org_member(org_id) and (user_id = auth.uid() or my_role(org_id) in ('owner', 'admin', 'auditor'))
  );
drop policy if exists tenant_active_guard on public.ai_requests;
create policy tenant_active_guard on public.ai_requests as restrictive
  for all using ((org_id is null) or is_org_active(org_id)) with check ((org_id is null) or is_org_active(org_id));

-- Clients read; only the service role (ai-gateway) and the console RPC write.
revoke all on public.ai_settings, public.ai_conversations, public.ai_messages, public.ai_requests from anon;
revoke insert, update, delete, truncate on public.ai_settings, public.ai_conversations, public.ai_messages, public.ai_requests from authenticated;
grant select on public.ai_settings, public.ai_conversations, public.ai_messages, public.ai_requests to authenticated;
grant all on public.ai_settings, public.ai_conversations, public.ai_messages, public.ai_requests to service_role;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Band from the organisation's matrix, falling back to the shipped thresholds
-- (mirrors bandFor() in src/lib/matrix.js).
CREATE OR REPLACE FUNCTION public.ai_band(p_org uuid, p_l integer, p_i integer)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when p_l is null or p_i is null then null else coalesce(
    (select c->>'band'
       from risk_matrix_config m, jsonb_array_elements(m.cells) c
      where m.org_id = p_org and m.is_active
        and (c->>'l')::int = p_l and (c->>'i')::int = p_i
      limit 1),
    case when p_l * p_i >= 20 then 'critical' when p_l * p_i >= 12 then 'high'
         when p_l * p_i >= 6 then 'medium' else 'low' end) end
$function$;

-- Same rule as ROLE_SETS.findingsReader in src/lib/roles.js.
CREATE OR REPLACE FUNCTION public.ai_can_read_findings(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(my_role(p_org) in ('owner', 'admin', 'risk_manager', 'compliance_officer', 'auditor'), false)
$function$;

-- Incident SLA deadline (mirrors src/lib/sla.js; a due date overrides).
CREATE OR REPLACE FUNCTION public.ai_incident_deadline(p_severity text, p_created timestamp with time zone, p_due timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(p_due, p_created + make_interval(hours => case lower(coalesce(p_severity, ''))
    when 'critical' then 4 when 'high' then 24 when 'medium' then 72
    when 'low' then 168 when 'informational' then 720 else 72 end))
$function$;

-- Requests answered or failed today (Riyadh), for the daily limit. Server only.
CREATE OR REPLACE FUNCTION public.ai_requests_today(p_org uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from ai_requests
   where org_id = p_org and created_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
     and status in ('ok', 'error')
$function$;

-- ── Tools ───────────────────────────────────────────────────────────────────
-- Each returns jsonb. Every list carries `link` (an in-app path) and a stable
-- `ref` so the answer can cite it and the page can turn it into a link.

-- 1. Workspace overview
CREATE OR REPLACE FUNCTION public.ai_tool_overview(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not is_org_member(p_org) then return jsonb_build_object('error', 'not a member of this organisation'); end if;
  select jsonb_build_object(
    'as_of', now(),
    'risks_open', (select count(*) from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed'),
    'risk_levels_note', 'inherent = before controls (what the dashboard shows); current = after controls (residual if scored, otherwise inherent)',
    'open_risks_by_inherent_band', (select coalesce(jsonb_object_agg(coalesce(b, 'not_scored'), n), '{}'::jsonb) from (
        select ai_band(p_org, inherent_likelihood, inherent_impact) b, count(*) n
          from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed' group by 1) r),
    'open_risks_by_current_band', (select coalesce(jsonb_object_agg(coalesce(b, 'not_scored'), n), '{}'::jsonb) from (
        select ai_band(p_org, coalesce(residual_likelihood, inherent_likelihood), coalesce(residual_impact, inherent_impact)) b, count(*) n
          from risks where org_id = p_org and coalesce(workflow_state, 'draft') <> 'closed' group by 1) r),
    'risks_by_state', (select coalesce(jsonb_object_agg(coalesce(workflow_state, 'draft'), n), '{}'::jsonb) from (
        select workflow_state, count(*) n from risks where org_id = p_org group by 1) w),
    'risks_outside_tolerance', (select count(*) from risks where org_id = p_org and tolerance_status in ('breached', 'outside') and coalesce(workflow_state,'draft') <> 'closed'),
    'suggested_risks_pending', (select count(*) from risk_suggestions where org_id = p_org and status = 'pending'),
    'tasks_open', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled')),
    'tasks_overdue', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled') and due_at < now()),
    'tasks_without_due_date', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled') and due_at is null),
    'incidents_open', (select count(*) from incidents where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed')),
    'incidents_open_by_status', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
        select coalesce(status, 'open') st, count(*) n from incidents
         where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed') group by 1) s),
    'incidents_open_note', 'incidents_open counts every unresolved incident, including in_progress; the dashboard tile counts status open only',
    'incidents_past_sla', (select count(*) from incidents where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed')
                             and ai_incident_deadline(severity, created_at, due_at) < now()),
    'compliance_nca_ecc', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from compliance_statuses where org_id = p_org and framework = 'NCA ECC' group by status) s),
    'automated_requirements', (select coalesce(jsonb_object_agg(automated_status, n), '{}'::jsonb)
        from (select automated_status, count(*) n from v_requirement_automation where org_id = p_org group by automated_status) a),
    'open_findings', case when ai_can_read_findings(p_org) then (
        select coalesce(jsonb_object_agg(severity, n), '{}'::jsonb) from (
          select severity, count(*) n from (
            select severity from m365_findings where org_id = p_org and status = 'open'
            union all select severity from defender_findings where org_id = p_org and status = 'open'
            union all select severity from sharepoint_findings where org_id = p_org and status = 'open') f
          group by severity) g)
      else to_jsonb('not visible to your role'::text) end
  ) into v;
  return v;
end $function$;

-- 2. Risk search
CREATE OR REPLACE FUNCTION public.ai_tool_search_risks(p_org uuid, p_query text DEFAULT NULL::text, p_band text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'sort' desc, x->>'ref'), '[]'::jsonb) from (
    select jsonb_build_object(
      'ref', r.risk_id, 'title', r.title, 'category', r.category,
      'workflow_state', r.workflow_state, 'status', r.status,
      'inherent', jsonb_build_object('l', r.inherent_likelihood, 'i', r.inherent_impact, 'score', r.inherent_score,
                                     'band', ai_band(p_org, r.inherent_likelihood, r.inherent_impact)),
      'residual', case when r.residual_likelihood is null then null else
                  jsonb_build_object('l', r.residual_likelihood, 'i', r.residual_impact, 'score', r.residual_score,
                                     'band', ai_band(p_org, r.residual_likelihood, r.residual_impact)) end,
      'current', jsonb_build_object(
          'score', coalesce(r.residual_likelihood, r.inherent_likelihood) * coalesce(r.residual_impact, r.inherent_impact),
          'band', ai_band(p_org, coalesce(r.residual_likelihood, r.inherent_likelihood), coalesce(r.residual_impact, r.inherent_impact)),
          'basis', case when r.residual_likelihood is null then 'inherent only (no residual score yet)' else 'residual' end),
      'band_match', case when p_band is null then null
          when ai_band(p_org, r.inherent_likelihood, r.inherent_impact) = lower(p_band)
           and ai_band(p_org, coalesce(r.residual_likelihood, r.inherent_likelihood), coalesce(r.residual_impact, r.inherent_impact)) = lower(p_band)
            then 'before and after controls'
          when ai_band(p_org, coalesce(r.residual_likelihood, r.inherent_likelihood), coalesce(r.residual_impact, r.inherent_impact)) = lower(p_band)
            then 'after controls only'
          else 'before controls only (reduced by controls)' end,
      'tolerance_status', r.tolerance_status,
      'owner', p.full_name, 'framework_ref', r.framework_ref, 'source', r.source,
      'review_date', r.review_date::date,
      'link', '/app/risks/' || r.id,
      'sort', lpad((coalesce(r.residual_likelihood, r.inherent_likelihood) * coalesce(r.residual_impact, r.inherent_impact))::text, 3, '0')
              || lpad(coalesce(r.inherent_score, 0)::text, 3, '0')) x
    from risks r left join profiles p on p.id = r.owner_id
    where r.org_id = p_org
      and (p_state is null or r.workflow_state = p_state or (p_state = 'open' and coalesce(r.workflow_state,'draft') <> 'closed'))
      and (p_query is null or r.title ilike '%' || p_query || '%' or r.risk_statement ilike '%' || p_query || '%'
           or r.category ilike '%' || p_query || '%' or r.framework_ref ilike '%' || p_query || '%' or r.risk_id ilike p_query)
      and (p_band is null
           or ai_band(p_org, r.inherent_likelihood, r.inherent_impact) = lower(p_band)
           or ai_band(p_org, coalesce(r.residual_likelihood, r.inherent_likelihood),
                      coalesce(r.residual_impact, r.inherent_impact)) = lower(p_band))
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) s
$function$;

-- 3. One risk in full
CREATE OR REPLACE FUNCTION public.ai_tool_get_risk(p_org uuid, p_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare r risks; v jsonb;
begin
  select * into r from risks where org_id = p_org
     and (risk_id = upper(trim(p_ref)) or id::text = trim(p_ref)) limit 1;
  if r.id is null then return jsonb_build_object('error', 'no risk with that reference is visible to you'); end if;
  select jsonb_build_object(
    'ref', r.risk_id, 'title', r.title, 'link', '/app/risks/' || r.id,
    'statement', r.risk_statement, 'cause', r.cause, 'event', r.event, 'impact', r.impact_statement,
    'description', r.description, 'category', r.category, 'subcategory', r.subcategory,
    'business_unit', r.business_unit, 'source', r.source, 'framework_ref', r.framework_ref,
    'workflow_state', r.workflow_state, 'status', r.status, 'treatment', r.treatment,
    'inherent', jsonb_build_object('l', r.inherent_likelihood, 'i', r.inherent_impact, 'score', r.inherent_score,
                                   'band', ai_band(p_org, r.inherent_likelihood, r.inherent_impact)),
    'residual', case when r.residual_likelihood is null then null else
                jsonb_build_object('l', r.residual_likelihood, 'i', r.residual_impact, 'score', r.residual_score,
                                   'band', ai_band(p_org, r.residual_likelihood, r.residual_impact)) end,
    'tolerance_status', r.tolerance_status, 'gate_failed_rules', r.gate_failed_rules,
    'owner', (select full_name from profiles where id = r.owner_id),
    'review_date', r.review_date::date, 'last_reviewed_at', r.last_reviewed_at::date,
    'controls', (select coalesce(jsonb_agg(jsonb_build_object(
        'ref', c.control_id, 'name', c.name, 'coverage', m.coverage, 'effectiveness', c.effectiveness,
        'testing_status', c.testing_status, 'link', '/app/controls/' || c.id)), '[]'::jsonb)
      from risk_control_mappings m join risk_controls c on c.id = m.control_id where m.risk_id = r.id),
    'treatment_actions', (select coalesce(jsonb_agg(jsonb_build_object(
        'ref', a.action_ref, 'title', a.title, 'status', a.status, 'percent_complete', a.percent_complete,
        'target_date', a.target_date) order by a.target_date nulls last), '[]'::jsonb)
      from risk_treatment_actions a where a.risk_id = r.id),
    'open_tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', t.title, 'status', t.status, 'due', t.due_at::date, 'link', '/app/tasks/' || t.id)), '[]'::jsonb)
      from tasks t where t.risk_id = r.id and t.status not in ('done', 'cancelled')),
    'raised_by_risys', (select jsonb_build_object('area', s.area_id || ' ' || s.area_name,
        'open_findings', s.open_findings, 'failing_signals', s.failing_signals,
        'still_open_evidence', (select coalesce(jsonb_agg(e->>'title'), '[]'::jsonb)
                                  from jsonb_array_elements(s.evidence) e))
      from risk_suggestions s where s.risk_id = r.id limit 1)
  ) into v;
  return v;
end $function$;

-- 4. NCA ECC compliance
CREATE OR REPLACE FUNCTION public.ai_tool_compliance(p_org uuid, p_requirement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v jsonb; req text := nullif(trim(p_requirement), '');
begin
  if not is_org_member(p_org) then return jsonb_build_object('error', 'not a member of this organisation'); end if;
  if req is null then
    select jsonb_build_object('framework', 'NCA ECC', 'domains', coalesce(jsonb_agg(d order by d->>'domain'), '[]'::jsonb)) into v
    from (
      select jsonb_build_object(
        'domain', e.domain_id || ' ' || e.domain_name,
        'requirements', count(*),
        'statuses', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (
            select coalesce(cs.status, 'not_assessed') st, count(*) n
              from nca_ecc e2 left join compliance_statuses cs
                on cs.org_id = p_org and cs.framework = 'NCA ECC' and cs.requirement_id = e2.control_id
             where e2.domain_id = e.domain_id group by 1) z),
        'automated', (select coalesce(jsonb_object_agg(a.automated_status, n), '{}'::jsonb) from (
            select va.automated_status, count(*) n from v_requirement_automation va
             where va.org_id = p_org and va.requirement_id like e.domain_id || '-%' group by 1) a)
      ) d
      from nca_ecc e group by e.domain_id, e.domain_name
    ) s;
    return v;
  end if;

  select jsonb_build_object(
    'framework', 'NCA ECC', 'requirement', e.control_id, 'type', e.control_type,
    'domain', e.domain_id || ' ' || e.domain_name, 'subdomain', e.subdomain_id || ' ' || e.subdomain_name,
    'text', e.control_text, 'text_ar', e.control_text_ar,
    'link', '/app/compliance/NCA%20ECC/' || e.control_id,
    'manual_status', (select jsonb_build_object('status', cs.status, 'notes', cs.notes,
        'updated_at', cs.updated_at::date, 'review_due', cs.review_due_at)
      from compliance_statuses cs where cs.org_id = p_org and cs.framework = 'NCA ECC' and cs.requirement_id = e.control_id),
    'automated', (select jsonb_build_object('status', va.automated_status, 'pass', va.pass_count, 'fail', va.fail_count,
        'partial', va.partial_count, 'unknown', va.unknown_count, 'computed', va.last_computed_at::date,
        'signals', va.signals)
      from v_requirement_automation va where va.org_id = p_org and va.requirement_id = e.control_id),
    'open_findings', case when ai_can_read_findings(p_org) then (
        select jsonb_build_object('total', vf.open_count, 'critical', vf.open_critical, 'warning', vf.open_warning,
          'info', vf.open_info, 'connectors', vf.connectors)
          from v_requirement_findings vf where vf.org_id = p_org and vf.requirement_id = e.control_id)
      else to_jsonb('not visible to your role'::text) end,
    'review', (select jsonb_build_object('state', rs.state, 'due', rs.due_date, 'last_reviewed', rs.last_reviewed_on,
        'frequency', rs.frequency)
      from v_review_schedule rs where rs.org_id = p_org and rs.requirement_id = e.control_id limit 1)
  ) into v
  from nca_ecc e where e.control_id = req;
  return coalesce(v, jsonb_build_object('error', 'no NCA ECC requirement ' || req));
end $function$;

-- 5. Connector findings
CREATE OR REPLACE FUNCTION public.ai_tool_findings(p_org uuid, p_connector text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_requirement text DEFAULT NULL::text, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not ai_can_read_findings(p_org) then
    return jsonb_build_object('error', 'connector findings are not visible to your role');
  end if;
  select coalesce(jsonb_agg(f order by f->>'sev_rank', f->>'title'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'connector', x.connector, 'ref', x.finding_id, 'title', x.title, 'severity', x.severity,
      'subject', x.subject_name, 'first_seen', x.first_seen_at::date,
      'requirements', (select coalesce(jsonb_agg(k.requirement_id order by k.position), '[]'::jsonb)
                         from finding_control_refs k where k.source_table = x.src and k.finding_row_id = x.id),
      'recommendation', left(x.recommendation, 600),
      'link', '/app/findings/' || x.connector,
      'sev_rank', case x.severity when 'critical' then 0 when 'warning' then 1 else 2 end) f
    from (
      select 'm365_findings' src, 'm365' connector, id, finding_id, title, severity, subject_name, first_seen_at, recommendation, status, org_id from m365_findings
      union all select 'defender_findings', 'defender', id, finding_id, title, severity, subject_name, first_seen_at, recommendation, status, org_id from defender_findings
      union all select 'sharepoint_findings', 'sharepoint', id, finding_id, title, severity, subject_name, first_seen_at, recommendation, status, org_id from sharepoint_findings
    ) x
    where x.org_id = p_org and x.status = 'open'
      and (p_connector is null or x.connector = lower(p_connector))
      and (p_severity is null or x.severity = lower(p_severity))
      and (p_requirement is null or exists (select 1 from finding_control_refs k
             where k.source_table = x.src and k.finding_row_id = x.id
               and (k.requirement_id = p_requirement or k.requirement_id like p_requirement || '-%')))
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ) s;
  return v;
end $function$;

-- 6. NCA ECC control text search (reference data, not tenant data)
CREATE OR REPLACE FUNCTION public.ai_tool_framework_search(p_query text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'framework', 'NCA ECC', 'requirement', control_id, 'type', control_type,
      'subdomain', subdomain_id || ' ' || subdomain_name, 'text', control_text,
      'link', '/app/compliance/NCA%20ECC/' || control_id)), '[]'::jsonb)
  from (
    select * from nca_ecc
     where control_id = trim(p_query)
        or control_text ilike '%' || trim(p_query) || '%'
        or control_text_ar ilike '%' || trim(p_query) || '%'
        or subdomain_name ilike '%' || trim(p_query) || '%'
     order by (control_id = trim(p_query)) desc, control_id
     limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ) e
$function$;

-- 7. Open tasks and incidents
CREATE OR REPLACE FUNCTION public.ai_tool_work_items(p_org uuid, p_kind text DEFAULT 'tasks'::text, p_overdue_only boolean DEFAULT false, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_items jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if not is_org_member(p_org) then return jsonb_build_object('error', 'not a member of this organisation'); end if;

  if lower(coalesce(p_kind, 'tasks')) = 'incidents' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'title', i.title, 'severity', i.severity, 'status', i.status, 'priority', i.priority,
        'source', coalesce(i.connector_id, i.source_type), 'opened', i.created_at::date,
        'sla_deadline', i.deadline, 'sla_breached', i.deadline < now(),
        'overdue_by_days', case when i.deadline < now() then floor(extract(epoch from now() - i.deadline) / 86400)::int end,
        'link', '/app/incidents/' || i.id) order by i.deadline), '[]'::jsonb)
      into v_items
      from (select x.*, ai_incident_deadline(x.severity, x.created_at, x.due_at) deadline
              from incidents x
             where x.org_id = p_org and coalesce(x.status, 'open') not in ('resolved', 'closed')
               and (not p_overdue_only or ai_incident_deadline(x.severity, x.created_at, x.due_at) < now())
             order by ai_incident_deadline(x.severity, x.created_at, x.due_at) limit v_lim) i;

    return jsonb_build_object(
      'kind', 'incidents',
      'filter', case when p_overdue_only then 'past their SLA deadline' else 'all open' end,
      'sla_rule', 'deadline = due date if set, else opened + 4h critical / 24h high / 72h medium / 7d low / 30d informational',
      'open_total', (select count(*) from incidents where org_id = p_org and coalesce(status, 'open') not in ('resolved', 'closed')),
      'items', v_items);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'title', t.title, 'status', t.status, 'priority', t.priority, 'due', t.due_at::date,
      'overdue', coalesce(t.due_at < now(), false), 'assignee', p.full_name,
      'risk', (select risk_id from risks where id = t.risk_id), 'link', '/app/tasks/' || t.id)
      order by t.due_at nulls last), '[]'::jsonb)
    into v_items
    from (select * from tasks where org_id = p_org and status not in ('done', 'cancelled')
            and (not p_overdue_only or due_at < now())
          order by due_at nulls last limit v_lim) t
    left join profiles p on p.id = t.assigned_to;

  return jsonb_build_object(
    'kind', 'tasks',
    'filter', case when p_overdue_only then 'past their due date' else 'all open' end,
    'open_total', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled')),
    'open_without_due_date', (select count(*) from tasks where org_id = p_org and status not in ('done', 'cancelled') and due_at is null),
    'items', v_items);
end $function$;

-- 8. Suggested risks
CREATE OR REPLACE FUNCTION public.ai_tool_suggested_risks(p_org uuid, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not ai_can_read_findings(p_org) then
    return jsonb_build_object('error', 'suggested risks are not visible to your role');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'area', s.area_id || ' ' || s.area_name, 'title', s.title, 'status', s.status,
      'inherent', jsonb_build_object('l', s.inherent_likelihood, 'i', s.inherent_impact,
                                     'band', ai_band(p_org, s.inherent_likelihood, s.inherent_impact)),
      'open_findings', s.open_findings, 'critical_findings', s.critical_findings, 'failing_signals', s.failing_signals,
      'controls', s.controls, 'registered_as', (select risk_id from risks where id = s.risk_id),
      'link', '/app/risks/suggestions/' || s.id) order by s.critical_findings desc, s.open_findings desc), '[]'::jsonb)
    into v
    from risk_suggestions s
   where s.org_id = p_org and (p_status is null or s.status = lower(p_status));
  return v;
end $function$;

-- ── Function permissions ────────────────────────────────────────────────────
-- Tools and helpers: signed-in people only (they run as that person).
-- The daily-limit counter: server only.
do $$
declare f text;
begin
  foreach f in array array[
    'ai_band(uuid, integer, integer)', 'ai_can_read_findings(uuid)',
    'ai_incident_deadline(text, timestamptz, timestamptz)',
    'ai_tool_overview(uuid)', 'ai_tool_search_risks(uuid, text, text, text, integer)',
    'ai_tool_get_risk(uuid, text)', 'ai_tool_compliance(uuid, text)',
    'ai_tool_findings(uuid, text, text, text, integer)', 'ai_tool_framework_search(text, integer)',
    'ai_tool_work_items(uuid, text, boolean, integer)', 'ai_tool_suggested_risks(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.ai_requests_today(uuid) from public, anon, authenticated;
grant execute on function public.ai_requests_today(uuid) to service_role;

-- ── Console control (platform staff only) ──────────────────────────────────
-- What the console shows about a company's AI: the switch and usage counts.
-- Never conversation content.
create or replace function public.platform_get_ai_settings(p_org uuid)
returns json
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare s ai_settings;
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into s from ai_settings where org_id = p_org;
  return json_build_object(
    'enabled', coalesce(s.enabled, false),
    'mode', coalesce(s.mode, 'off'),
    'daily_request_limit', coalesce(s.daily_request_limit, 200),
    'updated_at', s.updated_at,
    'updated_by_email', (select email from profiles where id = s.updated_by),
    'requests_today', ai_requests_today(p_org),
    'requests_30d', (select count(*) from ai_requests where org_id = p_org and created_at > now() - interval '30 days' and status in ('ok', 'error')),
    'refused_30d', (select count(*) from ai_requests where org_id = p_org and created_at > now() - interval '30 days' and status in ('refused', 'limited')),
    'people_30d', (select count(distinct user_id) from ai_requests where org_id = p_org and created_at > now() - interval '30 days' and status = 'ok'),
    'last_request_at', (select max(created_at) from ai_requests where org_id = p_org)
  );
end $function$;

-- Turn Ask RISYS on or off for a company. Turning it on with a provider
-- outside the Kingdom ('global') needs a written reason, kept in the log.
create or replace function public.platform_set_ai_settings(p_org uuid, p_mode text, p_daily_limit integer default null, p_reason text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_old ai_settings; v_org organizations; v_limit int; v_mode text := lower(trim(coalesce(p_mode, '')));
begin
  if not is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_org from organizations where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  if v_mode not in ('off', 'in_kingdom', 'global') then raise exception 'Unknown AI mode: %', p_mode; end if;
  if v_mode = 'global' and length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Allowing a provider outside the Kingdom needs a reason of at least 10 characters';
  end if;
  v_limit := coalesce(p_daily_limit, (select daily_request_limit from ai_settings where org_id = p_org), 200);
  if v_limit < 0 or v_limit > 10000 then raise exception 'Daily limit must be between 0 and 10000'; end if;

  select * into v_old from ai_settings where org_id = p_org;

  insert into ai_settings (org_id, enabled, mode, daily_request_limit, updated_by, updated_at)
  values (p_org, v_mode <> 'off', v_mode, v_limit, auth.uid(), now())
  on conflict (org_id) do update
    set enabled = excluded.enabled, mode = excluded.mode,
        daily_request_limit = excluded.daily_request_limit,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  perform platform_log('company.ai_changed', p_org, v_org.name, null, null, p_reason,
    jsonb_build_object('ai_mode', jsonb_build_array(coalesce(v_old.mode, 'off'), v_mode),
                       'daily_limit', jsonb_build_array(coalesce(v_old.daily_request_limit, 200), v_limit)));

  return platform_get_ai_settings(p_org);
end $function$;

revoke all on function public.platform_get_ai_settings(uuid) from public, anon;
revoke all on function public.platform_set_ai_settings(uuid, text, integer, text) from public, anon;
grant execute on function public.platform_get_ai_settings(uuid) to authenticated;
grant execute on function public.platform_set_ai_settings(uuid, text, integer, text) to authenticated;
