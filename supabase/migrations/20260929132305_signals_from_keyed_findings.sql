-- ── More measured ECC requirements ───────────────────────────────────────────
--
-- Ten new signals from data RISYS already collects. Requirements with an
-- automated status go from 14 to 23 (12 → 19 measured directly, the rest by roll-up).
--
--   Defender Secure Score, per requirement — uses finding_control_refs, so a
--   Secure Score control counts toward the requirement it is keyed to rather
--   than a hand-kept list of control names:
--     defender.email_filtering            → 2-4-3-1
--     defender.email_advanced_protection  → 2-4-3-4
--     defender.audit_logging              → 2-12-3-1
--     defender.data_protection_posture    → 2-7-2
--
--   Microsoft 365 mailboxes:
--     m365.external_forwarding            → 2-4-2, 2-7-2
--
--   SharePoint and OneDrive tenant settings:
--     sharepoint.anyone_links_disabled    → 2-7-2
--     sharepoint.sharing_domain_restricted→ 2-7-2
--     sharepoint.guest_reshare_blocked    → 2-2-3-3
--     sharepoint.idle_signout             → 2-2-2
--     sharepoint.unmanaged_sync_blocked   → 2-6-3-1, 2-6-3-2
--
-- The SharePoint signals read a snapshot of the tenant settings that
-- sharepoint-security writes to counts.tenant_settings on the scan run. Until
-- that function is redeployed and a scan has run, they stay 'unknown' with that
-- reason. They are NOT inferred from the absence of a finding: the function
-- raises a finding only when a setting is readable and bad, so "no finding"
-- also covers "could not read it", and that must not read as a pass.

-- ── Catalogue ────────────────────────────────────────────────────────────────
insert into public.compliance_signals
  (signal_key, connector_id, name, description, method, finding_type, unit,
   pass_threshold, partial_threshold, higher_is_better, requires_license, is_active, source_note)
values
  ('defender.email_filtering', 'defender', 'Email filtering controls achieved',
   'Share of Microsoft Secure Score controls keyed to ECC 2-4-3-1 (phishing and spam filtering) that are fully achieved.',
   'graph', null, 'ratio', 1, 0.5, true, null, true,
   'Microsoft Secure Score, read by the Defender connector. Each Secure Score control is keyed to its ECC requirement.'),
  ('defender.email_advanced_protection', 'defender', 'Advanced email threat protection achieved',
   'Share of Microsoft Secure Score controls keyed to ECC 2-4-3-4 (Safe Links, Safe Attachments, APT protection) that are fully achieved.',
   'graph', null, 'ratio', 1, 0.5, true, null, true,
   'Microsoft Secure Score, read by the Defender connector. Safe Links and Safe Attachments need Defender for Office 365.'),
  ('defender.audit_logging', 'defender', 'Audit logging controls achieved',
   'Share of Microsoft Secure Score controls keyed to ECC 2-12-3-1 (event logs activated) that are fully achieved.',
   'graph', null, 'ratio', 1, 0.5, true, null, true,
   'Microsoft Secure Score, read by the Defender connector.'),
  ('defender.data_protection_posture', 'defender', 'Data protection controls achieved',
   'Share of Microsoft Secure Score controls keyed to ECC 2-7-2 (data and information protection) that are fully achieved.',
   'graph', null, 'ratio', 1, 0.5, true, null, true,
   'Microsoft Secure Score, read by the Defender connector.'),
  ('m365.external_forwarding', 'm365', 'Mailboxes without external forwarding',
   'Share of scanned mailboxes with no forwarding address or inbox rule sending mail outside the organisation.',
   'graph', 'external_forwarding', 'ratio', 1, 0.9, true, null, true,
   'Mailbox settings and inbox rules, read by the Microsoft 365 connector.'),
  ('sharepoint.anyone_links_disabled', 'sharepoint', '"Anyone" links turned off',
   'SharePoint and OneDrive do not allow links that open without signing in.',
   'graph', 'tenant_policy', 'boolean', 1, null, true, null, true,
   'SharePoint tenant sharing settings, read by the SharePoint connector.'),
  ('sharepoint.sharing_domain_restricted', 'sharepoint', 'External sharing limited by domain',
   'External sharing is restricted to an allow list of domains, or blocks a deny list.',
   'graph', 'tenant_policy', 'boolean', 1, null, true, null, true,
   'SharePoint tenant sharing settings, read by the SharePoint connector.'),
  ('sharepoint.guest_reshare_blocked', 'sharepoint', 'Guests cannot reshare',
   'External users cannot share items they do not own.',
   'graph', 'tenant_policy', 'boolean', 1, null, true, null, true,
   'SharePoint tenant sharing settings, read by the SharePoint connector.'),
  ('sharepoint.idle_signout', 'sharepoint', 'Idle session sign-out on',
   'Browser sessions to SharePoint and OneDrive sign out after a period of inactivity.',
   'graph', 'tenant_policy', 'boolean', 1, null, true, null, true,
   'SharePoint tenant access settings, read by the SharePoint connector.'),
  ('sharepoint.unmanaged_sync_blocked', 'sharepoint', 'Sync blocked on unmanaged devices',
   'OneDrive sync is limited to managed, domain-joined computers.',
   'graph', 'tenant_policy', 'boolean', 1, null, true, null, true,
   'OneDrive sync settings, read by the SharePoint connector.')
