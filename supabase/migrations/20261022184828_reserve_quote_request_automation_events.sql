alter table public.automation_events
  add column lock_token uuid;

create index automation_events_quote_ready_idx
  on public.automation_events (next_attempt_at, created_at)
  where event_type = 'quote_request.created'
    and status in ('pending', 'failed');

create index automation_events_quote_lock_expiry_idx
  on public.automation_events (locked_at)
  where event_type = 'quote_request.created'
    and status = 'processing';

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

  return query
  with candidates as (
    select event.id
    from public.automation_events event
    where event.event_type = 'quote_request.created'
      and (
        (
          event.status in ('pending', 'failed')
          and event.next_attempt_at <= timezone('utc', now())
        )
        or (
          event.status = 'processing'
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
        when event.status = 'processing' then 'Lock expired before acknowledgement'
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
  v_rescheduled boolean;
begin
  update public.automation_events
  set
    status = 'failed',
    locked_at = null,
    lock_token = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Unknown delivery error'), 1000),
    next_attempt_at = timezone('utc', now())
      + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and lock_token = p_lock_token
  returning true into v_rescheduled;

  return coalesce(v_rescheduled, false);
end;
$$;

create or replace function public.claim_automation_events(p_limit integer default 25)
returns table(id uuid, event_type text, idempotency_key text, payload jsonb, attempts integer)
language sql
set search_path = public, pg_temp
as $$
  with candidates as (
    select id
    from public.automation_events
    where event_type <> 'quote_request.created'
      and status in ('pending', 'failed')
      and next_attempt_at <= timezone('utc', now())
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.automation_events event
    set status = 'processing', attempts = event.attempts + 1, locked_at = timezone('utc', now())
    from candidates
    where event.id = candidates.id
    returning event.id, event.event_type, event.idempotency_key, event.payload, event.attempts
  )
  select * from claimed;
$$;

create or replace function public.mark_automation_event_succeeded(p_event_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.automation_events
  set status = 'succeeded', delivered_at = timezone('utc', now()), locked_at = null, last_error = null
  where id = p_event_id
    and event_type <> 'quote_request.created'
    and status = 'processing';
$$;

create or replace function public.reschedule_automation_event(p_event_id uuid, p_error text)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.automation_events
  set
    status = 'failed',
    locked_at = null,
    last_error = left(p_error, 1000),
    next_attempt_at = timezone('utc', now()) + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
  where id = p_event_id
    and event_type <> 'quote_request.created'
    and status = 'processing';
$$;

revoke all on function public.claim_quote_request_automation_events(integer) from public, anon, authenticated;
revoke all on function public.mark_quote_request_automation_event_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reschedule_quote_request_automation_event(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.claim_quote_request_automation_events(integer) to service_role;
grant execute on function public.mark_quote_request_automation_event_succeeded(uuid, uuid) to service_role;
grant execute on function public.reschedule_quote_request_automation_event(uuid, uuid, text) to service_role;
