alter table public.automation_alerts
  add column locked_at timestamptz,
  add column lock_token uuid;

create index automation_alerts_processing_lock_idx
  on public.automation_alerts (locked_at)
  where status = 'processing';

create or replace function public.reschedule_quote_request_automation_event_v2(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.automation_events
  set
    status = case
      when delivery_started_at is not null then 'delivery_unknown'
      when attempts >= 8 then 'dead_letter'
      else 'failed'
    end,
    delivery_unknown_at = case
      when delivery_started_at is not null then timezone('utc', now())
      else delivery_unknown_at
    end,
    dead_lettered_at = case
      when delivery_started_at is null and attempts >= 8 then timezone('utc', now())
      else dead_lettered_at
    end,
    locked_at = null,
    lock_token = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Unknown delivery error'), 1000),
    next_attempt_at = case
      when delivery_started_at is not null or attempts >= 8 then null
      else timezone('utc', now())
        + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
    end
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and lock_token = p_lock_token
  returning status into v_status;

  if not found then
    return 'stale';
  end if;

  if v_status in ('delivery_unknown', 'dead_letter') then
    perform public.enqueue_quote_delivery_alert(
      p_event_id,
      v_status,
      (select attempts from public.automation_events where id = p_event_id)
    );
  end if;

  if v_status = 'failed' then
    return 'retry_scheduled';
  end if;

  return v_status;
end;
$$;

create or replace function public.reschedule_quote_request_automation_event(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language sql
set search_path = public, pg_temp
as $$
  select public.reschedule_quote_request_automation_event_v2(
    p_event_id,
    p_lock_token,
    p_error
  ) <> 'stale';
$$;

create or replace function public.claim_quote_delivery_alerts(
  p_limit integer default 25
)
returns table(
  id uuid,
  automation_event_id uuid,
  alert_type text,
  idempotency_key text,
  payload jsonb,
  attempts integer,
  lock_token uuid
)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select alert.id
    from public.automation_alerts alert
    where (
      alert.status in ('pending', 'failed')
      and alert.next_attempt_at <= timezone('utc', now())
    ) or (
      alert.status = 'processing'
      and alert.locked_at <= timezone('utc', now()) - interval '10 minutes'
    )
    order by
      case when alert.status = 'processing' then alert.locked_at else alert.next_attempt_at end,
      alert.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.automation_alerts alert
    set
      status = 'processing',
      attempts = alert.attempts + 1,
      locked_at = timezone('utc', now()),
      lock_token = gen_random_uuid(),
      last_error = case
        when alert.status = 'processing' then 'Alert lock expired before confirmation'
        else alert.last_error
      end
    from candidates
    where alert.id = candidates.id
    returning
      alert.id,
      alert.automation_event_id,
      alert.alert_type,
      alert.idempotency_key,
      alert.payload,
      alert.attempts,
      alert.lock_token
  )
  select
    claimed.id,
    claimed.automation_event_id,
    claimed.alert_type,
    claimed.idempotency_key,
    claimed.payload,
    claimed.attempts,
    claimed.lock_token
  from claimed;
end;
$$;

create or replace function public.mark_quote_delivery_alert_succeeded(
  p_alert_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_succeeded boolean;
begin
  update public.automation_alerts
  set
    status = 'succeeded',
    delivered_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    last_error = null
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
  returning true into v_succeeded;

  return coalesce(v_succeeded, false);
end;
$$;

create or replace function public.reschedule_quote_delivery_alert(
  p_alert_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rescheduled boolean;
begin
  update public.automation_alerts
  set
    status = 'failed',
    locked_at = null,
    lock_token = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Unknown alert delivery error'), 1000),
    next_attempt_at = timezone('utc', now())
      + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
  returning true into v_rescheduled;

  return coalesce(v_rescheduled, false);
end;
$$;

revoke all on function public.reschedule_quote_request_automation_event_v2(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reschedule_quote_request_automation_event(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_quote_delivery_alerts(integer) from public, anon, authenticated;
revoke all on function public.mark_quote_delivery_alert_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reschedule_quote_delivery_alert(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.reschedule_quote_request_automation_event_v2(uuid, uuid, text) to service_role;
grant execute on function public.reschedule_quote_request_automation_event(uuid, uuid, text) to service_role;
grant execute on function public.claim_quote_delivery_alerts(integer) to service_role;
grant execute on function public.mark_quote_delivery_alert_succeeded(uuid, uuid) to service_role;
grant execute on function public.reschedule_quote_delivery_alert(uuid, uuid, text) to service_role;
