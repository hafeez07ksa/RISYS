create or replace function public.compute_org_signals(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_entra_ok      boolean;   -- Entra directory has been synced
  v_defender_ok   boolean;   -- Defender Secure Score was read on the last scan
  v_m365_dns_ok   boolean;   -- the M365 connector's DNS source ran
  v_num int; v_den int; v_val numeric; v_txt text;
  v_signals int := 0;
begin
  if p_org is null then raise exception 'org_id is required'; end if;

  select exists (select 1 from entra_users where org_id = p_org) into v_entra_ok;
  select coalesce((
    select r.sources #>> '{posture,state}' in ('ok','partial')
      from connector_scan_runs r
     where r.org_id = p_org and r.connector_id = 'defender' and r.finished_at is not null
     order by r.finished_at desc limit 1), false) into v_defender_ok;
  select coalesce((
    select r.sources #>> '{dns,state}' in ('ok','partial')
      from connector_scan_runs r
     where r.org_id = p_org and r.connector_id = 'm365' and r.finished_at is not null
     order by r.finished_at desc limit 1), false) into v_m365_dns_ok;

  -- ── RISYS internal signals ─────────────────────────────────────────────────

  -- Risk methodology: a register is "in use" when risks are scored both before
  -- and after controls and have been through the tolerance gate. Counting rows
  -- alone would pass an empty register.
  select count(*) filter (where inherent_score is not null and residual_score is not null and tolerance_status is not null),
         count(*)
    into v_num, v_den
    from risks where org_id = p_org and coalesce(workflow_state,'draft') <> 'draft';
  if v_den = 0 then
    perform record_signal(p_org, 'risys.risk_methodology', 'unknown', null, 0, 0,
      'No risks past draft in the register yet, so the methodology cannot be evidenced.',
      jsonb_build_object('reason','no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'risys.risk_methodology', grade_signal('risys.risk_methodology', v_val), v_val, v_num, v_den,
      format('%s of %s risks are scored inherent and residual and have passed the tolerance gate.', v_num, v_den),
      '{}'::jsonb, 24);
  end if;
  v_signals := v_signals + 1;

  -- ECC assessment: statuses exist and are being kept current (reviewed, or set,
  -- within the last 12 months).
  select count(*) filter (where coalesce(review_due_at, updated_at) > now() - interval '12 months'),
         count(*)
    into v_num, v_den
    from compliance_statuses where org_id = p_org and framework = 'NCA ECC';
  if v_den = 0 then
    perform record_signal(p_org, 'risys.ecc_assessment_active', 'fail', 0, 0, 0,
      'No NCA ECC requirement has been assessed in RISYS yet.', '{}'::jsonb, 24);
  else
    v_val := case when v_num > 0 then 1 else 0 end;
    perform record_signal(p_org, 'risys.ecc_assessment_active', case when v_num > 0 then 'pass' else 'partial' end, v_val, v_num, v_den,
      format('%s of %s recorded ECC assessments have been set or reviewed in the last 12 months.', v_num, v_den),
      '{}'::jsonb, 24);
  end if;
  v_signals := v_signals + 1;

  -- Incident management: closed within SLA, over the last 90 days. With no
  -- incidents there is nothing to evidence either way.
  select count(*) filter (where coalesce(sla_breached, false) = false), count(*)
    into v_num, v_den
    from incidents
   where org_id = p_org and resolved_at is not null and resolved_at > now() - interval '90 days';
  if v_den = 0 then
    perform record_signal(p_org, 'risys.incident_management', 'unknown', null, 0, 0,
      'No incident has been closed in the last 90 days, so SLA performance cannot be measured.',
      jsonb_build_object('reason','no_data'), 24);
  else
    v_val := v_num::numeric / v_den;
    perform record_signal(p_org, 'risys.incident_management', grade_signal('risys.incident_management', v_val), v_val, v_num, v_den,
      format('%s of %s incidents closed in the last 90 days met their SLA.', v_num, v_den), '{}'::jsonb, 24);
  end if;
  v_signals := v_signals + 1;

  -- ── Entra ID directory signals ─────────────────────────────────────────────

  if not v_entra_ok then
    perform record_signal(p_org, 'entra.mfa_registration', 'unknown', null, null, null,
      'Microsoft Entra ID has not been synced, so MFA registration is not known.', jsonb_build_object('reason','no_connector'), 24);
    perform record_signal(p_org, 'entra.least_privilege', 'unknown', null, null, null,
      'Microsoft Entra ID has not been synced, so directory roles are not known.', jsonb_build_object('reason','no_connector'), 24);
    perform record_signal(p_org, 'entra.standing_global_admins', 'unknown', null, null, null,
      'Microsoft Entra ID has not been synced, so administrator accounts are not known.', jsonb_build_object('reason','no_connector'), 24);
    perform record_signal(p_org, 'entra.inactive_accounts', 'unknown', null, null, null,
      'Microsoft Entra ID has not been synced, so account activity is not known.', jsonb_build_object('reason','no_connector'), 24);
  else
    -- MFA registration: only over accounts whose MFA state RISYS could actually
    -- read. On a tenant without Entra ID P1 the registration report is refused,
    -- and entra-directory marks those users mfa_known=false; counting them as
    -- unregistered would report a failing control that was never measured.
    select count(*) filter (where is_mfa_registered), count(*)
      into v_num, v_den
      from entra_users
     where org_id = p_org and account_enabled and coalesce(user_type,'Member') = 'Member'
       and coalesce((raw_data->>'mfa_known')::boolean, true);
    if v_den = 0 then
      perform record_signal(p_org, 'entra.mfa_registration', 'unknown', null, 0, 0,
        'MFA registration could not be read for any account. The registration report needs Microsoft Entra ID P1.',
        jsonb_build_object('reason','not_licensed'), 24);
    else
      v_val := v_num::numeric / v_den;
      perform record_signal(p_org, 'entra.mfa_registration', grade_signal('entra.mfa_registration', v_val), v_val, v_num, v_den,
        format('%s of %s enabled member accounts have registered an MFA method.', v_num, v_den), '{}'::jsonb, 24);
    end if;

    -- Least privilege: the share of enabled accounts that hold no directory role.
    select count(*) filter (where not coalesce(is_privileged, false)), count(*)
      into v_num, v_den
      from entra_users where org_id = p_org and account_enabled;
    v_val := case when v_den = 0 then null else v_num::numeric / v_den end;
    perform record_signal(p_org, 'entra.least_privilege', grade_signal('entra.least_privilege', v_val), v_val, v_num, v_den,
      format('%s of %s enabled accounts hold no directory role (%s privileged).', v_num, v_den, v_den - v_num), '{}'::jsonb, 24);

    -- Standing Global Administrators. Fewer is better, but one is a single
    -- point of failure, which Microsoft and the ECC both warn against.
    select count(*) into v_num
      from entra_users
     where org_id = p_org and account_enabled
       and exists (
         select 1 from jsonb_array_elements(coalesce(directory_roles,'[]'::jsonb)) r
          where r->>'displayName' ilike 'Global Administrator%');
    v_txt := format('%s enabled account%s hold the Global Administrator role permanently.', v_num, case when v_num = 1 then '' else 's' end);
    if v_num = 1 then v_txt := v_txt || ' A single administrator is also a single point of failure — Microsoft recommends at least two.'; end if;
    perform record_signal(p_org, 'entra.standing_global_admins',
      case when v_num = 1 then 'partial' else grade_signal('entra.standing_global_admins', v_num) end,
      v_num, v_num, null, v_txt, '{}'::jsonb, 24);

    -- Inactive accounts: needs last_sign_in, which comes from Entra ID P1.
    select count(*) filter (where last_sign_in is not null), count(*)
      into v_num, v_den
      from entra_users where org_id = p_org and account_enabled;
    if v_num = 0 then
      perform record_signal(p_org, 'entra.inactive_accounts', 'unknown', null, null, v_den,
        'Last sign-in is not available for any account. Sign-in activity needs Microsoft Entra ID P1.',
        jsonb_build_object('reason','not_licensed'), 24);
    else
      select count(*) filter (where last_sign_in < now() - interval '90 days'), count(*)
        into v_num, v_den
        from entra_users where org_id = p_org and account_enabled and last_sign_in is not null;
      v_val := case when v_den = 0 then null else v_num::numeric / v_den end;
      perform record_signal(p_org, 'entra.inactive_accounts', grade_signal('entra.inactive_accounts', v_val), v_val, v_num, v_den,
        format('%s of %s enabled accounts have not signed in for 90 days.', v_num, v_den), '{}'::jsonb, 24);
    end if;
  end if;
  v_signals := v_signals + 4;

  return jsonb_build_object('org_id', p_org, 'computed', v_signals, 'entra', v_entra_ok, 'defender', v_defender_ok, 'dns', v_m365_dns_ok);
end $$;;
