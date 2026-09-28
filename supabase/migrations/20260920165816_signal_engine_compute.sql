-- ── The signal computation engine ────────────────────────────────────────────
--
-- Connectors collect raw facts (entra_users, defender_findings, m365_findings).
-- This turns those facts into the measurable signals defined in
-- compliance_signals, and v_requirement_automation rolls the signals up to an
-- automated status per framework requirement.
--
-- Rules it keeps to:
--   • A signal is only 'pass' or 'fail' when RISYS actually measured it. When
--     the data is missing — no connector, no licence, a source that failed —
--     the result is 'unknown' with a summary saying what is missing. A silent
--     zero would read as a failing control and be wrong.
--   • Every result carries numerator/denominator or a count, so the number on
--     screen can be explained to an auditor.
--   • stale_after marks when a result stops being trustworthy; a result older
--     than that is treated as unknown by the reader.

create or replace function public.record_signal(
  p_org uuid, p_signal text, p_status text, p_value numeric,
  p_num int, p_den int, p_summary text, p_details jsonb default '{}'::jsonb,
  p_stale_hours int default 48
) returns void language sql security definer set search_path to 'public' as $$
  insert into org_signal_results (org_id, signal_key, status, value, numerator, denominator, summary, details, computed_at, stale_after)
  values (p_org, p_signal, p_status, p_value, p_num, p_den, p_summary, coalesce(p_details,'{}'::jsonb), now(), now() + make_interval(hours => p_stale_hours))
  on conflict (org_id, signal_key) do update
     set status = excluded.status, value = excluded.value,
         numerator = excluded.numerator, denominator = excluded.denominator,
         summary = excluded.summary, details = excluded.details,
         computed_at = excluded.computed_at, stale_after = excluded.stale_after;
$$;

-- Grade a ratio or count against the thresholds on the signal definition.
create or replace function public.grade_signal(p_signal text, p_value numeric)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p_value is null then 'unknown'
    when s.higher_is_better then
      case when p_value >= s.pass_threshold then 'pass'
           when s.partial_threshold is not null and p_value >= s.partial_threshold then 'partial'
           else 'fail' end
    else
      case when p_value <= s.pass_threshold then 'pass'
           when s.partial_threshold is not null and p_value <= s.partial_threshold then 'partial'
           else 'fail' end
  end
  from compliance_signals s where s.signal_key = p_signal;
$$;;