on conflict (signal_key) do update set
  connector_id = excluded.connector_id, name = excluded.name, description = excluded.description,
  method = excluded.method, finding_type = excluded.finding_type, unit = excluded.unit,
  pass_threshold = excluded.pass_threshold, partial_threshold = excluded.partial_threshold,
  higher_is_better = excluded.higher_is_better, requires_license = excluded.requires_license,
  is_active = excluded.is_active, source_note = excluded.source_note;

insert into public.signal_requirement_map (signal_key, framework, requirement_id, weight, org_id, note)
select v.signal_key, 'NCA ECC', v.requirement_id, 1, null, v.note
  from (values
    ('defender.email_filtering',           '2-4-3-1',  'Secure Score email filtering controls'),
    ('defender.email_advanced_protection', '2-4-3-4',  'Secure Score Safe Links / Safe Attachments'),
    ('defender.audit_logging',             '2-12-3-1', 'Secure Score audit logging controls'),
    ('defender.data_protection_posture',   '2-7-2',    'Secure Score data protection controls'),
    ('m365.external_forwarding',           '2-4-2',    'Mail leaving the organisation by forwarding'),
    ('m365.external_forwarding',           '2-7-2',    'Data leaving the organisation by forwarding'),
    ('sharepoint.anyone_links_disabled',   '2-7-2',    'Unauthenticated sharing links'),
    ('sharepoint.sharing_domain_restricted','2-7-2',   'Where shared data can go'),
    ('sharepoint.guest_reshare_blocked',   '2-2-3-3',  'Access spreading beyond need-to-know'),
    ('sharepoint.idle_signout',            '2-2-2',    'Session control (ECC has no dedicated session-timeout control)'),
    ('sharepoint.unmanaged_sync_blocked',  '2-6-3-1',  'Organisation data on unmanaged devices'),
    ('sharepoint.unmanaged_sync_blocked',  '2-6-3-2',  'Controlled use of personal devices')
  ) as v(signal_key, requirement_id, note)
 where not exists (
   select 1 from public.signal_requirement_map m
    where m.signal_key = v.signal_key and m.framework = 'NCA ECC'
      and m.requirement_id = v.requirement_id and m.org_id is null);

