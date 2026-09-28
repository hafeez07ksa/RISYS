-- Signals derived from what the Defender and Microsoft 365 connectors collect,
-- plus honest "not measured yet" results for the signals whose data RISYS does
-- not gather. Split from compute_org_signals so each half stays readable.
create or replace function public.compute_signals_platform(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_defender_ok boolean;
  v_dns_ok      boolean;
  v_num int; v_den int; v_val numeric;
  r record;
  -- Secure Score controls that evidence each signal. A control Microsoft does
  -- not report for the tenant simply is not there, and the signal stays unknown
  -- rather than being graded on nothing.
  v_map jsonb := jsonb_build_object(
    'entra.legacy_auth_blocked', jsonb_build_array('blocklegacyauthentication','spo_legacy_auth','exo_legacyauth','aad_blocklegacyauth'),
    'entra.password_policy',     jsonb_build_array('pwagepolicynew','passwordpolicy','aad_password_protection','self_service_password_reset'),
    'entra.mfa_enforcement',     jsonb_build_array('adminmfav2','mfaregistrationv2','mfa_conditional_access','signinriskpolicy','userriskpolicy')
  );
begin
  if p_org is null then raise exception 'org_id is required'; end if;

  select coalesce((
    select s.sources #>> '{posture,state}' in ('ok','partial')
      from connector_scan_runs s
     where s.org_id = p_org and s.connector_id = 'defender' and s.finished_at is not null
     order by s.finished_at desc limit 1), false) into v_defender_ok;

  select coalesce((
    select s.sources #>> '{dns,state}' in ('ok','partial')
      from connector_scan_runs s
     where s.org_id = p_org and s.connector_id = 'm365' and s.finished_at is not null
     order by s.finished_at desc limit 1), false) into v_dns_ok;

  -- ── Secure Score derived ───────────────────────────────────────────────────
  for r in select key as signal_key, value as keys from jsonb_each(v_map) loop
    if not v_defender_ok then
      perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
        'Microsoft Secure Score has not been read. Connect Microsoft Defender and run a scan.',
        jsonb_build_object('reason','no_connector'), 48);
    else
      select count(*) filter (where f.status = 'resolved'), count(*)
        into v_num, v_den
        from defender_findings f
       where f.org_id = p_org and f.source = 'secure_score'
         and lower(replace(f.finding_id, 'score:', '')) in (select jsonb_array_elements_text(r.keys));
      if v_den = 0 then
        perform record_signal(p_org, r.signal_key, 'unknown', null, 0, 0,
          'Microsoft Secure Score does not report a matching control for this tenant, usually because the feature needs a licence the tenant does not hold.',
          jsonb_build_object('reason','not_reported'), 48);
      else
        v_val := v_num::numeric / v_den;
        perform record_signal(p_org, r.signal_key,
          case when v_num = v_den then 'pass' when v_num = 0 then 'fail' else 'partial' end,
          v_val, v_num, v_den,
          format('%s of %s related Microsoft Secure Score controls are fully achieved.', v_num, v_den),
          jsonb_build_object('source','secure_score'), 48);
      end if;
    end if;
  end loop;

  -- ── DNS (SPF, DKIM, DMARC) ─────────────────────────────────────────────────
  for r in select unnest(array['dns.spf','dns.dkim','dns.dmarc']) as signal_key loop
    if not v_dns_ok then
      perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
        'Mail domain DNS records have not been checked. Connect Microsoft 365 and run a scan.',
        jsonb_build_object('reason','no_connector'), 48);
    else
      -- The M365 connector raises one finding per domain that fails the check,
      -- and records every domain it looked at on the scan run.
      select coalesce((
        select (s.counts #>> '{dns,domains}')::int
          from connector_scan_runs s
         where s.org_id = p_org and s.connector_id = 'm365' and s.finished_at is not null
         order by s.finished_at desc limit 1), 0) into v_den;
      select count(*) into v_num
        from m365_findings f
       where f.org_id = p_org and f.status = 'open' and f.source = 'dns'
         and f.finding_id like 'dns:' || split_part(r.signal_key, '.', 2) || ':%';
      if v_den = 0 then
        perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
          'No verified mail domain was found to check.', jsonb_build_object('reason','no_data'), 48);
      else
        v_val := (v_den - v_num)::numeric / v_den;
        perform record_signal(p_org, r.signal_key, grade_signal(r.signal_key, v_val), v_val, v_den - v_num, v_den,
          format('%s of %s mail domains pass the %s check.', v_den - v_num, v_den, upper(split_part(r.signal_key, '.', 2))),
          jsonb_build_object('source','dns'), 48);
      end if;
    end if;
  end loop;

  -- ── Not collected yet ──────────────────────────────────────────────────────
  -- Conditional Access, PIM and access reviews need Graph policy collection
  -- that RISYS does not do yet. Recording them as unknown with the reason keeps
  -- the requirement honestly "partially automated" instead of silently failing.
  for r in select signal_key, source_note from compliance_signals
            where signal_key in ('entra.ca_policies_enabled','entra.ca_policy_coverage','entra.ca_config_drift',
                                 'entra.privileged_pim','entra.access_review_completion','m365.webmail_mfa') loop
    perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
      coalesce(r.source_note, 'Not collected yet.'), jsonb_build_object('reason','not_collected'), 168);
  end loop;

  return jsonb_build_object('defender', v_defender_ok, 'dns', v_dns_ok);
end $$;

-- What connectors and the UI call: compute everything for one organisation.
create or replace function public.refresh_org_signals(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a jsonb; b jsonb; v_reqs int;
begin
  if not (is_org_member(p_org) or auth.uid() is null) then
    raise exception 'You do not have access to this organisation';
  end if;
  a := compute_org_signals(p_org);
  b := compute_signals_platform(p_org);
  select count(*) into v_reqs from v_requirement_automation where org_id = p_org;
  return a || b || jsonb_build_object('requirements_covered', v_reqs, 'refreshed_at', now());
end $$;

revoke execute on function public.compute_org_signals(uuid) from public, anon;
revoke execute on function public.compute_signals_platform(uuid) from public, anon;
revoke execute on function public.record_signal(uuid, text, text, numeric, int, int, text, jsonb, int) from public, anon;
revoke execute on function public.grade_signal(text, numeric) from public, anon;
revoke execute on function public.refresh_org_signals(uuid) from public, anon;
grant execute on function public.refresh_org_signals(uuid) to authenticated;;
