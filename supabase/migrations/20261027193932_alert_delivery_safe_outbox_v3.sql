alter table public.automation_alerts
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_unknown_at timestamptz,
  add column if not exists dead_lettered_at timestamptz,
  alter column next_attempt_at drop not null;

alter table public.automation_alerts
  drop constraint if exists automation_alerts_status_check;

alter table public.automation_alerts
  add constraint automation_alerts_status_check
  check (status in (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'delivery_unknown',
    'dead_letter'
  ));

-- Existing alerts never had a recorded SMTP start. Their processing locks remain
-- retryable; pre-existing failed/pending rows already at the cap become terminal.
update public.automation_alerts
set
  status = 'dead_letter',
  dead_lettered_at = coalesce(dead_lettered_at, timezone('utc', now())),
  locked_at = null,
  lock_token = null,
  next_attempt_at = null,
  last_error = coalesce(last_error, 'Alert retry limit reached before V3 migration')
where status in ('pending', 'failed')
  and attempts >= 8;

create index if not exists automation_alerts_delivery_unknown_idx
  on public.automation_alerts (delivery_unknown_at)
  where status = 'delivery_unknown';

create index if not exists automation_alerts_dead_letter_idx
  on public.automation_alerts (dead_lettered_at)
  where status = 'dead_letter';

create index if not exists automation_alerts_retry_ready_v3_idx
  on public.automation_alerts (next_attempt_at, created_at)
  where status in ('pending', 'failed') and attempts < 8;

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

  -- Once SMTP may have begun, expiry means delivery cannot be proven. Quarantine it.
  update public.automation_alerts as alert
  set
    status = 'delivery_unknown',
    delivery_unknown_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    next_attempt_at = null,
    last_error = 'Alert lock expired after delivery started'
  where alert.status = 'processing'
    and alert.delivery_started_at is not null
    and alert.locked_at <= timezone('utc', now()) - interval '10 minutes';

  -- A worker that never started SMTP but exhausted its eighth claim is terminal.
  update public.automation_alerts as alert
  set
    status = 'dead_letter',
    dead_lettered_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    next_attempt_at = null,
    last_error = 'Alert lock expired before delivery started after retry limit'
  where alert.status = 'processing'
    and alert.delivery_started_at is null
    and alert.attempts >= 8
    and alert.locked_at <= timezone('utc', now()) - interval '10 minutes';

  return query
  with candidates as (
    select alert.id
    from public.automation_alerts alert
    where (
      alert.status in ('pending', 'failed')
      and alert.attempts < 8
      and alert.next_attempt_at <= timezone('utc', now())
    ) or (
      alert.status = 'processing'
      and alert.delivery_started_at is null
      and alert.attempts < 8
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
        when alert.status = 'processing' then 'Alert lock expired before delivery started'
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

create or replace function public.begin_quote_delivery_alert_delivery(
  p_alert_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started boolean;
begin
  update public.automation_alerts
  set delivery_started_at = timezone('utc', now())
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
    and delivery_started_at is null
  returning true into v_started;

  return coalesce(v_started, false);
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
    next_attempt_at = null,
    last_error = null
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
    and delivery_started_at is not null
  returning true into v_succeeded;

  return coalesce(v_succeeded, false);
end;
$$;

create or replace function public.mark_quote_delivery_alert_delivery_unknown(
  p_alert_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_unknown boolean;
begin
  update public.automation_alerts
  set
    status = 'delivery_unknown',
    delivery_unknown_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    next_attempt_at = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Alert delivery outcome could not be confirmed'), 1000)
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
    and delivery_started_at is not null
  returning true into v_unknown;

  return coalesce(v_unknown, false);
end;
$$;

create or replace function public.reschedule_quote_delivery_alert_v3(
  p_alert_id uuid,
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
  update public.automation_alerts
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
    next_attempt_at = case
      when delivery_started_at is not null or attempts >= 8 then null
      else timezone('utc', now())
        + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
    end,
    last_error = left(coalesce(nullif(p_error, ''), 'Unknown alert delivery error'), 1000)
  where id = p_alert_id
    and status = 'processing'
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
  returning status into v_status;

  if not found then
    return 'stale';
  end if;

  if v_status = 'failed' then
    return 'retry_scheduled';
  end if;

  return v_status;
end;
$$;

-- Preserve the historical function signature while routing it through V3 safeguards.
create or replace function public.reschedule_quote_delivery_alert(
  p_alert_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language sql
set search_path = public, pg_temp
as $$
  select public.reschedule_quote_delivery_alert_v3(
    p_alert_id,
    p_lock_token,
    p_error
  ) <> 'stale';
$$;

revoke all on function public.claim_quote_delivery_alerts(integer) from public, anon, authenticated;
revoke all on function public.begin_quote_delivery_alert_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_quote_delivery_alert_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_quote_delivery_alert_delivery_unknown(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reschedule_quote_delivery_alert_v3(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reschedule_quote_delivery_alert(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.claim_quote_delivery_alerts(integer) to service_role;
grant execute on function public.begin_quote_delivery_alert_delivery(uuid, uuid) to service_role;
grant execute on function public.mark_quote_delivery_alert_succeeded(uuid, uuid) to service_role;
grant execute on function public.mark_quote_delivery_alert_delivery_unknown(uuid, uuid, text) to service_role;
grant execute on function public.reschedule_quote_delivery_alert_v3(uuid, uuid, text) to service_role;
grant execute on function public.reschedule_quote_delivery_alert(uuid, uuid, text) to service_role;