-- ── Computation ──────────────────────────────────────────────────────────────
create or replace function public.compute_signals_findings(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_defender_ok boolean;
  v_fwd_state   text;
  v_mailboxes   int;
  v_sp_state    text;
  v_sp          jsonb;      -- counts.tenant_settings from the last SharePoint scan
  v_cap         text;
  v_bool        boolean;
  v_num int; v_den int; v_val numeric;
  r record;
begin
  if p_org is null then raise exception 'org_id is required'; end if;

  -- ── Defender Secure Score, by keyed requirement ───────────────────────────
  select coalesce((
    select s.sources #>> '{posture,state}' in ('ok', 'partial')
      from connector_scan_runs s
     where s.org_id = p_org and s.connector_id = 'defender' and s.finished_at is not null
     order by s.finished_at desc limit 1), false) into v_defender_ok;

  for r in select * from (values
      ('defender.email_filtering',           '2-4-3-1'),
      ('defender.email_advanced_protection', '2-4-3-4'),
      ('defender.audit_logging',             '2-12-3-1'),
      ('defender.data_protection_posture',   '2-7-2')) as v(signal_key, requirement_id) loop
    if not v_defender_ok then
      perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
        'Microsoft Secure Score has not been read. Connect Microsoft Defender and run a scan.',
        jsonb_build_object('reason', 'no_connector'), 48);
    else
      select count(*) filter (where f.status = 'resolved'), count(*)
        into v_num, v_den
        from defender_findings f
        join finding_control_refs k
          on k.source_table = 'defender_findings' and k.finding_row_id = f.id
       where f.org_id = p_org and f.source = 'secure_score'
         and k.framework = 'NCA ECC' and k.requirement_id = r.requirement_id and k.is_primary;
      if v_den = 0 then
        perform record_signal(p_org, r.signal_key, 'unknown', null, 0, 0,
          'Microsoft Secure Score reports no control for this requirement on this tenant, usually because the feature needs a licence the tenant does not hold.',
          jsonb_build_object('reason', 'not_reported'), 48);
      else
        v_val := v_num::numeric / v_den;
        perform record_signal(p_org, r.signal_key,
          case when v_num = v_den then 'pass' when v_num = 0 then 'fail' else 'partial' end,
          v_val, v_num, v_den,
          format('%s of %s Microsoft Secure Score controls for ECC %s are fully achieved.', v_num, v_den, r.requirement_id),
          jsonb_build_object('source', 'secure_score', 'requirement_id', r.requirement_id), 48);
      end if;
    end if;
  end loop;

  -- ── Microsoft 365: external forwarding ────────────────────────────────────
  select s.sources #>> '{forwarding,state}', nullif(s.counts #>> '{mailboxes,scanned}', '')::int
    into v_fwd_state, v_mailboxes
    from connector_scan_runs s
   where s.org_id = p_org and s.connector_id = 'm365' and s.finished_at is not null
   order by s.finished_at desc limit 1;

  if coalesce(v_fwd_state, '') not in ('ok', 'partial') then
    perform record_signal(p_org, 'm365.external_forwarding', 'unknown', null, null, null,
      case when v_fwd_state is null then 'Microsoft 365 has not been scanned. Connect it and run a scan.'
           when v_fwd_state = 'skipped' then 'Forwarding checks are turned off in the Microsoft 365 connector settings.'
           else 'Mailbox forwarding could not be read on the last Microsoft 365 scan.' end,
      jsonb_build_object('reason', coalesce(v_fwd_state, 'no_connector')), 48);
  elsif coalesce(v_mailboxes, 0) = 0 then
    perform record_signal(p_org, 'm365.external_forwarding', 'unknown', null, 0, 0,
      'No mailbox was scanned, so forwarding cannot be measured.', jsonb_build_object('reason', 'no_data'), 48);
  else
    select count(distinct subject_id) into v_num
      from m365_findings
     where org_id = p_org and status = 'open' and category = 'external_forwarding';
    v_num := least(v_num, v_mailboxes);
    v_val := (v_mailboxes - v_num)::numeric / v_mailboxes;
    perform record_signal(p_org, 'm365.external_forwarding', grade_signal('m365.external_forwarding', v_val),
      v_val, v_mailboxes - v_num, v_mailboxes,
      format('%s of %s scanned mailboxes send no mail outside the organisation by forwarding or rules.', v_mailboxes - v_num, v_mailboxes)
        || case when v_fwd_state = 'partial' then ' Not every mailbox could be read on the last scan.' else '' end,
      jsonb_build_object('source', 'forwarding'), 48);
  end if;

  -- ── SharePoint and OneDrive tenant settings ───────────────────────────────
  select s.sources #>> '{tenant,state}', s.counts -> 'tenant_settings'
    into v_sp_state, v_sp
    from connector_scan_runs s
   where s.org_id = p_org and s.connector_id = 'sharepoint' and s.finished_at is not null
   order by s.finished_at desc limit 1;

  if coalesce(v_sp_state, '') <> 'ok' or v_sp is null or jsonb_typeof(v_sp) <> 'object' then
    for r in select unnest(array['sharepoint.anyone_links_disabled', 'sharepoint.sharing_domain_restricted',
                                 'sharepoint.guest_reshare_blocked', 'sharepoint.idle_signout',
                                 'sharepoint.unmanaged_sync_blocked']) as signal_key loop
      perform record_signal(p_org, r.signal_key, 'unknown', null, null, null,
        case when v_sp_state is null then 'SharePoint has not been scanned. Connect Microsoft Entra ID and run a SharePoint scan.'
             when v_sp_state <> 'ok' then 'SharePoint tenant settings could not be read on the last scan.'
             else 'The last SharePoint scan did not record tenant settings. Run a new scan after the SharePoint connector update.' end,
        jsonb_build_object('reason', case when v_sp_state is null then 'no_connector'
                                          when v_sp_state <> 'ok' then 'source_failed'
                                          else 'not_collected' end), 48);
    end loop;
  else
    v_cap := nullif(v_sp ->> 'sharingCapability', '');

    -- "Anyone" links
    if v_cap is null then
      perform record_signal(p_org, 'sharepoint.anyone_links_disabled', 'unknown', null, null, null,
        'The tenant sharing level was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    else
      v_bool := v_cap <> 'externalUserAndGuestSharing';
      perform record_signal(p_org, 'sharepoint.anyone_links_disabled', case when v_bool then 'pass' else 'fail' end,
        case when v_bool then 1 else 0 end, null, null,
        case when v_bool then 'SharePoint and OneDrive do not allow "Anyone" links.'
             else 'SharePoint and OneDrive allow "Anyone" links, which open without signing in.' end,
        jsonb_build_object('sharingCapability', v_cap), 48);
    end if;

    -- Domain restriction (only meaningful when external sharing is on)
    if v_cap is null then
      perform record_signal(p_org, 'sharepoint.sharing_domain_restricted', 'unknown', null, null, null,
        'The tenant sharing level was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    elsif v_cap = 'disabled' then
      perform record_signal(p_org, 'sharepoint.sharing_domain_restricted', 'not_applicable', null, null, null,
        'External sharing is turned off, so there is nothing to restrict by domain.', '{}'::jsonb, 48);
    elsif nullif(v_sp ->> 'sharingDomainRestrictionMode', '') is null then
      perform record_signal(p_org, 'sharepoint.sharing_domain_restricted', 'unknown', null, null, null,
        'The domain restriction setting was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    else
      v_bool := (v_sp ->> 'sharingDomainRestrictionMode') <> 'none';
      perform record_signal(p_org, 'sharepoint.sharing_domain_restricted', case when v_bool then 'pass' else 'fail' end,
        case when v_bool then 1 else 0 end, null, null,
        case when v_bool then 'External sharing is limited by domain.'
             else 'External sharing is allowed with any domain.' end,
        jsonb_build_object('sharingDomainRestrictionMode', v_sp ->> 'sharingDomainRestrictionMode'), 48);
    end if;

    -- Guest resharing
    if v_cap = 'disabled' then
      perform record_signal(p_org, 'sharepoint.guest_reshare_blocked', 'not_applicable', null, null, null,
        'External sharing is turned off, so guests cannot reshare.', '{}'::jsonb, 48);
    elsif jsonb_typeof(v_sp -> 'isResharingByExternalUsersEnabled') is distinct from 'boolean' then
      perform record_signal(p_org, 'sharepoint.guest_reshare_blocked', 'unknown', null, null, null,
        'The guest resharing setting was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    else
      v_bool := not (v_sp ->> 'isResharingByExternalUsersEnabled')::boolean;
      perform record_signal(p_org, 'sharepoint.guest_reshare_blocked', case when v_bool then 'pass' else 'fail' end,
        case when v_bool then 1 else 0 end, null, null,
        case when v_bool then 'Guests cannot share items they do not own.'
             else 'Guests can share items they do not own with other people.' end,
        '{}'::jsonb, 48);
    end if;

    -- Idle session sign-out
    if jsonb_typeof(v_sp #> '{idleSessionSignOut,isEnabled}') is distinct from 'boolean' then
      perform record_signal(p_org, 'sharepoint.idle_signout', 'unknown', null, null, null,
        'The idle session sign-out setting was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    else
      v_bool := (v_sp #>> '{idleSessionSignOut,isEnabled}')::boolean;
      perform record_signal(p_org, 'sharepoint.idle_signout', case when v_bool then 'pass' else 'fail' end,
        case when v_bool then 1 else 0 end, null, null,
        case when v_bool then 'Idle browser sessions to SharePoint and OneDrive are signed out.'
             else 'Idle session sign-out is off for SharePoint and OneDrive.' end,
        '{}'::jsonb, 48);
    end if;

    -- Unmanaged-device sync
    if jsonb_typeof(v_sp -> 'isUnmanagedSyncAppForTenantRestricted') is distinct from 'boolean' then
      perform record_signal(p_org, 'sharepoint.unmanaged_sync_blocked', 'unknown', null, null, null,
        'The OneDrive sync restriction was not reported.', jsonb_build_object('reason', 'not_reported'), 48);
    else
      v_bool := (v_sp ->> 'isUnmanagedSyncAppForTenantRestricted')::boolean;
      perform record_signal(p_org, 'sharepoint.unmanaged_sync_blocked', case when v_bool then 'pass' else 'fail' end,
        case when v_bool then 1 else 0 end, null, null,
        case when v_bool then 'OneDrive sync is limited to managed computers.'
             else 'OneDrive sync is allowed on unmanaged computers.' end,
        '{}'::jsonb, 48);
    end if;
  end if;

  return jsonb_build_object('findings_signals', 10, 'defender', v_defender_ok,
                            'forwarding', v_fwd_state, 'sharepoint_tenant', v_sp_state);
end $$;

revoke execute on function public.compute_signals_findings(uuid) from public, anon, authenticated;
grant  execute on function public.compute_signals_findings(uuid) to service_role;

-- ── Wire into the three places signals are recomputed ────────────────────────
create or replace function public.refresh_org_signals(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a jsonb; b jsonb; c jsonb; v_reqs int;
begin
  if not (is_org_member(p_org) or auth.uid() is null) then
    raise exception 'You do not have access to this organisation';
  end if;
  a := compute_org_signals(p_org);
  b := compute_signals_platform(p_org);
  c := compute_signals_findings(p_org);
  select count(*) into v_reqs from v_requirement_automation where org_id = p_org;
  return a || b || c || jsonb_build_object('requirements_covered', v_reqs, 'refreshed_at', now());
end $$;

create or replace function public.refresh_all_org_signals()
returns void language plpgsql security definer set search_path to 'public' as $$
declare o record;
begin
  for o in select id from organizations where status = 'active' loop
    begin
      perform compute_org_signals(o.id);
      perform compute_signals_platform(o.id);
      perform compute_signals_findings(o.id);
    exception when others then
      raise warning 'refresh signals for % failed: %', o.id, sqlerrm;
    end;
  end loop;
end $$;

create or replace function public.trg_refresh_signals_after_scan()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.finished_at is not null and (old.finished_at is null or old.status is distinct from new.status) then
    begin
      perform compute_org_signals(new.org_id);
      perform compute_signals_platform(new.org_id);
      perform compute_signals_findings(new.org_id);
    exception when others then
      -- A signal that cannot be computed must never fail the scan that produced
      -- the data. Record it and move on.
      raise warning 'refresh signals for % failed: %', new.org_id, sqlerrm;
    end;
  end if;
  return new;
end $$;

-- First computation for every active organisation.
select public.refresh_all_org_signals();
