create table public.automation_heartbeats (
  workflow_key text primary key
    check (workflow_key in ('staging', 'alerts')),
  expected_active boolean not null default false,
  technical_state text not null default 'never_received'
    check (technical_state in ('never_received', 'cycle_started')),
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.automation_heartbeats (workflow_key)
values ('staging'), ('alerts')
on conflict (workflow_key) do nothing;

alter table public.automation_heartbeats enable row level security;

revoke all on table public.automation_heartbeats from public, anon, authenticated;
grant select, insert, update on table public.automation_heartbeats to service_role;

create or replace function public.record_automation_heartbeat(
  p_workflow_key text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_recorded boolean;
begin
  update public.automation_heartbeats
  set
    technical_state = 'cycle_started',
    last_heartbeat_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where workflow_key = p_workflow_key
  returning true into v_recorded;

  return coalesce(v_recorded, false);
end;
$$;

create or replace function public.get_automation_monitoring_snapshot(
  p_heartbeat_max_age_seconds integer,
  p_overdue_max_age_seconds integer,
  p_high_attempts integer
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expected_active_workflows integer;
  v_stale_heartbeats integer;
  v_overdue_events integer;
  v_overdue_alerts integer;
  v_expired_event_locks integer;
  v_expired_alert_locks integer;
  v_delivery_unknown integer;
  v_dead_letter integer;
  v_high_attempts integer;
begin
  if p_heartbeat_max_age_seconds is null
    or p_overdue_max_age_seconds is null
    or p_high_attempts is null
    or p_heartbeat_max_age_seconds < 60
    or p_overdue_max_age_seconds < 60
    or p_high_attempts < 1
    or p_high_attempts > 8 then
    raise exception 'Invalid monitoring thresholds' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_active_workflows
  from public.automation_heartbeats
  where expected_active;

  select count(*)::integer
  into v_stale_heartbeats
  from public.automation_heartbeats
  where expected_active
    and (
      last_heartbeat_at is null
      or last_heartbeat_at <= timezone('utc', now())
        - make_interval(secs => p_heartbeat_max_age_seconds)
      or last_heartbeat_at > timezone('utc', now()) + interval '5 minutes'
    );

  select count(*)::integer
  into v_overdue_events
  from public.automation_events
  where status in ('pending', 'failed')
    and next_attempt_at <= timezone('utc', now())
      - make_interval(secs => p_overdue_max_age_seconds);

  select count(*)::integer
  into v_overdue_alerts
  from public.automation_alerts
  where status in ('pending', 'failed')
    and next_attempt_at <= timezone('utc', now())
      - make_interval(secs => p_overdue_max_age_seconds);

  select count(*)::integer
  into v_expired_event_locks
  from public.automation_events
  where status = 'processing'
    and locked_at <= timezone('utc', now())
      - make_interval(secs => p_overdue_max_age_seconds);

  select count(*)::integer
  into v_expired_alert_locks
  from public.automation_alerts
  where status = 'processing'
    and locked_at <= timezone('utc', now())
      - make_interval(secs => p_overdue_max_age_seconds);

  select (
    (select count(*) from public.automation_events where status = 'delivery_unknown')
    + (select count(*) from public.automation_alerts where status = 'delivery_unknown')
  )::integer
  into v_delivery_unknown;

  select (
    (select count(*) from public.automation_events where status = 'dead_letter')
    + (select count(*) from public.automation_alerts where status = 'dead_letter')
  )::integer
  into v_dead_letter;

  select (
    (select count(*) from public.automation_events
      where status in ('pending', 'failed', 'processing') and attempts >= p_high_attempts)
    + (select count(*) from public.automation_alerts
      where status in ('pending', 'failed', 'processing') and attempts >= p_high_attempts)
  )::integer
  into v_high_attempts;

  return jsonb_build_object(
    'expected_active_workflows', v_expected_active_workflows,
    'stale_heartbeats', v_stale_heartbeats,
    'overdue_events', v_overdue_events,
    'overdue_alerts', v_overdue_alerts,
    'expired_event_locks', v_expired_event_locks,
    'expired_alert_locks', v_expired_alert_locks,
    'delivery_unknown', v_delivery_unknown,
    'dead_letter', v_dead_letter,
    'high_attempts', v_high_attempts
  );
end;
$$;

revoke all on function public.record_automation_heartbeat(text) from public, anon, authenticated;
revoke all on function public.get_automation_monitoring_snapshot(integer, integer, integer) from public, anon, authenticated;

grant execute on function public.record_automation_heartbeat(text) to service_role;
grant execute on function public.get_automation_monitoring_snapshot(integer, integer, integer) to service_role;
