alter table public.automation_events
  add column delivery_started_at timestamptz,
  add column delivery_unknown_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column resolution_note text,
  add column resolved_at timestamptz;

alter table public.automation_events
  alter column next_attempt_at drop not null;

alter table public.automation_events
  drop constraint automation_events_status_check,
  add constraint automation_events_status_check check (
    status in (
      'pending',
      'processing',
      'succeeded',
      'failed',
      'delivery_unknown',
      'dead_letter'
    )
  );

create table public.automation_alerts (
  id uuid primary key default gen_random_uuid(),
  automation_event_id uuid not null references public.automation_events(id) on delete cascade,
  alert_type text not null check (alert_type in ('delivery_unknown', 'dead_letter')),
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  delivered_at timestamptz,
  last_error text,
  constraint automation_alerts_event_type_unique unique (automation_event_id, alert_type)
);

create index automation_events_quote_delivery_unknown_idx
  on public.automation_events (delivery_unknown_at)
  where event_type = 'quote_request.created'
    and status = 'delivery_unknown';

create index automation_alerts_ready_idx
  on public.automation_alerts (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.automation_alerts enable row level security;

revoke all on table public.automation_alerts from anon, authenticated;
grant select, insert, update on table public.automation_alerts to service_role;

create or replace function public.enqueue_quote_delivery_alert(
  p_event_id uuid,
  p_alert_type text,
  p_attempts integer
)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.automation_alerts (
    automation_event_id,
    alert_type,
    idempotency_key,
    payload
  ) values (
    p_event_id,
    p_alert_type,
    p_event_id::text || ':' || p_alert_type,
    jsonb_build_object(
      'automationEventId', p_event_id,
      'alertType', p_alert_type,
      'attempts', p_attempts
    )
  )
  on conflict (automation_event_id, alert_type) do nothing;
$$;

update public.automation_events
set delivery_started_at = locked_at
where event_type = 'quote_request.created'
  and status = 'processing'
  and delivery_started_at is null;

with dead_lettered as (
  update public.automation_events
  set
    status = 'dead_letter',
    dead_lettered_at = timezone('utc', now()),
    next_attempt_at = null,
    locked_at = null,
    lock_token = null,
    last_error = coalesce(last_error, 'Maximum delivery attempts reached before V2 migration')
  where event_type = 'quote_request.created'
    and status in ('pending', 'failed')
    and attempts >= 8
  returning id, attempts
)
insert into public.automation_alerts (
  automation_event_id,
  alert_type,
  idempotency_key,
  payload
)
select
  dead_lettered.id,
  'dead_letter',
  dead_lettered.id::text || ':dead_letter',
  jsonb_build_object(
    'automationEventId', dead_lettered.id,
    'alertType', 'dead_letter',
    'attempts', dead_lettered.attempts
  )
from dead_lettered
on conflict (automation_event_id, alert_type) do nothing;

create or replace function public.claim_quote_request_automation_events(
  p_limit integer default 25
)
returns table(
  id uuid,
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

  with expired_delivery_attempts as (
    select event.id, event.attempts
    from public.automation_events event
    where event.event_type = 'quote_request.created'
      and event.status = 'processing'
      and event.delivery_started_at is not null
      and event.locked_at <= timezone('utc', now()) - interval '10 minutes'
    for update skip locked
  ), quarantined as (
    update public.automation_events event
    set
      status = 'delivery_unknown',
      delivery_unknown_at = timezone('utc', now()),
      locked_at = null,
      lock_token = null,
      next_attempt_at = null,
      last_error = coalesce(event.last_error, 'Delivery outcome unknown after lock expiry')
    from expired_delivery_attempts expired
    where event.id = expired.id
    returning event.id, event.attempts
  )
  insert into public.automation_alerts (
    automation_event_id,
    alert_type,
    idempotency_key,
    payload
  )
  select
    quarantined.id,
    'delivery_unknown',
    quarantined.id::text || ':delivery_unknown',
    jsonb_build_object(
      'automationEventId', quarantined.id,
      'alertType', 'delivery_unknown',
      'attempts', quarantined.attempts
    )
  from quarantined
  on conflict (automation_event_id, alert_type) do nothing;

  return query
  with candidates as (
    select event.id
    from public.automation_events event
    where event.event_type = 'quote_request.created'
      and (
        (
          event.status in ('pending', 'failed')
          and event.attempts < 8
          and event.next_attempt_at <= timezone('utc', now())
        )
        or (
          event.status = 'processing'
          and event.delivery_started_at is null
          and event.locked_at <= timezone('utc', now()) - interval '10 minutes'
        )
      )
    order by
      case
        when event.status = 'processing' then event.locked_at
        else event.next_attempt_at
      end,
      event.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.automation_events event
    set
      status = 'processing',
      attempts = event.attempts + 1,
      locked_at = timezone('utc', now()),
      lock_token = gen_random_uuid(),
      last_error = case
        when event.status = 'processing' then 'Lock expired before delivery started'
        else event.last_error
      end
    from candidates
    where event.id = candidates.id
    returning event.id, event.idempotency_key, event.payload, event.attempts, event.lock_token
  )
  select
    claimed.id,
    claimed.idempotency_key,
    claimed.payload,
    claimed.attempts,
    claimed.lock_token
  from claimed;
end;
$$;

create or replace function public.begin_quote_request_automation_delivery(
  p_event_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started boolean;
begin
  update public.automation_events
  set delivery_started_at = coalesce(delivery_started_at, timezone('utc', now()))
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and lock_token = p_lock_token
  returning true into v_started;

  return coalesce(v_started, false);
end;
$$;

create or replace function public.mark_quote_request_automation_delivery_unknown(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  update public.automation_events
  set
    status = 'delivery_unknown',
    delivery_unknown_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    next_attempt_at = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Delivery outcome unknown'), 1000)
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and delivery_started_at is not null
    and lock_token = p_lock_token
  returning attempts into v_attempts;

  if not found then
    return false;
  end if;

  perform public.enqueue_quote_delivery_alert(
    p_event_id,
    'delivery_unknown',
    v_attempts
  );

  return true;
end;
$$;

create or replace function public.mark_quote_request_automation_event_succeeded(
  p_event_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_succeeded boolean;
begin
  update public.automation_events
  set
    status = 'succeeded',
    delivered_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    last_error = null
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and delivery_started_at is not null
    and lock_token = p_lock_token
  returning true into v_succeeded;

  return coalesce(v_succeeded, false);
end;
$$;

create or replace function public.reschedule_quote_request_automation_event(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
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
  returning attempts, status into v_attempts, v_status;

  if not found then
    return false;
  end if;

  if v_status in ('delivery_unknown', 'dead_letter') then
    perform public.enqueue_quote_delivery_alert(p_event_id, v_status, v_attempts);
  end if;

  return true;
end;
$$;

revoke all on function public.enqueue_quote_delivery_alert(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.claim_quote_request_automation_events(integer) from public, anon, authenticated;
revoke all on function public.begin_quote_request_automation_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_quote_request_automation_delivery_unknown(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_quote_request_automation_event_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reschedule_quote_request_automation_event(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.enqueue_quote_delivery_alert(uuid, text, integer) to service_role;
grant execute on function public.claim_quote_request_automation_events(integer) to service_role;
grant execute on function public.begin_quote_request_automation_delivery(uuid, uuid) to service_role;
grant execute on function public.mark_quote_request_automation_delivery_unknown(uuid, uuid, text) to service_role;
grant execute on function public.mark_quote_request_automation_event_succeeded(uuid, uuid) to service_role;
grant execute on function public.reschedule_quote_request_automation_event(uuid, uuid, text) to service_role;
